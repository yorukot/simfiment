import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:18181",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    channel: process.env.CI ? undefined : "chrome",
    geolocation: { latitude: 25.033, longitude: 121.5654 },
    permissions: ["geolocation"],
  },
  webServer: {
    command: "go -C .. run ./cmd/simfiment serve",
    url: "http://127.0.0.1:18181/health/ready",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      SIMFIMENT_ADDR: "127.0.0.1:18181",
      SIMFIMENT_BASE_URL: "http://127.0.0.1:18181",
      SIMFIMENT_DATA_DIR: resolve("test-results/e2e-data"),
      SIMFIMENT_DEVELOPMENT: "true",
      SIMFIMENT_SECURE_COOKIES: "false",
      SIMFIMENT_ARGON2_MEMORY_KIB: "19456",
      SIMFIMENT_ARGON2_ITERATIONS: "2",
      SIMFIMENT_ARGON2_PARALLELISM: "1",
    },
  },
});
