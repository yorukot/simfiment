package database

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDownloadBackupAndOnlineRestoreRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	now := time.Date(2026, time.August, 5, 8, 9, 10, 0, time.UTC)
	sourceDir := t.TempDir()
	sourceDB, err := Open(ctx, sourceDir)
	if err != nil {
		t.Fatalf("open source database: %v", err)
	}
	defer sourceDB.Close()
	seedInitializedDatabase(t, sourceDB, now, "backup-password-hash")
	insertCategoryMarker(t, sourceDB, now, "expense", "Backup marker")
	if _, err := sourceDB.ExecContext(ctx, `INSERT INTO sessions(
		token_hash, csrf_token_hash, password_version, created_at, last_seen_at, expires_at
	) VALUES (x'01', x'02', 1, ?, ?, ?)`, now.UnixMilli(), now.UnixMilli(), now.Add(time.Hour).UnixMilli()); err != nil {
		t.Fatalf("insert source session: %v", err)
	}

	backup, err := CreateDownloadBackup(ctx, sourceDB, sourceDir)
	if err != nil {
		t.Fatalf("create download backup: %v", err)
	}
	defer os.Remove(backup.Path)
	if mode := fileMode(t, backup.Path); mode.Perm() != 0o600 {
		t.Fatalf("backup mode = %o, want 600", mode.Perm())
	}
	backupDB, err := sql.Open("sqlite", "file:"+backup.Path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	var sessionCount int
	if err := backupDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM sessions").Scan(&sessionCount); err != nil {
		t.Fatal(err)
	}
	_ = backupDB.Close()
	if sessionCount != 0 {
		t.Fatalf("download backup session count = %d, want 0", sessionCount)
	}
	if err := PrepareRestoreFile(ctx, backup.Path); err != nil {
		t.Fatalf("prepare restore file: %v", err)
	}

	destinationDir := t.TempDir()
	destinationDB, err := Open(ctx, destinationDir)
	if err != nil {
		t.Fatalf("open destination database: %v", err)
	}
	defer destinationDB.Close()
	seedInitializedDatabase(t, destinationDB, now, "destination-password-hash")
	insertCategoryMarker(t, destinationDB, now, "income", "Old destination marker")
	emergencyPath, err := RestoreOnline(ctx, destinationDB, backup.Path, destinationDir)
	if err != nil {
		t.Fatalf("restore backup: %v", err)
	}
	if emergencyPath != "" {
		t.Fatalf("emergency path = %q, want empty", emergencyPath)
	}

	assertCategoryCount(t, destinationDB, "Backup marker", 1)
	assertCategoryCount(t, destinationDB, "Old destination marker", 0)
	var passwordHash string
	if err := destinationDB.QueryRowContext(ctx, "SELECT password_hash FROM auth_credentials WHERE id = 1").Scan(&passwordHash); err != nil {
		t.Fatal(err)
	}
	if passwordHash != "backup-password-hash" {
		t.Fatalf("restored password hash = %q", passwordHash)
	}
	if err := destinationDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM sessions").Scan(&sessionCount); err != nil {
		t.Fatal(err)
	}
	if sessionCount != 0 {
		t.Fatalf("restored session count = %d, want 0", sessionCount)
	}
	if mode := fileMode(t, filepath.Join(destinationDir, "simfiment.db")); mode.Perm() != 0o600 {
		t.Fatalf("restored database mode = %o, want 600", mode.Perm())
	}
	if matches, err := filepath.Glob(filepath.Join(destinationDir, ".simfiment-snapshot-*.db")); err != nil || len(matches) != 0 {
		t.Fatalf("rollback snapshots after success = %v, err = %v", matches, err)
	}
}

func TestPrepareRestoreRejectsInvalidAndNewerBackups(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	invalid := filepath.Join(t.TempDir(), "invalid.db")
	if err := os.WriteFile(invalid, []byte("not sqlite"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := PrepareRestoreFile(ctx, invalid); !errors.Is(err, ErrInvalidBackup) {
		t.Fatalf("invalid backup error = %v", err)
	}

	dir := t.TempDir()
	db, err := Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, time.August, 5, 8, 9, 10, 0, time.UTC)
	seedInitializedDatabase(t, db, now, "backup-password-hash")
	backup, err := CreateDownloadBackup(ctx, db, dir)
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(backup.Path)
	_ = db.Close()
	backupDB, err := sql.Open("sqlite", "file:"+backup.Path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := backupDB.ExecContext(ctx, `INSERT INTO schema_migrations(version, name, checksum, applied_at)
		VALUES (999, 'future.sql', 'future', ?)`, now.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	_ = backupDB.Close()
	if err := PrepareRestoreFile(ctx, backup.Path); !errors.Is(err, ErrNewerSchema) {
		t.Fatalf("newer backup error = %v", err)
	}
}

func seedInitializedDatabase(t *testing.T, db *sql.DB, now time.Time, passwordHash string) {
	t.Helper()
	ms := now.UnixMilli()
	if _, err := db.Exec(`INSERT INTO app_settings(
		id, initialized_at, currency_code, currency_exponent, timezone, locale, theme,
		automatic_location_enabled, created_at, updated_at
	) VALUES (1, ?, 'TWD', 0, 'Asia/Taipei', 'zh-TW', 'system', 0, ?, ?)`, ms, ms, ms); err != nil {
		t.Fatalf("seed app settings: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO auth_credentials(
		id, password_hash, password_version, created_at, updated_at
	) VALUES (1, ?, 1, ?, ?)`, passwordHash, ms, ms); err != nil {
		t.Fatalf("seed credentials: %v", err)
	}
}

func insertCategoryMarker(t *testing.T, db *sql.DB, now time.Time, kind, name string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO categories(
		kind, name, icon_key, sort_order, created_at, updated_at
	) VALUES (?, ?, '', 0, ?, ?)`, kind, name, now.UnixMilli(), now.UnixMilli()); err != nil {
		t.Fatalf("insert marker: %v", err)
	}
}

func assertCategoryCount(t *testing.T, db *sql.DB, name string, want int) {
	t.Helper()
	var got int
	if err := db.QueryRow("SELECT COUNT(*) FROM categories WHERE name = ?", name).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("category %q count = %d, want %d", name, got, want)
	}
}

func fileMode(t *testing.T, path string) os.FileMode {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat %s: %v", path, err)
	}
	return info.Mode()
}
