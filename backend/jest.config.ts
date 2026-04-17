import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/test/**/*.test.ts"],
  // Force serial — tests share one database
  maxWorkers: 1,
  // 30s per test — enough for DB operations, short enough to catch hangs
  testTimeout: 30_000,
  transformIgnorePatterns: ["/node_modules/"],
  clearMocks: true,
  verbose: true,
};

export default config;
