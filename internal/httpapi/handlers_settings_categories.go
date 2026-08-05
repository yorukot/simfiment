package httpapi

import (
	"net/http"

	"simfiment/internal/domain"
	"simfiment/internal/service"
)

func (a *API) getSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := a.service.Settings(r.Context())
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, settings)
}

func (a *API) patchSettings(w http.ResponseWriter, r *http.Request) {
	var input service.SettingsUpdate
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	settings, err := a.service.UpdateSettings(r.Context(), input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, settings)
}

func (a *API) operationsStatus(w http.ResponseWriter, r *http.Request) {
	status, err := a.service.OperationsStatus(r.Context())
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, status)
}

func (a *API) listCategories(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	items, err := a.service.ListCategories(r.Context(), kind, includeArchived)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, items)
}

func (a *API) createCategory(w http.ResponseWriter, r *http.Request) {
	var input service.CategoryInput
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.CreateCategory(r.Context(), input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusCreated, item)
}

func (a *API) patchCategory(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	var input service.CategoryUpdate
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.UpdateCategory(r.Context(), id, input)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) archiveCategory(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.ArchiveCategory(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) restoreCategory(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	item, err := a.service.RestoreCategory(r.Context(), id)
	if err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, item)
}

func (a *API) reorderCategories(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Kind       string  `json:"kind"`
		OrderedIDs []int64 `json:"orderedIds"`
	}
	if err := a.decodeJSON(w, r, &input); err != nil {
		a.writeError(w, r, err)
		return
	}
	if err := a.service.ReorderCategories(r.Context(), input.Kind, input.OrderedIDs); err != nil {
		a.writeError(w, r, err)
		return
	}
	a.writeData(w, http.StatusOK, map[string]bool{"reordered": true})
}

func pathID(r *http.Request) (int64, error) {
	value := r.PathValue("id")
	var id int64
	if value == "" {
		return 0, domain.ValidationError(map[string]string{"id": "資源識別碼無效。"})
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return 0, domain.ValidationError(map[string]string{"id": "資源識別碼無效。"})
		}
		id = id*10 + int64(char-'0')
		if id > 9_223_372_036_854_775_000 {
			return 0, domain.ValidationError(map[string]string{"id": "資源識別碼無效。"})
		}
	}
	if id < 1 {
		return 0, domain.ValidationError(map[string]string{"id": "資源識別碼無效。"})
	}
	return id, nil
}
