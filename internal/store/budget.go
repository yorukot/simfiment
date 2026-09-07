package store

import (
	"context"
	"database/sql"
	"time"

	"simfiment/internal/domain"
)

func (s *Store) BudgetLimits(ctx context.Context, month string) (string, []domain.BudgetLimit, error) {
	var effective sql.NullString
	if err := s.q.QueryRowContext(ctx, "SELECT MAX(month) FROM budget_versions WHERE month <= ?", month).Scan(&effective); err != nil {
		return "", nil, err
	}
	items := make([]domain.BudgetLimit, 0)
	if !effective.Valid {
		return "", items, nil
	}
	rows, err := s.q.QueryContext(ctx, "SELECT COALESCE(category_id, 0), amount_minor FROM budget_limits WHERE month = ? ORDER BY COALESCE(category_id, 0)", effective.String)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var item domain.BudgetLimit
		if err := rows.Scan(&item.CategoryID, &item.AmountMinor); err != nil {
			return "", nil, err
		}
		items = append(items, item)
	}
	return effective.String, items, rows.Err()
}

// ReplaceBudgetLimits must run inside the caller's transaction. Empty versions disable caps.
func (s *Store) ReplaceBudgetLimits(ctx context.Context, month, currency string, items []domain.BudgetLimit, now time.Time) error {
	if _, err := s.q.ExecContext(ctx, "INSERT INTO budget_versions(month) VALUES (?) ON CONFLICT DO NOTHING", month); err != nil {
		return err
	}
	if _, err := s.q.ExecContext(ctx, "DELETE FROM budget_limits WHERE month = ?", month); err != nil {
		return err
	}
	for _, item := range items {
		var category any
		if item.CategoryID != 0 {
			category = item.CategoryID
		}
		if _, err := s.q.ExecContext(ctx, "INSERT INTO budget_limits(month, category_id, amount_minor, currency_code, updated_at) VALUES (?, ?, ?, ?, ?)", month, category, item.AmountMinor, currency, now.UnixMilli()); err != nil {
			return err
		}
	}
	return nil
}

type BudgetExpense struct {
	Date                    string
	CategoryID, AmountMinor int64
}

func (s *Store) BudgetExpenses(ctx context.Context, from, to string) ([]BudgetExpense, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT occurred_local_date, category_id, SUM(amount_minor) FROM transactions
        WHERE deleted_at IS NULL AND kind = 'expense' AND occurred_local_date >= ? AND occurred_local_date < ?
        GROUP BY occurred_local_date, category_id`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]BudgetExpense, 0)
	for rows.Next() {
		var item BudgetExpense
		if err := rows.Scan(&item.Date, &item.CategoryID, &item.AmountMinor); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
