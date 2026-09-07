package domain

import "time"

const MaxAmountMinor int64 = 9_000_000_000_000

// Settings contains installation-scoped user preferences.
type Settings struct {
	InitializedAt           *time.Time `json:"initializedAt,omitempty"`
	CurrencyCode            string     `json:"currencyCode"`
	CurrencyExponent        int        `json:"currencyExponent"`
	Timezone                string     `json:"timezone"`
	Locale                  string     `json:"locale"`
	Theme                   string     `json:"theme"`
	AutomaticLocationEnable bool       `json:"automaticLocationEnabled"`
}

// Category classifies transactions of one kind.
type Category struct {
	ID         int64      `json:"id"`
	Kind       string     `json:"kind"`
	Name       string     `json:"name"`
	IconKey    string     `json:"iconKey"`
	SortOrder  int        `json:"sortOrder"`
	ArchivedAt *time.Time `json:"archivedAt,omitempty"`
}

// Location is sensitive entry-location metadata attached to a transaction.
type Location struct {
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	AccuracyM  *float64  `json:"accuracyM,omitempty"`
	CapturedAt time.Time `json:"capturedAt"`
}

// Transaction is a confirmed income or expense record.
type Transaction struct {
	Settlement            *Settlement `json:"settlement,omitempty"`
	ID                    int64       `json:"id"`
	ClientRequestID       string      `json:"clientRequestId,omitempty"`
	Kind                  string      `json:"kind"`
	AmountMinor           int64       `json:"amountMinor"`
	CurrencyCode          string      `json:"currencyCode"`
	Category              Category    `json:"category"`
	Title                 string      `json:"title"`
	OccurredAt            time.Time   `json:"occurredAt"`
	OccurredLocalDate     string      `json:"occurredLocalDate"`
	Source                string      `json:"source"`
	RecurringOccurrenceID *int64      `json:"recurringOccurrenceId,omitempty"`
	LocationStatus        string      `json:"locationStatus"`
	Location              *Location   `json:"location,omitempty"`
	DeletedAt             *time.Time  `json:"deletedAt,omitempty"`
	CreatedAt             time.Time   `json:"createdAt"`
	UpdatedAt             time.Time   `json:"updatedAt"`
}

// Totals contains dashboard totals in minor currency units.
type Totals struct {
	IncomeMinor      int64 `json:"incomeMinor"`
	ExpenseMinor     int64 `json:"expenseMinor"`
	NetMinor         int64 `json:"netMinor"`
	TransactionCount int64 `json:"transactionCount"`
}

// CategoryTotal is an aggregate for one category.
type CategoryTotal struct {
	CategoryID       int64  `json:"categoryId"`
	Name             string `json:"name"`
	IconKey          string `json:"iconKey"`
	AmountMinor      int64  `json:"amountMinor"`
	TransactionCount int64  `json:"transactionCount"`
}

// DailyDashboard is the server-authoritative aggregate for one local date.
type DailyDashboard struct {
	Date              string          `json:"date"`
	CurrencyCode      string          `json:"currencyCode"`
	Totals            Totals          `json:"totals"`
	ExpenseCategories []CategoryTotal `json:"expenseCategories"`
	IncomeCategories  []CategoryTotal `json:"incomeCategories"`
}

// DailySeriesPoint contains one day's monthly aggregate.
type DailySeriesPoint struct {
	Date         string `json:"date"`
	IncomeMinor  int64  `json:"incomeMinor"`
	ExpenseMinor int64  `json:"expenseMinor"`
	NetMinor     int64  `json:"netMinor"`
}

// MonthlyDashboard is the server-authoritative aggregate for one month.
type MonthlyDashboard struct {
	Month             string             `json:"month"`
	CurrencyCode      string             `json:"currencyCode"`
	Totals            Totals             `json:"totals"`
	ExpenseCategories []CategoryTotal    `json:"expenseCategories"`
	IncomeCategories  []CategoryTotal    `json:"incomeCategories"`
	DailySeries       []DailySeriesPoint `json:"dailySeries"`
}

// RecurringRule is an anchor-based template for scheduled occurrences.
type RecurringRule struct {
	ID              int64      `json:"id"`
	ClientRequestID string     `json:"clientRequestId,omitempty"`
	Kind            string     `json:"kind"`
	AmountMinor     int64      `json:"amountMinor"`
	CurrencyCode    string     `json:"currencyCode"`
	Category        Category   `json:"category"`
	Title           string     `json:"title"`
	Frequency       string     `json:"frequency"`
	IntervalCount   int        `json:"intervalCount"`
	StartOn         string     `json:"startOn"`
	NextSequence    int        `json:"nextSequence"`
	NextDueOn       string     `json:"nextDueOn"`
	Enabled         bool       `json:"enabled"`
	ArchivedAt      *time.Time `json:"archivedAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// RecurringOccurrence is an immutable scheduled snapshot.
type RecurringOccurrence struct {
	ID           int64     `json:"id"`
	RuleID       int64     `json:"ruleId"`
	ScheduledOn  string    `json:"scheduledOn"`
	Status       string    `json:"status"`
	Kind         string    `json:"kind"`
	AmountMinor  int64     `json:"amountMinor"`
	CurrencyCode string    `json:"currencyCode"`
	Category     Category  `json:"category"`
	Title        string    `json:"title"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// RecurringPreview is a calculated future item that is not persisted or counted.
type RecurringPreview struct {
	RuleID       int64    `json:"ruleId"`
	ScheduledOn  string   `json:"scheduledOn"`
	Kind         string   `json:"kind"`
	AmountMinor  int64    `json:"amountMinor"`
	CurrencyCode string   `json:"currencyCode"`
	Category     Category `json:"category"`
	Title        string   `json:"title"`
}
