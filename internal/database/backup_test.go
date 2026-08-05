package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBackupRestoreRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	sourceDir := t.TempDir()
	sourceDB, err := Open(ctx, sourceDir)
	if err != nil {
		t.Fatalf("open source database: %v", err)
	}
	now := time.Date(2026, time.August, 5, 8, 9, 10, 0, time.UTC)
	if _, err := sourceDB.ExecContext(ctx, `INSERT INTO categories
		(kind, name, icon_key, sort_order, created_at, updated_at)
		VALUES ('expense', 'Backup marker', '', 0, ?, ?)`, now.UnixMilli(), now.UnixMilli()); err != nil {
		t.Fatalf("insert marker: %v", err)
	}
	backup, err := CreateBackup(ctx, sourceDB, sourceDir, now)
	if err != nil {
		t.Fatalf("create backup: %v", err)
	}
	if err := sourceDB.Close(); err != nil {
		t.Fatalf("close source database: %v", err)
	}
	if mode := fileMode(t, backup.Path); mode.Perm() != 0o600 {
		t.Fatalf("backup mode = %o, want 600", mode.Perm())
	}

	destinationDir := t.TempDir()
	destinationDB, err := Open(ctx, destinationDir)
	if err != nil {
		t.Fatalf("open destination database: %v", err)
	}
	if _, err := destinationDB.ExecContext(ctx, `INSERT INTO categories
		(kind, name, icon_key, sort_order, created_at, updated_at)
		VALUES ('income', 'Old destination marker', '', 0, ?, ?)`, now.UnixMilli(), now.UnixMilli()); err != nil {
		t.Fatalf("insert destination marker: %v", err)
	}
	if err := destinationDB.Close(); err != nil {
		t.Fatalf("close destination database: %v", err)
	}

	rollback, err := RestoreBackup(ctx, destinationDir, backup.Path, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("restore backup: %v", err)
	}
	if rollback == "" {
		t.Fatal("expected rollback copy for existing database")
	}
	if _, err := os.Stat(rollback); err != nil {
		t.Fatalf("stat rollback copy: %v", err)
	}

	restoredDB, err := Open(ctx, destinationDir)
	if err != nil {
		t.Fatalf("open restored database: %v", err)
	}
	defer restoredDB.Close()
	var markerCount int
	if err := restoredDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM categories WHERE name = 'Backup marker'").Scan(&markerCount); err != nil {
		t.Fatalf("read restored marker: %v", err)
	}
	if markerCount != 1 {
		t.Fatalf("restored marker count = %d, want 1", markerCount)
	}
	var oldCount int
	if err := restoredDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM categories WHERE name = 'Old destination marker'").Scan(&oldCount); err != nil {
		t.Fatalf("read destination marker: %v", err)
	}
	if oldCount != 0 {
		t.Fatalf("old destination marker count = %d, want 0", oldCount)
	}
	if mode := fileMode(t, filepath.Join(destinationDir, "simfiment.db")); mode.Perm() != 0o600 {
		t.Fatalf("restored database mode = %o, want 600", mode.Perm())
	}

	freshDir := t.TempDir()
	rollback, err = RestoreBackup(ctx, freshDir, backup.Path, now.Add(2*time.Hour))
	if err != nil {
		t.Fatalf("restore into fresh directory: %v", err)
	}
	if rollback != "" {
		t.Fatalf("fresh restore rollback path = %q, want empty", rollback)
	}
	freshDB, err := Open(ctx, freshDir)
	if err != nil {
		t.Fatalf("open fresh restore: %v", err)
	}
	defer freshDB.Close()
	if err := freshDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM categories WHERE name = 'Backup marker'").Scan(&markerCount); err != nil {
		t.Fatalf("read fresh restored marker: %v", err)
	}
	if markerCount != 1 {
		t.Fatalf("fresh restored marker count = %d, want 1", markerCount)
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
