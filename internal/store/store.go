package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"simfiment/internal/domain"
	"simfiment/internal/i18n"
)

// DBTX is implemented by both sql.DB and sql.Tx.
type DBTX interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// Store is the database access layer.
type Store struct{ q DBTX }

var (
	ErrCurrencyWouldZero = errors.New("currency conversion would produce a zero amount")
	ErrCurrencyOverflow  = errors.New("currency conversion would exceed the amount limit")
)

// New creates a store backed by a database or transaction.
func New(q DBTX) *Store { return &Store{q: q} }

// Credential is the singleton authentication record.
type Credential struct {
	PasswordHash    string
	PasswordVersion int64
}

// Session is an opaque server-side session record.
type Session struct {
	ID              int64
	TokenHash       []byte
	CSRFTokenHash   []byte
	PasswordVersion int64
	CreatedAt       time.Time
	LastSeenAt      time.Time
	ExpiresAt       time.Time
	RevokedAt       *time.Time
}

// Initialized reports whether setup has completed.
func (s *Store) Initialized(ctx context.Context) (bool, error) {
	var initialized sql.NullInt64
	err := s.q.QueryRowContext(ctx, "SELECT initialized_at FROM app_settings WHERE id = 1").Scan(&initialized)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read initialization state: %w", err)
	}
	return initialized.Valid, nil
}

// InsertSetup writes the singleton settings, credential, and localized defaults.
func (s *Store) InsertSetup(ctx context.Context, settings domain.Settings, passwordHash string, now time.Time) error {
	nowMS := now.UTC().UnixMilli()
	result, err := s.q.ExecContext(ctx, `INSERT INTO app_settings(
		id, initialized_at, currency_code, currency_exponent, timezone, locale, theme,
		automatic_location_enabled, created_at, updated_at
	) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		nowMS, settings.CurrencyCode, settings.CurrencyExponent, settings.Timezone, settings.Locale,
		settings.Theme, boolInt(settings.AutomaticLocationEnable), nowMS, nowMS)
	if err != nil {
		return fmt.Errorf("insert settings: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return errors.New("insert settings affected unexpected row count")
	}
	if _, err := s.q.ExecContext(ctx, `INSERT INTO auth_credentials(
		id, password_hash, password_version, created_at, updated_at
	) VALUES (1, ?, 1, ?, ?)`, passwordHash, nowMS, nowMS); err != nil {
		return fmt.Errorf("insert credential: %w", err)
	}
	locale, _ := i18n.Normalize(settings.Locale)
	expense, income := i18n.DefaultCategories(locale)
	for _, group := range []struct {
		kind       string
		categories []i18n.CategorySeed
	}{{"expense", expense}, {"income", income}} {
		for i, category := range group.categories {
			if _, err := s.q.ExecContext(ctx, `INSERT INTO categories(
				kind, name, icon_key, sort_order, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?)`, group.kind, category.Name, category.Icon, i, nowMS, nowMS); err != nil {
				return fmt.Errorf("insert default %s category: %w", group.kind, err)
			}
		}
	}
	return nil
}

// GetSettings returns installation settings.
func (s *Store) GetSettings(ctx context.Context) (domain.Settings, error) {
	var out domain.Settings
	var initialized sql.NullInt64
	var automatic int
	err := s.q.QueryRowContext(ctx, `SELECT initialized_at, currency_code, currency_exponent,
		timezone, locale, theme, automatic_location_enabled
		FROM app_settings WHERE id = 1`).Scan(
		&initialized, &out.CurrencyCode, &out.CurrencyExponent, &out.Timezone, &out.Locale, &out.Theme, &automatic)
	if err != nil {
		return out, fmt.Errorf("get settings: %w", err)
	}
	if initialized.Valid {
		value := time.UnixMilli(initialized.Int64).UTC()
		out.InitializedAt = &value
	}
	out.AutomaticLocationEnable = automatic == 1
	return out, nil
}

// UpdateSettings updates mutable installation preferences.
func (s *Store) UpdateSettings(ctx context.Context, theme string, automatic bool, timezone, locale,
	currencyCode string, currencyExponent int, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE app_settings SET theme = ?, automatic_location_enabled = ?,
		timezone = ?, locale = ?, currency_code = ?, currency_exponent = ?, updated_at = ? WHERE id = 1`,
		theme, boolInt(automatic), timezone, locale, currencyCode, currencyExponent, now.UTC().UnixMilli())
	if err != nil {
		return fmt.Errorf("update settings: %w", err)
	}
	return nil
}

// RewriteCurrency reinterprets every persisted financial amount using a new
// exponent and code. The caller is responsible for wrapping this in the same
// transaction as the app_settings update.
func (s *Store) RewriteCurrency(ctx context.Context, code string, oldExponent, newExponent int, now time.Time) error {
	type target struct {
		table, amountColumn, currencyColumn string
	}
	targets := []target{
		{"transactions", "amount_minor", "currency_code"},
		{"budget_limits", "amount_minor", "currency_code"},
		{"recurring_rules", "amount_minor", "currency_code"},
		{"recurring_occurrences", "amount_minor_snapshot", "currency_snapshot"},
	}
	factor := int64(1)
	difference := newExponent - oldExponent
	if difference < 0 {
		difference = -difference
	}
	for range difference {
		factor *= 10
	}

	if newExponent > oldExponent {
		limit := domain.MaxAmountMinor / factor
		for _, item := range targets {
			var blocked bool
			query := fmt.Sprintf("SELECT EXISTS(SELECT 1 FROM %s WHERE %s > ?)", item.table, item.amountColumn)
			if err := s.q.QueryRowContext(ctx, query, limit).Scan(&blocked); err != nil {
				return fmt.Errorf("check %s currency overflow: %w", item.table, err)
			}
			if blocked {
				return ErrCurrencyOverflow
			}
		}
	} else if newExponent < oldExponent {
		for _, item := range targets {
			var blocked bool
			query := fmt.Sprintf("SELECT EXISTS(SELECT 1 FROM %s WHERE %s < ?)", item.table, item.amountColumn)
			if err := s.q.QueryRowContext(ctx, query, factor).Scan(&blocked); err != nil {
				return fmt.Errorf("check %s zero currency amount: %w", item.table, err)
			}
			if blocked {
				return ErrCurrencyWouldZero
			}
		}
	}

	nowMS := now.UTC().UnixMilli()
	for _, item := range targets {
		expression := item.amountColumn
		args := []any{code, nowMS}
		if newExponent > oldExponent {
			expression += " * ?"
			args = []any{factor, code, nowMS}
		} else if newExponent < oldExponent {
			expression += " / ?"
			args = []any{factor, code, nowMS}
		}
		query := fmt.Sprintf("UPDATE %s SET %s = %s, %s = ?, updated_at = ?",
			item.table, item.amountColumn, expression, item.currencyColumn)
		if _, err := s.q.ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("rewrite %s currency: %w", item.table, err)
		}
	}
	return nil
}

// GetCredential returns the singleton credential.
func (s *Store) GetCredential(ctx context.Context) (Credential, error) {
	var out Credential
	err := s.q.QueryRowContext(ctx,
		"SELECT password_hash, password_version FROM auth_credentials WHERE id = 1").Scan(
		&out.PasswordHash, &out.PasswordVersion)
	if err != nil {
		return out, fmt.Errorf("get credential: %w", err)
	}
	return out, nil
}

// UpdatePassword replaces the credential and increments its version.
func (s *Store) UpdatePassword(ctx context.Context, hash string, now time.Time) (int64, error) {
	if _, err := s.q.ExecContext(ctx, `UPDATE auth_credentials SET password_hash = ?,
		password_version = password_version + 1, updated_at = ? WHERE id = 1`,
		hash, now.UTC().UnixMilli()); err != nil {
		return 0, fmt.Errorf("update password: %w", err)
	}
	credential, err := s.GetCredential(ctx)
	return credential.PasswordVersion, err
}

// RehashPassword upgrades only the encoded hash parameters. It intentionally
// preserves the password version because the user's secret did not change.
func (s *Store) RehashPassword(ctx context.Context, hash string, now time.Time) error {
	result, err := s.q.ExecContext(ctx, `UPDATE auth_credentials SET password_hash = ?,
		updated_at = ? WHERE id = 1`, hash, now.UTC().UnixMilli())
	if err != nil {
		return fmt.Errorf("rehash password: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return errors.New("rehash password affected unexpected row count")
	}
	return nil
}

// CreateSession persists hashes for a new opaque session.
func (s *Store) CreateSession(ctx context.Context, tokenHash, csrfHash []byte, passwordVersion int64, now, expires time.Time) (int64, error) {
	result, err := s.q.ExecContext(ctx, `INSERT INTO sessions(
		token_hash, csrf_token_hash, password_version, created_at, last_seen_at, expires_at
	) VALUES (?, ?, ?, ?, ?, ?)`, tokenHash, csrfHash, passwordVersion,
		now.UTC().UnixMilli(), now.UTC().UnixMilli(), expires.UTC().UnixMilli())
	if err != nil {
		return 0, fmt.Errorf("create session: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("session id: %w", err)
	}
	return id, nil
}

// GetSessionByTokenHash finds a session without exposing the bearer token.
func (s *Store) GetSessionByTokenHash(ctx context.Context, tokenHash []byte) (Session, error) {
	var out Session
	var created, seen, expires int64
	var revoked sql.NullInt64
	err := s.q.QueryRowContext(ctx, `SELECT id, token_hash, csrf_token_hash, password_version,
		created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE token_hash = ?`, tokenHash).Scan(
		&out.ID, &out.TokenHash, &out.CSRFTokenHash, &out.PasswordVersion,
		&created, &seen, &expires, &revoked)
	if err != nil {
		return out, fmt.Errorf("get session: %w", err)
	}
	out.CreatedAt = time.UnixMilli(created).UTC()
	out.LastSeenAt = time.UnixMilli(seen).UTC()
	out.ExpiresAt = time.UnixMilli(expires).UTC()
	if revoked.Valid {
		value := time.UnixMilli(revoked.Int64).UTC()
		out.RevokedAt = &value
	}
	return out, nil
}

// RotateCSRF replaces the session-bound CSRF token hash.
func (s *Store) RotateCSRF(ctx context.Context, sessionID int64, csrfHash []byte, now time.Time) error {
	_, err := s.q.ExecContext(ctx,
		"UPDATE sessions SET csrf_token_hash = ?, last_seen_at = ? WHERE id = ?",
		csrfHash, now.UTC().UnixMilli(), sessionID)
	if err != nil {
		return fmt.Errorf("rotate csrf token: %w", err)
	}
	return nil
}

// RevokeSession revokes one session idempotently.
func (s *Store) RevokeSession(ctx context.Context, sessionID int64, now time.Time) error {
	_, err := s.q.ExecContext(ctx,
		"UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?", now.UTC().UnixMilli(), sessionID)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

// RevokeOtherSessions revokes every session except the current one.
func (s *Store) RevokeOtherSessions(ctx context.Context, sessionID int64, now time.Time) error {
	_, err := s.q.ExecContext(ctx,
		"UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id <> ?", now.UTC().UnixMilli(), sessionID)
	if err != nil {
		return fmt.Errorf("revoke other sessions: %w", err)
	}
	return nil
}

// UpdateSessionPasswordVersion keeps the current session valid after a password change.
func (s *Store) UpdateSessionPasswordVersion(ctx context.Context, sessionID, version int64, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE sessions SET password_version = ?,
		last_seen_at = ? WHERE id = ?`, version, now.UTC().UnixMilli(), sessionID)
	if err != nil {
		return fmt.Errorf("update session password version: %w", err)
	}
	return nil
}

// RevokeAllSessions revokes every session.
func (s *Store) RevokeAllSessions(ctx context.Context, now time.Time) error {
	_, err := s.q.ExecContext(ctx,
		"UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?)", now.UTC().UnixMilli())
	if err != nil {
		return fmt.Errorf("revoke all sessions: %w", err)
	}
	return nil
}

// CleanupExpiredSessions removes expired or long-revoked session rows.
func (s *Store) CleanupExpiredSessions(ctx context.Context, now time.Time) error {
	cutoff := now.Add(-24 * time.Hour).UTC().UnixMilli()
	_, err := s.q.ExecContext(ctx, `DELETE FROM sessions
		WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)`,
		now.UTC().UnixMilli(), cutoff)
	if err != nil {
		return fmt.Errorf("cleanup sessions: %w", err)
	}
	return nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
