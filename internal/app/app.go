package app

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"simfiment/internal/database"
	"simfiment/internal/httpapi"
	"simfiment/internal/platform"
	"simfiment/internal/service"
	staticfiles "simfiment/internal/static"
)

// Version is replaced at build time for releases.
var Version = "0.1.0-dev"

// Run executes the requested CLI command.
func Run(args []string) error {
	command := "serve"
	if len(args) > 0 {
		command = args[0]
	}
	if command == "version" {
		fmt.Println(Version)
		return nil
	}
	cfg, err := platform.LoadConfig()
	if err != nil {
		return err
	}
	logger := newLogger(cfg.LogLevel)
	ctx := context.Background()
	if command == "backup" && len(args) > 1 && args[1] == "restore" {
		if len(args) != 3 {
			return fmt.Errorf("usage: simfiment backup restore <file>")
		}
		rollback, err := database.RestoreBackup(ctx, cfg.DataDir, args[2], time.Now())
		if err != nil {
			return err
		}
		restoredDB, err := database.Open(ctx, cfg.DataDir)
		if err != nil {
			return fmt.Errorf("open restored database: %w", err)
		}
		if err := database.Health(ctx, restoredDB); err != nil {
			restoredDB.Close()
			return fmt.Errorf("verify restored database: %w", err)
		}
		if err := restoredDB.Close(); err != nil {
			return err
		}
		if rollback == "" {
			fmt.Println("Backup restored into a fresh data directory.")
		} else {
			fmt.Printf("Backup restored. Previous database preserved at %s\n", rollback)
		}
		return nil
	}
	db, err := database.Open(ctx, cfg.DataDir)
	if err != nil {
		return err
	}
	defer db.Close()
	svc := service.New(db, cfg, platform.RealClock{})
	switch command {
	case "serve":
		return serve(cfg, db, svc, logger)
	case "doctor":
		if err := database.Health(ctx, db); err != nil {
			return err
		}
		if err := database.ForeignKeyCheck(ctx, db); err != nil {
			return err
		}
		fmt.Println("Database quick_check: ok")
		fmt.Println("Foreign key check: ok")
		return nil
	case "backup":
		if len(args) != 2 || args[1] != "create" {
			return fmt.Errorf("usage: simfiment backup create")
		}
		info, err := database.CreateBackup(ctx, db, cfg.DataDir, time.Now())
		if err != nil {
			return err
		}
		fmt.Println(info.Path)
		return nil
	case "auth":
		if len(args) != 2 || args[1] != "reset" {
			return fmt.Errorf("usage: simfiment auth reset")
		}
		fmt.Print("New password: ")
		password, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil {
			return err
		}
		password = strings.TrimSuffix(strings.TrimSuffix(password, "\n"), "\r")
		if err := svc.ResetPassword(ctx, password); err != nil {
			return err
		}
		fmt.Println("Password changed and all sessions revoked.")
		return nil
	case "migrate":
		if len(args) != 2 || args[1] != "status" {
			return fmt.Errorf("usage: simfiment migrate status")
		}
		rows, err := db.QueryContext(ctx, "SELECT version, name, applied_at FROM schema_migrations ORDER BY version")
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var version int
			var name string
			var applied int64
			if err := rows.Scan(&version, &name, &applied); err != nil {
				return err
			}
			fmt.Printf("%03d  %s  %s\n", version, name, time.UnixMilli(applied).UTC().Format(time.RFC3339))
		}
		return rows.Err()
	default:
		return fmt.Errorf("unknown command %q", command)
	}
}

func serve(cfg platform.Config, db *sql.DB, svc *service.Service, logger *slog.Logger) error {
	if !cfg.Development {
		if err := staticfiles.Validate(); err != nil {
			return err
		}
	}
	handler := httpapi.New(svc, db, cfg, logger, Version, staticfiles.Handler())
	server := &http.Server{Addr: cfg.Addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	shutdownCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	errCh := make(chan error, 1)
	go func() {
		logger.Info("server started", "address", cfg.Addr, "base_url", cfg.BaseURL, "version", Version)
		errCh <- server.ListenAndServe()
	}()
	select {
	case err := <-errCh:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case <-shutdownCtx.Done():
		logger.Info("server shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(ctx)
	}
}

func newLogger(level string) *slog.Logger {
	logLevel := slog.LevelInfo
	_ = logLevel.UnmarshalText([]byte(level))
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
}
