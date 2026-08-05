package service

import (
	"context"
	"database/sql"
	"net/http"
	"sort"
	"strings"
	"time"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/store"
)

// RecurringRuleInput contains recurring template and schedule fields.
type RecurringRuleInput struct {
	ClientRequestID string `json:"clientRequestId"`
	Kind            string `json:"kind"`
	AmountMinor     int64  `json:"amountMinor"`
	CategoryID      int64  `json:"categoryId"`
	Title           string `json:"title"`
	Frequency       string `json:"frequency"`
	IntervalCount   int    `json:"intervalCount"`
	StartOn         string `json:"startOn"`
}

// RecurringConfirmInput optionally overrides one occurrence snapshot.
type RecurringConfirmInput struct {
	ClientRequestID string     `json:"clientRequestId"`
	AmountMinor     *int64     `json:"amountMinor,omitempty"`
	CategoryID      *int64     `json:"categoryId,omitempty"`
	Title           *string    `json:"title,omitempty"`
	OccurredAt      *time.Time `json:"occurredAt,omitempty"`
}

// ListRecurringRules returns rules and preserves archived snapshots when requested.
func (s *Service) ListRecurringRules(ctx context.Context, includeArchived bool) ([]domain.RecurringRule, error) {
	items, err := s.store.ListRecurringRules(ctx, includeArchived)
	if err != nil {
		return nil, internal("list recurring rules", err)
	}
	return items, nil
}

// CreateRecurringRule creates an idempotent anchor-based rule.
func (s *Service) CreateRecurringRule(ctx context.Context, input RecurringRuleInput) (domain.RecurringRule, error) {
	title, fields := validateRecurring(input, true)
	if _, err := s.validateActiveCategory(ctx, input.CategoryID, input.Kind); err != nil {
		if typed, ok := err.(*domain.Error); ok && typed.Fields != nil {
			for field, message := range typed.Fields {
				fields[field] = message
			}
		} else {
			return domain.RecurringRule{}, err
		}
	}
	if len(fields) > 0 {
		return domain.RecurringRule{}, domain.ValidationError(fields)
	}
	if existing, err := s.store.FindRecurringRuleByRequestID(ctx, input.ClientRequestID); err == nil {
		return existing, nil
	} else if !store.IsNoRows(err) {
		return domain.RecurringRule{}, internal("find recurring idempotency key", err)
	}
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return domain.RecurringRule{}, internal("load recurring settings", err)
	}
	id, err := s.store.InsertRecurringRule(ctx, store.InsertRule{
		ClientRequestID: input.ClientRequestID, Kind: input.Kind, AmountMinor: input.AmountMinor,
		CurrencyCode: settings.CurrencyCode, CategoryID: input.CategoryID, Title: title,
		Frequency: input.Frequency, IntervalCount: input.IntervalCount, StartOn: input.StartOn,
		Now: s.clock.Now(),
	})
	if err != nil {
		return domain.RecurringRule{}, internal("create recurring rule", err)
	}
	if err := s.EnsureOccurrences(ctx); err != nil {
		return domain.RecurringRule{}, err
	}
	return s.store.GetRecurringRule(ctx, id)
}

// UpdateRecurringRule changes only the template used for not-yet-generated occurrences.
func (s *Service) UpdateRecurringRule(ctx context.Context, id int64, input RecurringRuleInput) (domain.RecurringRule, error) {
	if _, err := s.store.GetRecurringRule(ctx, id); err != nil {
		if store.IsNoRows(err) {
			return domain.RecurringRule{}, domain.NewError(http.StatusNotFound, "not_found", "找不到週期規則。")
		}
		return domain.RecurringRule{}, internal("get recurring rule", err)
	}
	title, fields := validateRecurring(input, false)
	if _, err := s.validateActiveCategory(ctx, input.CategoryID, input.Kind); err != nil {
		if typed, ok := err.(*domain.Error); ok && typed.Fields != nil {
			for field, message := range typed.Fields {
				fields[field] = message
			}
		} else {
			return domain.RecurringRule{}, err
		}
	}
	if len(fields) > 0 {
		return domain.RecurringRule{}, domain.ValidationError(fields)
	}
	if err := s.store.UpdateRecurringRule(ctx, id, input.Kind, input.AmountMinor, input.CategoryID,
		title, input.Frequency, input.IntervalCount, input.StartOn, s.clock.Now()); err != nil {
		return domain.RecurringRule{}, internal("update recurring rule", err)
	}
	if err := s.EnsureOccurrences(ctx); err != nil {
		return domain.RecurringRule{}, err
	}
	return s.store.GetRecurringRule(ctx, id)
}

// SetRecurringRuleEnabled enables or disables an unarchived rule.
func (s *Service) SetRecurringRuleEnabled(ctx context.Context, id int64, enabled bool) (domain.RecurringRule, error) {
	rule, err := s.store.GetRecurringRule(ctx, id)
	if err != nil {
		if store.IsNoRows(err) {
			return rule, domain.NewError(http.StatusNotFound, "not_found", "找不到週期規則。")
		}
		return rule, internal("get recurring rule", err)
	}
	if rule.ArchivedAt != nil {
		return rule, domain.NewError(http.StatusConflict, "rule_archived", "封存的週期規則無法啟用。")
	}
	if err := s.store.SetRecurringRuleEnabled(ctx, id, enabled, s.clock.Now()); err != nil {
		return rule, internal("set recurring rule state", err)
	}
	if enabled {
		if err := s.EnsureOccurrences(ctx); err != nil {
			return rule, err
		}
	}
	return s.store.GetRecurringRule(ctx, id)
}

// ArchiveRecurringRule disables and archives a rule.
func (s *Service) ArchiveRecurringRule(ctx context.Context, id int64) (domain.RecurringRule, error) {
	if _, err := s.store.GetRecurringRule(ctx, id); err != nil {
		if store.IsNoRows(err) {
			return domain.RecurringRule{}, domain.NewError(http.StatusNotFound, "not_found", "找不到週期規則。")
		}
		return domain.RecurringRule{}, internal("get recurring rule", err)
	}
	if err := s.store.ArchiveRecurringRule(ctx, id, s.clock.Now()); err != nil {
		return domain.RecurringRule{}, internal("archive recurring rule", err)
	}
	return s.store.GetRecurringRule(ctx, id)
}

// EnsureOccurrences lazily generates due snapshots through the installation's current date.
func (s *Service) EnsureOccurrences(ctx context.Context) error {
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return internal("load recurrence settings", err)
	}
	zone, err := time.LoadLocation(settings.Timezone)
	if err != nil {
		return internal("load recurrence timezone", err)
	}
	through := s.clock.Now().In(zone).Format("2006-01-02")
	dueRules, err := s.store.ListDueRules(ctx, through)
	if err != nil {
		return internal("load due recurring rules", err)
	}
	for _, due := range dueRules {
		err := database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
			txStore := store.New(tx)
			rule, err := txStore.GetRecurringRule(ctx, due.ID)
			if err != nil {
				return err
			}
			if !rule.Enabled || rule.ArchivedAt != nil || rule.NextDueOn > through {
				return nil
			}
			sequence := rule.NextSequence
			dueOn := rule.NextDueOn
			for generated := 0; dueOn <= through; generated++ {
				if generated >= 1000 {
					return domain.NewError(http.StatusConflict, "recurrence_safety_limit", "週期規則需要管理員檢查，因為待產生筆數過多。")
				}
				if err := txStore.InsertPendingOccurrence(ctx, rule, dueOn, s.clock.Now()); err != nil {
					return err
				}
				sequence++
				dueOn, err = domain.OccurrenceDate(rule.StartOn, rule.Frequency, rule.IntervalCount, sequence)
				if err != nil {
					return err
				}
			}
			return txStore.UpdateRuleCursor(ctx, rule.ID, sequence, dueOn, s.clock.Now())
		})
		if err != nil {
			if _, ok := err.(*domain.Error); ok {
				return err
			}
			return internal("generate recurring occurrences", err)
		}
	}
	return nil
}

// ListRecurringOccurrences ensures due items and returns occurrence snapshots.
func (s *Service) ListRecurringOccurrences(ctx context.Context, status string) ([]domain.RecurringOccurrence, error) {
	if status != "" && status != "pending" && status != "confirmed" && status != "skipped" {
		return nil, domain.ValidationError(map[string]string{"status": "週期狀態無效。"})
	}
	if err := s.EnsureOccurrences(ctx); err != nil {
		return nil, err
	}
	items, err := s.store.ListOccurrences(ctx, status)
	if err != nil {
		return nil, internal("list recurring occurrences", err)
	}
	return items, nil
}

// RecurringPreview calculates future instances without inserting rows.
func (s *Service) RecurringPreview(ctx context.Context, from, to string) ([]domain.RecurringPreview, error) {
	start, startErr := domain.ParseDate(from)
	end, endErr := domain.ParseDate(to)
	if startErr != nil || endErr != nil || !start.Before(end) {
		return nil, domain.ValidationError(map[string]string{"from": "預覽日期範圍無效。", "to": "預覽日期範圍無效。"})
	}
	if end.Sub(start) > 366*24*time.Hour {
		return nil, domain.ValidationError(map[string]string{"to": "預覽範圍不可超過一年。"})
	}
	rules, err := s.store.ListRecurringRules(ctx, false)
	if err != nil {
		return nil, internal("list rules for preview", err)
	}
	items := make([]domain.RecurringPreview, 0)
	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		for sequence := 0; sequence < 1000; sequence++ {
			date, err := domain.OccurrenceDate(rule.StartOn, rule.Frequency, rule.IntervalCount, sequence)
			if err != nil {
				return nil, internal("calculate recurring preview", err)
			}
			if date >= to {
				break
			}
			if date >= from {
				items = append(items, domain.RecurringPreview{RuleID: rule.ID, ScheduledOn: date,
					Kind: rule.Kind, AmountMinor: rule.AmountMinor, CurrencyCode: rule.CurrencyCode,
					Category: rule.Category, Title: rule.Title})
			}
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].ScheduledOn == items[j].ScheduledOn {
			return items[i].RuleID < items[j].RuleID
		}
		return items[i].ScheduledOn < items[j].ScheduledOn
	})
	return items, nil
}

// ConfirmOccurrence atomically creates one actual transaction from a pending snapshot.
func (s *Service) ConfirmOccurrence(ctx context.Context, id int64, override RecurringConfirmInput) (domain.Transaction, error) {
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return domain.Transaction{}, internal("load recurring confirmation settings", err)
	}
	zone, _ := time.LoadLocation(settings.Timezone)
	var output domain.Transaction
	now := s.clock.Now()
	err = database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		occurrence, err := txStore.GetOccurrence(ctx, id)
		if err != nil {
			return err
		}
		if occurrence.Status != "pending" {
			return domain.NewError(http.StatusConflict, "occurrence_not_pending", "此週期項目已處理。")
		}
		amount := occurrence.AmountMinor
		categoryID := occurrence.Category.ID
		title := occurrence.Title
		date, _ := domain.ParseDate(occurrence.ScheduledOn)
		occurredAt := time.Date(date.Year(), date.Month(), date.Day(), 12, 0, 0, 0, zone)
		if occurrence.ScheduledOn == now.In(zone).Format("2006-01-02") {
			occurredAt = now.In(zone)
		}
		if override.AmountMinor != nil {
			amount = *override.AmountMinor
		}
		if override.CategoryID != nil {
			categoryID = *override.CategoryID
		}
		if override.Title != nil {
			title = *override.Title
		}
		if override.OccurredAt != nil {
			occurredAt = *override.OccurredAt
		}
		normalized, fields := validateTransactionBase("", occurrence.Kind, amount, categoryID, title, occurredAt, now, false)
		categoryInactive := false
		category, categoryErr := txStore.GetCategory(ctx, categoryID)
		if categoryErr != nil || category.ArchivedAt != nil {
			categoryInactive = true
			fields["categoryId"] = "此分類已停用，請選擇新的分類後確認。"
		} else if category.Kind != occurrence.Kind {
			categoryInactive = true
			fields["categoryId"] = "分類類型與週期項目不符。"
		}
		if len(fields) > 0 {
			if categoryInactive {
				return &domain.Error{Status: 422, Code: "category_inactive", Message: "週期項目需要調整。", Fields: fields}
			}
			return domain.ValidationError(fields)
		}
		requestID := override.ClientRequestID
		if requestID == "" {
			requestID = "recurring:" + intString(id)
		} else if !validRequestID(requestID) {
			return domain.ValidationError(map[string]string{"clientRequestId": "請求識別碼無效。"})
		}
		fingerprintValue := fingerprint(struct {
			OccurrenceID, Amount, Category int64
			Title, OccurredAt              string
		}{id, amount, categoryID, normalized, occurredAt.UTC().Format(time.RFC3339Nano)})
		txID, err := txStore.InsertTransaction(ctx, store.InsertTransaction{
			ClientRequestID: requestID, RequestFingerprint: fingerprintValue, Kind: occurrence.Kind,
			AmountMinor: amount, CurrencyCode: occurrence.CurrencyCode, CategoryID: categoryID,
			Title: normalized, OccurredAtUTC: occurredAt, OccurredLocalDate: occurredAt.In(zone).Format("2006-01-02"),
			OccurredTimezone: settings.Timezone, Source: "recurring", RecurringOccurrenceID: &id,
			LocationStatus: "none", Now: now,
		})
		if err != nil {
			return err
		}
		changed, err := txStore.TransitionOccurrence(ctx, id, "confirmed", now)
		if err != nil {
			return err
		}
		if !changed {
			return domain.NewError(http.StatusConflict, "occurrence_not_pending", "此週期項目已處理。")
		}
		output, err = txStore.GetTransaction(ctx, txID, true)
		return err
	})
	if err != nil {
		if typed, ok := err.(*domain.Error); ok {
			return domain.Transaction{}, typed
		}
		if store.IsNoRows(err) {
			return domain.Transaction{}, domain.NewError(http.StatusNotFound, "not_found", "找不到週期項目。")
		}
		return domain.Transaction{}, internal("confirm recurring occurrence", err)
	}
	return output, nil
}

// SkipOccurrence marks a pending occurrence skipped without creating a transaction.
func (s *Service) SkipOccurrence(ctx context.Context, id int64) (domain.RecurringOccurrence, error) {
	changed, err := s.store.TransitionOccurrence(ctx, id, "skipped", s.clock.Now())
	if err != nil {
		return domain.RecurringOccurrence{}, internal("skip recurring occurrence", err)
	}
	if !changed {
		if _, err := s.store.GetOccurrence(ctx, id); err != nil && store.IsNoRows(err) {
			return domain.RecurringOccurrence{}, domain.NewError(http.StatusNotFound, "not_found", "找不到週期項目。")
		}
		return domain.RecurringOccurrence{}, domain.NewError(http.StatusConflict, "occurrence_not_pending", "此週期項目已處理。")
	}
	return s.store.GetOccurrence(ctx, id)
}

func validateRecurring(input RecurringRuleInput, requireRequestID bool) (string, map[string]string) {
	fields := map[string]string{}
	if requireRequestID && !validRequestID(input.ClientRequestID) {
		fields["clientRequestId"] = "請求識別碼無效。"
	}
	if !validKind(input.Kind) {
		fields["kind"] = "類型必須是 expense 或 income。"
	}
	if input.AmountMinor < 1 || input.AmountMinor > domain.MaxAmountMinor {
		fields["amountMinor"] = "金額必須大於零且不得超過上限。"
	}
	if input.CategoryID < 1 {
		fields["categoryId"] = "請選擇分類。"
	}
	title := strings.TrimSpace(input.Title)
	if len([]rune(title)) > 80 || containsControl(title) {
		fields["title"] = "標題最多 80 個有效字元。"
	}
	if input.Frequency != "weekly" && input.Frequency != "monthly" && input.Frequency != "yearly" {
		fields["frequency"] = "頻率必須是 weekly、monthly 或 yearly。"
	}
	if input.IntervalCount < 1 || input.IntervalCount > 100 {
		fields["intervalCount"] = "間隔必須介於 1 到 100。"
	}
	if _, err := domain.ParseDate(input.StartOn); err != nil {
		fields["startOn"] = "開始日期格式必須為 YYYY-MM-DD。"
	}
	return title, fields
}

func intString(value int64) string {
	const digits = "0123456789"
	if value == 0 {
		return "0"
	}
	buffer := [20]byte{}
	position := len(buffer)
	for value > 0 {
		position--
		buffer[position] = digits[value%10]
		value /= 10
	}
	return string(buffer[position:])
}
