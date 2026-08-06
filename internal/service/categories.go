package service

import (
	"context"
	"database/sql"
	_ "embed"
	"net/http"
	"strings"
	"unicode"
	"unicode/utf8"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/store"
)

//go:embed material_icon_names.txt
var materialIconNames string

var allowedIcons = func() map[string]bool {
	icons := map[string]bool{
		"": true, "food": true, "transport": true, "shopping": true, "home": true,
		"entertainment": true, "health": true, "education": true, "subscription": true,
		"other": true, "salary": true, "bonus": true, "freelance": true, "interest": true,
		"refund": true, "gift": true, "travel": true, "pets": true, "utilities": true,
	}
	for _, name := range strings.Fields(materialIconNames) {
		icons[name] = true
	}
	return icons
}()

// CategoryInput contains fields accepted for category creation.
type CategoryInput struct {
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	IconKey string `json:"iconKey"`
}

// CategoryUpdate contains mutable category fields.
type CategoryUpdate struct {
	Name    string `json:"name"`
	IconKey string `json:"iconKey"`
}

// ListCategories returns categories filtered by kind and archive state.
func (s *Service) ListCategories(ctx context.Context, kind string, includeArchived bool) ([]domain.Category, error) {
	if !validKind(kind) {
		return nil, domain.ValidationError(map[string]string{"kind": "類型必須是 expense 或 income。"})
	}
	items, err := s.store.ListCategories(ctx, kind, includeArchived)
	if err != nil {
		return nil, internal("list categories", err)
	}
	return items, nil
}

// CreateCategory validates and creates a selectable category.
func (s *Service) CreateCategory(ctx context.Context, input CategoryInput) (domain.Category, error) {
	name, fieldErrors := validateCategoryFields(input.Kind, input.Name, input.IconKey, true)
	if len(fieldErrors) > 0 {
		return domain.Category{}, domain.ValidationError(fieldErrors)
	}
	conflict, err := s.store.FindActiveCategoryName(ctx, input.Kind, name, 0)
	if err != nil {
		return domain.Category{}, internal("check category uniqueness", err)
	}
	if conflict {
		return domain.Category{}, domain.NewError(http.StatusConflict, "category_name_conflict", "已有同名的啟用中分類。")
	}
	item, err := s.store.InsertCategory(ctx, input.Kind, name, input.IconKey, s.clock.Now())
	if err != nil {
		return domain.Category{}, internal("create category", err)
	}
	return item, nil
}

// UpdateCategory validates and updates a category name and icon.
func (s *Service) UpdateCategory(ctx context.Context, id int64, input CategoryUpdate) (domain.Category, error) {
	existing, err := s.store.GetCategory(ctx, id)
	if err != nil {
		if store.IsNoRows(err) {
			return domain.Category{}, domain.NewError(http.StatusNotFound, "not_found", "找不到分類。")
		}
		return domain.Category{}, internal("get category", err)
	}
	name, fieldErrors := validateCategoryFields(existing.Kind, input.Name, input.IconKey, false)
	if len(fieldErrors) > 0 {
		return domain.Category{}, domain.ValidationError(fieldErrors)
	}
	conflict, err := s.store.FindActiveCategoryName(ctx, existing.Kind, name, id)
	if err != nil {
		return domain.Category{}, internal("check category uniqueness", err)
	}
	if conflict && existing.ArchivedAt == nil {
		return domain.Category{}, domain.NewError(http.StatusConflict, "category_name_conflict", "已有同名的啟用中分類。")
	}
	item, err := s.store.UpdateCategory(ctx, id, name, input.IconKey, s.clock.Now())
	if err != nil {
		return domain.Category{}, internal("update category", err)
	}
	return item, nil
}

// ArchiveCategory archives a category when business constraints allow it.
func (s *Service) ArchiveCategory(ctx context.Context, id int64) (domain.Category, error) {
	var out domain.Category
	err := database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		category, err := txStore.GetCategory(ctx, id)
		if err != nil {
			return err
		}
		if category.ArchivedAt != nil {
			out = category
			return nil
		}
		count, err := txStore.ActiveCategoryCount(ctx, category.Kind)
		if err != nil {
			return err
		}
		if count <= 1 {
			return domain.NewError(http.StatusConflict, "last_active_category", "每種類型至少要保留一個啟用中的分類。")
		}
		used, err := txStore.CategoryUsedByActiveRule(ctx, id)
		if err != nil {
			return err
		}
		if used {
			return domain.NewError(http.StatusConflict, "category_in_use", "此分類仍被啟用中的週期規則使用。")
		}
		if err := txStore.ArchiveCategory(ctx, id, s.clock.Now()); err != nil {
			return err
		}
		out, err = txStore.GetCategory(ctx, id)
		return err
	})
	if err != nil {
		if _, ok := err.(*domain.Error); ok {
			return domain.Category{}, err
		}
		if store.IsNoRows(err) {
			return domain.Category{}, domain.NewError(http.StatusNotFound, "not_found", "找不到分類。")
		}
		return domain.Category{}, internal("archive category", err)
	}
	return out, nil
}

// RestoreCategory restores a category if its active name remains unique.
func (s *Service) RestoreCategory(ctx context.Context, id int64) (domain.Category, error) {
	category, err := s.store.GetCategory(ctx, id)
	if err != nil {
		if store.IsNoRows(err) {
			return domain.Category{}, domain.NewError(http.StatusNotFound, "not_found", "找不到分類。")
		}
		return domain.Category{}, internal("get category", err)
	}
	if category.ArchivedAt == nil {
		return category, nil
	}
	conflict, err := s.store.FindActiveCategoryName(ctx, category.Kind, category.Name, id)
	if err != nil {
		return domain.Category{}, internal("check category restore", err)
	}
	if conflict {
		return domain.Category{}, domain.NewError(http.StatusConflict, "category_name_conflict", "啟用中的分類已有相同名稱。")
	}
	if err := s.store.RestoreCategory(ctx, id, category.Kind, s.clock.Now()); err != nil {
		return domain.Category{}, internal("restore category", err)
	}
	return s.store.GetCategory(ctx, id)
}

// ReorderCategories atomically replaces the active order for one kind.
func (s *Service) ReorderCategories(ctx context.Context, kind string, orderedIDs []int64) error {
	if !validKind(kind) {
		return domain.ValidationError(map[string]string{"kind": "類型必須是 expense 或 income。"})
	}
	active, err := s.store.ListCategories(ctx, kind, false)
	if err != nil {
		return internal("list categories for reorder", err)
	}
	if len(active) != len(orderedIDs) {
		return domain.ValidationError(map[string]string{"orderedIds": "排序必須包含此類型的所有啟用中分類。"})
	}
	wanted := make(map[int64]bool, len(active))
	for _, item := range active {
		wanted[item.ID] = true
	}
	seen := make(map[int64]bool, len(orderedIDs))
	for _, id := range orderedIDs {
		if !wanted[id] || seen[id] {
			return domain.ValidationError(map[string]string{"orderedIds": "排序包含無效或重複的分類。"})
		}
		seen[id] = true
	}
	now := s.clock.Now()
	return database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		for order, id := range orderedIDs {
			if err := txStore.SetCategoryOrder(ctx, id, order, now); err != nil {
				return err
			}
		}
		return nil
	})
}

func validateCategoryFields(kind, value, icon string, validateKind bool) (string, map[string]string) {
	fields := map[string]string{}
	if validateKind && !validKind(kind) {
		fields["kind"] = "類型必須是 expense 或 income。"
	}
	name := strings.TrimSpace(value)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 30 || containsControl(name) {
		fields["name"] = "分類名稱必須為 1 到 30 個有效字元。"
	}
	if !allowedIcons[icon] {
		fields["iconKey"] = "不支援此圖示。"
	}
	return name, fields
}

func validKind(kind string) bool { return kind == "expense" || kind == "income" }

func containsControl(value string) bool {
	for _, r := range value {
		if unicode.IsControl(r) && r != '\t' && r != '\n' && r != '\r' {
			return true
		}
	}
	return false
}
