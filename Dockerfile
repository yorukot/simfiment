# syntax=docker/dockerfile:1.7
FROM node:22.22.2-alpine AS web
WORKDIR /src/web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
COPY internal/static/ /src/internal/static/
RUN pnpm run build

FROM golang:1.26.5-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/internal/static/dist ./internal/static/dist
ARG VERSION=0.1.0
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X simfiment/internal/app.Version=${VERSION}" -o /out/simfiment ./cmd/simfiment

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g 10001 simfiment \
    && adduser -D -u 10001 -G simfiment simfiment \
    && mkdir -p /data \
    && chown simfiment:simfiment /data
COPY --from=backend /out/simfiment /app/simfiment
USER 10001:10001
VOLUME ["/data"]
EXPOSE 8080
ENV SIMFIMENT_ADDR=:8080 \
    SIMFIMENT_DATA_DIR=/data \
    SIMFIMENT_SECURE_COOKIES=true \
    SIMFIMENT_DEVELOPMENT=false
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health/ready || exit 1
ENTRYPOINT ["/app/simfiment"]
CMD ["serve"]
