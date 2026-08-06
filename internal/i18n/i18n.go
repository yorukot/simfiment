// Package i18n contains the deliberately small set of locales supported by Simfiment.
package i18n

import (
	"sort"
	"strconv"
	"strings"
)

type Locale string

const (
	TraditionalChinese Locale = "zh-TW"
	English            Locale = "en"
)

func Supported(value string) bool {
	return value == string(TraditionalChinese) || value == string(English)
}

func Normalize(value string) (Locale, bool) {
	tag := strings.ToLower(strings.TrimSpace(value))
	switch {
	case tag == "en" || strings.HasPrefix(tag, "en-"):
		return English, true
	case tag == "zh" || strings.HasPrefix(tag, "zh-"):
		return TraditionalChinese, true
	default:
		return TraditionalChinese, false
	}
}

// Negotiate selects the best supported locale from an Accept-Language header.
func Negotiate(header string) Locale {
	type preference struct {
		tag   string
		q     float64
		order int
	}
	preferences := make([]preference, 0)
	for index, part := range strings.Split(header, ",") {
		segments := strings.Split(part, ";")
		candidate := preference{tag: strings.TrimSpace(segments[0]), q: 1, order: index}
		for _, parameter := range segments[1:] {
			key, value, found := strings.Cut(strings.TrimSpace(parameter), "=")
			if found && strings.EqualFold(key, "q") {
				if parsed, err := strconv.ParseFloat(value, 64); err == nil {
					candidate.q = parsed
				}
			}
		}
		if candidate.tag != "" && candidate.tag != "*" && candidate.q > 0 {
			preferences = append(preferences, candidate)
		}
	}
	sort.SliceStable(preferences, func(left, right int) bool {
		if preferences[left].q == preferences[right].q {
			return preferences[left].order < preferences[right].order
		}
		return preferences[left].q > preferences[right].q
	})
	for _, preference := range preferences {
		if locale, ok := Normalize(preference.tag); ok {
			return locale
		}
	}
	return TraditionalChinese
}

func Text(locale Locale, traditionalChinese string) string {
	if locale != English {
		return traditionalChinese
	}
	if translated, ok := english[traditionalChinese]; ok {
		return translated
	}
	return traditionalChinese
}

func Fields(locale Locale, fields map[string]string) map[string]string {
	if len(fields) == 0 {
		return nil
	}
	localized := make(map[string]string, len(fields))
	for field, message := range fields {
		localized[field] = Text(locale, message)
	}
	return localized
}

type CategorySeed struct {
	Name string
	Icon string
}

func DefaultCategories(locale Locale) (expense, income []CategorySeed) {
	if locale == English {
		return []CategorySeed{
				{"Food", "food"}, {"Transport", "transport"}, {"Shopping", "shopping"},
				{"Home", "home"}, {"Entertainment", "entertainment"}, {"Health", "health"},
				{"Education", "education"}, {"Subscriptions", "subscription"}, {"Other", "other"},
			}, []CategorySeed{
				{"Salary", "salary"}, {"Bonus", "bonus"}, {"Freelance", "freelance"},
				{"Interest", "interest"}, {"Refund", "refund"}, {"Other", "other"},
			}
	}
	return []CategorySeed{
			{"飲食", "food"}, {"交通", "transport"}, {"購物", "shopping"}, {"居家", "home"},
			{"娛樂", "entertainment"}, {"健康", "health"}, {"教育", "education"},
			{"訂閱", "subscription"}, {"其他", "other"},
		}, []CategorySeed{
			{"薪資", "salary"}, {"獎金", "bonus"}, {"接案", "freelance"},
			{"利息", "interest"}, {"退款", "refund"}, {"其他", "other"},
		}
}

var english = map[string]string{
	"部分欄位無效。":                            "Some fields are invalid.",
	"密碼必須是有效文字":                          "The password must contain valid text.",
	"密碼長度必須為 12 到 128 個字元":               "The password must be between 12 and 128 characters.",
	"分類識別碼無效。":                           "The category ID is invalid.",
	"每頁筆數無效。":                            "The page size is invalid.",
	"找不到 API 路徑。":                        "The API route was not found.",
	"發生未預期的錯誤，請稍後再試。":                    "An unexpected error occurred. Please try again.",
	"Content-Type 必須是 application/json。": "Content-Type must be application/json.",
	"JSON 內容無效。":                         "The JSON body is invalid.",
	"請求內容超過 64 KiB。":                     "The request body exceeds 64 KiB.",
	"備份檔案類型必須是 application/vnd.sqlite3。": "The backup file type must be application/vnd.sqlite3.",
	"備份檔案不可超過 1 GiB。":                    "The backup file cannot exceed 1 GiB.",
	"選取的檔案不是有效的 Simfiment 備份。":           "The selected file is not a valid Simfiment backup.",
	"此備份來自較新的 Simfiment 版本，請先更新應用程式。":    "This backup is from a newer Simfiment version. Update the application first.",
	"時間必須是有效的 RFC 3339 格式。":              "The time must use a valid RFC 3339 format.",
	"JSON 內容後方包含多餘資料。":                   "The JSON body contains trailing data.",
	"資料庫目前無法使用。":                         "The database is currently unavailable.",
	"請求來源無效。":                            "The request origin is invalid.",
	"請先登入。":                              "Please sign in first.",
	"安全驗證失敗，請重新整理後再試。":                   "Security verification failed. Refresh and try again.",
	"資源識別碼無效。":                           "The resource ID is invalid.",
	"主題必須是 system、light 或 dark。":         "The theme must be system, light, or dark.",
	"MVP 僅支援繁體中文（zh-TW）。":                "The locale is not supported.",
	"語系必須是 zh-TW 或 en。":                  "The locale must be zh-TW or en.",
	"請選擇有效的 IANA 時區。":                    "Choose a valid IANA time zone.",
	"變更時區不會重新分組既有資料，請確認後再儲存。":            "Changing the time zone does not regroup existing data. Confirm before saving.",
	"日期格式必須為 YYYY-MM-DD。":                "The date must use YYYY-MM-DD format.",
	"月份格式必須為 YYYY-MM。":                   "The month must use YYYY-MM format.",
	"類型必須是 expense 或 income。":            "The type must be expense or income.",
	"已有同名的啟用中分類。":                        "An active category with that name already exists.",
	"找不到分類。":                             "The category was not found.",
	"每種類型至少要保留一個啟用中的分類。":                 "Keep at least one active category of each type.",
	"此分類仍被啟用中的週期規則使用。":                   "This category is used by an enabled recurring rule.",
	"啟用中的分類已有相同名稱。":                      "An active category already has that name.",
	"排序必須包含此類型的所有啟用中分類。":                 "The order must include every active category of this type.",
	"排序包含無效或重複的分類。":                      "The order contains an invalid or duplicate category.",
	"分類名稱必須為 1 到 30 個有效字元。":              "The category name must contain 1 to 30 valid characters.",
	"不支援此圖示。":                            "This icon is not supported.",
	"位置意圖必須是 none、capture 或 skip。":       "The location intent must be none, capture, or skip.",
	"只有 capture 意圖可以附帶位置。":               "Only the capture intent can include a location.",
	"此請求識別碼已用於不同內容。":                     "This request ID was already used for different content.",
	"分類類型與交易類型不符。":                       "The category type does not match the transaction type.",
	"找不到交易。":                             "The transaction was not found.",
	"起始日期無效。":                            "The start date is invalid.",
	"結束日期無效。":                            "The end date is invalid.",
	"結束日期必須晚於起始日期。":                      "The end date must be after the start date.",
	"交易類型無效。":                            "The transaction type is invalid.",
	"搜尋文字最多 100 個字元。":                    "Search text is limited to 100 characters.",
	"每頁筆數必須介於 1 到 200。":                  "The page size must be between 1 and 200.",
	"游標無效。":                              "The cursor is invalid.",
	"已刪除的交易無法編輯。":                        "Deleted transactions cannot be edited.",
	"無法替已刪除的交易附加位置。":                     "A location cannot be attached to a deleted transaction.",
	"只能在手動交易建立後五分鐘內附加位置。":                "A location can be attached only within five minutes of creating a manual transaction.",
	"此交易未啟用位置擷取。":                        "Location capture is not enabled for this transaction.",
	"位置失敗原因無效。":                          "The location failure reason is invalid.",
	"此交易無法更新位置狀態。":                       "This transaction's location status cannot be updated.",
	"目前的位置狀態無法標記為失敗。":                    "The current location status cannot be marked as failed.",
	"無法修改已刪除交易的位置。":                      "The location of a deleted transaction cannot be changed.",
	"週期交易不支援輸入位置。":                       "Recurring transactions do not support entry locations.",
	"請選擇分類。":                             "Choose a category.",
	"此分類已封存。":                            "This category is archived.",
	"請求識別碼無效。":                           "The request ID is invalid.",
	"交易類型必須是 expense 或 income。":          "The transaction type must be expense or income.",
	"金額必須大於零且不得超過上限。":                    "The amount must be greater than zero and within the limit.",
	"標題最多 80 個有效字元。":                     "The title is limited to 80 valid characters.",
	"請輸入有效的日期與時間。":                       "Enter a valid date and time.",
	"交易時間不可超過現在五分鐘。":                     "The transaction time cannot be more than five minutes in the future.",
	"緯度無效。":                              "The latitude is invalid.",
	"經度無效。":                              "The longitude is invalid.",
	"位置精確度無效。":                           "The location accuracy is invalid.",
	"位置擷取時間無效。":                          "The location capture time is invalid.",
	"找不到週期規則。":                           "The recurring rule was not found.",
	"封存的週期規則無法啟用。":                       "An archived recurring rule cannot be enabled.",
	"週期規則需要管理員檢查，因為待產生筆數過多。":             "The recurring rule needs administrator review because it would generate too many items.",
	"週期狀態無效。":                            "The recurring status is invalid.",
	"預覽日期範圍無效。":                          "The preview date range is invalid.",
	"預覽範圍不可超過一年。":                        "The preview range cannot exceed one year.",
	"此週期項目已處理。":                          "This recurring item has already been processed.",
	"此分類已停用，請選擇新的分類後確認。":                 "This category is inactive. Choose a new category before confirming.",
	"分類類型與週期項目不符。":                       "The category type does not match the recurring item.",
	"週期項目需要調整。":                          "The recurring item needs adjustment.",
	"找不到週期項目。":                           "The recurring item was not found.",
	"頻率必須是 weekly、monthly 或 yearly。":     "The frequency must be weekly, monthly, or yearly.",
	"間隔必須介於 1 到 100。":                    "The interval must be between 1 and 100.",
	"開始日期格式必須為 YYYY-MM-DD。":              "The start date must use YYYY-MM-DD format.",
	"此應用程式已完成設定。":                        "This application has already been set up.",
	"登入嘗試過於頻繁，請稍後再試。":                    "There have been too many sign-in attempts. Try again later.",
	"密碼不正確。":                             "The password is incorrect.",
	"登入階段已失效，請重新登入。":                     "Your session has expired. Sign in again.",
	"目前密碼不正確。":                           "The current password is incorrect.",
	"新密碼必須與目前密碼不同。":                      "The new password must differ from the current password.",
	"請選擇支援的幣別。":                          "Choose a supported currency.",
	"變更幣別會重新解讀所有金額，請確認後再儲存。":             "Changing the currency reinterprets every amount. Confirm before saving.",
	"有金額在截斷後會變成零，請先調整這些金額。":              "Some amounts would become zero after truncation. Adjust them before changing the currency.",
	"有金額在轉換後會超過上限，請先調整這些金額。":             "Some amounts would exceed the limit after conversion. Adjust them before changing the currency.",
}
