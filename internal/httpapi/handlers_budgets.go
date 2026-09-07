package httpapi

import (
	"net/http"
	"simfiment/internal/service"
)

func (a *API) getBudgets(w http.ResponseWriter, r *http.Request) {
	item, err := a.service.Budgets(r.Context(), r.URL.Query().Get("month"))
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) putBudgets(w http.ResponseWriter, r *http.Request) {
	var input service.BudgetsInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.SetBudgets(r.Context(), r.PathValue("month"), input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) completeSettlement(w http.ResponseWriter, r *http.Request) {
	a.setSettlementCompleted(w, r, true)
}
func (a *API) reopenSettlement(w http.ResponseWriter, r *http.Request) {
	a.setSettlementCompleted(w, r, false)
}

func (a *API) setSettlementCompleted(w http.ResponseWriter, r *http.Request, completed bool) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.CompleteSettlement(r.Context(), id, completed)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}
