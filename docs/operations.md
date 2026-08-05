# Operations

## Runtime shape

Simfiment 必須以單一 replica 執行，SQLite 位於本機持久磁碟。不要把 active database 放在 NFS，也不要讓多個 process 同時把同一 SQLite 檔案當作應用程式資料庫。

必要的生產設定：

```text
SIMFIMENT_DATA_DIR=/data
SIMFIMENT_BASE_URL=https://finance.example.com
SIMFIMENT_SECURE_COOKIES=true
SIMFIMENT_DEVELOPMENT=false
```

## Health

- `/health/live`：process liveness，不讀取財務資料。
- `/health/ready`：確認 SQLite 可用、必要 pragma、migration 完整以及 quick check。
- `simfiment doctor`：quick check 加 foreign-key check。

## Backup

`simfiment backup create` 使用 SQLite `VACUUM INTO` 建立一致快照，通過 quick check 與 foreign-key check 後才原子改名。建議由 cron、systemd timer 或平台 scheduler 每日執行，保留最近 7 份 daily 與 4 份 weekly。備份檔與資料目錄必須只讓服務帳號讀取。

## Restore

1. 停止 Simfiment server。
2. 執行 `simfiment backup restore /path/to/simfiment-....db`。
3. 記錄輸出的 rollback 檔案路徑。
4. 執行 `simfiment doctor`。
5. 啟動 server，確認 `/health/ready`。

## Password recovery

在主機終端執行 `simfiment auth reset`。這會更新 Argon2id hash、遞增 password version、撤銷所有 Session，但不會刪除財務資料。

## Location privacy

生產環境必須使用 HTTPS。座標只保存在 SQLite 與備份中，不會寫入 request log，也不會送往外部地圖、分析或 reverse-geocoding service。
