package store

import (
	"context"
	"fmt"

	"simfiment/internal/domain"
)

// DashboardTotals returns transaction totals for a half-open local-date range.
func (s *Store) DashboardTotals(ctx context.Context, from, to string) (domain.Totals, error) {
	var out domain.Totals
	err := s.q.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_minor ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_minor ELSE 0 END), 0),
		COUNT(*)
		FROM transactions
		WHERE occurred_local_date >= ? AND occurred_local_date < ? AND deleted_at IS NULL`,
		from, to).Scan(&out.IncomeMinor, &out.ExpenseMinor, &out.TransactionCount)
	if err != nil {
		return out, fmt.Errorf("dashboard totals: %w", err)
	}
	out.NetMinor = out.IncomeMinor - out.ExpenseMinor
	return out, nil
}

// DashboardCategoryTotals returns ordered aggregates by category and kind.
func (s *Store) DashboardCategoryTotals(ctx context.Context, from, to, kind string) ([]domain.CategoryTotal, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT c.id, c.name, c.icon_key,
		SUM(t.amount_minor), COUNT(*)
		FROM transactions t JOIN categories c ON c.id = t.category_id
		WHERE t.kind = ? AND t.occurred_local_date >= ? AND t.occurred_local_date < ?
		AND t.deleted_at IS NULL
		GROUP BY c.id, c.name, c.icon_key, c.sort_order
		ORDER BY SUM(t.amount_minor) DESC, c.sort_order ASC, c.name ASC`, kind, from, to)
	if err != nil {
		return nil, fmt.Errorf("dashboard category totals: %w", err)
	}
	defer rows.Close()
	items := make([]domain.CategoryTotal, 0)
	for rows.Next() {
		var item domain.CategoryTotal
		if err := rows.Scan(&item.CategoryID, &item.Name, &item.IconKey,
			&item.AmountMinor, &item.TransactionCount); err != nil {
			return nil, fmt.Errorf("scan category total: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate category totals: %w", err)
	}
	return items, nil
}

// DashboardDailySeries returns days with actual activity within a month.
func (s *Store) DashboardDailySeries(ctx context.Context, from, to string) ([]domain.DailySeriesPoint, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT occurred_local_date,
		COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_minor ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_minor ELSE 0 END), 0)
		FROM transactions
		WHERE occurred_local_date >= ? AND occurred_local_date < ? AND deleted_at IS NULL
		GROUP BY occurred_local_date ORDER BY occurred_local_date`, from, to)
	if err != nil {
		return nil, fmt.Errorf("dashboard daily series: %w", err)
	}
	defer rows.Close()
	items := make([]domain.DailySeriesPoint, 0)
	for rows.Next() {
		var item domain.DailySeriesPoint
		if err := rows.Scan(&item.Date, &item.IncomeMinor, &item.ExpenseMinor); err != nil {
			return nil, fmt.Errorf("scan daily series: %w", err)
		}
		item.NetMinor = item.IncomeMinor - item.ExpenseMinor
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate daily series: %w", err)
	}
	return items, nil
}
