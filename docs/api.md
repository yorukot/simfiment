# Simfiment API 摘要

API base path 為 `/api/v1`。成功 JSON 使用 `{ "data": ... }`，錯誤使用 `{ "error": { "code", "message", "fields", "requestId" } }`。除了 meta、setup、login 與 health 外，所有端點都需要 Session cookie；所有 authenticated mutation 另外需要同源 `Origin` 與 `X-CSRF-Token`。

主要資源：

- `GET /api/v1/meta`
- `POST /api/v1/setup`
- `POST|GET|DELETE /api/v1/session`
- `PUT /api/v1/password`
- `GET|PATCH /api/v1/settings`
- `GET /api/v1/operations/status`
- `/api/v1/categories`
- `/api/v1/transactions`
- `/api/v1/dashboards/day` 與 `/api/v1/dashboards/month`
- `/api/v1/recurring-rules`
- `/api/v1/recurring-occurrences`
- `/api/v1/recurring-preview`

完整 request/response 契約與 validation rules 見根目錄的 [development specification](../simfiment-development-spec.md#21-http-api-specification)。

