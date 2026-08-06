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

登入後由「設定 → 完整備份與還原」下載備份。伺服器使用 SQLite `VACUUM INTO` 建立包含 WAL 已提交內容的一致快照，清除 Session，通過 quick check 與 foreign-key check 後才傳給瀏覽器。暫存檔使用 `0600` 並在傳輸完成後刪除，伺服器不保留歷史份數。

`.db` 內含交易、分類、週期、設定、位置與密碼雜湊，應存放在受保護且不與 Simfiment 共用同一磁碟的位置。Simfiment 不提供自動排程或雲端保存；自架管理者應依自己的復原目標定期下載並保存備份。

## Restore

1. 在「設定 → 完整備份與還原」選擇 `.db`，確認取代所有資料。
2. 伺服器將檔案串流到受限暫存空間；上限 1 GiB、逾時 5 分鐘。
3. 上傳檔必須是已初始化的 Simfiment SQLite；舊版 schema 會先在暫存檔升級，較新版 schema 會被拒絕。
4. 完整性檢查通過後，伺服器短暫鎖定資料庫請求，以 SQLite 線上還原取代目前資料。失敗時會自動回復原資料。
5. 成功後所有 Session 都會失效；以備份當時的密碼重新登入並確認資料。

只有取代與 rollback 都失敗的極端情況，伺服器才會在 error log 記錄保留下來的緊急 snapshot 路徑；一般成功或已回復的操作不留下伺服器端備份。

## Password recovery

在主機終端執行 `simfiment auth reset`。這會更新 Argon2id hash、遞增 password version、撤銷所有 Session，但不會刪除財務資料。

## Location privacy

生產環境必須使用 HTTPS。座標只保存在 SQLite 與備份中，不會寫入 request log，也不會送往外部地圖、分析或 reverse-geocoding service。
