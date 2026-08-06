package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"simfiment/internal/domain"
)

const transactionSelect = `SELECT
	t.id, t.client_request_id, t.kind, t.amount_minor, t.currency_code,
	c.id, c.kind, c.name, c.icon_key, c.sort_order, c.archived_at,
	t.title, t.occurred_at_utc_ms, t.occurred_local_date, t.occurred_timezone,
	t.source, t.recurring_occurrence_id, t.location_status, t.deleted_at,
	t.created_at, t.updated_at,
	l.latitude, l.longitude, l.accuracy_m, l.captured_at
FROM transactions t
JOIN categories c ON c.id = t.category_id
LEFT JOIN transaction_locations l ON l.transaction_id = t.id`

// InsertTransaction contains normalized storage values.
type InsertTransaction struct {
	ClientRequestID       string
	RequestFingerprint    string
	Kind                  string
	AmountMinor           int64
	CurrencyCode          string
	CategoryID            int64
	Title                 string
	OccurredAtUTC         time.Time
	OccurredLocalDate     string
	OccurredTimezone      string
	Source                string
	RecurringOccurrenceID *int64
	LocationStatus        string
	Now                   time.Time
}

// ExistingTransaction contains idempotency metadata and its transaction.
type ExistingTransaction struct {
	Fingerprint string
	Transaction domain.Transaction
}

// TransactionFilters selects normal active transaction lists.
type TransactionFilters struct {
	From       string
	To         string
	Kind       string
	CategoryID int64
	Query      string
	Limit      int
	BeforeID   int64
	BeforeTime int64
}

// FindTransactionByRequestID looks up an idempotent request result.
func (s *Store) FindTransactionByRequestID(ctx context.Context, requestID string) (ExistingTransaction, error) {
	var fingerprint string
	var id int64
	err := s.q.QueryRowContext(ctx,
		"SELECT id, request_fingerprint FROM transactions WHERE client_request_id = ?", requestID).Scan(&id, &fingerprint)
	if err != nil {
		return ExistingTransaction{}, fmt.Errorf("find transaction request: %w", err)
	}
	item, err := s.GetTransaction(ctx, id, true)
	return ExistingTransaction{Fingerprint: fingerprint, Transaction: item}, err
}

// InsertTransaction inserts a transaction and returns its id.
func (s *Store) InsertTransaction(ctx context.Context, input InsertTransaction) (int64, error) {
	var occurrence any
	if input.RecurringOccurrenceID != nil {
		occurrence = *input.RecurringOccurrenceID
	}
	result, err := s.q.ExecContext(ctx, `INSERT INTO transactions(
		client_request_id, request_fingerprint, kind, amount_minor, currency_code, category_id,
		title, occurred_at_utc_ms, occurred_local_date, occurred_timezone, source,
		recurring_occurrence_id, location_status, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.ClientRequestID, input.RequestFingerprint, input.Kind, input.AmountMinor,
		input.CurrencyCode, input.CategoryID, input.Title, input.OccurredAtUTC.UTC().UnixMilli(),
		input.OccurredLocalDate, input.OccurredTimezone, input.Source, occurrence,
		input.LocationStatus, input.Now.UTC().UnixMilli(), input.Now.UTC().UnixMilli())
	if err != nil {
		return 0, fmt.Errorf("insert transaction: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("transaction id: %w", err)
	}
	return id, nil
}

// GetTransaction returns a transaction; deleted records are optional.
func (s *Store) GetTransaction(ctx context.Context, id int64, includeDeleted bool) (domain.Transaction, error) {
	query := transactionSelect + " WHERE t.id = ?"
	if !includeDeleted {
		query += " AND t.deleted_at IS NULL"
	}
	return scanTransaction(s.q.QueryRowContext(ctx, query, id))
}

// ListTransactions returns active transactions ordered newest first.
func (s *Store) ListTransactions(ctx context.Context, filters TransactionFilters) ([]domain.Transaction, error) {
	query := transactionSelect + " WHERE t.deleted_at IS NULL"
	args := make([]any, 0, 8)
	if filters.From != "" {
		query += " AND t.occurred_local_date >= ?"
		args = append(args, filters.From)
	}
	if filters.To != "" {
		query += " AND t.occurred_local_date < ?"
		args = append(args, filters.To)
	}
	if filters.Kind != "" {
		query += " AND t.kind = ?"
		args = append(args, filters.Kind)
	}
	if filters.CategoryID != 0 {
		query += " AND t.category_id = ?"
		args = append(args, filters.CategoryID)
	}
	if filters.Query != "" {
		query += " AND (t.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')"
		pattern := "%" + escapeLike(filters.Query) + "%"
		args = append(args, pattern, pattern)
	}
	if filters.BeforeID != 0 {
		query += " AND (t.occurred_at_utc_ms < ? OR (t.occurred_at_utc_ms = ? AND t.id < ?))"
		args = append(args, filters.BeforeTime, filters.BeforeTime, filters.BeforeID)
	}
	query += " ORDER BY t.occurred_at_utc_ms DESC, t.id DESC LIMIT ?"
	args = append(args, filters.Limit)
	rows, err := s.q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list transactions: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Transaction, 0)
	for rows.Next() {
		item, err := scanTransaction(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate transactions: %w", err)
	}
	return items, nil
}

// ListTransactionsForExport returns every active transaction in chronological order.
func (s *Store) ListTransactionsForExport(ctx context.Context) ([]domain.Transaction, error) {
	rows, err := s.q.QueryContext(ctx, transactionSelect+`
		WHERE t.deleted_at IS NULL
		ORDER BY t.occurred_at_utc_ms ASC, t.id ASC`)
	if err != nil {
		return nil, fmt.Errorf("list transactions for export: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Transaction, 0)
	for rows.Next() {
		item, err := scanTransaction(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate transactions for export: %w", err)
	}
	return items, nil
}

// UpdateTransaction changes editable transaction fields.
func (s *Store) UpdateTransaction(ctx context.Context, id int64, kind string, amount int64, categoryID int64, title string, occurredAt time.Time, localDate, timezone string, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE transactions SET kind = ?, amount_minor = ?, category_id = ?,
		title = ?, occurred_at_utc_ms = ?, occurred_local_date = ?, occurred_timezone = ?, updated_at = ?
		WHERE id = ?`, kind, amount, categoryID, title, occurredAt.UTC().UnixMilli(), localDate,
		timezone, now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("update transaction: %w", err)
	}
	return nil
}

// SetTransactionDeleted applies an idempotent soft-delete or restore.
func (s *Store) SetTransactionDeleted(ctx context.Context, id int64, deleted bool, now time.Time) error {
	query := "UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ?"
	args := []any{now.UTC().UnixMilli(), id}
	if deleted {
		query = "UPDATE transactions SET deleted_at = COALESCE(deleted_at, ?), updated_at = CASE WHEN deleted_at IS NULL THEN ? ELSE updated_at END WHERE id = ?"
		args = []any{now.UTC().UnixMilli(), now.UTC().UnixMilli(), id}
	}
	result, err := s.q.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("set transaction deletion: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// UpsertLocation atomically stores one entry location and marks it attached.
func (s *Store) UpsertLocation(ctx context.Context, transactionID int64, location domain.Location, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `INSERT INTO transaction_locations(
		transaction_id, latitude, longitude, accuracy_m, captured_at, source, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, 'browser', ?, ?)
	ON CONFLICT(transaction_id) DO UPDATE SET latitude = excluded.latitude,
		longitude = excluded.longitude, accuracy_m = excluded.accuracy_m,
		captured_at = excluded.captured_at, updated_at = excluded.updated_at`,
		transactionID, location.Latitude, location.Longitude, location.AccuracyM,
		location.CapturedAt.UTC().UnixMilli(), now.UTC().UnixMilli(), now.UTC().UnixMilli())
	if err != nil {
		return fmt.Errorf("upsert location: %w", err)
	}
	if _, err := s.q.ExecContext(ctx, `UPDATE transactions SET location_status = 'attached',
		updated_at = ? WHERE id = ?`, now.UTC().UnixMilli(), transactionID); err != nil {
		return fmt.Errorf("set location attached: %w", err)
	}
	return nil
}

// SetLocationStatus changes location state without storing browser details.
func (s *Store) SetLocationStatus(ctx context.Context, transactionID int64, status string, now time.Time) error {
	_, err := s.q.ExecContext(ctx, "UPDATE transactions SET location_status = ?, updated_at = ? WHERE id = ?",
		status, now.UTC().UnixMilli(), transactionID)
	if err != nil {
		return fmt.Errorf("set location status: %w", err)
	}
	return nil
}

// DeleteLocation removes coordinates and records an explicit user skip.
func (s *Store) DeleteLocation(ctx context.Context, transactionID int64, now time.Time) error {
	if _, err := s.q.ExecContext(ctx,
		"DELETE FROM transaction_locations WHERE transaction_id = ?", transactionID); err != nil {
		return fmt.Errorf("delete location: %w", err)
	}
	return s.SetLocationStatus(ctx, transactionID, "skipped", now)
}

// ExpirePendingLocations opportunistically marks old capture attempts as failed.
func (s *Store) ExpirePendingLocations(ctx context.Context, before time.Time, now time.Time) error {
	_, err := s.q.ExecContext(ctx, `UPDATE transactions SET location_status = 'failed', updated_at = ?
		WHERE location_status = 'pending' AND created_at < ?`,
		now.UTC().UnixMilli(), before.UTC().UnixMilli())
	if err != nil {
		return fmt.Errorf("expire pending locations: %w", err)
	}
	return nil
}

func scanTransaction(row rowScanner) (domain.Transaction, error) {
	var out domain.Transaction
	var categoryArchived, occurrence, deleted sql.NullInt64
	var occurred, created, updated int64
	var latitude, longitude, accuracy sql.NullFloat64
	var captured sql.NullInt64
	var occurredTimezone string
	err := row.Scan(
		&out.ID, &out.ClientRequestID, &out.Kind, &out.AmountMinor, &out.CurrencyCode,
		&out.Category.ID, &out.Category.Kind, &out.Category.Name, &out.Category.IconKey,
		&out.Category.SortOrder, &categoryArchived, &out.Title, &occurred,
		&out.OccurredLocalDate, &occurredTimezone, &out.Source, &occurrence, &out.LocationStatus,
		&deleted, &created, &updated, &latitude, &longitude, &accuracy, &captured,
	)
	if err != nil {
		return out, fmt.Errorf("scan transaction: %w", err)
	}
	zone, zoneErr := time.LoadLocation(occurredTimezone)
	if zoneErr != nil {
		zone = time.UTC
	}
	out.OccurredAt = time.UnixMilli(occurred).In(zone)
	out.CreatedAt = time.UnixMilli(created).UTC()
	out.UpdatedAt = time.UnixMilli(updated).UTC()
	if categoryArchived.Valid {
		value := time.UnixMilli(categoryArchived.Int64).UTC()
		out.Category.ArchivedAt = &value
	}
	if occurrence.Valid {
		value := occurrence.Int64
		out.RecurringOccurrenceID = &value
	}
	if deleted.Valid {
		value := time.UnixMilli(deleted.Int64).UTC()
		out.DeletedAt = &value
	}
	if latitude.Valid && longitude.Valid && captured.Valid {
		location := &domain.Location{
			Latitude: latitude.Float64, Longitude: longitude.Float64,
			CapturedAt: time.UnixMilli(captured.Int64).UTC(),
		}
		if accuracy.Valid {
			value := accuracy.Float64
			location.AccuracyM = &value
		}
		out.Location = location
	}
	return out, nil
}

func escapeLike(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	value = strings.ReplaceAll(value, "%", "\\%")
	return strings.ReplaceAll(value, "_", "\\_")
}

// IsNoRows reports whether a wrapped store error represents an absent row.
func IsNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }
