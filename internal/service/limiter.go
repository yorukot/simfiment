package service

import (
	"sync"
	"time"

	"simfiment/internal/platform"
)

type loginAttempt struct {
	failures     int
	blockedUntil time.Time
	lastAttempt  time.Time
}

type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string]loginAttempt
	clock    platform.Clock
}

func newLoginLimiter(clock platform.Clock) *loginLimiter {
	return &loginLimiter{attempts: make(map[string]loginAttempt), clock: clock}
}

func (l *loginLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	attempt := l.attempts[key]
	return !l.clock.Now().Before(attempt.blockedUntil)
}

func (l *loginLimiter) failure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.clock.Now()
	attempt := l.attempts[key]
	if now.Sub(attempt.lastAttempt) > 15*time.Minute {
		attempt.failures = 0
	}
	attempt.failures++
	attempt.lastAttempt = now
	if attempt.failures >= 5 {
		delay := time.Duration(attempt.failures-4) * 5 * time.Second
		if delay > time.Minute {
			delay = time.Minute
		}
		attempt.blockedUntil = now.Add(delay)
	}
	l.attempts[key] = attempt
}

func (l *loginLimiter) success(key string) {
	l.mu.Lock()
	delete(l.attempts, key)
	l.mu.Unlock()
}
