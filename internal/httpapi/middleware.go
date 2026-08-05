package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"simfiment/internal/domain"
	"simfiment/internal/store"
)

type contextKey string

const (
	requestIDKey contextKey = "request-id"
	sessionKey   contextKey = "session"
)

type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (w *responseRecorder) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (a *API) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		requestID := newRequestID()
		w.Header().Set("X-Request-ID", requestID)
		setSecurityHeaders(w)
		r = r.WithContext(context.WithValue(r.Context(), requestIDKey, requestID))
		recorder := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if recovered := recover(); recovered != nil {
				a.logger.Error("panic recovered", "request_id", requestID, "panic", recovered, "stack", string(debug.Stack()))
				if recorder.status < 400 {
					a.writeAPIError(recorder, http.StatusInternalServerError, "internal_error",
						"發生未預期的錯誤，請稍後再試。", nil, requestID)
				}
			}
			a.logger.Info("request", "request_id", requestID, "method", r.Method,
				"path", r.URL.Path, "status", recorder.status, "duration_ms", time.Since(started).Milliseconds())
		}()
		next.ServeHTTP(recorder, r)
	})
}

func (a *API) protected(mutation bool, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(a.cookieName())
		if err != nil {
			a.writeError(w, r, domain.NewError(http.StatusUnauthorized, "authentication_required", "請先登入。"))
			return
		}
		session, err := a.service.Authenticate(r.Context(), cookie.Value)
		if err != nil {
			a.clearSessionCookie(w)
			a.writeError(w, r, err)
			return
		}
		if mutation {
			if origin := r.Header.Get("Origin"); origin == "" || strings.TrimRight(origin, "/") != strings.TrimRight(a.cfg.BaseURL, "/") {
				a.writeError(w, r, domain.NewError(http.StatusForbidden, "invalid_origin", "請求來源無效。"))
				return
			}
			if !a.service.CheckCSRF(session, r.Header.Get("X-CSRF-Token")) {
				a.writeError(w, r, domain.NewError(http.StatusForbidden, "invalid_csrf", "安全驗證失敗，請重新整理後再試。"))
				return
			}
		}
		r = r.WithContext(context.WithValue(r.Context(), sessionKey, session))
		next(w, r)
	}
}

func sessionFrom(ctx context.Context) store.Session {
	value, _ := ctx.Value(sessionKey).(store.Session)
	return value
}

func requestIDFrom(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey).(string)
	return value
}

func newRequestID() string {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return "req_unknown"
	}
	return "req_" + hex.EncodeToString(buffer)
}

func setSecurityHeaders(w http.ResponseWriter) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
}
