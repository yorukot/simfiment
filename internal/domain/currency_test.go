package domain

import "testing"

func TestSupportedCurrencyCatalog(t *testing.T) {
	if got := len(SupportedCurrencies()); got != 50 {
		t.Fatalf("currency count = %d, want 50", got)
	}
	for code, exponent := range map[string]int{"TWD": 0, "USD": 2, "JPY": 0, "KWD": 3} {
		currency, ok := Currency("  " + code + "  ")
		if !ok || currency.Code != code || currency.Exponent != exponent {
			t.Errorf("Currency(%q) = %#v, %v", code, currency, ok)
		}
	}
	if currency, ok := Currency("usd"); !ok || currency.Code != "USD" {
		t.Fatalf("lowercase currency = %#v, %v", currency, ok)
	}
	if _, ok := Currency("BTC"); ok {
		t.Fatal("unsupported BTC was accepted")
	}

	copyOfCatalog := SupportedCurrencies()
	copyOfCatalog[0].Code = "XXX"
	if currency, _ := Currency("TWD"); currency.Code != "TWD" {
		t.Fatal("callers can mutate the currency catalog")
	}
}
