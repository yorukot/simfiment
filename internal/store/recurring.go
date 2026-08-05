package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"simfiment/internal/domain"
)

const ruleSelect = `SELECT r.id, r.client_request_id, r.kind, r.amount_minor,
	r.currency_code, c.id, c.kind, c.name, c.icon_key, c.sort_order, c.archived_at,
	r.title, r.frequency, r.interval_count, r.start_on, r.next_sequence,
	r.next_due_on, r.enabled, r.archived_at, r.created_at, r.updated_at
FROM recurring_rules r JOIN categories c ON c.id = r.category_id`

// InsertRule contains normalized recurring rule values.
type InsertRule struct {
	ClientRequestID string
	Kind            string
	AmountMinor     int64
	CurrencyCode    string
	CategoryID      int64
	Title           string
	Frequency       string
	IntervalCount   int
	StartOn         string
	Now             time.Time
}

// ListRecurringRules returns recurring rules in stable order.
func (s *Store) ListRecurringRules(ctx context.Context, includeArchived bool) ([]domain.RecurringRule, error) {
	query := ruleSelect
	if !includeArchived {
		query += " WHERE r.archived_at IS NULL"
	}
	query += " ORDER BY r.enabled DESC, r.next_due_on, r.id"
	rows, err := s.q.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list recurring rules: %w", err)
	}
	defer rows.Close()
	items := make([]domain.RecurringRule, 0)
	for rows.Next() {
		item, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recurring rules: %w", err)
	}
	return items, nil
}

// ListDueRules returns enabled rules that may need generation.
func (s *Store) ListDueRules(ctx context.Context, through string) ([]domain.RecurringRule, error) {
	rows, err := s.q.QueryContext(ctx, ruleSelect+` WHERE r.enabled = 1
		AND r.archived_at IS NULL AND r.next_due_on <= ? ORDER BY r.id`, through)
	if err != nil {
		return nil, fmt.Errorf("list due rules: %w", err)
	}
	defer rows.Close()
	items := make([]domain.RecurringRule, 0)
	for rows.Next() {
		item, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetRecurringRule returns one recurring rule.
func (s *Store) GetRecurringRule(ctx context.Context, id int64) (domain.RecurringRule, error) {
	return scanRule(s.q.QueryRowContext(ctx, ruleSelect+" WHERE r.id = ?", id))
}

// FindRecurringRuleByRequestID returns an idempotently created rule.
func (s *Store) FindRecurringRuleByRequestID(ctx context.Context, requestID string) (domain.RecurringRule, error) {
	var id int64
	if err := s.q.QueryRowContext(ctx,
		"SELECT id FROM recurring_rules WHERE client_request_id = ?", requestID).Scan(&id); err != nil {
		return domain.RecurringRule{}, fmt.Errorf("find recurring request: %w", err)
	}
	return s.GetRecurringRule(ctx, id)
}

// InsertRecurringRule inserts a recurring schedule anchored at its start date.
func (s *Store) InsertRecurringRule(ctx context.Context, input InsertRule) (int64, error) {
	nowMS := input.Now.UTC().UnixMilli()
	result, err := s.q.ExecContext(ctx, `INSERT INTO recurring_rules(
		client_request_id, kind, amount_minor, currency_code, category_id, title,
		frequency, interval_count, start_on, next_sequence, next_due_on,
		enabled, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`, input.ClientRequestID,
		input.Kind, input.AmountMinor, input.CurrencyCode, input.CategoryID, input.Title,
		input.Frequency, input.IntervalCount, input.StartOn, input.StartOn, nowMS, nowMS)
	if err != nil {
		return 0, fmt.Errorf("insert recurring rule: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("recurring rule id: %w", err)
	}
	return id, nil
}

// UpdateRecurringRule updates future rule values and resets generation to its anchor.
func (s *Store) UpdateRecurringRule(ctx context.Context, id int64, kind string, amount int64, categoryID int64, title, frequency string, interval int, startOn string, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE recurring_rules SET kind = ?, amount_minor = ?,
		category_id = ?, title = ?, frequency = ?, interval_count = ?, start_on = ?,
		next_sequence = 0, next_due_on = ?, updated_at = ? WHERE id = ?`,
		kind, amount, categoryID, title, frequency, interval, startOn, startOn, now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("update recurring rule: %w", err)
	}
	return nil
}

// SetRecurringRuleEnabled enables or disables a rule.
func (s *Store) SetRecurringRuleEnabled(ctx context.Context, id int64, enabled bool, now time.Time) error {
	_, err := s.q.ExecContext(ctx,
		"UPDATE recurring_rules SET enabled = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL",
		boolInt(enabled), now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("set recurring enabled: %w", err)
	}
	return nil
}

// ArchiveRecurringRule disables and archives a rule.
func (s *Store) ArchiveRecurringRule(ctx context.Context, id int64, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE recurring_rules SET enabled = 0,
		archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?`,
		now.UTC().UnixMilli(), now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("archive recurring rule: %w", err)
	}
	return nil
}

// InsertPendingOccurrence inserts an immutable snapshot with duplicate protection.
func (s *Store) InsertPendingOccurrence(ctx context.Context, rule domain.RecurringRule, scheduledOn string, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `INSERT INTO recurring_occurrences(
		rule_id, scheduled_on, status, kind_snapshot, amount_minor_snapshot,
		currency_snapshot, category_id_snapshot, title_snapshot, created_at, updated_at
	) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(rule_id, scheduled_on) DO NOTHING`, rule.ID, scheduledOn, rule.Kind,
		rule.AmountMinor, rule.CurrencyCode, rule.Category.ID, rule.Title,
		now.UTC().UnixMilli(), now.UTC().UnixMilli())
	if err != nil {
		return fmt.Errorf("insert recurring occurrence: %w", err)
	}
	return nil
}

// UpdateRuleCursor advances generation state atomically with occurrence insertion.
func (s *Store) UpdateRuleCursor(ctx context.Context, id int64, sequence int, dueOn string, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE recurring_rules SET next_sequence = ?,
		next_due_on = ?, updated_at = ? WHERE id = ?`, sequence, dueOn, now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("update recurring cursor: %w", err)
	}
	return nil
}

const occurrenceSelect = `SELECT o.id, o.rule_id, o.scheduled_on, o.status,
	o.kind_snapshot, o.amount_minor_snapshot, o.currency_snapshot,
	c.id, c.kind, c.name, c.icon_key, c.sort_order, c.archived_at,
	o.title_snapshot, o.created_at, o.updated_at
FROM recurring_occurrences o JOIN categories c ON c.id = o.category_id_snapshot`

// ListOccurrences lists occurrence snapshots with an optional status.
func (s *Store) ListOccurrences(ctx context.Context, status string) ([]domain.RecurringOccurrence, error) {
	query := occurrenceSelect
	args := []any{}
	if status != "" {
		query += " WHERE o.status = ?"
		args = append(args, status)
	}
	query += " ORDER BY o.scheduled_on, o.id"
	rows, err := s.q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list recurring occurrences: %w", err)
	}
	defer rows.Close()
	items := make([]domain.RecurringOccurrence, 0)
	for rows.Next() {
		item, err := scanOccurrence(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetOccurrence returns one recurring snapshot.
func (s *Store) GetOccurrence(ctx context.Context, id int64) (domain.RecurringOccurrence, error) {
	return scanOccurrence(s.q.QueryRowContext(ctx, occurrenceSelect+" WHERE o.id = ?", id))
}

// TransitionOccurrence changes a pending occurrence exactly once.
func (s *Store) TransitionOccurrence(ctx context.Context, id int64, status string, now time.Time) (bool, error) {
	result, err := s.q.ExecContext(ctx, `UPDATE recurring_occurrences SET status = ?, updated_at = ?
		WHERE id = ? AND status = 'pending'`, status, now.UTC().UnixMilli(), id)
	if err != nil {
		return false, fmt.Errorf("transition occurrence: %w", err)
	}
	affected, err := result.RowsAffected()
	return affected == 1, err
}

func scanRule(row rowScanner) (domain.RecurringRule, error) {
	var out domain.RecurringRule
	var enabled int
	var categoryArchived, archived sql.NullInt64
	var created, updated int64
	err := row.Scan(&out.ID, &out.ClientRequestID, &out.Kind, &out.AmountMinor,
		&out.CurrencyCode, &out.Category.ID, &out.Category.Kind, &out.Category.Name,
		&out.Category.IconKey, &out.Category.SortOrder, &categoryArchived, &out.Title,
		&out.Frequency, &out.IntervalCount, &out.StartOn, &out.NextSequence,
		&out.NextDueOn, &enabled, &archived, &created, &updated)
	if err != nil {
		return out, fmt.Errorf("scan recurring rule: %w", err)
	}
	out.Enabled = enabled == 1
	out.CreatedAt = time.UnixMilli(created).UTC()
	out.UpdatedAt = time.UnixMilli(updated).UTC()
	if categoryArchived.Valid {
		value := time.UnixMilli(categoryArchived.Int64).UTC()
		out.Category.ArchivedAt = &value
	}
	if archived.Valid {
		value := time.UnixMilli(archived.Int64).UTC()
		out.ArchivedAt = &value
	}
	return out, nil
}

func scanOccurrence(row rowScanner) (domain.RecurringOccurrence, error) {
	var out domain.RecurringOccurrence
	var categoryArchived sql.NullInt64
	var created, updated int64
	err := row.Scan(&out.ID, &out.RuleID, &out.ScheduledOn, &out.Status, &out.Kind,
		&out.AmountMinor, &out.CurrencyCode, &out.Category.ID, &out.Category.Kind,
		&out.Category.Name, &out.Category.IconKey, &out.Category.SortOrder,
		&categoryArchived, &out.Title, &created, &updated)
	if err != nil {
		return out, fmt.Errorf("scan recurring occurrence: %w", err)
	}
	out.CreatedAt = time.UnixMilli(created).UTC()
	out.UpdatedAt = time.UnixMilli(updated).UTC()
	if categoryArchived.Valid {
		value := time.UnixMilli(categoryArchived.Int64).UTC()
		out.Category.ArchivedAt = &value
	}
	return out, nil
}
