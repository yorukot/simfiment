package domain

import "strings"

// CurrencyDefinition is one installation currency supported by Simfiment.
// Exponent is the number of decimal places accepted and stored as minor units.
type CurrencyDefinition struct {
	Code     string `json:"code"`
	Exponent int    `json:"exponent"`
}

var supportedCurrencies = []CurrencyDefinition{
	{Code: "TWD", Exponent: 0},
	{Code: "USD", Exponent: 2},
	{Code: "EUR", Exponent: 2},
	{Code: "JPY", Exponent: 0},
	{Code: "CNY", Exponent: 2},
	{Code: "HKD", Exponent: 2},
	{Code: "MOP", Exponent: 2},
	{Code: "SGD", Exponent: 2},
	{Code: "MYR", Exponent: 2},
	{Code: "THB", Exponent: 2},
	{Code: "VND", Exponent: 0},
	{Code: "IDR", Exponent: 0},
	{Code: "PHP", Exponent: 2},
	{Code: "KRW", Exponent: 0},
	{Code: "INR", Exponent: 2},
	{Code: "AUD", Exponent: 2},
	{Code: "NZD", Exponent: 2},
	{Code: "CAD", Exponent: 2},
	{Code: "GBP", Exponent: 2},
	{Code: "CHF", Exponent: 2},
	{Code: "SEK", Exponent: 2},
	{Code: "NOK", Exponent: 2},
	{Code: "DKK", Exponent: 2},
	{Code: "PLN", Exponent: 2},
	{Code: "CZK", Exponent: 2},
	{Code: "HUF", Exponent: 0},
	{Code: "RON", Exponent: 2},
	{Code: "TRY", Exponent: 2},
	{Code: "UAH", Exponent: 2},
	{Code: "RUB", Exponent: 2},
	{Code: "AED", Exponent: 2},
	{Code: "SAR", Exponent: 2},
	{Code: "ILS", Exponent: 2},
	{Code: "QAR", Exponent: 2},
	{Code: "KWD", Exponent: 3},
	{Code: "BHD", Exponent: 3},
	{Code: "OMR", Exponent: 3},
	{Code: "JOD", Exponent: 3},
	{Code: "ZAR", Exponent: 2},
	{Code: "EGP", Exponent: 2},
	{Code: "MXN", Exponent: 2},
	{Code: "BRL", Exponent: 2},
	{Code: "ARS", Exponent: 2},
	{Code: "CLP", Exponent: 0},
	{Code: "COP", Exponent: 0},
	{Code: "PEN", Exponent: 2},
	{Code: "BDT", Exponent: 2},
	{Code: "PKR", Exponent: 0},
	{Code: "LKR", Exponent: 2},
	{Code: "NPR", Exponent: 2},
}

// SupportedCurrencies returns a copy so callers cannot mutate the catalog.
func SupportedCurrencies() []CurrencyDefinition {
	out := make([]CurrencyDefinition, len(supportedCurrencies))
	copy(out, supportedCurrencies)
	return out
}

// Currency returns the canonical definition for a case-insensitive code.
func Currency(code string) (CurrencyDefinition, bool) {
	canonical := strings.ToUpper(strings.TrimSpace(code))
	for _, currency := range supportedCurrencies {
		if currency.Code == canonical {
			return currency, true
		}
	}
	return CurrencyDefinition{}, false
}
