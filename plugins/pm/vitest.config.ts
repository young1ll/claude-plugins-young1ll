import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "mcp/**/*.ts", "storage/**/*.ts"],
      exclude: ["**/*.d.ts", "**/index.ts"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": "/Users/young1ll/SynologyDrive/_devspace/young1ll-plugins/plugins/pm",
    },
  },
});
