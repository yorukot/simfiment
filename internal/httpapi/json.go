package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"simfiment/internal/domain"
	"simfiment/internal/i18n"
)

type successEnvelope struct {
	Data any `json:"data"`
	Meta any `json:"meta,omitempty"`
}

type errorBody struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Fields    map[string]string `json:"fields,omitempty"`
	RequestID string            `json:"requestId"`
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
}

func (a *API) writeData(w http.ResponseWriter, status int, data any) {
	a.writeDataMeta(w, status, data, nil)
}

func (a *API) writeDataMeta(w http.ResponseWriter, status int, data, meta any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(successEnvelope{Data: data, Meta: meta})
}

func (a *API) writeError(w http.ResponseWriter, r *http.Request, err error) {
	requestID := requestIDFrom(r.Context())
	var typed *domain.Error
	if errors.As(err, &typed) {
		a.writeAPIError(w, r, typed.Status, typed.Code, typed.Message, typed.Fields, requestID)
		return
	}
	var internalErr *domain.InternalError
	if errors.As(err, &internalErr) {
		a.logger.Error("request failed", "request_id", requestID, "operation", internalErr.Op, "error", internalErr.Err)
	} else {
		a.logger.Error("request failed", "request_id", requestID, "error", err)
	}
	a.writeAPIError(w, r, http.StatusInternalServerError, "internal_error", "發生未預期的錯誤，請稍後再試。", nil, requestID)
}

func (a *API) writeAPIError(w http.ResponseWriter, r *http.Request, status int, code, message string, fields map[string]string, requestID string) {
	locale := i18n.Negotiate(r.Header.Get("Accept-Language"))
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Language", string(locale))
	w.Header().Add("Vary", "Accept-Language")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorEnvelope{Error: errorBody{
		Code: code, Message: i18n.Text(locale, message), Fields: i18n.Fields(locale, fields), RequestID: requestID,
	}})
}

func (a *API) decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return domain.NewError(http.StatusBadRequest, "invalid_content_type", "Content-Type 必須是 application/json。")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		message := "JSON 內容無效。"
		if strings.Contains(err.Error(), "http: request body too large") {
			return domain.NewError(http.StatusRequestEntityTooLarge, "body_too_large", "請求內容超過 64 KiB。")
		}
		var timeError *time.ParseError
		if errors.As(err, &timeError) {
			return domain.ValidationError(map[string]string{"occurredAt": "時間必須是有效的 RFC 3339 格式。"})
		}
		return domain.NewError(http.StatusBadRequest, "invalid_json", message)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return domain.NewError(http.StatusBadRequest, "invalid_json", "JSON 內容後方包含多餘資料。")
	}
	return nil
}
