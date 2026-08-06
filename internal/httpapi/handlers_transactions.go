package httpapi

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"simfiment/internal/domain"
	"simfiment/internal/service"
)

var transactionCSVHeader = []string{
	"id", "occurred_at", "local_date", "kind", "amount", "currency", "category", "title",
	"source", "location_status", "latitude", "longitude", "accuracy_m", "location_captured_at",
	"created_at", "updated_at",
}

func (a *API) listTransactions(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	filters := service.TransactionFilters{From: query.Get("from"), To: query.Get("to"),
		Kind: query.Get("kind"), Query: query.Get("q"), Cursor: query.Get("cursor")}
	fields := map[string]string{}
	if value := query.Get("categoryId"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed < 1 {
			fields["categoryId"] = "分類識別碼無效。"
		} else {
			filters.CategoryID = parsed
		}
	}
	if value := query.Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			fields["limit"] = "每頁筆數無效。"
		} else {
			filters.Limit = parsed
		}
	}
	if len(fields) > 0 {
		a.writeError(w, r, domain.ValidationError(fields))
		return
	}
	items, cursor, err := a.service.ListTransactions(r.Context(), filters)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	meta := map[string]any{}
	if cursor != "" {
		meta["nextCursor"] = cursor
	}
	a.writeDataMeta(w, http.StatusOK, items, meta)
}

func (a *API) exportTransactionsCSV(w http.ResponseWriter, r *http.Request) {
	export, err := a.service.ExportTransactions(r.Context())
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	filename := "simfiment-transactions-" + time.Now().Format("2006-01-02") + ".csv"
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("\xEF\xBB\xBF"))
	writer := csv.NewWriter(w)
	_ = writer.Write(transactionCSVHeader)
	for _, item := range export.Transactions {
		latitude, longitude, accuracy, capturedAt := "", "", "", ""
		if item.Location != nil {
			latitude = strconv.FormatFloat(item.Location.Latitude, 'f', -1, 64)
			longitude = strconv.FormatFloat(item.Location.Longitude, 'f', -1, 64)
			if item.Location.AccuracyM != nil {
				accuracy = strconv.FormatFloat(*item.Location.AccuracyM, 'f', -1, 64)
			}
			capturedAt = item.Location.CapturedAt.UTC().Format(time.RFC3339Nano)
		}
		_ = writer.Write([]string{
			strconv.FormatInt(item.ID, 10),
			item.OccurredAt.Format(time.RFC3339Nano),
			item.OccurredLocalDate,
			item.Kind,
			formatMinorAmount(item.AmountMinor, export.CurrencyExponent),
			item.CurrencyCode,
			safeCSVCell(item.Category.Name),
			safeCSVCell(item.Title),
			item.Source,
			item.LocationStatus,
			latitude,
			longitude,
			accuracy,
			capturedAt,
			item.CreatedAt.UTC().Format(time.RFC3339Nano),
			item.UpdatedAt.UTC().Format(time.RFC3339Nano),
		})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		a.logger.Error("write transaction csv", "request_id", requestIDFrom(r.Context()), "error", err)
	}
}

func formatMinorAmount(amount int64, exponent int) string {
	if exponent <= 0 {
		return strconv.FormatInt(amount, 10)
	}
	factor := int64(1)
	for range exponent {
		factor *= 10
	}
	return fmt.Sprintf("%d.%0*d", amount/factor, exponent, amount%factor)
}

func safeCSVCell(value string) string {
	trimmed := strings.TrimLeft(value, " \t\r\n")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return "'" + value
	}
	return value
}

func (a *API) createTransaction(w http.ResponseWriter, r *http.Request) {
	var input service.TransactionInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.CreateTransaction(r.Context(), input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusCreated, item)
}

func (a *API) getTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.GetTransaction(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) patchTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	var input service.TransactionUpdate
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.UpdateTransaction(r.Context(), id, input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) deleteTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.DeleteTransaction(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) restoreTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.RestoreTransaction(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) putLocation(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	var input service.LocationInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.AttachLocation(r.Context(), id, input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) locationFailure(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.MarkLocationFailure(r.Context(), id, input.Reason)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) deleteLocation(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.RemoveLocation(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) dayDashboard(w http.ResponseWriter, r *http.Request) {
	item, err := a.service.DailyDashboard(r.Context(), r.URL.Query().Get("date"))
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) monthDashboard(w http.ResponseWriter, r *http.Request) {
	item, err := a.service.MonthlyDashboard(r.Context(), r.URL.Query().Get("month"))
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}
