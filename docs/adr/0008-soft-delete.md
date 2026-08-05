# ADR-0008: Soft-delete transactions

Deleting sets `deleted_at`; dashboards exclude those rows and restore clears it. This supports immediate undo without destructive record removal.
