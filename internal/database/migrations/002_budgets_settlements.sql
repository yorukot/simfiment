CREATE TABLE budget_versions (
    month TEXT PRIMARY KEY CHECK (length(month) = 7)
) STRICT;

CREATE TABLE budget_limits (
    id INTEGER PRIMARY KEY,
    month TEXT NOT NULL REFERENCES budget_versions(month) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9000000000000),
    currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
    updated_at INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX budget_limits_scope_idx ON budget_limits(month, COALESCE(category_id, 0));

ALTER TABLE transactions ADD COLUMN settlement_counterparty TEXT NOT NULL DEFAULT '' CHECK (length(settlement_counterparty) <= 80);
ALTER TABLE transactions ADD COLUMN settlement_due_on TEXT NOT NULL DEFAULT '' CHECK (settlement_due_on = '' OR length(settlement_due_on) = 10);
ALTER TABLE transactions ADD COLUMN settlement_completed_at INTEGER;
CREATE INDEX transactions_pending_settlement_idx ON transactions(kind, occurred_at_utc_ms, id)
    WHERE deleted_at IS NULL AND settlement_counterparty <> '' AND settlement_completed_at IS NULL;
