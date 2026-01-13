/**
 * E2E Global Setup
 *
 * Runs once before all E2E tests start.
 */

import { execSync } from "child_process";
import { getE2EConfig, validateE2EEnvironment } from "./env.js";

export default async function globalSetup(): Promise<void> {
  console.log("\n=== E2E Test Global Setup ===\n");

  // Validate environment
  const { valid, errors } = validateE2EEnvironment();
  if (!valid) {
    console.error("E2E Environment validation failed:");
    errors.forEach((err) => console.error(`  - ${err}`));
    throw new Error("E2E environment not ready");
  }

  const config = getE2EConfig();

  // Clean up stale test resources (older than 24 hours)
  console.log("Cleaning up stale test resources...");
  try {
    const issues = JSON.parse(
      execSync(
        `gh issue list --state open --search "${config.github.testPrefix}" --json number,createdAt --limit 100`,
        { encoding: "utf-8" }
      )
    );

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let closedCount = 0;

    for (const issue of issues) {
      if (new Date(issue.createdAt).getTime() < cutoff) {
        try {
          execSync(`gh issue close ${issue.number} --comment "Stale E2E test cleanup"`, {
            stdio: "pipe",
          });
          closedCount++;
        } catch {
          // Ignore errors for individual issues
        }
      }
    }

    if (closedCount > 0) {
      console.log(`  Closed ${closedCount} stale test issues`);
    }
  } catch {
    console.log("  No stale issues to clean up");
  }

  // Clean up stale test branches
  try {
    const branches = execSync(
      `git branch -r --list "origin/${config.git.testBranchPrefix}*"`,
      { encoding: "utf-8" }
    )
      .split("\n")
      .filter((b) => b.trim())
      .map((b) => b.trim().replace("origin/", ""));

    if (branches.length > 0) {
      console.log(`  Found ${branches.length} stale test branches`);
      // Note: We don't auto-delete branches to be safe
    }
  } catch {
    // No stale branches
  }

  console.log("\n=== Global Setup Complete ===\n");
}
