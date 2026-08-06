package i18n

import "testing"

func TestNegotiate(t *testing.T) {
	tests := []struct {
		header string
		want   Locale
	}{
		{"en-US,en;q=0.9", English},
		{"ja,zh-Hant;q=0.8,en;q=0.5", TraditionalChinese},
		{"fr,en;q=0.7", English},
		{"en;q=0,zh-TW;q=0.5", TraditionalChinese},
		{"", TraditionalChinese},
		{"*", TraditionalChinese},
	}
	for _, test := range tests {
		if got := Negotiate(test.header); got != test.want {
			t.Errorf("Negotiate(%q) = %q, want %q", test.header, got, test.want)
		}
	}
}

func TestEnglishTextAndCategorySeeds(t *testing.T) {
	if got := Text(English, "密碼不正確。"); got != "The password is incorrect." {
		t.Fatalf("translated password error = %q", got)
	}
	if got := Text(English, "unknown fallback"); got != "unknown fallback" {
		t.Fatalf("unknown message = %q", got)
	}
	expense, income := DefaultCategories(English)
	if expense[0].Name != "Food" || income[0].Name != "Salary" {
		t.Fatalf("english seeds = %#v %#v", expense[0], income[0])
	}
}
