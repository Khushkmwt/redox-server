import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: {
        lines: 80,
        functions: 85,
        statements: 80,
        branches: 70,
      },
    },
  },
});
