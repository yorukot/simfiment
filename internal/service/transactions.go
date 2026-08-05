package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"simfiment/internal/database"
	"simfiment/internal/domain"
	"simfiment/internal/store"
)

// LocationInput contains browser-provided entry-location metadata.
type LocationInput struct {
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	AccuracyM  *float64  `json:"accuracyM"`
	CapturedAt time.Time `json:"capturedAt"`
}

// TransactionInput contains manual quick-entry values.
type TransactionInput struct {
	ClientRequestID string         `json:"clientRequestId"`
	Kind            string         `json:"kind"`
	AmountMinor     int64          `json:"amountMinor"`
	CategoryID      int64          `json:"categoryId"`
	OccurredAt      time.Time      `json:"occurredAt"`
	Title           string         `json:"title"`
	LocationIntent  string         `json:"locationIntent"`
	Location        *LocationInput `json:"location,omitempty"`
}

// TransactionUpdate contains editable values; every field is required for a replacement-style patch.
type TransactionUpdate struct {
	Kind        string    `json:"kind"`
	AmountMinor int64     `json:"amountMinor"`
	CategoryID  int64     `json:"categoryId"`
	Title       string    `json:"title"`
	OccurredAt  time.Time `json:"occurredAt"`
}

// TransactionFilters contains supported list filters.
type TransactionFilters struct {
	From       string
	To         string
	Kind       string
	CategoryID int64
	Query      string
	Limit      int
	Cursor     string
}

// CreateTransaction validates and atomically creates an idempotent manual transaction.
func (s *Service) CreateTransaction(ctx context.Context, input TransactionInput) (domain.Transaction, error) {
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return domain.Transaction{}, internal("load transaction settings", err)
	}
	title, fields := validateTransactionBase(input.ClientRequestID, input.Kind, input.AmountMinor,
		input.CategoryID, input.Title, input.OccurredAt, s.clock.Now(), true)
	if input.LocationIntent != "none" && input.LocationIntent != "capture" && input.LocationIntent != "skip" {
		fields["locationIntent"] = "位置意圖必須是 none、capture 或 skip。"
	}
	if input.Location != nil {
		validateLocation(*input.Location, fields)
		if input.LocationIntent != "capture" {
			fields["location"] = "只有 capture 意圖可以附帶位置。"
		}
	}
	type normalizedLocation struct {
		Latitude, Longitude float64
		AccuracyM           *float64
		CapturedAt          string
	}
	var locationValue *normalizedLocation
	if input.Location != nil {
		locationValue = &normalizedLocation{Latitude: input.Location.Latitude,
			Longitude: input.Location.Longitude, AccuracyM: input.Location.AccuracyM,
			CapturedAt: input.Location.CapturedAt.UTC().Format(time.RFC3339Nano)}
	}
	normalized := struct {
		Kind, Title, OccurredAt, LocationIntent string
		AmountMinor, CategoryID                 int64
		Location                                *normalizedLocation
	}{input.Kind, title, input.OccurredAt.UTC().Format(time.RFC3339Nano), input.LocationIntent,
		input.AmountMinor, input.CategoryID, locationValue}
	fingerprint := fingerprint(normalized)
	if validRequestID(input.ClientRequestID) {
		existing, findErr := s.store.FindTransactionByRequestID(ctx, input.ClientRequestID)
		if findErr == nil {
			if existing.Fingerprint != fingerprint {
				return domain.Transaction{}, domain.NewError(http.StatusConflict, "idempotency_conflict", "此請求識別碼已用於不同內容。")
			}
			return existing.Transaction, nil
		}
		if !store.IsNoRows(findErr) {
			return domain.Transaction{}, internal("find transaction request", findErr)
		}
	}
	categoryKindMismatch := false
	category, err := s.validateActiveCategory(ctx, input.CategoryID, input.Kind)
	if err != nil {
		if domainErr, ok := err.(*domain.Error); ok && domainErr.Fields != nil {
			categoryKindMismatch = domainErr.Code == "category_kind_mismatch"
			for field, value := range domainErr.Fields {
				fields[field] = value
			}
		} else {
			return domain.Transaction{}, err
		}
	}
	_ = category
	if len(fields) > 0 {
		if categoryKindMismatch {
			return domain.Transaction{}, &domain.Error{Status: http.StatusUnprocessableEntity,
				Code: "category_kind_mismatch", Message: "分類類型與交易類型不符。", Fields: fields}
		}
		return domain.Transaction{}, domain.ValidationError(fields)
	}
	zone, _ := time.LoadLocation(settings.Timezone)
	localDate := input.OccurredAt.In(zone).Format("2006-01-02")
	status := "none"
	if input.LocationIntent == "skip" {
		status = "skipped"
	} else if input.LocationIntent == "capture" {
		status = "pending"
		if input.Location != nil {
			status = "attached"
		}
	}
	now := s.clock.Now()
	var output domain.Transaction
	err = database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		txStore := store.New(tx)
		existing, err := txStore.FindTransactionByRequestID(ctx, input.ClientRequestID)
		if err == nil {
			if existing.Fingerprint != fingerprint {
				return domain.NewError(http.StatusConflict, "idempotency_conflict", "此請求識別碼已用於不同內容。")
			}
			output = existing.Transaction
			return nil
		}
		if !store.IsNoRows(err) {
			return err
		}
		id, err := txStore.InsertTransaction(ctx, store.InsertTransaction{
			ClientRequestID: input.ClientRequestID, RequestFingerprint: fingerprint,
			Kind: input.Kind, AmountMinor: input.AmountMinor, CurrencyCode: settings.CurrencyCode,
			CategoryID: input.CategoryID, Title: title, OccurredAtUTC: input.OccurredAt,
			OccurredLocalDate: localDate, OccurredTimezone: settings.Timezone,
			Source: "manual", LocationStatus: status, Now: now,
		})
		if err != nil {
			return err
		}
		if input.Location != nil {
			location := domain.Location{Latitude: input.Location.Latitude, Longitude: input.Location.Longitude,
				AccuracyM: input.Location.AccuracyM, CapturedAt: input.Location.CapturedAt}
			if err := txStore.UpsertLocation(ctx, id, location, now); err != nil {
				return err
			}
		}
		output, err = txStore.GetTransaction(ctx, id, true)
		return err
	})
	if err != nil {
		if _, ok := err.(*domain.Error); ok {
			return domain.Transaction{}, err
		}
		return domain.Transaction{}, internal("create transaction", err)
	}
	return output, nil
}

// GetTransaction returns a transaction and opportunistically expires old pending location states.
func (s *Service) GetTransaction(ctx context.Context, id int64) (domain.Transaction, error) {
	now := s.clock.Now()
	_ = s.store.ExpirePendingLocations(ctx, now.Add(-5*time.Minute), now)
	item, err := s.store.GetTransaction(ctx, id, true)
	if err != nil {
		if store.IsNoRows(err) {
			return item, domain.NewError(http.StatusNotFound, "not_found", "找不到交易。")
		}
		return item, internal("get transaction", err)
	}
	return item, nil
}

// ListTransactions returns filtered active transactions.
func (s *Service) ListTransactions(ctx context.Context, filters TransactionFilters) ([]domain.Transaction, string, error) {
	fields := map[string]string{}
	if filters.From != "" {
		if _, err := domain.ParseDate(filters.From); err != nil {
			fields["from"] = "起始日期無效。"
		}
	}
	if filters.To != "" {
		if _, err := domain.ParseDate(filters.To); err != nil {
			fields["to"] = "結束日期無效。"
		}
	}
	if filters.From != "" && filters.To != "" && filters.From >= filters.To {
		fields["to"] = "結束日期必須晚於起始日期。"
	}
	if filters.Kind != "" && !validKind(filters.Kind) {
		fields["kind"] = "交易類型無效。"
	}
	if utf8.RuneCountInString(filters.Query) > 100 {
		fields["q"] = "搜尋文字最多 100 個字元。"
	}
	if filters.Limit == 0 {
		filters.Limit = 100
	}
	if filters.Limit < 1 || filters.Limit > 200 {
		fields["limit"] = "每頁筆數必須介於 1 到 200。"
	}
	var beforeID, beforeTime int64
	if filters.Cursor != "" {
		decoded, err := base64.RawURLEncoding.DecodeString(filters.Cursor)
		parts := strings.Split(string(decoded), ":")
		if err != nil || len(parts) != 2 {
			fields["cursor"] = "游標無效。"
		} else {
			beforeTime, err = strconv.ParseInt(parts[0], 10, 64)
			if err == nil {
				beforeID, err = strconv.ParseInt(parts[1], 10, 64)
			}
			if err != nil || beforeTime < 1 || beforeID < 1 {
				fields["cursor"] = "游標無效。"
			}
		}
	}
	if len(fields) > 0 {
		return nil, "", domain.ValidationError(fields)
	}
	now := s.clock.Now()
	_ = s.store.ExpirePendingLocations(ctx, now.Add(-5*time.Minute), now)
	items, err := s.store.ListTransactions(ctx, store.TransactionFilters{
		From: filters.From, To: filters.To, Kind: filters.Kind, CategoryID: filters.CategoryID,
		Query: strings.TrimSpace(filters.Query), Limit: filters.Limit + 1, BeforeID: beforeID, BeforeTime: beforeTime,
	})
	if err != nil {
		return nil, "", internal("list transactions", err)
	}
	next := ""
	if len(items) > filters.Limit {
		last := items[filters.Limit-1]
		raw := strconv.FormatInt(last.OccurredAt.UnixMilli(), 10) + ":" + strconv.FormatInt(last.ID, 10)
		next = base64.RawURLEncoding.EncodeToString([]byte(raw))
		items = items[:filters.Limit]
	}
	return items, next, nil
}

// UpdateTransaction validates and updates a transaction.
func (s *Service) UpdateTransaction(ctx context.Context, id int64, input TransactionUpdate) (domain.Transaction, error) {
	existing, err := s.GetTransaction(ctx, id)
	if err != nil {
		return domain.Transaction{}, err
	}
	if existing.DeletedAt != nil {
		return domain.Transaction{}, domain.NewError(http.StatusConflict, "transaction_deleted", "已刪除的交易無法編輯。")
	}
	title, fields := validateTransactionBase("", input.Kind, input.AmountMinor, input.CategoryID,
		input.Title, input.OccurredAt, s.clock.Now(), false)
	categoryKindMismatch := false
	_, categoryErr := s.validateActiveCategory(ctx, input.CategoryID, input.Kind)
	if categoryErr != nil {
		if value, ok := categoryErr.(*domain.Error); ok && value.Fields != nil {
			categoryKindMismatch = value.Code == "category_kind_mismatch"
			for field, message := range value.Fields {
				fields[field] = message
			}
		} else {
			return domain.Transaction{}, categoryErr
		}
	}
	if len(fields) > 0 {
		if categoryKindMismatch {
			return domain.Transaction{}, &domain.Error{Status: http.StatusUnprocessableEntity,
				Code: "category_kind_mismatch", Message: "分類類型與交易類型不符。", Fields: fields}
		}
		return domain.Transaction{}, domain.ValidationError(fields)
	}
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return domain.Transaction{}, internal("load transaction settings", err)
	}
	zone, _ := time.LoadLocation(settings.Timezone)
	if err := s.store.UpdateTransaction(ctx, id, input.Kind, input.AmountMinor, input.CategoryID,
		title, input.OccurredAt, input.OccurredAt.In(zone).Format("2006-01-02"), settings.Timezone, s.clock.Now()); err != nil {
		return domain.Transaction{}, internal("update transaction", err)
	}
	return s.store.GetTransaction(ctx, id, true)
}

// DeleteTransaction applies an idempotent soft delete.
func (s *Service) DeleteTransaction(ctx context.Context, id int64) (domain.Transaction, error) {
	if _, err := s.GetTransaction(ctx, id); err != nil {
		return domain.Transaction{}, err
	}
	if err := s.store.SetTransactionDeleted(ctx, id, true, s.clock.Now()); err != nil {
		return domain.Transaction{}, internal("delete transaction", err)
	}
	return s.store.GetTransaction(ctx, id, true)
}

// RestoreTransaction restores a soft-deleted transaction idempotently.
func (s *Service) RestoreTransaction(ctx context.Context, id int64) (domain.Transaction, error) {
	if _, err := s.GetTransaction(ctx, id); err != nil {
		return domain.Transaction{}, err
	}
	if err := s.store.SetTransactionDeleted(ctx, id, false, s.clock.Now()); err != nil {
		return domain.Transaction{}, internal("restore transaction", err)
	}
	return s.store.GetTransaction(ctx, id, true)
}

// AttachLocation attaches an entry location to a recent manual transaction.
func (s *Service) AttachLocation(ctx context.Context, id int64, input LocationInput) (domain.Transaction, error) {
	item, err := s.GetTransaction(ctx, id)
	if err != nil {
		return domain.Transaction{}, err
	}
	fields := map[string]string{}
	validateLocation(input, fields)
	if item.DeletedAt != nil {
		return domain.Transaction{}, domain.NewError(http.StatusConflict, "transaction_deleted", "無法替已刪除的交易附加位置。")
	}
	if item.Source != "manual" || s.clock.Now().Sub(item.CreatedAt) > 5*time.Minute {
		return domain.Transaction{}, domain.NewError(http.StatusConflict, "location_unavailable", "只能在手動交易建立後五分鐘內附加位置。")
	}
	if item.LocationStatus != "pending" && item.LocationStatus != "failed" && item.LocationStatus != "attached" {
		return domain.Transaction{}, domain.NewError(http.StatusConflict, "location_unavailable", "此交易未啟用位置擷取。")
	}
	if len(fields) > 0 {
		return domain.Transaction{}, domain.ValidationError(fields)
	}
	err = database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		return store.New(tx).UpsertLocation(ctx, id, domain.Location{Latitude: input.Latitude,
			Longitude: input.Longitude, AccuracyM: input.AccuracyM, CapturedAt: input.CapturedAt}, s.clock.Now())
	})
	if err != nil {
		return domain.Transaction{}, internal("attach location", err)
	}
	return s.store.GetTransaction(ctx, id, true)
}

// MarkLocationFailure records a safe failure state without browser error text.
func (s *Service) MarkLocationFailure(ctx context.Context, id int64, reason string) (domain.Transaction, error) {
	allowed := map[string]bool{"permission_denied": true, "position_unavailable": true, "timeout": true,
		"unsupported": true, "unknown": true}
	if !allowed[reason] {
		return domain.Transaction{}, domain.ValidationError(map[string]string{"reason": "位置失敗原因無效。"})
	}
	item, err := s.GetTransaction(ctx, id)
	if err != nil {
		return item, err
	}
	if item.Source != "manual" || item.DeletedAt != nil {
		return item, domain.NewError(http.StatusConflict, "location_unavailable", "此交易無法更新位置狀態。")
	}
	if item.LocationStatus == "failed" {
		return item, nil
	}
	if item.LocationStatus != "pending" {
		return item, domain.NewError(http.StatusConflict, "location_unavailable", "目前的位置狀態無法標記為失敗。")
	}
	if err := s.store.SetLocationStatus(ctx, id, "failed", s.clock.Now()); err != nil {
		return item, internal("mark location failure", err)
	}
	return s.store.GetTransaction(ctx, id, true)
}

// RemoveLocation deletes stored coordinates and records an explicit skip.
func (s *Service) RemoveLocation(ctx context.Context, id int64) (domain.Transaction, error) {
	item, err := s.GetTransaction(ctx, id)
	if err != nil {
		return item, err
	}
	if item.DeletedAt != nil {
		return item, domain.NewError(http.StatusConflict, "transaction_deleted", "無法修改已刪除交易的位置。")
	}
	if item.Source != "manual" {
		return item, domain.NewError(http.StatusConflict, "location_unavailable", "週期交易不支援輸入位置。")
	}
	err = database.WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		return store.New(tx).DeleteLocation(ctx, id, s.clock.Now())
	})
	if err != nil {
		return item, internal("remove location", err)
	}
	return s.store.GetTransaction(ctx, id, true)
}

func (s *Service) validateActiveCategory(ctx context.Context, id int64, kind string) (domain.Category, error) {
	if id < 1 {
		return domain.Category{}, domain.ValidationError(map[string]string{"categoryId": "請選擇分類。"})
	}
	category, err := s.store.GetCategory(ctx, id)
	if err != nil {
		if store.IsNoRows(err) {
			return domain.Category{}, domain.ValidationError(map[string]string{"categoryId": "找不到分類。"})
		}
		return category, internal("get transaction category", err)
	}
	if category.ArchivedAt != nil {
		return category, domain.ValidationError(map[string]string{"categoryId": "此分類已封存。"})
	}
	if category.Kind != kind {
		return category, &domain.Error{Status: 422, Code: "category_kind_mismatch", Message: "分類類型與交易類型不符。",
			Fields: map[string]string{"categoryId": "分類類型與交易類型不符。"}}
	}
	return category, nil
}

func validateTransactionBase(requestID, kind string, amount, categoryID int64, title string, occurredAt, now time.Time, requireRequestID bool) (string, map[string]string) {
	fields := map[string]string{}
	if requireRequestID && !validRequestID(requestID) {
		fields["clientRequestId"] = "請求識別碼無效。"
	}
	if !validKind(kind) {
		fields["kind"] = "交易類型必須是 expense 或 income。"
	}
	if amount < 1 || amount > domain.MaxAmountMinor {
		fields["amountMinor"] = "金額必須大於零且不得超過上限。"
	}
	if categoryID < 1 {
		fields["categoryId"] = "請選擇分類。"
	}
	normalized := strings.TrimSpace(title)
	if !utf8.ValidString(normalized) || utf8.RuneCountInString(normalized) > 80 || containsControl(normalized) {
		fields["title"] = "標題最多 80 個有效字元。"
	}
	if occurredAt.IsZero() {
		fields["occurredAt"] = "請輸入有效的日期與時間。"
	} else if occurredAt.After(now.Add(5 * time.Minute)) {
		fields["occurredAt"] = "交易時間不可超過現在五分鐘。"
	}
	return normalized, fields
}

func validateLocation(location LocationInput, fields map[string]string) {
	if math.IsNaN(location.Latitude) || math.IsInf(location.Latitude, 0) || location.Latitude < -90 || location.Latitude > 90 {
		fields["location.latitude"] = "緯度無效。"
	}
	if math.IsNaN(location.Longitude) || math.IsInf(location.Longitude, 0) || location.Longitude < -180 || location.Longitude > 180 {
		fields["location.longitude"] = "經度無效。"
	}
	if location.AccuracyM != nil && (math.IsNaN(*location.AccuracyM) || math.IsInf(*location.AccuracyM, 0) || *location.AccuracyM < 0) {
		fields["location.accuracyM"] = "位置精確度無效。"
	}
	if location.CapturedAt.IsZero() {
		fields["location.capturedAt"] = "位置擷取時間無效。"
	}
}

func validRequestID(value string) bool {
	if len(value) < 8 || len(value) > 64 {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == ':' {
			continue
		}
		return false
	}
	return true
}

func fingerprint(value any) string {
	encoded, _ := json.Marshal(value)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func isNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }
