package httpapi

import (
	"net"
	"net/http"
	"strings"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/service"
)

func (a *API) live(w http.ResponseWriter, _ *http.Request) {
	a.writeData(w, http.StatusOK, map[string]string{"status": "alive"})
}

func (a *API) ready(w http.ResponseWriter, r *http.Request) {
	if err := database.Health(r.Context(), a.db); err != nil {
		a.writeAPIError(w, http.StatusServiceUnavailable, "not_ready", "資料庫目前無法使用。", nil, requestIDFrom(r.Context()))
		return
	}
	a.writeData(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (a *API) meta(w http.ResponseWriter, r *http.Request) {
	initialized, err := a.service.Initialized(r.Context())
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, map[string]any{
		"name": "Simfiment", "version": a.version, "initialized": initialized, "defaultLocale": "zh-TW",
	})
}

func (a *API) setup(w http.ResponseWriter, r *http.Request) {
	if !a.validPublicOrigin(r) {
		a.writeError(w, r, domain.NewError(http.StatusForbidden, "invalid_origin", "請求來源無效。"))
		return
	}
	var input service.SetupInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	result, err := a.service.Setup(r.Context(), input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.setSessionCookie(w, result.Token, result.Session.ExpiresAt)
	a.writeData(w, http.StatusCreated, map[string]any{"authenticated": true, "expiresAt": result.Session.ExpiresAt, "csrfToken": result.CSRFToken})
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	if !a.validPublicOrigin(r) {
		a.writeError(w, r, domain.NewError(http.StatusForbidden, "invalid_origin", "請求來源無效。"))
		return
	}
	var input struct {
		Password string `json:"password"`
	}
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	result, err := a.service.Login(r.Context(), sourceIP(r), input.Password)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.setSessionCookie(w, result.Token, result.Session.ExpiresAt)
	a.writeData(w, http.StatusOK, map[string]any{"authenticated": true, "expiresAt": result.Session.ExpiresAt, "csrfToken": result.CSRFToken})
}

func (a *API) validPublicOrigin(r *http.Request) bool {
	origin := strings.TrimRight(r.Header.Get("Origin"), "/")
	return origin != "" && origin == strings.TrimRight(a.cfg.BaseURL, "/")
}

func (a *API) getSession(w http.ResponseWriter, r *http.Request) {
	result, err := a.service.RefreshSession(r.Context(), sessionFrom(r.Context()))
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, map[string]any{"authenticated": true,
		"expiresAt": result.Session.ExpiresAt, "csrfToken": result.CSRFToken, "settings": result.Settings})
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if err := a.service.Logout(r.Context(), sessionFrom(r.Context()).ID); err != nil {
		a.writeError(w, r, err)
		return
	}
	a.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) changePassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	if err := a.service.ChangePassword(r.Context(), sessionFrom(r.Context()).ID, input.CurrentPassword, input.NewPassword); err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, map[string]bool{"changed": true})
}

func (a *API) revokeOthers(w http.ResponseWriter, r *http.Request) {
	if err := a.service.RevokeOthers(r.Context(), sessionFrom(r.Context()).ID); err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, map[string]bool{"revoked": true})
}

func sourceIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}
