package httpapi

import (
	"net/http"
	"strconv"

	"simfiment/internal/domain"
	"simfiment/internal/service"
)

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
