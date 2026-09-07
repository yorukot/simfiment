package domain

import "time"

// Settlement tracks follow-up on an already counted income or expense.
type Settlement struct {
	Counterparty string     `json:"counterparty"`
	DueOn        string     `json:"dueOn,omitempty"`
	Status       string     `json:"status"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
}

// BudgetLimit is one monthly cap; category zero means all expenses.
type BudgetLimit struct {
	CategoryID  int64 `json:"categoryId"`
	AmountMinor int64 `json:"amountMinor"`
}

type BudgetDay struct {
	Date            string `json:"date"`
	AllocationMinor int64  `json:"allocationMinor"`
	ExpenseMinor    int64  `json:"expenseMinor"`
	AvailableMinor  int64  `json:"availableMinor"`
}

type BudgetSummary struct {
	BudgetLimit
	ExpenseMinor   int64       `json:"expenseMinor"`
	RemainingMinor int64       `json:"remainingMinor"`
	Days           []BudgetDay `json:"days"`
}

type MonthlyBudgets struct {
	Month          string          `json:"month"`
	EffectiveMonth string          `json:"effectiveMonth,omitempty"`
	CurrencyCode   string          `json:"currencyCode"`
	Items          []BudgetSummary `json:"items"`
}
