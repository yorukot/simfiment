package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"simfiment/internal/domain"
)

// ListCategories returns ordered categories for a kind.
func (s *Store) ListCategories(ctx context.Context, kind string, includeArchived bool) ([]domain.Category, error) {
	query := `SELECT id, kind, name, icon_key, sort_order, archived_at
		FROM categories WHERE kind = ?`
	if !includeArchived {
		query += " AND archived_at IS NULL"
	}
	query += " ORDER BY archived_at IS NOT NULL, sort_order, id"
	rows, err := s.q.QueryContext(ctx, query, kind)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()
	items := make([]domain.Category, 0)
	for rows.Next() {
		item, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate categories: %w", err)
	}
	return items, nil
}

// GetCategory returns a category regardless of archive state.
func (s *Store) GetCategory(ctx context.Context, id int64) (domain.Category, error) {
	row := s.q.QueryRowContext(ctx, `SELECT id, kind, name, icon_key, sort_order, archived_at
		FROM categories WHERE id = ?`, id)
	return scanCategory(row)
}

// FindActiveCategoryName reports whether an active category name is taken.
func (s *Store) FindActiveCategoryName(ctx context.Context, kind, name string, exceptID int64) (bool, error) {
	var found int
	err := s.q.QueryRowContext(ctx, `SELECT 1 FROM categories
		WHERE kind = ? AND name = ? AND archived_at IS NULL AND id <> ? LIMIT 1`,
		kind, name, exceptID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("find category name: %w", err)
	}
	return true, nil
}

// InsertCategory inserts an active category at the end of its kind.
func (s *Store) InsertCategory(ctx context.Context, kind, name, icon string, now time.Time) (domain.Category, error) {
	var sortOrder int
	if err := s.q.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), -1) + 1
		FROM categories WHERE kind = ? AND archived_at IS NULL`, kind).Scan(&sortOrder); err != nil {
		return domain.Category{}, fmt.Errorf("category order: %w", err)
	}
	result, err := s.q.ExecContext(ctx, `INSERT INTO categories(
		kind, name, icon_key, sort_order, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?)`, kind, name, icon, sortOrder, now.UTC().UnixMilli(), now.UTC().UnixMilli())
	if err != nil {
		return domain.Category{}, fmt.Errorf("insert category: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.Category{}, fmt.Errorf("category id: %w", err)
	}
	return s.GetCategory(ctx, id)
}

// UpdateCategory changes mutable category fields.
func (s *Store) UpdateCategory(ctx context.Context, id int64, name, icon string, now time.Time) (domain.Category, error) {
	_, err := s.q.ExecContext(ctx,
		"UPDATE categories SET name = ?, icon_key = ?, updated_at = ? WHERE id = ?",
		name, icon, now.UTC().UnixMilli(), id)
	if err != nil {
		return domain.Category{}, fmt.Errorf("update category: %w", err)
	}
	return s.GetCategory(ctx, id)
}

// ActiveCategoryCount counts selectable categories for a kind.
func (s *Store) ActiveCategoryCount(ctx context.Context, kind string) (int, error) {
	var count int
	err := s.q.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM categories WHERE kind = ? AND archived_at IS NULL", kind).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count active categories: %w", err)
	}
	return count, nil
}

// CategoryUsedByActiveRule reports whether an enabled rule depends on a category.
func (s *Store) CategoryUsedByActiveRule(ctx context.Context, id int64) (bool, error) {
	var found int
	err := s.q.QueryRowContext(ctx, `SELECT 1 FROM recurring_rules
		WHERE category_id = ? AND enabled = 1 AND archived_at IS NULL LIMIT 1`, id).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active recurring rule: %w", err)
	}
	return true, nil
}

// ArchiveCategory archives a category.
func (s *Store) ArchiveCategory(ctx context.Context, id int64, now time.Time) error {
	_, err := s.q.ExecContext(ctx,
		"UPDATE categories SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?",
		now.UTC().UnixMilli(), now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("archive category: %w", err)
	}
	return nil
}

// RestoreCategory restores a category to the end of its kind.
func (s *Store) RestoreCategory(ctx context.Context, id int64, kind string, now time.Time) error {
	var order int
	if err := s.q.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), -1) + 1
		FROM categories WHERE kind = ? AND archived_at IS NULL`, kind).Scan(&order); err != nil {
		return fmt.Errorf("restore category order: %w", err)
	}
	_, err := s.q.ExecContext(ctx, `UPDATE categories SET archived_at = NULL,
		sort_order = ?, updated_at = ? WHERE id = ?`, order, now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("restore category: %w", err)
	}
	return nil
}

// SetCategoryOrder updates one category position.
func (s *Store) SetCategoryOrder(ctx context.Context, id int64, order int, now time.Time) error {
	_, err := s.q.ExecContext(ctx,
		"UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?", order, now.UTC().UnixMilli(), id)
	if err != nil {
		return fmt.Errorf("set category order: %w", err)
	}
	return nil
}

type rowScanner interface{ Scan(...any) error }

func scanCategory(row rowScanner) (domain.Category, error) {
	var item domain.Category
	var archived sql.NullInt64
	if err := row.Scan(&item.ID, &item.Kind, &item.Name, &item.IconKey, &item.SortOrder, &archived); err != nil {
		return item, fmt.Errorf("scan category: %w", err)
	}
	if archived.Valid {
		value := time.UnixMilli(archived.Int64).UTC()
		item.ArchivedAt = &value
	}
	return item, nil
}
