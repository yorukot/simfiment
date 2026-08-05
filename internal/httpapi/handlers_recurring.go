package httpapi

import (
	"net/http"

	"simfiment/internal/service"
)

func (a *API) listRecurringRules(w http.ResponseWriter, r *http.Request) {
	items, err := a.service.ListRecurringRules(r.Context(), r.URL.Query().Get("includeArchived") == "true")
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, items)
}

func (a *API) createRecurringRule(w http.ResponseWriter, r *http.Request) {
	var input service.RecurringRuleInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.CreateRecurringRule(r.Context(), input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusCreated, item)
}

func (a *API) patchRecurringRule(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	var input service.RecurringRuleInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.UpdateRecurringRule(r.Context(), id, input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) enableRecurringRule(w http.ResponseWriter, r *http.Request) {
	a.setRecurringEnabled(w, r, true)
}

func (a *API) disableRecurringRule(w http.ResponseWriter, r *http.Request) {
	a.setRecurringEnabled(w, r, false)
}

func (a *API) setRecurringEnabled(w http.ResponseWriter, r *http.Request, enabled bool) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.SetRecurringRuleEnabled(r.Context(), id, enabled)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) archiveRecurringRule(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.ArchiveRecurringRule(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) listOccurrences(w http.ResponseWriter, r *http.Request) {
	items, err := a.service.ListRecurringOccurrences(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, items)
}

func (a *API) recurringPreview(w http.ResponseWriter, r *http.Request) {
	items, err := a.service.RecurringPreview(r.Context(), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, items)
}

func (a *API) confirmOccurrence(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	var input service.RecurringConfirmInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.ConfirmOccurrence(r.Context(), id, input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusCreated, item)
}

func (a *API) skipOccurrence(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	var input struct{}
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.SkipOccurrence(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) apiNotFound(w http.ResponseWriter, r *http.Request) {
	a.writeAPIError(w, http.StatusNotFound, "not_found", "找不到 API 路徑。", nil, requestIDFrom(r.Context()))
}
