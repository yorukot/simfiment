package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"simfiment/internal/domain"
)

func TestBudgetDailyCarryAndTransactionChanges(t *testing.T) {
	ctx := context.Background()
	svc, closeDB := newTestService(t, time.Date(2026, 9, 2, 5, 0, 0, 0, time.UTC))
	defer closeDB()
	categories, _ := svc.ListCategories(ctx, "expense", false)
	category := categories[0].ID
	_, err := svc.SetBudgets(ctx, "2026-09", BudgetsInput{Items: []domain.BudgetLimit{{AmountMinor: 9000}, {CategoryID: category, AmountMinor: 9000}}})
	if err != nil {
		t.Fatal(err)
	}
	first, err := svc.CreateTransaction(ctx, TransactionInput{ClientRequestID: "budget-first-expense", Kind: "expense", AmountMinor: 400, CategoryID: category, OccurredAt: svc.clock.Now().AddDate(0, 0, -1), LocationIntent: "none"})
	if err != nil {
		t.Fatal(err)
	}
	check := func(wantFirst, wantSecond, wantMonth int64) {
		t.Helper()
		budget, err := svc.Budgets(ctx, "2026-09")
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range budget.Items {
			if item.Days[0].AvailableMinor != wantFirst || item.Days[1].AvailableMinor != wantSecond || item.RemainingMinor != wantMonth {
				t.Fatalf("unexpected balances: %+v", item)
			}
		}
	}
	check(-100, 200, 8600)
	income, _ := svc.ListCategories(ctx, "income", false)
	if _, err := svc.CreateTransaction(ctx, TransactionInput{ClientRequestID: "budget-income-not-credit", Kind: "income", AmountMinor: 1000, CategoryID: income[0].ID, OccurredAt: svc.clock.Now(), LocationIntent: "none"}); err != nil {
		t.Fatal(err)
	}
	check(-100, 200, 8600)
	if _, err := svc.UpdateTransaction(ctx, first.ID, TransactionUpdate{Kind: "expense", AmountMinor: 200, CategoryID: category, OccurredAt: first.OccurredAt}); err != nil {
		t.Fatal(err)
	}
	check(100, 400, 8800)
	if _, err := svc.DeleteTransaction(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	check(300, 600, 9000)
	if _, err := svc.RestoreTransaction(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	check(100, 400, 8800)
	next, err := svc.Budgets(ctx, "2026-10")
	if err != nil || next.EffectiveMonth != "2026-09" || next.Items[0].Days[0].AvailableMinor != 9000/31 || next.Items[0].RemainingMinor != 9000 {
		t.Fatalf("month reset: %+v %v", next, err)
	}
}

func TestBudgetVersionsRoundingAndValidation(t *testing.T) {
	ctx := context.Background()
	svc, closeDB := newTestService(t, time.Date(2026, 9, 15, 5, 0, 0, 0, time.UTC))
	defer closeDB()
	for _, month := range []string{"2024-02", "2025-02", "2026-04", "2026-07"} {
		budget, err := svc.SetBudgets(ctx, month, BudgetsInput{Items: []domain.BudgetLimit{{AmountMinor: 100}}})
		if err != nil {
			t.Fatal(err)
		}
		var allocated int64
		for _, day := range budget.Items[0].Days {
			allocated += day.AllocationMinor
		}
		if allocated != 100 || budget.Items[0].Days[len(budget.Items[0].Days)-1].AvailableMinor != 100 {
			t.Fatalf("rounding lost money: %+v", budget)
		}
	}
	if _, err := svc.SetBudgets(ctx, "2026-09", BudgetsInput{Items: []domain.BudgetLimit{{AmountMinor: 300}}}); err != nil {
		t.Fatal(err)
	}
	before, _ := svc.Budgets(ctx, "2026-08")
	if before.Items[0].AmountMinor != 100 {
		t.Fatal("changed earlier budget")
	}
	// An explicit empty version disables rather than inheriting previous caps.
	if _, err := svc.SetBudgets(ctx, "2026-10", BudgetsInput{Items: []domain.BudgetLimit{}}); err != nil {
		t.Fatal(err)
	}
	after, _ := svc.Budgets(ctx, "2026-11")
	if len(after.Items) != 0 || after.EffectiveMonth != "2026-10" {
		t.Fatal("disabled version was not inherited")
	}
	income, _ := svc.ListCategories(ctx, "income", false)
	for _, items := range [][]domain.BudgetLimit{nil, {{AmountMinor: 0}}, {{AmountMinor: domain.MaxAmountMinor + 1}}, {{AmountMinor: 50}, {AmountMinor: 100}}, {{CategoryID: income[0].ID, AmountMinor: 50}}, {{CategoryID: -1, AmountMinor: 50}}} {
		if _, err := svc.SetBudgets(ctx, "2026-09", BudgetsInput{Items: items}); err == nil {
			t.Fatalf("accepted invalid limits: %+v", items)
		}
	}
	preserved, _ := svc.Budgets(ctx, "2026-09")
	if preserved.Items[0].AmountMinor != 300 {
		t.Fatal("invalid save changed budget")
	}
	for _, month := range []string{"2026-2", "2026-13", "garbage", "0000-01"} {
		if _, err := svc.Budgets(ctx, month); err == nil {
			t.Fatalf("accepted invalid month %q", month)
		}
	}
}

func TestSettlementsCountOnceAndPreserveHistory(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 9, 1, 5, 0, 0, 0, time.UTC)
	svc, closeDB := newTestService(t, now)
	defer closeDB()
	for _, kind := range []string{"expense", "income"} {
		categories, _ := svc.ListCategories(ctx, kind, false)
		input := TransactionInput{ClientRequestID: "settlement-lunch-" + kind, Kind: kind, AmountMinor: 270, CategoryID: categories[0].ID, Title: "午餐", OccurredAt: now, LocationIntent: "none"}
		if kind == "income" {
			input.Settlement = &SettlementInput{Counterparty: " Alex ", DueOn: "2026-09-02"}
		}
		item, err := svc.CreateTransaction(ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		if kind == "expense" {
			continue
		}
		if item.Settlement == nil || item.Settlement.Counterparty != "Alex" || item.Settlement.Status != "pending" {
			t.Fatalf("tracking: %+v", item)
		}
		retry, err := svc.CreateTransaction(ctx, input)
		if err != nil || retry.ID != item.ID {
			t.Fatalf("retry: %+v %v", retry, err)
		}
		input.Settlement = &SettlementInput{Counterparty: "Other"}
		if _, err := svc.CreateTransaction(ctx, input); err == nil {
			t.Fatal("expected idempotency conflict")
		}
		svc.clock = fixedClock{now: now.AddDate(0, 0, 1)}
		done, err := svc.CompleteSettlement(ctx, item.ID, true)
		if err != nil || done.Settlement.Status != "completed" || done.DeletedAt != nil || done.OccurredLocalDate != "2026-09-01" {
			t.Fatalf("complete: %+v %v", done, err)
		}
		svc.clock = fixedClock{now: now.AddDate(0, 0, 2)}
		repeated, err := svc.CompleteSettlement(ctx, item.ID, true)
		if err != nil || !repeated.Settlement.CompletedAt.Equal(*done.Settlement.CompletedAt) {
			t.Fatal("completion not idempotent")
		}
		pending, _, _ := svc.ListTransactions(ctx, TransactionFilters{SettlementStatus: "pending"})
		if len(pending) != 0 {
			t.Fatal("completed item still pending")
		}
		if _, err := svc.CompleteSettlement(ctx, item.ID, false); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.DeleteTransaction(ctx, item.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.CompleteSettlement(ctx, item.ID, true); err == nil {
			t.Fatal("completed deleted transaction")
		}
		pending, _, _ = svc.ListTransactions(ctx, TransactionFilters{SettlementStatus: "pending"})
		if len(pending) != 0 {
			t.Fatal("deleted tracking visible")
		}
		restored, err := svc.RestoreTransaction(ctx, item.ID)
		if err != nil || restored.Settlement.Status != "pending" {
			t.Fatal("restore lost tracking")
		}
		if _, err := svc.UpdateTransaction(ctx, item.ID, TransactionUpdate{Kind: kind, AmountMinor: 270, CategoryID: item.Category.ID, Title: item.Title, OccurredAt: item.OccurredAt}); err != nil {
			t.Fatal(err)
		}
		updated, _ := svc.GetTransaction(ctx, item.ID)
		if updated.Settlement == nil {
			t.Fatal("legacy update cleared tracking")
		}
		if _, err := svc.UpdateTransaction(ctx, item.ID, TransactionUpdate{Kind: kind, AmountMinor: 270, CategoryID: item.Category.ID, Title: item.Title, OccurredAt: item.OccurredAt, Settlement: &SettlementInput{}}); err != nil {
			t.Fatal(err)
		}
		cleared, _ := svc.GetTransaction(ctx, item.ID)
		if cleared.Settlement != nil {
			t.Fatal("explicit removal retained tracking")
		}
	}
	day, err := svc.DailyDashboard(ctx, "2026-09-01")
	if err != nil || day.Totals.ExpenseMinor != 270 || day.Totals.IncomeMinor != 270 || day.Totals.TransactionCount != 2 {
		t.Fatalf("lunch accounting: %+v %v", day, err)
	}
	next, _ := svc.DailyDashboard(ctx, "2026-09-02")
	if next.Totals.TransactionCount != 0 {
		t.Fatal("completion created new transaction")
	}
}

func TestSettlementValidationAndBudgetCurrency(t *testing.T) {
	ctx := context.Background()
	svc, closeDB := newTestService(t, time.Date(2026, 9, 1, 5, 0, 0, 0, time.UTC))
	defer closeDB()
	categories, _ := svc.ListCategories(ctx, "expense", false)
	for i, settlement := range []*SettlementInput{{}, {Counterparty: "Alex", DueOn: "2026-02-30"}} {
		_, err := svc.CreateTransaction(ctx, TransactionInput{ClientRequestID: fmt.Sprintf("invalid-settlement-%d", i), Kind: "expense", AmountMinor: 270, CategoryID: categories[0].ID, OccurredAt: svc.clock.Now(), LocationIntent: "none", Settlement: settlement})
		if err == nil {
			t.Fatal("accepted invalid settlement")
		}
	}
	if _, _, err := svc.ListTransactions(ctx, TransactionFilters{SettlementStatus: "unknown"}); err == nil {
		t.Fatal("accepted invalid filter")
	}
	_, err := svc.SetBudgets(ctx, "2026-09", BudgetsInput{Items: []domain.BudgetLimit{{AmountMinor: 9000}}})
	if err != nil {
		t.Fatal(err)
	}
	currency := "USD"
	if _, err := svc.UpdateSettings(ctx, SettingsUpdate{CurrencyCode: &currency, ConfirmCurrencyChange: true}); err != nil {
		t.Fatal(err)
	}
	budget, _ := svc.Budgets(ctx, "2026-09")
	if budget.CurrencyCode != "USD" || budget.Items[0].AmountMinor != 900000 {
		t.Fatalf("currency rewrite: %+v", budget)
	}
}
