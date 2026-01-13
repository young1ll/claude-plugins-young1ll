/**
 * Vitest E2E Configuration
 *
 * Separate configuration for E2E tests that run against real APIs.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    exclude: ["tests/unit/**", "tests/integration/**"],

    // E2E tests run sequentially to avoid GitHub API rate limits and DB locks
    // In Vitest 4, use fileParallelism instead of pool options
    fileParallelism: false,

    // Longer timeouts for real API calls
    testTimeout: 60000,
    hookTimeout: 60000,

    // Global setup/teardown
    globalSetup: ["tests/e2e/config/global-setup.ts"],
    globalTeardown: ["tests/e2e/config/global-teardown.ts"],

    // Load environment variables
    setupFiles: ["tests/e2e/config/setup.ts"],

    // Coverage (optional)
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "mcp/**/*.ts"],
      exclude: ["tests/**"],
    },
  },
});
