# ADR-0003: Server-side opaque sessions

The browser receives a random HttpOnly cookie. Only its SHA-256 hash is stored. Session-bound CSRF hashes, expiration, revocation, and password versions remain server-controlled; JWT is not used.

