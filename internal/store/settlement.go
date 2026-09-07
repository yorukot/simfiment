package store

import (
	"context"
	"time"
)

// SetSettlement preserves completion on metadata edits; an empty name removes tracking.
func (s *Store) SetSettlement(ctx context.Context, id int64, counterparty, dueOn string, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE transactions SET settlement_counterparty = ?, settlement_due_on = ?,
        settlement_completed_at = CASE WHEN ? = '' THEN NULL ELSE settlement_completed_at END, updated_at = ? WHERE id = ?`,
		counterparty, dueOn, counterparty, now.UnixMilli(), id)
	return err
}

// CompleteSettlement atomically changes follow-up state without changing financial fields.
func (s *Store) CompleteSettlement(ctx context.Context, id int64, completed bool, now time.Time) error {
	query := `UPDATE transactions SET settlement_completed_at = ?, updated_at = ? WHERE id = ?
        AND deleted_at IS NULL AND settlement_counterparty <> '' AND settlement_completed_at IS NULL`
	var value any = now.UnixMilli()
	if !completed {
		value = nil
		query = `UPDATE transactions SET settlement_completed_at = ?, updated_at = ? WHERE id = ?
            AND deleted_at IS NULL AND settlement_counterparty <> '' AND settlement_completed_at IS NOT NULL`
	}
	_, err := s.q.ExecContext(ctx, query, value, now.UnixMilli(), id)
	return err
}
