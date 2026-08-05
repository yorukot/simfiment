package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// BackupInfo describes one verified SQLite snapshot.
type BackupInfo struct {
	Path      string
	CreatedAt time.Time
	Size      int64
}

// CreateBackup creates a consistent snapshot with VACUUM INTO and restrictive permissions.
func CreateBackup(ctx context.Context, db *sql.DB, dataDir string, now time.Time) (BackupInfo, error) {
	dir := filepath.Join(dataDir, "backups")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return BackupInfo{}, fmt.Errorf("create backup directory: %w", err)
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return BackupInfo{}, fmt.Errorf("secure backup directory: %w", err)
	}
	name := "simfiment-" + now.UTC().Format("2006-01-02T150405Z") + ".db"
	finalPath := filepath.Join(dir, name)
	temp, err := os.CreateTemp(dir, ".simfiment-backup-*.tmp")
	if err != nil {
		return BackupInfo{}, fmt.Errorf("create backup temp file: %w", err)
	}
	tempPath := temp.Name()
	if err := temp.Close(); err != nil {
		return BackupInfo{}, err
	}
	if err := os.Remove(tempPath); err != nil {
		return BackupInfo{}, err
	}
	defer os.Remove(tempPath)
	quoted := strings.ReplaceAll(tempPath, "'", "''")
	if _, err := db.ExecContext(ctx, "VACUUM INTO '"+quoted+"'"); err != nil {
		return BackupInfo{}, fmt.Errorf("vacuum backup: %w", err)
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		return BackupInfo{}, fmt.Errorf("secure backup: %w", err)
	}
	if err := verifyDatabase(ctx, tempPath); err != nil {
		return BackupInfo{}, err
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		return BackupInfo{}, fmt.Errorf("finalize backup: %w", err)
	}
	info, err := os.Stat(finalPath)
	if err != nil {
		return BackupInfo{}, err
	}
	return BackupInfo{Path: finalPath, CreatedAt: info.ModTime(), Size: info.Size()}, nil
}

// ListBackups returns verified-looking backup files ordered newest first.
func ListBackups(dataDir string) ([]BackupInfo, error) {
	dir := filepath.Join(dataDir, "backups")
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []BackupInfo{}, nil
	}
	if err != nil {
		return nil, err
	}
	items := make([]BackupInfo, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "simfiment-") || !strings.HasSuffix(entry.Name(), ".db") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		items = append(items, BackupInfo{Path: filepath.Join(dir, entry.Name()), CreatedAt: info.ModTime(), Size: info.Size()})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	return items, nil
}

// RestoreBackup verifies a snapshot, preserves the current database, and replaces it.
// The server must be stopped before calling this function.
func RestoreBackup(ctx context.Context, dataDir, source string, now time.Time) (string, error) {
	absSource, err := filepath.Abs(source)
	if err != nil {
		return "", err
	}
	if err := verifyDatabase(ctx, absSource); err != nil {
		return "", err
	}
	target := filepath.Join(dataDir, "simfiment.db")
	rollback := ""
	if _, err := os.Stat(target); err == nil {
		rollback = target + ".rollback-" + now.UTC().Format("20060102T150405Z")
		current, openErr := sql.Open("sqlite", "file:"+target)
		if openErr != nil {
			return "", fmt.Errorf("open current database before restore: %w", openErr)
		}
		if _, checkpointErr := current.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); checkpointErr != nil {
			current.Close()
			return "", fmt.Errorf("checkpoint current database: %w", checkpointErr)
		}
		if closeErr := current.Close(); closeErr != nil {
			return "", closeErr
		}
		if err := copyFile(target, rollback); err != nil {
			return "", fmt.Errorf("preserve current database: %w", err)
		}
	}
	temp := target + ".restore-tmp"
	if err := copyFile(absSource, temp); err != nil {
		return rollback, fmt.Errorf("stage restore: %w", err)
	}
	defer os.Remove(temp)
	if err := os.Rename(temp, target); err != nil {
		return rollback, fmt.Errorf("replace database: %w", err)
	}
	_ = os.Remove(target + "-wal")
	_ = os.Remove(target + "-shm")
	if err := os.Chmod(target, 0o600); err != nil {
		return rollback, err
	}
	return rollback, nil
}

func verifyDatabase(ctx context.Context, path string) error {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
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

func copyFile(source, target string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := output.ReadFrom(input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}
