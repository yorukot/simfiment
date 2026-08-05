.PHONY: build dev e2e fmt test vet web-install web-build web-test clean

web-install:
	cd web && npm ci

web-build:
	cd web && npm run build

web-test:
	cd web && npm test

build: web-build
	go build -trimpath -ldflags "-s -w" -o simfiment ./cmd/simfiment

dev:
	go run ./cmd/simfiment serve

fmt:
	gofmt -w cmd internal

vet:
	go vet ./...

test: web-test
	go test ./...

e2e:
	cd web && npm run test:e2e

clean:
	go clean
