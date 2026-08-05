# ADR-0004: Non-blocking location

Browser geolocation begins with entry, but transaction creation never waits. A later result is attached through a second authenticated request. Coordinates are entry-location metadata, not merchant-location claims.

Transaction details render attached coordinates on an embedded OpenStreetMap map. Opening a transaction with attached coordinates therefore sends those coordinates to OpenStreetMap, which is disclosed in the location settings. The application does not reverse-geocode or persist a third-party place name.
