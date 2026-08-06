# Simfiment API 摘要

API base path 為 `/api/v1`。成功 JSON 使用 `{ "data": ... }`，錯誤使用 `{ "error": { "code", "message", "fields", "requestId" } }`；CSV 與 SQLite 下載端點則直接回傳檔案。除了 meta、setup、login 與 health 外，所有端點都需要 Session cookie；所有 authenticated mutation 另外需要同源 `Origin` 與 `X-CSRF-Token`。

錯誤訊息支援 `zh-TW` 與 `en`。客戶端可傳送 `Accept-Language`，伺服器會以 `Content-Language` 回覆實際使用的語系；未提供或不支援的語系回退為 `zh-TW`。

主要資源：

- `GET /api/v1/meta`
- `POST /api/v1/setup`
- `POST|GET|DELETE /api/v1/session`
- `PUT /api/v1/password`
- `GET|PATCH /api/v1/settings`
- `GET /api/v1/operations/status`
- `GET /api/v1/backups/download`
- `POST /api/v1/backups/restore`
- `/api/v1/categories`
- `/api/v1/transactions`
- `GET /api/v1/transactions/export.csv`（下載所有未刪除交易的 UTF-8 CSV）
- `/api/v1/dashboards/day` 與 `/api/v1/dashboards/month`
- `/api/v1/recurring-rules`
- `/api/v1/recurring-occurrences`
- `/api/v1/recurring-preview`

完整 request/response 契約與 validation rules 見根目錄的 [development specification](../simfiment-development-spec.md#21-http-api-specification)。

`GET /api/v1/meta` 的 `currencies` 提供 Setup 與 Settings 共用的支援幣別目錄，每筆包含 `code` 與 `exponent`。`POST /api/v1/setup` 只接受目錄中的 `currencyCode`，小數位由伺服器推導。

`PATCH /api/v1/settings` 可傳送 `currencyCode` 與 `confirmCurrencyChange: true` 變更整本帳幣別。此操作不進行匯率換算，而會在單一 transaction 中重新解讀所有交易、週期規則與 occurrence snapshots；降低小數位時直接截斷。未確認回傳 `currency_confirmation_required`，截斷成零或放大超限則拒絕且不修改任何資料。

`GET /api/v1/transactions/export.csv` 依發生時間由舊到新輸出所有未刪除交易。檔案使用含 BOM 的 UTF-8，欄位為 `id`、`occurred_at`、`local_date`、`kind`、`amount`、`currency`、`category`、`title`、`source`、`location_status`、位置明細，以及建立／更新時間。`amount` 依安裝幣別的小數位數輸出；為避免試算表公式注入，危險的分類或標題開頭會加上單引號。

`GET /api/v1/backups/download` 回傳 `application/vnd.sqlite3` 的一致完整快照，檔名為 `simfiment-backup-YYYY-MM-DDTHHMMSSZ.db`。快照不含 Session，並使用 `Cache-Control: private, no-store`。

`POST /api/v1/backups/restore` 接受 `application/vnd.sqlite3` 原始 body，不使用 multipart，大小上限 1 GiB。成功回傳 `204` 並清除 Session cookie；無效檔案回傳 `422 invalid_backup`，較新 schema 回傳 `409 backup_from_newer_version`，超過上限回傳 `413 backup_too_large`。成功後所有既有 Session 失效，資料、設定與密碼完整回到備份狀態。
