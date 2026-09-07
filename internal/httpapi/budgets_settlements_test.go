package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"simfiment/internal/domain"
	"strings"
	"testing"
	"time"
)

func TestBudgetAndSettlementEndpoints(t *testing.T) {
	handler, cfg, session, cleanup := newTestHandler(t)
	defer cleanup()
	cookie := &http.Cookie{Name: "simfiment_session", Value: session.Token}
	call := func(method, path, body, csrf, origin string, authenticated bool) *httptest.ResponseRecorder {
		t.Helper()
		req := authenticatedJSONRequest(method, path, []byte(body), cookie, csrf, origin)
		if !authenticated {
			req.Header.Del("Cookie")
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		return response
	}
	for _, path := range []string{"/api/v1/budgets?month=2026-09", "/api/v1/transactions?settlementStatus=pending"} {
		if response := call("GET", path, "", "", "", false); response.Code != 401 {
			t.Fatalf("unprotected %s: %d", path, response.Code)
		}
	}
	for _, route := range []struct{ method, path string }{{"PUT", "/api/v1/budgets/2026-09"}, {"POST", "/api/v1/transactions/1/complete"}, {"POST", "/api/v1/transactions/1/reopen"}} {
		for _, protection := range []struct{ csrf, origin string }{{"wrong", cfg.BaseURL}, {session.CSRFToken, "https://evil.test"}} {
			response := call(route.method, route.path, `{}`, protection.csrf, protection.origin, true)
			if response.Code != 403 {
				t.Fatalf("mutation protection %s: %d", route.path, response.Code)
			}
		}
	}
	response := call("PUT", "/api/v1/budgets/2026-09", `{"items":[{"categoryId":0,"amountMinor":9000}]}`, session.CSRFToken, cfg.BaseURL, true)
	if response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	response = call("PUT", "/api/v1/budgets/2026-09", `{"items":[{"categoryId":0,"amountMinor":0}]}`, session.CSRFToken, cfg.BaseURL, true)
	if response.Code != 422 {
		t.Fatal("invalid budget accepted")
	}
	body := fmt.Sprintf(`{"clientRequestId":"http-settlement-expense","kind":"expense","amountMinor":270,"categoryId":1,"title":"Lunch","occurredAt":%q,"locationIntent":"none","settlement":{"counterparty":"=Alex","dueOn":"2026-09-10"}}`, time.Now().UTC().Format(time.RFC3339))
	response = call("POST", "/api/v1/transactions", body, session.CSRFToken, cfg.BaseURL, true)
	if response.Code != 201 {
		t.Fatal(response.Body.String())
	}
	var result struct {
		Data domain.Transaction `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	id := result.Data.ID
	response = call("POST", fmt.Sprintf("/api/v1/transactions/%d/complete", id), `{}`, session.CSRFToken, cfg.BaseURL, true)
	if response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Data.Settlement.Status != "completed" || result.Data.AmountMinor != 270 {
		t.Fatal("completion changed transaction")
	}
	response = call("GET", "/api/v1/transactions/export.csv", "", "", "", true)
	if response.Code != 200 || !strings.Contains(response.Body.String(), "settlement_status") || !strings.Contains(response.Body.String(), "'=Alex") || !strings.Contains(response.Body.String(), "completed") {
		t.Fatalf("settlement export: %s", response.Body.String())
	}
	response = call("GET", "/api/v1/transactions?settlementStatus=invalid", "", "", "", true)
	if response.Code != 422 {
		t.Fatal("invalid filter accepted")
	}
}
