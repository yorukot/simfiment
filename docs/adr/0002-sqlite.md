# ADR-0002: SQLite source of truth

SQLite is the operational database. Simfiment runs one replica on local persistent storage, explicitly enables foreign keys and WAL, and uses a single conservative database connection.

