package platform

import "time"

// Clock provides the current time and makes time-dependent behavior testable.
type Clock interface {
	Now() time.Time
}

// RealClock uses the system clock.
type RealClock struct{}

// Now returns the current time.
func (RealClock) Now() time.Time { return time.Now() }
