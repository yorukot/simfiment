package httpapi

import (
	"database/sql"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"simfiment/internal/platform"
	"simfiment/internal/service"
)

// API owns HTTP routing and safe protocol mapping.
type API struct {
	service *service.Service
	db      *sql.DB
	cfg     platform.Config
	logger  *slog.Logger
	version string
	static  http.Handler
	dbGate  sync.RWMutex
}

// New creates a same-origin API and SPA router.
func New(svc *service.Service, db *sql.DB, cfg platform.Config, logger *slog.Logger, version string, static http.Handler) http.Handler {
	a := &API{service: svc, db: db, cfg: cfg, logger: logger, version: version, static: static}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", a.live)
	mux.HandleFunc("GET /health/ready", a.ready)
	mux.HandleFunc("GET /api/v1/meta", a.meta)
	mux.HandleFunc("POST /api/v1/setup", a.setup)
	mux.HandleFunc("POST /api/v1/session", a.login)
	mux.HandleFunc("GET /api/v1/session", a.protected(false, a.getSession))
	mux.HandleFunc("DELETE /api/v1/session", a.protected(true, a.logout))
	mux.HandleFunc("PUT /api/v1/password", a.protected(true, a.changePassword))
	mux.HandleFunc("POST /api/v1/sessions/revoke-others", a.protected(true, a.revokeOthers))
	mux.HandleFunc("GET /api/v1/settings", a.protected(false, a.getSettings))
	mux.HandleFunc("PATCH /api/v1/settings", a.protected(true, a.patchSettings))
	mux.HandleFunc("GET /api/v1/operations/status", a.protected(false, a.operationsStatus))
	mux.HandleFunc("GET /api/v1/backups/download", a.protected(false, a.downloadBackup))
	mux.HandleFunc("POST /api/v1/backups/restore", a.protectedRestore(a.restoreBackup))
	mux.HandleFunc("GET /api/v1/categories", a.protected(false, a.listCategories))
	mux.HandleFunc("POST /api/v1/categories", a.protected(true, a.createCategory))
	mux.HandleFunc("PATCH /api/v1/categories/{id}", a.protected(true, a.patchCategory))
	mux.HandleFunc("POST /api/v1/categories/{id}/archive", a.protected(true, a.archiveCategory))
	mux.HandleFunc("POST /api/v1/categories/{id}/restore", a.protected(true, a.restoreCategory))
	mux.HandleFunc("PUT /api/v1/categories/order", a.protected(true, a.reorderCategories))
	mux.HandleFunc("GET /api/v1/transactions", a.protected(false, a.listTransactions))
	mux.HandleFunc("GET /api/v1/transactions/export.csv", a.protected(false, a.exportTransactionsCSV))
	mux.HandleFunc("POST /api/v1/transactions", a.protected(true, a.createTransaction))
	mux.HandleFunc("GET /api/v1/transactions/{id}", a.protected(false, a.getTransaction))
	mux.HandleFunc("PATCH /api/v1/transactions/{id}", a.protected(true, a.patchTransaction))
	mux.HandleFunc("DELETE /api/v1/transactions/{id}", a.protected(true, a.deleteTransaction))
	mux.HandleFunc("POST /api/v1/transactions/{id}/restore", a.protected(true, a.restoreTransaction))
	mux.HandleFunc("PUT /api/v1/transactions/{id}/location", a.protected(true, a.putLocation))
	mux.HandleFunc("POST /api/v1/transactions/{id}/location-failure", a.protected(true, a.locationFailure))
	mux.HandleFunc("DELETE /api/v1/transactions/{id}/location", a.protected(true, a.deleteLocation))
	mux.HandleFunc("GET /api/v1/dashboards/day", a.protected(false, a.dayDashboard))
	mux.HandleFunc("GET /api/v1/dashboards/month", a.protected(false, a.monthDashboard))
	mux.HandleFunc("GET /api/v1/recurring-rules", a.protected(false, a.listRecurringRules))
	mux.HandleFunc("POST /api/v1/recurring-rules", a.protected(true, a.createRecurringRule))
	mux.HandleFunc("PATCH /api/v1/recurring-rules/{id}", a.protected(true, a.patchRecurringRule))
	mux.HandleFunc("POST /api/v1/recurring-rules/{id}/enable", a.protected(true, a.enableRecurringRule))
	mux.HandleFunc("POST /api/v1/recurring-rules/{id}/disable", a.protected(true, a.disableRecurringRule))
	mux.HandleFunc("POST /api/v1/recurring-rules/{id}/archive", a.protected(true, a.archiveRecurringRule))
	mux.HandleFunc("GET /api/v1/recurring-occurrences", a.protected(false, a.listOccurrences))
	mux.HandleFunc("GET /api/v1/recurring-preview", a.protected(false, a.recurringPreview))
	mux.HandleFunc("POST /api/v1/recurring-occurrences/{id}/confirm", a.protected(true, a.confirmOccurrence))
	mux.HandleFunc("POST /api/v1/recurring-occurrences/{id}/skip", a.protected(true, a.skipOccurrence))
	mux.HandleFunc("/api/", a.apiNotFound)
	mux.Handle("/", static)
	return a.middleware(a.withDatabaseGate(mux))
}

func (a *API) cookieName() string {
	if a.cfg.SecureCookies {
		return "__Host-simfiment_session"
	}
	return "simfiment_session"
}

func (a *API) setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{Name: a.cookieName(), Value: token, Path: "/",
		Expires: expires, MaxAge: int(time.Until(expires).Seconds()), HttpOnly: true,
		Secure: a.cfg.SecureCookies, SameSite: http.SameSiteStrictMode})
}

func (a *API) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: a.cookieName(), Value: "", Path: "/",
		MaxAge: -1, HttpOnly: true, Secure: a.cfg.SecureCookies, SameSite: http.SameSiteStrictMode})
}
