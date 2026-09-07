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

## 預算與借還款

`GET /api/v1/budgets?month=YYYY-MM` 回傳 `month`、`effectiveMonth`、`currencyCode` 與 `items`。每筆包含 `categoryId`（0 為全部支出）、`amountMinor`、`expenseMinor`、`remainingMinor`、`days`；每日包含 `date`、`allocationMinor`、`expenseMinor` 與 `availableMinor`。

`PUT /api/v1/budgets/{month}` 接受 `{ "items": [{ "categoryId": 0, "amountMinor": 9000 }] }`，完整取代自該月生效的設定。缺少該月份設定時沿用最近的較早版本；空陣列明確停用，自該月起沿用停用狀態。每個分類限一筆，只能使用支出分類；既有已封存分類仍可保留。更早月份不受影響，較晚月份沿用至下一個設定版本。

每日可用額度為 `floor(月額度 × 當月日序 / 當月天數) − 月初至當日的有效支出`，允許負數，收入不回補；月初不承接上月结餘。所有金額均使用最小貨幣單位。

交易建立與更新接受可選 `settlement: { "counterparty": "Alex", "dueOn": "2026-09-10" }`；對象必填且最多 80 字元，到期日選填。交易建立即計入原交易日期的收支。回傳欄位另外包含 `status: "pending" | "completed"` 與可選 `completedAt`。

更新交易時省略 `settlement` 保留追蹤資料；傳入 `{ "counterparty": "" }` 明確移除追蹤。`POST /api/v1/transactions/{id}/complete`、`POST /api/v1/transactions/{id}/reopen` 完成或撤銷完成，操作具冪等性且不改金額、交易日期或刪除狀態。已刪除或未追蹤的交易回傳 `409 settlement_unavailable`。

交易清單新增 `settlementStatus=pending|completed`，可搭配 `kind` 和既有游標分頁。CSV 尾端新增 `settlement_counterparty`、`settlement_due_on`、`settlement_status`、`settlement_completed_at`；完成的交易仍會匯出。
