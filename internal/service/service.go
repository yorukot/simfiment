package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"fmt"
	"net/http"
	"time"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/i18n"
	"simfiment/internal/platform"
	"simfiment/internal/store"
)

// Service coordinates domain rules and transactional storage operations.
type Service struct {
	db             *sql.DB
	store          *store.Store
	clock          platform.Clock
	cfg            platform.Config
	passwordParams passwordParameters
	limiter        *loginLimiter
}

// New creates the application service layer.
func New(db *sql.DB, cfg platform.Config, clock platform.Clock) *Service {
	return &Service{
		db: db, store: store.New(db), cfg: cfg, clock: clock,
		passwordParams: passwordParameters{
			memory: cfg.Argon2MemoryKiB, iterations: cfg.Argon2Iterations,
			parallelism: cfg.Argon2Parallelism, saltLength: 16, keyLength: 32,
		},
		limiter: newLoginLimiter(clock),
	}
}

// SetupInput contains one-time initialization choices.
type SetupInput struct {
	Password                string `json:"password"`
	Timezone                string `json:"timezone"`
	Locale                  string `json:"locale"`
	CurrencyCode            string `json:"currencyCode"`
	AutomaticLocationEnable bool   `json:"automaticLocationEnabled"`
}

// SessionResult contains plaintext values that are returned once to the browser.
type SessionResult struct {
	Token     string
	CSRFToken string
	Session   store.Session
	Settings  domain.Settings
}

// Initialized reports installation state.
func (s *Service) Initialized(ctx context.Context) (bool, error) {
	return s.store.Initialized(ctx)
}

// Setup performs one-time initialization and creates the first session atomically.
func (s *Service) Setup(ctx context.Context, input SetupInput) (SessionResult, error) {
	initialized, err := s.store.Initialized(ctx)
	if err != nil {
		return SessionResult{}, internal("check setup state", err)
	}
	if initialized {
		return SessionResult{}, domain.NewError(http.StatusConflict, "already_initialized", "此應用程式已完成設定。")
	}
	settings, fieldErrors := validateSetup(input)
	if err := validatePassword(input.Password); err != nil {
		fieldErrors["password"] = err.Error()
	}
	if len(fieldErrors) > 0 {
		return SessionResult{}, domain.ValidationError(fieldErrors)
	}
	hash, err := hashPassword(input.Password, s.passwordParams)
	if err != nil {
		return SessionResult{}, internal("hash setup password", err)
	}
	now := s.clock.Now()
	token, tokenHash, csrf, csrfHash, err := newSessionSecrets()
	if err != nil {
		return SessionResult{}, internal("generate setup session", err)
	}
	expires := now.Add(time.Duration(s.cfg.SessionDays) * 24 * time.Hour)
	var sessionID int64
	err = database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		if err := txStore.InsertSetup(ctx, settings, hash, now); err != nil {
			return err
		}
		var createErr error
		sessionID, createErr = txStore.CreateSession(ctx, tokenHash, csrfHash, 1, now, expires)
		return createErr
	})
	if err != nil {
		return SessionResult{}, internal("initialize application", err)
	}
	settings.InitializedAt = &now
	return SessionResult{Token: token, CSRFToken: csrf, Settings: settings, Session: store.Session{
		ID: sessionID, PasswordVersion: 1, CreatedAt: now, LastSeenAt: now, ExpiresAt: expires,
	}}, nil
}

// Login verifies the password, applies rate limits, and creates a session.
func (s *Service) Login(ctx context.Context, sourceIP, password string) (SessionResult, error) {
	_ = s.store.CleanupExpiredSessions(ctx, s.clock.Now())
	if !s.limiter.allow(sourceIP) {
		return SessionResult{}, domain.NewError(http.StatusTooManyRequests, "rate_limited", "登入嘗試過於頻繁，請稍後再試。")
	}
	credential, err := s.store.GetCredential(ctx)
	if err != nil {
		s.limiter.failure(sourceIP)
		return SessionResult{}, domain.NewError(http.StatusUnauthorized, "invalid_credentials", "密碼不正確。")
	}
	valid, verifyErr := verifyPassword(password, credential.PasswordHash)
	if verifyErr != nil || !valid {
		s.limiter.failure(sourceIP)
		return SessionResult{}, domain.NewError(http.StatusUnauthorized, "invalid_credentials", "密碼不正確。")
	}
	s.limiter.success(sourceIP)
	now := s.clock.Now()
	needsRehash, err := passwordNeedsRehash(credential.PasswordHash, s.passwordParams)
	if err != nil {
		return SessionResult{}, internal("inspect password hash", err)
	}
	if needsRehash {
		upgraded, err := hashPassword(password, s.passwordParams)
		if err != nil {
			return SessionResult{}, internal("rehash password", err)
		}
		if err := s.store.RehashPassword(ctx, upgraded, now); err != nil {
			return SessionResult{}, internal("persist rehashed password", err)
		}
	}
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return SessionResult{}, internal("load settings after login", err)
	}
	if err := s.EnsureOccurrences(ctx); err != nil {
		return SessionResult{}, err
	}
	token, tokenHash, csrf, csrfHash, err := newSessionSecrets()
	if err != nil {
		return SessionResult{}, internal("generate login session", err)
	}
	expires := now.Add(time.Duration(s.cfg.SessionDays) * 24 * time.Hour)
	id, err := s.store.CreateSession(ctx, tokenHash, csrfHash, credential.PasswordVersion, now, expires)
	if err != nil {
		return SessionResult{}, internal("persist login session", err)
	}
	return SessionResult{Token: token, CSRFToken: csrf, Settings: settings, Session: store.Session{
		ID: id, PasswordVersion: credential.PasswordVersion, CreatedAt: now, LastSeenAt: now, ExpiresAt: expires,
	}}, nil
}

// Authenticate validates an opaque session token and password version.
func (s *Service) Authenticate(ctx context.Context, token string) (store.Session, error) {
	if token == "" {
		return store.Session{}, domain.NewError(http.StatusUnauthorized, "authentication_required", "請先登入。")
	}
	sum := sha256.Sum256([]byte(token))
	session, err := s.store.GetSessionByTokenHash(ctx, sum[:])
	if err != nil || session.RevokedAt != nil || !s.clock.Now().Before(session.ExpiresAt) {
		return store.Session{}, domain.NewError(http.StatusUnauthorized, "authentication_required", "登入階段已失效，請重新登入。")
	}
	credential, err := s.store.GetCredential(ctx)
	if err != nil || credential.PasswordVersion != session.PasswordVersion {
		return store.Session{}, domain.NewError(http.StatusUnauthorized, "authentication_required", "登入階段已失效，請重新登入。")
	}
	return session, nil
}

// RefreshSession rotates the CSRF secret recovered after a page reload.
func (s *Service) RefreshSession(ctx context.Context, session store.Session) (SessionResult, error) {
	csrf, err := randomToken(32)
	if err != nil {
		return SessionResult{}, internal("generate csrf token", err)
	}
	hash := sha256.Sum256([]byte(csrf))
	if err := s.store.RotateCSRF(ctx, session.ID, hash[:], s.clock.Now()); err != nil {
		return SessionResult{}, internal("rotate csrf token", err)
	}
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return SessionResult{}, internal("load session settings", err)
	}
	return SessionResult{CSRFToken: csrf, Session: session, Settings: settings}, nil
}

// CheckCSRF validates a session-bound mutation token.
func (s *Service) CheckCSRF(session store.Session, token string) bool {
	hash := sha256.Sum256([]byte(token))
	return len(session.CSRFTokenHash) == len(hash) && subtleBytes(hash[:], session.CSRFTokenHash)
}

// Logout revokes the current session.
func (s *Service) Logout(ctx context.Context, sessionID int64) error {
	return s.store.RevokeSession(ctx, sessionID, s.clock.Now())
}

// RevokeOthers revokes all sessions except the current one.
func (s *Service) RevokeOthers(ctx context.Context, sessionID int64) error {
	return s.store.RevokeOtherSessions(ctx, sessionID, s.clock.Now())
}

// ChangePassword verifies the current password and invalidates other sessions.
func (s *Service) ChangePassword(ctx context.Context, sessionID int64, current, replacement string) error {
	credential, err := s.store.GetCredential(ctx)
	if err != nil {
		return internal("load credential", err)
	}
	valid, err := verifyPassword(current, credential.PasswordHash)
	if err != nil || !valid {
		return domain.NewError(http.StatusUnauthorized, "invalid_credentials", "目前密碼不正確。")
	}
	if current == replacement {
		return domain.ValidationError(map[string]string{"newPassword": "新密碼必須與目前密碼不同。"})
	}
	if err := validatePassword(replacement); err != nil {
		return domain.ValidationError(map[string]string{"newPassword": err.Error()})
	}
	hash, err := hashPassword(replacement, s.passwordParams)
	if err != nil {
		return internal("hash new password", err)
	}
	now := s.clock.Now()
	return database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		version, err := txStore.UpdatePassword(ctx, hash, now)
		if err != nil {
			return err
		}
		if err := txStore.RevokeOtherSessions(ctx, sessionID, now); err != nil {
			return err
		}
		return txStore.UpdateSessionPasswordVersion(ctx, sessionID, version, now)
	})
}

// ResetPassword supports administrative CLI recovery while preserving finance data.
func (s *Service) ResetPassword(ctx context.Context, replacement string) error {
	if err := validatePassword(replacement); err != nil {
		return err
	}
	hash, err := hashPassword(replacement, s.passwordParams)
	if err != nil {
		return err
	}
	now := s.clock.Now()
	return database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		if _, err := txStore.UpdatePassword(ctx, hash, now); err != nil {
			return err
		}
		return txStore.RevokeAllSessions(ctx, now)
	})
}

func validateSetup(input SetupInput) (domain.Settings, map[string]string) {
	errorsByField := map[string]string{}
	if _, err := time.LoadLocation(input.Timezone); err != nil {
		errorsByField["timezone"] = "請選擇有效的 IANA 時區。"
	}
	if !i18n.Supported(input.Locale) {
		errorsByField["locale"] = "語系必須是 zh-TW 或 en。"
	}
	currency, supported := domain.Currency(input.CurrencyCode)
	if !supported {
		errorsByField["currencyCode"] = "請選擇支援的幣別。"
	}
	return domain.Settings{CurrencyCode: currency.Code, CurrencyExponent: currency.Exponent,
		Timezone: input.Timezone, Locale: input.Locale, Theme: "system",
		AutomaticLocationEnable: input.AutomaticLocationEnable}, errorsByField
}

func randomToken(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("read cryptographic random source: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func newSessionSecrets() (string, []byte, string, []byte, error) {
	token, err := randomToken(32)
	if err != nil {
		return "", nil, "", nil, err
	}
	csrf, err := randomToken(32)
	if err != nil {
		return "", nil, "", nil, err
	}
	tokenHash := sha256.Sum256([]byte(token))
	csrfHash := sha256.Sum256([]byte(csrf))
	return token, tokenHash[:], csrf, csrfHash[:], nil
}

func subtleBytes(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	var value byte
	for i := range left {
		value |= left[i] ^ right[i]
	}
	return value == 0
}

func internal(op string, err error) error { return &domain.InternalError{Op: op, Err: err} }
