package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	sqlite "modernc.org/sqlite"
)

var (
	// ErrInvalidBackup reports a SQLite file that is not a usable initialized Simfiment backup.
	ErrInvalidBackup = errors.New("invalid Simfiment backup")
)

// BackupInfo describes one temporary, verified SQLite snapshot.
type BackupInfo struct {
	Path      string
	CreatedAt time.Time
	Size      int64
}

// CreateDownloadBackup creates a consistent snapshot suitable for download.
// Session rows are intentionally removed so restoring it signs every device out.
func CreateDownloadBackup(ctx context.Context, db *sql.DB, dataDir string) (BackupInfo, error) {
	return createSnapshot(ctx, db, dataDir, true)
}

func createSnapshot(ctx context.Context, db *sql.DB, dataDir string, clearSessions bool) (result BackupInfo, finalErr error) {
	temp, err := os.CreateTemp(dataDir, ".simfiment-snapshot-*.db")
	if err != nil {
		return result, fmt.Errorf("create snapshot temp file: %w", err)
	}
	path := temp.Name()
	if err := temp.Close(); err != nil {
		_ = os.Remove(path)
		return result, err
	}
	if err := os.Remove(path); err != nil {
		return result, err
	}
	defer func() {
		if finalErr != nil {
			_ = os.Remove(path)
		}
	}()

	quoted := strings.ReplaceAll(path, "'", "''")
	if _, err := db.ExecContext(ctx, "VACUUM INTO '"+quoted+"'"); err != nil {
		return result, fmt.Errorf("vacuum snapshot: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return result, fmt.Errorf("secure snapshot: %w", err)
	}
	if clearSessions {
		if err := clearBackupSessions(ctx, path); err != nil {
			return result, err
		}
	}
	if err := verifyDatabase(ctx, path); err != nil {
		return result, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return result, err
	}
	return BackupInfo{Path: path, CreatedAt: info.ModTime(), Size: info.Size()}, nil
}

func clearBackupSessions(ctx context.Context, path string) error {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)")
	if err != nil {
		return fmt.Errorf("open snapshot for session cleanup: %w", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.ExecContext(ctx, "DELETE FROM sessions"); err != nil {
		_ = db.Close()
		return fmt.Errorf("clear snapshot sessions: %w", err)
	}
	if err := db.Close(); err != nil {
		return fmt.Errorf("close cleaned snapshot: %w", err)
	}
	return nil
}

// PrepareRestoreFile validates an uploaded backup, upgrades older schemas in the
// temporary file, and removes all saved sessions before it can replace live data.
func PrepareRestoreFile(ctx context.Context, path string) error {
	if err := verifySQLiteHeader(path); err != nil {
		return err
	}
	db, err := openPath(ctx, path)
	if err != nil {
		if errors.Is(err, ErrNewerSchema) {
			return err
		}
		return fmt.Errorf("%w: %v", ErrInvalidBackup, err)
	}
	closed := false
	defer func() {
		if !closed {
			_ = db.Close()
		}
	}()

	var initialized sql.NullInt64
	if err := db.QueryRowContext(ctx, "SELECT initialized_at FROM app_settings WHERE id = 1").Scan(&initialized); err != nil || !initialized.Valid {
		return fmt.Errorf("%w: installation settings are missing", ErrInvalidBackup)
	}
	var credentials int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM auth_credentials WHERE id = 1 AND password_hash <> ''").Scan(&credentials); err != nil || credentials != 1 {
		return fmt.Errorf("%w: credentials are missing", ErrInvalidBackup)
	}
	if _, err := db.ExecContext(ctx, "DELETE FROM sessions"); err != nil {
		return fmt.Errorf("%w: clear restored sessions: %v", ErrInvalidBackup, err)
	}
	if err := Health(ctx, db); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidBackup, err)
	}
	if err := ForeignKeyCheck(ctx, db); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidBackup, err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return fmt.Errorf("%w: checkpoint staged backup: %v", ErrInvalidBackup, err)
	}
	if err := db.Close(); err != nil {
		return fmt.Errorf("%w: close staged backup: %v", ErrInvalidBackup, err)
	}
	closed = true
	if err := os.Chmod(path, 0o600); err != nil {
		return fmt.Errorf("secure staged backup: %w", err)
	}
	if err := verifyDatabase(ctx, path); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidBackup, err)
	}
	return nil
}

func verifySQLiteHeader(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("%w: open uploaded file: %v", ErrInvalidBackup, err)
	}
	defer file.Close()
	header := make([]byte, 16)
	if _, err := io.ReadFull(file, header); err != nil || string(header) != "SQLite format 3\x00" {
		return fmt.Errorf("%w: invalid SQLite header", ErrInvalidBackup)
	}
	return nil
}

// RestoreOnline atomically restores a prepared backup into the active database.
// It uses an ephemeral rollback snapshot and returns its path only if recovery
// itself fails and operator intervention is required.
func RestoreOnline(ctx context.Context, db *sql.DB, source, dataDir string) (emergencyPath string, finalErr error) {
	rollback, err := createSnapshot(ctx, db, dataDir, false)
	if err != nil {
		return "", fmt.Errorf("create pre-restore rollback: %w", err)
	}
	removeRollback := true
	defer func() {
		if removeRollback {
			_ = os.Remove(rollback.Path)
		}
	}()

	restoreErr := restoreFromFile(ctx, db, source)
	if restoreErr == nil {
		restoreErr = Health(ctx, db)
	}
	if restoreErr == nil {
		restoreErr = ForeignKeyCheck(ctx, db)
	}
	if restoreErr == nil {
		return "", nil
	}

	recoveryErr := restoreFromFile(ctx, db, rollback.Path)
	if recoveryErr == nil {
		recoveryErr = Health(ctx, db)
	}
	if recoveryErr == nil {
		recoveryErr = ForeignKeyCheck(ctx, db)
	}
	if recoveryErr != nil {
		removeRollback = false
		return rollback.Path, fmt.Errorf("restore failed: %v; rollback failed: %w", restoreErr, recoveryErr)
	}
	return "", fmt.Errorf("restore failed and original database was recovered: %w", restoreErr)
}

type onlineRestorer interface {
	NewRestore(string) (*sqlite.Backup, error)
}

func restoreFromFile(ctx context.Context, db *sql.DB, source string) error {
	connection, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("reserve database connection: %w", err)
	}
	defer connection.Close()
	return connection.Raw(func(driverConnection any) error {
		restorer, ok := driverConnection.(onlineRestorer)
		if !ok {
			return errors.New("SQLite driver does not support online restore")
		}
		backup, err := restorer.NewRestore("file:" + filepath.ToSlash(source) + "?mode=ro")
		if err != nil {
			return fmt.Errorf("start online restore: %w", err)
		}
		finished := false
		defer func() {
			if !finished {
				_ = backup.Finish()
			}
		}()
		for more := true; more; {
			more, err = backup.Step(-1)
			if err != nil {
				return fmt.Errorf("copy online restore: %w", err)
			}
		}
		finished = true
		if err := backup.Finish(); err != nil {
			return fmt.Errorf("finish online restore: %w", err)
		}
		return nil
	})
}

func verifyDatabase(ctx context.Context, path string) error {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=foreign_keys(1)")
	if err != nil {
		return fmt.Errorf("open backup: %w", err)
	}
	defer db.Close()
	if err := quickCheck(ctx, db); err != nil {
		return fmt.Errorf("verify backup: %w", err)
	}
	if err := ForeignKeyCheck(ctx, db); err != nil {
		return fmt.Errorf("verify backup: %w", err)
	}
	return nil
}
