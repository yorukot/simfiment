# ADR-0004: Non-blocking location

Browser geolocation begins with entry, but transaction creation never waits. A later result is attached through a second authenticated request. Coordinates are entry-location metadata, not merchant-location claims.

