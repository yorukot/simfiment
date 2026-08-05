package service

import (
	"context"
	"time"

	"simfiment/internal/domain"
)

// DailyDashboard returns aggregate data for one strict local date.
func (s *Service) DailyDashboard(ctx context.Context, date string) (domain.DailyDashboard, error) {
	parsed, err := domain.ParseDate(date)
	if err != nil {
		return domain.DailyDashboard{}, domain.ValidationError(map[string]string{"date": "日期格式必須為 YYYY-MM-DD。"})
	}
	if err := s.EnsureOccurrences(ctx); err != nil {
		return domain.DailyDashboard{}, err
	}
	next := parsed.AddDate(0, 0, 1).Format("2006-01-02")
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return domain.DailyDashboard{}, internal("load dashboard settings", err)
	}
	totals, err := s.store.DashboardTotals(ctx, date, next)
	if err != nil {
		return domain.DailyDashboard{}, internal("load daily totals", err)
	}
	expenses, err := s.store.DashboardCategoryTotals(ctx, date, next, "expense")
	if err != nil {
		return domain.DailyDashboard{}, internal("load daily expenses", err)
	}
	income, err := s.store.DashboardCategoryTotals(ctx, date, next, "income")
	if err != nil {
		return domain.DailyDashboard{}, internal("load daily income", err)
	}
	return domain.DailyDashboard{Date: date, CurrencyCode: settings.CurrencyCode, Totals: totals,
		ExpenseCategories: expenses, IncomeCategories: income}, nil
}

// MonthlyDashboard returns aggregate data and the complete local-day series for a month.
func (s *Service) MonthlyDashboard(ctx context.Context, month string) (domain.MonthlyDashboard, error) {
	if len(month) != 7 {
		return domain.MonthlyDashboard{}, domain.ValidationError(map[string]string{"month": "月份格式必須為 YYYY-MM。"})
	}
	start, err := time.Parse("2006-01", month)
	if err != nil || start.Format("2006-01") != month {
		return domain.MonthlyDashboard{}, domain.ValidationError(map[string]string{"month": "月份格式必須為 YYYY-MM。"})
	}
	if err := s.EnsureOccurrences(ctx); err != nil {
		return domain.MonthlyDashboard{}, err
	}
	end := start.AddDate(0, 1, 0)
	from, to := start.Format("2006-01-02"), end.Format("2006-01-02")
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return domain.MonthlyDashboard{}, internal("load dashboard settings", err)
	}
	totals, err := s.store.DashboardTotals(ctx, from, to)
	if err != nil {
		return domain.MonthlyDashboard{}, internal("load monthly totals", err)
	}
	expenses, err := s.store.DashboardCategoryTotals(ctx, from, to, "expense")
	if err != nil {
		return domain.MonthlyDashboard{}, internal("load monthly expenses", err)
	}
	income, err := s.store.DashboardCategoryTotals(ctx, from, to, "income")
	if err != nil {
		return domain.MonthlyDashboard{}, internal("load monthly income", err)
	}
	actual, err := s.store.DashboardDailySeries(ctx, from, to)
	if err != nil {
		return domain.MonthlyDashboard{}, internal("load monthly daily series", err)
	}
	byDate := make(map[string]domain.DailySeriesPoint, len(actual))
	for _, point := range actual {
		byDate[point.Date] = point
	}
	series := make([]domain.DailySeriesPoint, 0, end.Sub(start)/(24*time.Hour))
	for day := start; day.Before(end); day = day.AddDate(0, 0, 1) {
		date := day.Format("2006-01-02")
		point, ok := byDate[date]
		if !ok {
			point.Date = date
		}
		series = append(series, point)
	}
	return domain.MonthlyDashboard{Month: month, CurrencyCode: settings.CurrencyCode, Totals: totals,
		ExpenseCategories: expenses, IncomeCategories: income, DailySeries: series}, nil
}
