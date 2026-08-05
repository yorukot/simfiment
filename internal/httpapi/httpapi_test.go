package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simfiment/internal/database"
	"simfiment/internal/platform"
	"simfiment/internal/service"
)

type testEnvelope struct {
	Data  json.RawMessage `json:"data"`
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

func newTestHandler(t *testing.T) (http.Handler, platform.Config, service.SessionResult, func()) {
	t.Helper()
	dir := t.TempDir()
	cfg := platform.Config{DataDir: dir, BaseURL: "http://example.test", SessionDays: 30,
		Argon2MemoryKiB: 19_456, Argon2Iterations: 2, Argon2Parallelism: 1}
	db, err := database.Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	svc := service.New(db, cfg, platform.RealClock{})
	code, err := svc.EnsureSetupCode(context.Background())
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	session, err := svc.Setup(context.Background(), service.SetupInput{SetupCode: code,
		Password: "a sufficiently long password", Timezone: "Asia/Taipei", Locale: "zh-TW", CurrencyCode: "TWD"})
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New(svc, db, cfg, logger, "test", http.NotFoundHandler()), cfg, session, func() { _ = db.Close() }
}

func TestProtectedEndpointsAndCSRF(t *testing.T) {
	handler, cfg, initial, closeDB := newTestHandler(t)
	defer closeDB()

	unauthenticated := httptest.NewRecorder()
	handler.ServeHTTP(unauthenticated, httptest.NewRequest(http.MethodGet, "/api/v1/categories?kind=expense", nil))
	if unauthenticated.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d", unauthenticated.Code)
	}

	cookie := &http.Cookie{Name: "simfiment_session", Value: initial.Token}
	sessionRequest := httptest.NewRequest(http.MethodGet, "/api/v1/session", nil)
	sessionRequest.AddCookie(cookie)
	sessionResponse := httptest.NewRecorder()
	handler.ServeHTTP(sessionResponse, sessionRequest)
	if sessionResponse.Code != http.StatusOK {
		t.Fatalf("session response = %d: %s", sessionResponse.Code, sessionResponse.Body.String())
	}
	var envelope testEnvelope
	if err := json.Unmarshal(sessionResponse.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	var sessionData struct {
		CSRFToken string `json:"csrfToken"`
	}
	if err := json.Unmarshal(envelope.Data, &sessionData); err != nil || sessionData.CSRFToken == "" {
		t.Fatalf("csrf response: %#v err=%v", sessionData, err)
	}

	wrongCSRF := authenticatedJSONRequest(http.MethodPost, "/api/v1/categories",
		[]byte(`{"kind":"expense","name":"測試","iconKey":""}`), cookie, "wrong", cfg.BaseURL)
	wrongResponse := httptest.NewRecorder()
	handler.ServeHTTP(wrongResponse, wrongCSRF)
	if wrongResponse.Code != http.StatusForbidden {
		t.Fatalf("wrong csrf status = %d", wrongResponse.Code)
	}

	wrongOrigin := authenticatedJSONRequest(http.MethodPost, "/api/v1/categories",
		[]byte(`{"kind":"expense","name":"測試","iconKey":""}`), cookie, sessionData.CSRFToken, "https://evil.test")
	wrongOriginResponse := httptest.NewRecorder()
	handler.ServeHTTP(wrongOriginResponse, wrongOrigin)
	if wrongOriginResponse.Code != http.StatusForbidden {
		t.Fatalf("wrong origin status = %d", wrongOriginResponse.Code)
	}

	unknownField := authenticatedJSONRequest(http.MethodPost, "/api/v1/categories",
		[]byte(`{"kind":"expense","name":"測試","iconKey":"","unknown":true}`), cookie, sessionData.CSRFToken, cfg.BaseURL)
	unknownResponse := httptest.NewRecorder()
	handler.ServeHTTP(unknownResponse, unknownField)
	if unknownResponse.Code != http.StatusBadRequest {
		t.Fatalf("unknown field status = %d: %s", unknownResponse.Code, unknownResponse.Body.String())
	}

	valid := authenticatedJSONRequest(http.MethodPost, "/api/v1/categories",
		[]byte(`{"kind":"expense","name":"測試","iconKey":""}`), cookie, sessionData.CSRFToken, cfg.BaseURL)
	validResponse := httptest.NewRecorder()
	handler.ServeHTTP(validResponse, valid)
	if validResponse.Code != http.StatusCreated {
		t.Fatalf("valid create status = %d: %s", validResponse.Code, validResponse.Body.String())
	}
}

func TestAPINotFoundNeverReturnsSPA(t *testing.T) {
	handler, _, _, closeDB := newTestHandler(t)
	defer closeDB()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/no-such-route", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d", response.Code)
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"code":"not_found"`)) {
		t.Fatalf("unexpected response: %s", response.Body.String())
	}
}

func TestTransactionValidationLimitsAndIdempotency(t *testing.T) {
	handler, cfg, initial, closeDB := newTestHandler(t)
	defer closeDB()
	cookie := &http.Cookie{Name: "simfiment_session", Value: initial.Token}

	tests := []struct {
		name string
		body string
		want int
		code string
	}{
		{"invalid amount", `{"clientRequestId":"request-invalid-amount","kind":"expense","amountMinor":0,"categoryId":1,"title":"","occurredAt":"2026-08-05T02:00:00+08:00","locationIntent":"none"}`, http.StatusUnprocessableEntity, "validation_error"},
		{"invalid date", `{"clientRequestId":"request-invalid-date","kind":"expense","amountMinor":10,"categoryId":1,"title":"","occurredAt":"not-a-date","locationIntent":"none"}`, http.StatusUnprocessableEntity, "validation_error"},
		{"category kind mismatch", `{"clientRequestId":"request-kind-mismatch","kind":"expense","amountMinor":10,"categoryId":10,"title":"","occurredAt":"2026-08-05T02:00:00+08:00","locationIntent":"none"}`, http.StatusUnprocessableEntity, "category_kind_mismatch"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := authenticatedJSONRequest(http.MethodPost, "/api/v1/transactions", []byte(test.body), cookie, initial.CSRFToken, cfg.BaseURL)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.want || !strings.Contains(response.Body.String(), `"code":"`+test.code+`"`) {
				t.Fatalf("status/body = %d %s", response.Code, response.Body.String())
			}
		})
	}

	oversizedBody := `{"kind":"expense","padding":"` + strings.Repeat("x", 70<<10) + `"}`
	oversized := authenticatedJSONRequest(http.MethodPost, "/api/v1/transactions", []byte(oversizedBody), cookie, initial.CSRFToken, cfg.BaseURL)
	oversizedResponse := httptest.NewRecorder()
	handler.ServeHTTP(oversizedResponse, oversized)
	if oversizedResponse.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized status = %d: %s", oversizedResponse.Code, oversizedResponse.Body.String())
	}

	body := []byte(`{"clientRequestId":"request-idempotent-0001","kind":"expense","amountMinor":99,"categoryId":1,"title":"","occurredAt":"2026-08-05T02:00:00+08:00","locationIntent":"none"}`)
	var firstID float64
	for attempt := 0; attempt < 2; attempt++ {
		request := authenticatedJSONRequest(http.MethodPost, "/api/v1/transactions", body, cookie, initial.CSRFToken, cfg.BaseURL)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("attempt %d status = %d: %s", attempt, response.Code, response.Body.String())
		}
		var envelope struct {
			Data map[string]any `json:"data"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
		if attempt == 0 {
			firstID = envelope.Data["id"].(float64)
		} else if envelope.Data["id"] != firstID {
			t.Fatalf("duplicate returned id %v, want %v", envelope.Data["id"], firstID)
		}
	}
}

func TestSetupCannotRepeatAndLoginRateLimitActivates(t *testing.T) {
	handler, cfg, _, closeDB := newTestHandler(t)
	defer closeDB()

	setup := httptest.NewRequest(http.MethodPost, "/api/v1/setup", strings.NewReader(`{"setupCode":"unused","password":"a sufficiently long password","timezone":"Asia/Taipei","locale":"zh-TW","currencyCode":"TWD"}`))
	setup.Header.Set("Content-Type", "application/json")
	setup.Header.Set("Origin", cfg.BaseURL)
	setupResponse := httptest.NewRecorder()
	handler.ServeHTTP(setupResponse, setup)
	if setupResponse.Code != http.StatusConflict {
		t.Fatalf("repeat setup status = %d: %s", setupResponse.Code, setupResponse.Body.String())
	}

	for attempt := 1; attempt <= 6; attempt++ {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/session", strings.NewReader(`{"password":"definitely wrong"}`))
		request.RemoteAddr = "192.0.2.4:1234"
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Origin", cfg.BaseURL)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		want := http.StatusUnauthorized
		if attempt == 6 {
			want = http.StatusTooManyRequests
		}
		if response.Code != want {
			t.Fatalf("attempt %d status = %d, want %d: %s", attempt, response.Code, want, response.Body.String())
		}
	}
}

func authenticatedJSONRequest(method, path string, body []byte, cookie *http.Cookie, csrf, origin string) *http.Request {
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-CSRF-Token", csrf)
	request.Header.Set("Origin", origin)
	request.AddCookie(cookie)
	return request
}
