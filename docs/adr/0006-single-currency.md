# ADR-0006: Single installation currency

Simfiment uses one configured currency for the entire installation; mixed-currency transactions and exchange-rate aggregation are not exposed. TWD remains the default, while setup and authenticated settings may choose from the server-owned supported-currency catalog.

Amounts remain integer minor units. Changing the installation currency reinterprets the major-unit number without applying an exchange rate: increasing the exponent scales every persisted amount up, while decreasing it truncates extra decimal digits after explicit confirmation. Transactions (including soft-deleted rows), recurring rules, and occurrence snapshots are rewritten atomically with their currency codes. The change is rejected and rolled back if an amount would become zero or exceed the configured maximum.
