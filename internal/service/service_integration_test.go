package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/platform"
)

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }

func newTestService(t *testing.T, now time.Time) (*Service, func()) {
	t.Helper()
	dir := t.TempDir()
	db, err := database.Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg := platform.Config{DataDir: dir, BaseURL: "http://example.test", SessionDays: 30,
		Argon2MemoryKiB: 19_456, Argon2Iterations: 2, Argon2Parallelism: 1}
	svc := New(db, cfg, fixedClock{now: now})
	_, err = svc.Setup(context.Background(), SetupInput{
		Password: "a sufficiently long password", Timezone: "Asia/Taipei", Locale: "zh-TW", CurrencyCode: "TWD"})
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	return svc, func() { _ = db.Close() }
}

func TestCoreTransactionVerticalSlice(t *testing.T) {
	now := time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)
	svc, closeDB := newTestService(t, now)
	defer closeDB()
	ctx := context.Background()
	categories, err := svc.ListCategories(ctx, "expense", false)
	if err != nil || len(categories) == 0 {
		t.Fatalf("default categories: len=%d err=%v", len(categories), err)
	}
	input := TransactionInput{ClientRequestID: "898934c9-f75a-4d1d-9847-d127f288c39a",
		Kind: "expense", AmountMinor: 180, CategoryID: categories[0].ID, Title: "  ",
		OccurredAt: now, LocationIntent: "capture"}
	created, err := svc.CreateTransaction(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if created.Title != "" || created.LocationStatus != "pending" || created.OccurredLocalDate != "2026-08-05" {
		t.Fatalf("unexpected created transaction: %#v", created)
	}
	retried, err := svc.CreateTransaction(ctx, input)
	if err != nil || retried.ID != created.ID {
		t.Fatalf("idempotent retry: id=%d err=%v", retried.ID, err)
	}
	if _, err := svc.ArchiveCategory(ctx, categories[0].ID); err != nil {
		t.Fatalf("archive historical category: %v", err)
	}
	retried, err = svc.CreateTransaction(ctx, input)
	if err != nil || retried.ID != created.ID || retried.Category.ArchivedAt == nil {
		t.Fatalf("idempotent retry after category archive: %#v err=%v", retried, err)
	}
	changed := input
	changed.AmountMinor = 181
	_, err = svc.CreateTransaction(ctx, changed)
	var conflict *domain.Error
	if !errors.As(err, &conflict) || conflict.Code != "idempotency_conflict" {
		t.Fatalf("different idempotent payload: %v", err)
	}
	dashboard, err := svc.DailyDashboard(ctx, "2026-08-05")
	if err != nil || dashboard.Totals.ExpenseMinor != 180 || dashboard.Totals.TransactionCount != 1 {
		t.Fatalf("dashboard after create: %#v err=%v", dashboard.Totals, err)
	}
	deleted, err := svc.DeleteTransaction(ctx, created.ID)
	if err != nil || deleted.DeletedAt == nil {
		t.Fatalf("delete: %#v err=%v", deleted, err)
	}
	export, err := svc.ExportTransactions(ctx)
	if err != nil || len(export.Transactions) != 0 || export.CurrencyExponent != 0 {
		t.Fatalf("export after delete: %#v err=%v", export, err)
	}
	dashboard, _ = svc.DailyDashboard(ctx, "2026-08-05")
	if dashboard.Totals.TransactionCount != 0 {
		t.Fatalf("deleted transaction counted: %#v", dashboard.Totals)
	}
	restored, err := svc.RestoreTransaction(ctx, created.ID)
	if err != nil || restored.DeletedAt != nil {
		t.Fatalf("restore: %#v err=%v", restored, err)
	}
	export, err = svc.ExportTransactions(ctx)
	if err != nil || len(export.Transactions) != 1 || export.Transactions[0].ID != created.ID {
		t.Fatalf("export after restore: %#v err=%v", export, err)
	}
	dashboard, _ = svc.DailyDashboard(ctx, "2026-08-05")
	if dashboard.Totals.ExpenseMinor != 180 {
		t.Fatalf("restored transaction missing: %#v", dashboard.Totals)
	}
}

func TestEnglishSetupSeedsEnglishCategories(t *testing.T) {
	dir := t.TempDir()
	db, err := database.Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cfg := platform.Config{DataDir: dir, BaseURL: "http://example.test", SessionDays: 30,
		Argon2MemoryKiB: 19_456, Argon2Iterations: 2, Argon2Parallelism: 1}
	svc := New(db, cfg, fixedClock{now: time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)})
	if _, err := svc.Setup(context.Background(), SetupInput{
		Password: "a sufficiently long password", Timezone: "Asia/Taipei", Locale: "en", CurrencyCode: "TWD"}); err != nil {
		t.Fatal(err)
	}
	expense, err := svc.ListCategories(context.Background(), "expense", false)
	if err != nil || len(expense) == 0 || expense[0].Name != "Food" {
		t.Fatalf("english expense categories = %#v err=%v", expense, err)
	}
	income, err := svc.ListCategories(context.Background(), "income", false)
	if err != nil || len(income) == 0 || income[0].Name != "Salary" {
		t.Fatalf("english income categories = %#v err=%v", income, err)
	}
}

func TestSetupDerivesSupportedCurrencyExponent(t *testing.T) {
	dir := t.TempDir()
	db, err := database.Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cfg := platform.Config{DataDir: dir, BaseURL: "http://example.test", SessionDays: 30,
		Argon2MemoryKiB: 19_456, Argon2Iterations: 2, Argon2Parallelism: 1}
	svc := New(db, cfg, fixedClock{now: time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)})
	result, err := svc.Setup(context.Background(), SetupInput{Password: "a sufficiently long password",
		Timezone: "Asia/Taipei", Locale: "zh-TW", CurrencyCode: "kwd"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Settings.CurrencyCode != "KWD" || result.Settings.CurrencyExponent != 3 {
		t.Fatalf("setup currency = %#v", result.Settings)
	}
}

func TestCurrencyChangeRewritesLedgerAndTruncatesAfterConfirmation(t *testing.T) {
	now := time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)
	svc, closeDB := newTestService(t, now)
	defer closeDB()
	ctx := context.Background()

	if _, err := svc.UpdateSettings(ctx, SettingsUpdate{CurrencyCode: pointer("USD")}); err == nil {
		t.Fatal("currency changed without confirmation")
	} else {
		var conflict *domain.Error
		if !errors.As(err, &conflict) || conflict.Code != "currency_confirmation_required" {
			t.Fatalf("unconfirmed currency error = %v", err)
		}
	}
	settings, _ := svc.Settings(ctx)
	if settings.CurrencyCode != "TWD" || settings.CurrencyExponent != 0 {
		t.Fatalf("unconfirmed settings changed = %#v", settings)
	}

	if _, err := svc.UpdateSettings(ctx, SettingsUpdate{CurrencyCode: pointer("USD"), ConfirmCurrencyChange: true}); err != nil {
		t.Fatal(err)
	}
	categories, _ := svc.ListCategories(ctx, "expense", false)
	transaction, err := svc.CreateTransaction(ctx, TransactionInput{ClientRequestID: "currency-transaction-0001",
		Kind: "expense", AmountMinor: 1234, CategoryID: categories[0].ID, OccurredAt: now,
		LocationIntent: "none"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.DeleteTransaction(ctx, transaction.ID); err != nil {
		t.Fatal(err)
	}
	rule, err := svc.CreateRecurringRule(ctx, RecurringRuleInput{ClientRequestID: "currency-rule-0001",
		Kind: "expense", AmountMinor: 5678, CategoryID: categories[0].ID, Title: "Plan",
		Frequency: "monthly", IntervalCount: 1, StartOn: "2026-08-05"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ArchiveRecurringRule(ctx, rule.ID); err != nil {
		t.Fatal(err)
	}

	updated, err := svc.UpdateSettings(ctx, SettingsUpdate{CurrencyCode: pointer("JPY"), ConfirmCurrencyChange: true})
	if err != nil {
		t.Fatal(err)
	}
	if updated.CurrencyCode != "JPY" || updated.CurrencyExponent != 0 {
		t.Fatalf("updated settings = %#v", updated)
	}
	transaction, err = svc.GetTransaction(ctx, transaction.ID)
	if err != nil || transaction.AmountMinor != 12 || transaction.CurrencyCode != "JPY" || transaction.DeletedAt == nil {
		t.Fatalf("rewritten deleted transaction = %#v err=%v", transaction, err)
	}
	rules, err := svc.ListRecurringRules(ctx, true)
	if err != nil || len(rules) != 1 || rules[0].AmountMinor != 56 || rules[0].CurrencyCode != "JPY" {
		t.Fatalf("rewritten archived rule = %#v err=%v", rules, err)
	}
	occurrences, err := svc.ListRecurringOccurrences(ctx, "")
	if err != nil || len(occurrences) != 1 || occurrences[0].AmountMinor != 56 || occurrences[0].CurrencyCode != "JPY" {
		t.Fatalf("rewritten occurrence = %#v err=%v", occurrences, err)
	}
}

func TestCurrencyChangeRollsBackZeroAndOverflow(t *testing.T) {
	now := time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)

	t.Run("truncates to zero", func(t *testing.T) {
		svc, closeDB := newTestService(t, now)
		defer closeDB()
		ctx := context.Background()
		if _, err := svc.UpdateSettings(ctx, SettingsUpdate{CurrencyCode: pointer("USD"), ConfirmCurrencyChange: true}); err != nil {
			t.Fatal(err)
		}
		categories, _ := svc.ListCategories(ctx, "expense", false)
		created, err := svc.CreateTransaction(ctx, TransactionInput{ClientRequestID: "currency-zero-0001",
			Kind: "expense", AmountMinor: 50, CategoryID: categories[0].ID, OccurredAt: now,
			LocationIntent: "none"})
		if err != nil {
			t.Fatal(err)
		}
		_, err = svc.UpdateSettings(ctx, SettingsUpdate{CurrencyCode: pointer("JPY"), ConfirmCurrencyChange: true})
		var validation *domain.Error
		if !errors.As(err, &validation) || validation.Code != "validation_error" {
			t.Fatalf("zero conversion error = %v", err)
		}
		settings, _ := svc.Settings(ctx)
		unchanged, _ := svc.GetTransaction(ctx, created.ID)
		if settings.CurrencyCode != "USD" || unchanged.AmountMinor != 50 || unchanged.CurrencyCode != "USD" {
			t.Fatalf("zero conversion was not rolled back: %#v %#v", settings, unchanged)
		}
	})

	t.Run("overflows", func(t *testing.T) {
		svc, closeDB := newTestService(t, now)
		defer closeDB()
		ctx := context.Background()
		categories, _ := svc.ListCategories(ctx, "expense", false)
		created, err := svc.CreateTransaction(ctx, TransactionInput{ClientRequestID: "currency-overflow-0001",
			Kind: "expense", AmountMinor: domain.MaxAmountMinor, CategoryID: categories[0].ID,
			OccurredAt: now, LocationIntent: "none"})
		if err != nil {
			t.Fatal(err)
		}
		_, err = svc.UpdateSettings(ctx, SettingsUpdate{CurrencyCode: pointer("USD"), ConfirmCurrencyChange: true})
		var validation *domain.Error
		if !errors.As(err, &validation) || validation.Code != "validation_error" {
			t.Fatalf("overflow conversion error = %v", err)
		}
		settings, _ := svc.Settings(ctx)
		unchanged, _ := svc.GetTransaction(ctx, created.ID)
		if settings.CurrencyCode != "TWD" || unchanged.AmountMinor != domain.MaxAmountMinor || unchanged.CurrencyCode != "TWD" {
			t.Fatalf("overflow conversion was not rolled back: %#v %#v", settings, unchanged)
		}
	})
}

func pointer(value string) *string { return &value }

func TestLocationAttachAndRemove(t *testing.T) {
	now := time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)
	svc, closeDB := newTestService(t, now)
	defer closeDB()
	ctx := context.Background()
	categories, _ := svc.ListCategories(ctx, "expense", false)
	created, err := svc.CreateTransaction(ctx, TransactionInput{ClientRequestID: "location-test-0001",
		Kind: "expense", AmountMinor: 50, CategoryID: categories[0].ID, OccurredAt: now, LocationIntent: "capture"})
	if err != nil {
		t.Fatal(err)
	}
	accuracy := 12.5
	attached, err := svc.AttachLocation(ctx, created.ID, LocationInput{Latitude: 25.033, Longitude: 121.5654, AccuracyM: &accuracy, CapturedAt: now})
	if err != nil || attached.Location == nil || attached.LocationStatus != "attached" {
		t.Fatalf("attach: %#v err=%v", attached, err)
	}
	removed, err := svc.RemoveLocation(ctx, created.ID)
	if err != nil || removed.Location != nil || removed.LocationStatus != "skipped" {
		t.Fatalf("remove: %#v err=%v", removed, err)
	}
}

func TestRecurringGenerationSnapshotsMonthEnd(t *testing.T) {
	// 03:00 on April 30 in Asia/Taipei verifies that confirming today's
	// occurrence does not default to a future noon timestamp.
	now := time.Date(2026, 4, 29, 19, 0, 0, 0, time.UTC)
	svc, closeDB := newTestService(t, now)
	defer closeDB()
	ctx := context.Background()
	categories, _ := svc.ListCategories(ctx, "expense", false)
	_, err := svc.CreateRecurringRule(ctx, RecurringRuleInput{ClientRequestID: "rule-month-end-0001",
		Kind: "expense", AmountMinor: 1000, CategoryID: categories[0].ID, Title: "Rent",
		Frequency: "monthly", IntervalCount: 1, StartOn: "2026-01-31"})
	if err != nil {
		t.Fatal(err)
	}
	items, err := svc.ListRecurringOccurrences(ctx, "pending")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"}
	if len(items) != len(want) {
		t.Fatalf("got %d items, want %d", len(items), len(want))
	}
	for i, expected := range want {
		if items[i].ScheduledOn != expected {
			t.Errorf("item %d: got %s want %s", i, items[i].ScheduledOn, expected)
		}
	}
	transaction, err := svc.ConfirmOccurrence(ctx, items[0].ID, RecurringConfirmInput{})
	if err != nil || transaction.Source != "recurring" || transaction.LocationStatus != "none" {
		t.Fatalf("confirm: %#v err=%v", transaction, err)
	}
	if _, err := svc.ConfirmOccurrence(ctx, items[0].ID, RecurringConfirmInput{}); err == nil {
		t.Fatal("confirmed occurrence could be confirmed twice")
	}
	if _, err := svc.SkipOccurrence(ctx, items[1].ID); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordChangeRevokesOtherSessionsAndExpiration(t *testing.T) {
	now := time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)
	svc, closeDB := newTestService(t, now)
	defer closeDB()
	ctx := context.Background()
	current, err := svc.Login(ctx, "192.0.2.1", "a sufficiently long password")
	if err != nil {
		t.Fatal(err)
	}
	other, err := svc.Login(ctx, "192.0.2.2", "a sufficiently long password")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.ChangePassword(ctx, current.Session.ID, "a sufficiently long password", "a different long password"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(ctx, other.Token); err == nil {
		t.Fatal("other session remained valid after password change")
	}
	if _, err := svc.Authenticate(ctx, current.Token); err != nil {
		t.Fatalf("current session was revoked: %v", err)
	}

	login, err := svc.Login(ctx, "192.0.2.3", "a different long password")
	if err != nil {
		t.Fatal(err)
	}
	svc.clock = fixedClock{now: now.Add(31 * 24 * time.Hour)}
	if _, err := svc.Authenticate(ctx, login.Token); err == nil {
		t.Fatal("expired session remained valid")
	}
}

func TestTransactionCursorFollowsOccurredAtOrder(t *testing.T) {
	now := time.Date(2026, 8, 5, 5, 0, 0, 0, time.UTC)
	svc, closeDB := newTestService(t, now)
	defer closeDB()
	ctx := context.Background()
	categories, _ := svc.ListCategories(ctx, "expense", false)
	for index, hour := range []int{2, 1, 4} {
		_, err := svc.CreateTransaction(ctx, TransactionInput{
			ClientRequestID: "pagination-request-000" + intString(int64(index+1)),
			Kind:            "expense",
			AmountMinor:     int64(index + 1),
			CategoryID:      categories[0].ID,
			OccurredAt:      time.Date(2026, 8, 5, hour, 0, 0, 0, time.UTC),
			LocationIntent:  "none",
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	first, cursor, err := svc.ListTransactions(ctx, TransactionFilters{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 2 || first[0].AmountMinor != 3 || first[1].AmountMinor != 1 || cursor == "" {
		t.Fatalf("first page = %#v cursor=%q", first, cursor)
	}
	second, next, err := svc.ListTransactions(ctx, TransactionFilters{Limit: 2, Cursor: cursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(second) != 1 || second[0].AmountMinor != 2 || next != "" {
		t.Fatalf("second page = %#v cursor=%q", second, next)
	}
}
