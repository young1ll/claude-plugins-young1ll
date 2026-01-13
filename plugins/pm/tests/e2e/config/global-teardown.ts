/**
 * E2E Global Teardown
 *
 * Runs once after all E2E tests complete.
 */

import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { getE2EConfig } from "./env.js";

export default async function globalTeardown(): Promise<void> {
  console.log("\n=== E2E Test Global Teardown ===\n");

  const config = getE2EConfig();

  if (config.skipCleanup) {
    console.log("Skipping cleanup (E2E_SKIP_CLEANUP=true)");
    return;
  }

  // Clean up test database
  if (existsSync(config.db.path)) {
    console.log(`Removing test database: ${config.db.path}`);
    try {
      unlinkSync(config.db.path);
      if (existsSync(`${config.db.path}-wal`)) {
        unlinkSync(`${config.db.path}-wal`);
      }
      if (existsSync(`${config.db.path}-shm`)) {
        unlinkSync(`${config.db.path}-shm`);
      }
    } catch (err) {
      console.error(`  Failed to remove test database: ${err}`);
    }
  }

  // Report remaining test resources
  try {
    const issues = JSON.parse(
      execSync(
        `gh issue list --state open --search "${config.github.testPrefix}" --json number --limit 100`,
        { encoding: "utf-8" }
      )
    );

    if (issues.length > 0) {
      console.log(`\n  Note: ${issues.length} test issues remain open`);
      console.log("  Run 'npm run test:e2e:cleanup' to close them manually");
    }
  } catch {
    // Ignore
  }

  console.log("\n=== Global Teardown Complete ===\n");
}
