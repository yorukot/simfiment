# Repository Guidelines

## Project Structure & Module Organization

Simfiment is a Go monolith that embeds a React frontend. `cmd/simfiment/` contains the CLI entry point. Backend code lives under `internal/`: HTTP handlers are in `httpapi/`, business rules in `service/` and `domain/`, persistence in `store/` and `database/`, and migrations in `internal/database/migrations/`. The Vite application is under `web/src/`, organized into `app/`, reusable `components/`, and feature folders. Browser tests live in `web/e2e/`; product, API, operations, and architecture notes live in `docs/`. Vite writes production assets to `internal/static/dist/`.

## Build, Test, and Development Commands

- `make web-install` installs the pinned pnpm dependencies.
- `make dev` starts the Go server at `http://localhost:8080`; run `cd web && pnpm dev` separately for Vite hot reload.
- `make build` builds the frontend, then produces the `./simfiment` binary.
- `make test` runs Vitest unit/component tests and all Go tests.
- `make vet` runs `go vet ./...`.
- `cd web && pnpm run lint` type-checks TypeScript; `pnpm run format:check` checks Prettier formatting.
- `make e2e` builds the app and runs the critical Playwright flow. Install Chromium first with `cd web && pnpm exec playwright install chromium` when needed.

## Coding Style & Naming Conventions

Format Go with `gofmt` and follow standard Go naming: exported identifiers use PascalCase, internal names camelCase, and tests use `TestName`. TypeScript is strict and formatted by Prettier; use two-space indentation, PascalCase for React components, camelCase for functions/hooks, and `useName` for hooks. Keep feature-specific UI beside its feature and shared primitives under `web/src/components/`.

## Testing Guidelines

Place Go tests in `*_test.go` beside the package. Place frontend tests beside source as `*.test.ts` or `*.test.tsx`; Vitest uses jsdom and Testing Library. Name Playwright specs `*.spec.ts`. Add regression coverage for behavior changes, including API validation and accessibility-sensitive flows. No numeric coverage threshold is enforced; all relevant test suites must pass.

## Commit & Pull Request Guidelines

Recent history favors concise, imperative Conventional Commits such as `feat(categories): add searchable Material icon picker`, `test(e2e): ...`, and `docs: ...`; use a scope when useful. Keep each commit focused. Pull requests should explain user-visible behavior, list verification commands, link related issues, and include screenshots for UI changes. Call out migrations, configuration changes, or operational impact explicitly.

## Security & Configuration

Never commit `.env`, local `data/`, backups, or credentials. Preserve CSRF, Origin, session, and secure-cookie protections when changing authentication or mutations. Production supports one replica with persistent `/data`; review `docs/operations.md` before deployment changes.
