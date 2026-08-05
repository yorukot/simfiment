.PHONY: build dev e2e fmt test vet web-install web-build web-test clean

web-install:
	cd web && pnpm install --frozen-lockfile

web-build:
	cd web && pnpm run build

web-test:
	cd web && pnpm test

build: web-build
	go build -trimpath -ldflags "-s -w" -o simfiment ./cmd/simfiment

dev:
	go run ./cmd/simfiment serve

fmt:
	gofmt -w cmd internal
	cd web && pnpm run format

vet:
	go vet ./...

test: web-test
	go test ./...

e2e:
	cd web && pnpm run test:e2e

clean:
	go clean
