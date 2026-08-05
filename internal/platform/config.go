package platform

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config contains validated runtime configuration.
type Config struct {
	Addr              string
	DataDir           string
	BaseURL           string
	LogLevel          string
	SecureCookies     bool
	SessionDays       int
	Argon2MemoryKiB   uint32
	Argon2Iterations  uint32
	Argon2Parallelism uint8
	Development       bool
}

// LoadConfig reads supported environment variables and applies safe defaults.
func LoadConfig() (Config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return Config{}, fmt.Errorf("get working directory: %w", err)
	}
	cfg := Config{
		Addr:              env("SIMFIMENT_ADDR", ":8080"),
		DataDir:           env("SIMFIMENT_DATA_DIR", filepath.Join(cwd, "data")),
		BaseURL:           env("SIMFIMENT_BASE_URL", "http://localhost:8080"),
		LogLevel:          env("SIMFIMENT_LOG_LEVEL", "info"),
		SecureCookies:     envBool("SIMFIMENT_SECURE_COOKIES", false),
		SessionDays:       envInt("SIMFIMENT_SESSION_DAYS", 30),
		Argon2MemoryKiB:   uint32(envInt("SIMFIMENT_ARGON2_MEMORY_KIB", 19456)),
		Argon2Iterations:  uint32(envInt("SIMFIMENT_ARGON2_ITERATIONS", 2)),
		Argon2Parallelism: uint8(envInt("SIMFIMENT_ARGON2_PARALLELISM", 1)),
		Development:       envBool("SIMFIMENT_DEVELOPMENT", true),
	}
	if cfg.SessionDays < 1 || cfg.SessionDays > 365 {
		return Config{}, errors.New("SIMFIMENT_SESSION_DAYS must be between 1 and 365")
	}
	if cfg.Argon2MemoryKiB < 19456 || cfg.Argon2Iterations < 2 || cfg.Argon2Parallelism < 1 {
		return Config{}, errors.New("Argon2 parameters are below the supported security baseline")
	}
	parsed, err := url.Parse(cfg.BaseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" ||
		parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return Config{}, errors.New("SIMFIMENT_BASE_URL must be an HTTP(S) origin without a path, query, credentials, or fragment")
	}
	if parsed.Scheme == "https" && !cfg.SecureCookies && !cfg.Development {
		return Config{}, errors.New("secure cookies must be enabled for production HTTPS")
	}
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return Config{}, fmt.Errorf("create data directory: %w", err)
	}
	if err := os.Chmod(cfg.DataDir, 0o700); err != nil {
		return Config{}, fmt.Errorf("secure data directory: %w", err)
	}
	return cfg, nil
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envBool(name string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
