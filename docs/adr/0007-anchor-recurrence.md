# ADR-0007: Anchor-based recurrence

Every occurrence is calculated from `start_on + sequence × interval`, with explicit month-end and leap-day clamping. This prevents schedule drift.
