package httpapi

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"strconv"
	"time"

	"simfiment/internal/database"
	"simfiment/internal/domain"
)

const (
	maxBackupUploadBytes = int64(1 << 30)
	backupUploadTimeout  = 5 * time.Minute
)

func (a *API) downloadBackup(w http.ResponseWriter, r *http.Request) {
	backup, err := database.CreateDownloadBackup(r.Context(), a.db, a.cfg.DataDir)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	defer os.Remove(backup.Path)

	file, err := os.Open(backup.Path)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	defer file.Close()
	filename := "simfiment-backup-" + time.Now().UTC().Format("2006-01-02T150405Z") + ".db"
	w.Header().Set("Content-Type", "application/vnd.sqlite3")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Length", strconv.FormatInt(backup.Size, 10))
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, file); err != nil {
		a.logger.Error("write database backup", "request_id", requestIDFrom(r.Context()), "error", err)
	}
}

func (a *API) restoreBackup(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/vnd.sqlite3" {
		a.writeError(w, r, domain.NewError(http.StatusUnsupportedMediaType, "invalid_backup_content_type",
			"備份檔案類型必須是 application/vnd.sqlite3。"))
		return
	}
	if r.ContentLength > maxBackupUploadBytes {
		a.writeError(w, r, domain.NewError(http.StatusRequestEntityTooLarge, "backup_too_large",
			"備份檔案不可超過 1 GiB。"))
		return
	}
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(backupUploadTimeout))

	temp, err := os.CreateTemp(a.cfg.DataDir, ".simfiment-upload-*.db")
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	path := temp.Name()
	defer func() {
		_ = os.Remove(path)
		_ = os.Remove(path + "-wal")
		_ = os.Remove(path + "-shm")
	}()
	if err := os.Chmod(path, 0o600); err != nil {
		_ = temp.Close()
		a.writeError(w, r, err)
		return
	}

	limited := http.MaxBytesReader(w, r.Body, maxBackupUploadBytes)
	written, copyErr := io.Copy(temp, limited)
	closeErr := temp.Close()
	var maxBytesErr *http.MaxBytesError
	if errors.As(copyErr, &maxBytesErr) {
		a.writeError(w, r, domain.NewError(http.StatusRequestEntityTooLarge, "backup_too_large",
			"備份檔案不可超過 1 GiB。"))
		return
	}
	if copyErr != nil {
		a.writeError(w, r, fmt.Errorf("receive uploaded backup: %w", copyErr))
		return
	}
	if closeErr != nil {
		a.writeError(w, r, fmt.Errorf("close uploaded backup: %w", closeErr))
		return
	}
	if written == 0 {
		a.writeError(w, r, domain.NewError(http.StatusUnprocessableEntity, "invalid_backup", "選取的檔案不是有效的 Simfiment 備份。"))
		return
	}

	if err := database.PrepareRestoreFile(r.Context(), path); err != nil {
		switch {
		case errors.Is(err, database.ErrNewerSchema):
			a.writeError(w, r, domain.NewError(http.StatusConflict, "backup_from_newer_version",
				"此備份來自較新的 Simfiment 版本，請先更新應用程式。"))
		case errors.Is(err, database.ErrInvalidBackup):
			a.writeError(w, r, domain.NewError(http.StatusUnprocessableEntity, "invalid_backup",
				"選取的檔案不是有效的 Simfiment 備份。"))
		default:
			a.writeError(w, r, err)
		}
		return
	}

	a.dbGate.Lock()
	defer a.dbGate.Unlock()
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
	if !a.service.CheckCSRF(session, r.Header.Get("X-CSRF-Token")) {
		a.writeError(w, r, domain.NewError(http.StatusForbidden, "invalid_csrf", "安全驗證失敗，請重新整理後再試。"))
		return
	}

	emergencyPath, err := database.RestoreOnline(r.Context(), a.db, path, a.cfg.DataDir)
	if err != nil {
		if emergencyPath != "" {
			a.logger.Error("database restore and rollback failed", "request_id", requestIDFrom(r.Context()),
				"emergency_backup", emergencyPath, "error", err)
		}
		a.writeError(w, r, err)
		return
	}
	a.clearSessionCookie(w)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
