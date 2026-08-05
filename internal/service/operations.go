package service

import (
	"context"
	"time"

	"simfiment/internal/database"
)

// OperationsStatus is a safe summary for the authenticated Settings screen.
type OperationsStatus struct {
	DatabaseHealthy bool       `json:"databaseHealthy"`
	BackupCount     int        `json:"backupCount"`
	LastBackupAt    *time.Time `json:"lastBackupAt,omitempty"`
}

// OperationsStatus returns database health and local backup-directory metadata.
func (s *Service) OperationsStatus(ctx context.Context) (OperationsStatus, error) {
	result := OperationsStatus{DatabaseHealthy: database.Health(ctx, s.db) == nil}
	backups, err := database.ListBackups(s.cfg.DataDir)
	if err != nil {
		return result, internal("list backups", err)
	}
	result.BackupCount = len(backups)
	if len(backups) > 0 {
		value := backups[0].CreatedAt.UTC()
		result.LastBackupAt = &value
	}
	return result, nil
}
