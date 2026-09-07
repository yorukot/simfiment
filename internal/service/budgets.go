package service

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/store"
)

type BudgetsInput struct {
	Items []domain.BudgetLimit `json:"items"`
}

func budgetMonth(month string) (time.Time, error) {
	start, err := time.Parse("2006-01", month)
	if err != nil || len(month) != 7 || start.Format("2006-01") != month || start.Year() < 1 || start.Year() > 9998 {
		return time.Time{}, domain.ValidationError(map[string]string{"month": "月份格式必須為 YYYY-MM。"})
	}
	return start, nil
}

// Budgets calculates balances from actual active expenses, without daily rollover writes.
func (s *Service) Budgets(ctx context.Context, month string) (domain.MonthlyBudgets, error) {
	start, err := budgetMonth(month)
	if err != nil {
		return domain.MonthlyBudgets{}, err
	}
	end := start.AddDate(0, 1, 0)
	out := domain.MonthlyBudgets{Month: month, Items: make([]domain.BudgetSummary, 0)}
	err = database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		st := store.New(tx)
		settings, err := st.GetSettings(ctx)
		if err != nil {
			return err
		}
		out.CurrencyCode = settings.CurrencyCode
		effective, limits, err := st.BudgetLimits(ctx, month)
		if err != nil {
			return err
		}
		out.EffectiveMonth = effective
		expenses, err := st.BudgetExpenses(ctx, start.Format("2006-01-02"), end.Format("2006-01-02"))
		if err != nil {
			return err
		}
		days := int64(end.AddDate(0, 0, -1).Day())
		for _, limit := range limits {
			daily := make(map[string]int64)
			for _, expense := range expenses {
				if limit.CategoryID == 0 || limit.CategoryID == expense.CategoryID {
					daily[expense.Date] += expense.AmountMinor
				}
			}
			item := domain.BudgetSummary{BudgetLimit: limit, Days: make([]domain.BudgetDay, 0, days)}
			for d := int64(1); d <= days; d++ {
				date := start.AddDate(0, 0, int(d-1)).Format("2006-01-02")
				item.ExpenseMinor += daily[date]
				allocated := limit.AmountMinor * d / days
				item.Days = append(item.Days, domain.BudgetDay{Date: date,
					AllocationMinor: allocated - limit.AmountMinor*(d-1)/days,
					ExpenseMinor:    daily[date], AvailableMinor: allocated - item.ExpenseMinor})
			}
			item.RemainingMinor = limit.AmountMinor - item.ExpenseMinor
			out.Items = append(out.Items, item)
		}
		return nil
	})
	if err != nil {
		return out, internal("calculate budgets", err)
	}
	return out, nil
}

func (s *Service) SetBudgets(ctx context.Context, month string, input BudgetsInput) (domain.MonthlyBudgets, error) {
	if _, err := budgetMonth(month); err != nil {
		return domain.MonthlyBudgets{}, err
	}
	fields := map[string]string{}
	if input.Items == nil || len(input.Items) > 201 {
		fields["items"] = "請提供預算清單，最多 201 筆。"
	}
	seen := map[int64]bool{}
	for i, item := range input.Items {
		key := fmt.Sprintf("items.%d", i)
		if item.AmountMinor <= 0 || item.AmountMinor > domain.MaxAmountMinor {
			fields[key+".amountMinor"] = "金額必須大於零且不得超過上限。"
		}
		if item.CategoryID < 0 || seen[item.CategoryID] {
			fields[key+".categoryId"] = "預算分類無效或重複。"
		}
		seen[item.CategoryID] = true
	}
	if len(fields) > 0 {
		return domain.MonthlyBudgets{}, domain.ValidationError(fields)
	}
	err := database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		st := store.New(tx)
		settings, err := st.GetSettings(ctx)
		if err != nil {
			return err
		}
		_, existing, err := st.BudgetLimits(ctx, month)
		if err != nil {
			return err
		}
		existingCategories := map[int64]bool{}
		for _, item := range existing {
			existingCategories[item.CategoryID] = true
		}
		for _, item := range input.Items {
			if item.CategoryID == 0 {
				continue
			}
			category, err := st.GetCategory(ctx, item.CategoryID)
			if err != nil && !store.IsNoRows(err) {
				return err
			}
			if err != nil || category.Kind != "expense" || (category.ArchivedAt != nil && !existingCategories[item.CategoryID]) {
				return domain.ValidationError(map[string]string{"categoryId": "預算只能使用支出分類。"})
			}
		}
		return st.ReplaceBudgetLimits(ctx, month, settings.CurrencyCode, input.Items, s.clock.Now())
	})
	if err != nil {
		if _, ok := err.(*domain.Error); ok {
			return domain.MonthlyBudgets{}, err
		}
		return domain.MonthlyBudgets{}, internal("save budgets", err)
	}
	return s.Budgets(ctx, month)
}
