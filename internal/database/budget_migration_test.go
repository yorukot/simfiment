package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestVersionOneBackupUpgradesWithoutChangingTransactions(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	definitions, err := embeddedMigrations()
	if err != nil {
		t.Fatal(err)
	}
	first := definitions[0]
	if _, err := db.Exec(first.body); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO schema_migrations VALUES (?, ?, ?, 1)", first.version, first.name, first.checksum); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	seedInitializedDatabase(t, db, now, "old-password")
	insertCategoryMarker(t, db, now, "expense", "Old expense")
	if _, err := db.Exec(`INSERT INTO transactions(client_request_id, request_fingerprint, kind, amount_minor, currency_code, category_id,
        occurred_at_utc_ms, occurred_local_date, occurred_timezone, created_at, updated_at)
        VALUES ('old-entry', 'old-fingerprint', 'expense', 270, 'TWD', 1, 1, '2026-08-01', 'Asia/Taipei', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if err := PrepareRestoreFile(ctx, path); err != nil {
		t.Fatal(err)
	}
	upgraded, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	defer upgraded.Close()
	var amount int64
	var fingerprint, person string
	if err := upgraded.QueryRow("SELECT amount_minor, request_fingerprint, settlement_counterparty FROM transactions").Scan(&amount, &fingerprint, &person); err != nil {
		t.Fatal(err)
	}
	if amount != 270 || fingerprint != "old-fingerprint" || person != "" {
		t.Fatal("migration changed old transaction")
	}
	var count int
	if err := upgraded.QueryRow("SELECT COUNT(*) FROM budget_versions").Scan(&count); err != nil || count != 0 {
		t.Fatalf("unexpected budgets: %d %v", count, err)
	}
}
