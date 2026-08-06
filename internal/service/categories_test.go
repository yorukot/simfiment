package service

import "testing"

func TestValidateCategoryFieldsAcceptsMaterialSymbols(t *testing.T) {
	_, fields := validateCategoryFields("expense", "銀行", "account_balance_wallet", true)
	if message := fields["iconKey"]; message != "" {
		t.Fatalf("expected Material Symbol to be accepted, got %q", message)
	}
}

func TestValidateCategoryFieldsRejectsUnknownIcon(t *testing.T) {
	_, fields := validateCategoryFields("expense", "測試", "not_a_real_material_symbol", true)
	if message := fields["iconKey"]; message == "" {
		t.Fatal("expected unknown icon to be rejected")
	}
}
