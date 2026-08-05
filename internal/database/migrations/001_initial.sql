CREATE TABLE app_settings (
    id                          INTEGER PRIMARY KEY CHECK (id = 1),
    initialized_at              INTEGER,
    currency_code               TEXT NOT NULL DEFAULT 'TWD' CHECK (length(currency_code) = 3),
    currency_exponent           INTEGER NOT NULL DEFAULT 0 CHECK (currency_exponent BETWEEN 0 AND 3),
    timezone                    TEXT NOT NULL DEFAULT 'Asia/Taipei',
    locale                      TEXT NOT NULL DEFAULT 'zh-TW',
    theme                       TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
    automatic_location_enabled  INTEGER NOT NULL DEFAULT 0 CHECK (automatic_location_enabled IN (0, 1)),
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL
) STRICT;

CREATE TABLE auth_credentials (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash     TEXT NOT NULL,
    password_version  INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
    id                INTEGER PRIMARY KEY,
    token_hash        BLOB NOT NULL UNIQUE,
    csrf_token_hash   BLOB NOT NULL,
    password_version  INTEGER NOT NULL,
    created_at        INTEGER NOT NULL,
    last_seen_at      INTEGER NOT NULL,
    expires_at        INTEGER NOT NULL,
    revoked_at        INTEGER
) STRICT;

CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE categories (
    id           INTEGER PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
    icon_key     TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    archived_at  INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX categories_active_name_idx
    ON categories(kind, name) WHERE archived_at IS NULL;
CREATE INDEX categories_kind_order_idx
    ON categories(kind, archived_at, sort_order, id);

CREATE TABLE recurring_rules (
    id                 INTEGER PRIMARY KEY,
    client_request_id  TEXT NOT NULL UNIQUE,
    kind               TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    amount_minor       INTEGER NOT NULL CHECK (amount_minor > 0),
    currency_code      TEXT NOT NULL CHECK (length(currency_code) = 3),
    category_id        INTEGER NOT NULL,
    title              TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 80),
    frequency          TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    interval_count     INTEGER NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 100),
    start_on           TEXT NOT NULL CHECK (length(start_on) = 10),
    next_sequence      INTEGER NOT NULL DEFAULT 0 CHECK (next_sequence >= 0),
    next_due_on        TEXT NOT NULL CHECK (length(next_due_on) = 10),
    enabled            INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    archived_at        INTEGER,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX recurring_rules_active_idx
    ON recurring_rules(enabled, archived_at, next_due_on);

CREATE TABLE recurring_occurrences (
    id                    INTEGER PRIMARY KEY,
    rule_id               INTEGER NOT NULL,
    scheduled_on          TEXT NOT NULL CHECK (length(scheduled_on) = 10),
    status                TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'skipped')),
    kind_snapshot         TEXT NOT NULL CHECK (kind_snapshot IN ('expense', 'income')),
    amount_minor_snapshot INTEGER NOT NULL CHECK (amount_minor_snapshot > 0),
    currency_snapshot     TEXT NOT NULL CHECK (length(currency_snapshot) = 3),
    category_id_snapshot  INTEGER NOT NULL,
    title_snapshot        TEXT NOT NULL DEFAULT '' CHECK (length(title_snapshot) <= 80),
    created_at            INTEGER NOT NULL,
    updated_at            INTEGER NOT NULL,
    UNIQUE (rule_id, scheduled_on),
    FOREIGN KEY (rule_id) REFERENCES recurring_rules(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id_snapshot) REFERENCES categories(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX recurring_occurrences_status_date_idx
    ON recurring_occurrences(status, scheduled_on, id);

CREATE TABLE transactions (
    id                       INTEGER PRIMARY KEY,
    client_request_id        TEXT NOT NULL UNIQUE,
    request_fingerprint      TEXT NOT NULL,
    kind                     TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    amount_minor             INTEGER NOT NULL CHECK (amount_minor > 0),
    currency_code            TEXT NOT NULL CHECK (length(currency_code) = 3),
    category_id              INTEGER NOT NULL,
    title                    TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 80),
    occurred_at_utc_ms       INTEGER NOT NULL,
    occurred_local_date      TEXT NOT NULL CHECK (length(occurred_local_date) = 10),
    occurred_timezone        TEXT NOT NULL,
    source                   TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'recurring')),
    recurring_occurrence_id  INTEGER UNIQUE,
    location_status          TEXT NOT NULL DEFAULT 'none' CHECK (location_status IN ('none', 'pending', 'attached', 'failed', 'skipped')),
    deleted_at               INTEGER,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL,
    CHECK ((source = 'manual' AND recurring_occurrence_id IS NULL) OR (source = 'recurring' AND recurring_occurrence_id IS NOT NULL)),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (recurring_occurrence_id) REFERENCES recurring_occurrences(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX transactions_active_date_idx
    ON transactions(occurred_local_date, occurred_at_utc_ms, id) WHERE deleted_at IS NULL;
CREATE INDEX transactions_active_category_idx
    ON transactions(category_id, occurred_local_date) WHERE deleted_at IS NULL;
CREATE INDEX transactions_active_kind_date_idx
    ON transactions(kind, occurred_local_date) WHERE deleted_at IS NULL;

CREATE TABLE transaction_locations (
    transaction_id  INTEGER PRIMARY KEY,
    latitude        REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
    longitude       REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
    accuracy_m      REAL CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
    captured_at     INTEGER NOT NULL,
    source          TEXT NOT NULL DEFAULT 'browser' CHECK (source = 'browser'),
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) STRICT;

