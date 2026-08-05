# ADR-0001: Go monolith

One Go process serves the API and embedded React assets. This keeps authentication same-origin and produces one deployable service.

