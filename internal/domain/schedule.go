package domain

import (
	"fmt"
	"time"
)

const dateLayout = "2006-01-02"

// ParseDate validates a strict Gregorian YYYY-MM-DD date.
func ParseDate(value string) (time.Time, error) {
	parsed, err := time.Parse(dateLayout, value)
	if err != nil || parsed.Format(dateLayout) != value {
		return time.Time{}, fmt.Errorf("invalid date %q", value)
	}
	return parsed, nil
}

// OccurrenceDate calculates a schedule occurrence from its original anchor.
// Month and year arithmetic clamps to the target month's last day without drift.
func OccurrenceDate(startOn, frequency string, intervalCount, sequence int) (string, error) {
	anchor, err := ParseDate(startOn)
	if err != nil {
		return "", err
	}
	if intervalCount < 1 || intervalCount > 100 || sequence < 0 {
		return "", fmt.Errorf("invalid recurrence interval or sequence")
	}
	var result time.Time
	switch frequency {
	case "weekly":
		result = anchor.AddDate(0, 0, 7*intervalCount*sequence)
	case "monthly":
		months := int(anchor.Month()) - 1 + intervalCount*sequence
		year := anchor.Year() + months/12
		month := time.Month(months%12 + 1)
		result = clampedDate(year, month, anchor.Day())
	case "yearly":
		result = clampedDate(anchor.Year()+intervalCount*sequence, anchor.Month(), anchor.Day())
	default:
		return "", fmt.Errorf("invalid recurrence frequency %q", frequency)
	}
	return result.Format(dateLayout), nil
}

func clampedDate(year int, month time.Month, day int) time.Time {
	lastDay := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}
