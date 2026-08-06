package service

import (
	"context"

	"simfiment/internal/database"
)

// OperationsStatus is a safe summary for the authenticated Settings screen.
type OperationsStatus struct {
	DatabaseHealthy bool `json:"databaseHealthy"`
}

// OperationsStatus returns database health for the authenticated Settings screen.
func (s *Service) OperationsStatus(ctx context.Context) (OperationsStatus, error) {
	return OperationsStatus{DatabaseHealthy: database.Health(ctx, s.db) == nil}, nil
}
