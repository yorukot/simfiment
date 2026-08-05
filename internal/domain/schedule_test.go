package domain

import "testing"

func TestOccurrenceDateMonthEndDoesNotDrift(t *testing.T) {
	want := []string{"2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"}
	for sequence, expected := range want {
		actual, err := OccurrenceDate("2026-01-31", "monthly", 1, sequence)
		if err != nil {
			t.Fatalf("sequence %d: %v", sequence, err)
		}
		if actual != expected {
			t.Errorf("sequence %d: got %s, want %s", sequence, actual, expected)
		}
	}
}

func TestOccurrenceDateLeapYearDoesNotDrift(t *testing.T) {
	want := []string{"2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"}
	for sequence, expected := range want {
		actual, err := OccurrenceDate("2028-02-29", "yearly", 1, sequence)
		if err != nil {
			t.Fatalf("sequence %d: %v", sequence, err)
		}
		if actual != expected {
			t.Errorf("sequence %d: got %s, want %s", sequence, actual, expected)
		}
	}
}

func TestOccurrenceDateIntervals(t *testing.T) {
	tests := []struct {
		frequency string
		interval  int
		sequence  int
		want      string
	}{
		{"weekly", 2, 3, "2026-02-12"},
		{"monthly", 3, 2, "2026-07-01"},
		{"yearly", 2, 2, "2030-01-01"},
	}
	for _, test := range tests {
		actual, err := OccurrenceDate("2026-01-01", test.frequency, test.interval, test.sequence)
		if err != nil {
			t.Fatal(err)
		}
		if actual != test.want {
			t.Errorf("%s: got %s, want %s", test.frequency, actual, test.want)
		}
	}
}
