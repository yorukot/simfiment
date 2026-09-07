# Simfiment

Simfiment（Simple Financial Management）是單一使用者、行動優先的個人財務管理 Web 應用程式。它以 Go 單體服務提供 React 前端與 JSON API，並將 SQLite 作為唯一資料來源。

完整產品與工程規格見 [simfiment-development-spec.md](./simfiment-development-spec.md)。

## 已實作的 MVP

- Argon2id 密碼與伺服器端不透明 Session
- Session 綁定 CSRF、Origin 驗證、登入限流與安全標頭
- 支出／收入分類新增、重新命名、排序、封存與還原
- Setup／Settings 可選擇整本帳幣別，支援常用 0、2、3 位小數法定貨幣與安全的歷史資料重新解讀
- 金額＋分類即可儲存的快速交易輸入，選填標題與穩定冪等鍵
- 每月總預算與分類預算、每日正負結餘累積、跨月沿用額度並歸零結餘
- 借還款追蹤：建立即計入收支，完成／撤銷只更新狀態，保留歷史交易
- 開啟 App 直接記帳，可切換支出、收入與設定預算，支援連續輸入
- Today 與 Month 的 SQL 聚合、交易明細、編輯、軟刪除與還原
- 設定頁可將所有未刪除交易匯出為 Excel 相容的 UTF-8 CSV
- 非阻塞瀏覽器位置擷取、延遲附加、失敗狀態、五分鐘內重試與移除
- 錨點式週／月／年週期規則、快照、確認、調整並確認、略過與 30 日預覽
- SQLite migration、健康檢查、設定頁完整備份／線上還原、doctor 與密碼復原 CLI
- 可安裝 PWA、每個瀏覽器獨立設定的繁中／英文介面、深色主題、鍵盤操作與可讀的圖表替代內容

## 本機開發

需求：Go 1.26.5、Node.js 22.22.2、pnpm 10.30.3。

```bash
cd web
pnpm install --frozen-lockfile
pnpm run build
cd ..
go run ./cmd/simfiment serve
```

預設網址是 `http://localhost:8080`，資料位於 `./data`。首次啟動直接開啟網址，在設定頁輸入你要使用的密碼即可完成初始化。

前後端分離開發時，先執行 Go 服務，再於另一個終端執行：

```bash
cd web
pnpm run dev
```

Vite 會將 `/api` 與 `/health` 代理到 `localhost:8080`，瀏覽器仍以同源方式工作。

## 安裝成 App

完成前端建置後，Simfiment 會提供 Web App Manifest、一般／maskable 圖示與 Service Worker。Android Chrome 可由瀏覽器選單選擇「安裝應用程式」，iPhone／iPad Safari 則由分享選單選擇「加入主畫面」。

App 的預設啟動頁是快速記帳 `/entry`，今日總覽保留於 `/today`。Reminder 暫不提供。

除 `localhost` 開發環境外，PWA 安裝與 Service Worker 需要 HTTPS。Service Worker 只預先快取應用程式殼層、樣式、程式碼與圖示；`/api` 回應不會寫入 Cache Storage。為了讓同一天再次啟動時直接呈現 Today 畫面，前端會在瀏覽器的 `localStorage` 保存一份版本化的今日摘要與交易列表快照，但不保存 CSRF、Session Cookie 或精確位置座標。快照只在日期相符且 Session 尚未到期時呈現，登入重新驗證前維持唯讀，並在登出、驗證失敗或備份還原時清除；所有讀寫仍需連回 Simfiment 伺服器。

## 檢查與建置

```bash
make test
make vet
make build
make e2e
./simfiment version
```

`make e2e` 會啟動隔離的本機資料目錄並以 Playwright 執行新安裝、交易、分類、位置成功／拒絕、月報、週期確認／略過、改密碼與重新登入流程，同時對主要頁面執行 axe 掃描。首次在 CI 或沒有 Chrome/Chromium 的環境執行前，先於 `web` 目錄執行 `pnpm exec playwright install chromium`。

## 操作命令

```bash
simfiment serve
simfiment migrate status
simfiment doctor
simfiment auth reset
simfiment version
```

登入後可在設定頁下載完整 `.db` 備份，或上傳備份完整取代目前帳本。還原前會先驗證與升級舊版 schema，成功後所有裝置都會登出，並改用備份當時的密碼登入。

## 生產部署

生產環境只能啟動一個 Simfiment replica，並將 `/data` 掛載到本機持久磁碟。請由可信任的反向代理終止 HTTPS，將 `SIMFIMENT_BASE_URL` 設成公開 HTTPS 網址，並保持 `SIMFIMENT_SECURE_COOKIES=true`。

```bash
docker compose up --build -d
```

完整環境變數、備份與還原行為見 [docs/operations.md](./docs/operations.md)。
