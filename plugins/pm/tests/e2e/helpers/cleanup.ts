#!/usr/bin/env tsx
/**
 * E2E Test Resource Cleanup Script
 *
 * Forcefully cleans up all E2E test resources.
 * Usage: npm run test:e2e:cleanup
 */

import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";

const TEST_PREFIX = process.env.E2E_GITHUB_TEST_PREFIX || "e2e-test-";
const BRANCH_PREFIX = process.env.E2E_GIT_TEST_BRANCH_PREFIX || "e2e-test-";
const DB_PATH = process.env.E2E_DB_PATH || ".claude/pm-e2e-test.db";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  console.log("=== E2E Test Resource Cleanup ===\n");

  if (!force) {
    console.log("Use --force to actually delete resources\n");
    console.log("This will show what would be cleaned up:\n");
  }

  // 1. Clean up GitHub Issues
  console.log("GitHub Issues:");
  try {
    const issues = JSON.parse(
      execSync(
        `gh issue list --state open --search "${TEST_PREFIX}" --json number,title --limit 100`,
        { encoding: "utf-8" }
      )
    );

    if (issues.length === 0) {
      console.log("  No test issues found\n");
    } else {
      for (const issue of issues) {
        console.log(`  #${issue.number}: ${issue.title}`);
        if (force) {
          execSync(`gh issue close ${issue.number} --comment "Forced E2E cleanup"`, {
            stdio: "pipe",
          });
          console.log(`    -> Closed`);
        }
      }
      console.log();
    }
  } catch (err) {
    console.log(`  Error: ${err}\n`);
  }

  // 2. Clean up local branches
  console.log("Local Git Branches:");
  try {
    const result = execSync(`git branch --list "${BRANCH_PREFIX}*"`, {
      encoding: "utf-8",
    });
    const branches = result
      .split("\n")
      .map((b) => b.trim().replace(/^\*?\s*/, ""))
      .filter((b) => b);

    if (branches.length === 0) {
      console.log("  No test branches found\n");
    } else {
      for (const branch of branches) {
        console.log(`  ${branch}`);
        if (force) {
          try {
            execSync(`git branch -D ${branch}`, { stdio: "pipe" });
            console.log(`    -> Deleted`);
          } catch {
            console.log(`    -> Failed to delete (may be current branch)`);
          }
        }
      }
      console.log();
    }
  } catch {
    console.log("  No test branches found\n");
  }

  // 3. Clean up remote branches
  console.log("Remote Git Branches:");
  try {
    const result = execSync(`git branch -r --list "origin/${BRANCH_PREFIX}*"`, {
      encoding: "utf-8",
    });
    const branches = result
      .split("\n")
      .map((b) => b.trim().replace("origin/", ""))
      .filter((b) => b);

    if (branches.length === 0) {
      console.log("  No remote test branches found\n");
    } else {
      for (const branch of branches) {
        console.log(`  origin/${branch}`);
        if (force) {
          try {
            execSync(`git push origin --delete ${branch}`, { stdio: "pipe" });
            console.log(`    -> Deleted`);
          } catch {
            console.log(`    -> Failed to delete`);
          }
        }
      }
      console.log();
    }
  } catch {
    console.log("  No remote test branches found\n");
  }

  // 4. Clean up test database
  console.log("Test Database:");
  const dbFiles = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
  let foundDb = false;

  for (const file of dbFiles) {
    if (existsSync(file)) {
      foundDb = true;
      console.log(`  ${file}`);
      if (force) {
        try {
          unlinkSync(file);
          console.log(`    -> Deleted`);
        } catch (err) {
          console.log(`    -> Failed: ${err}`);
        }
      }
    }
  }

  if (!foundDb) {
    console.log("  No test database found\n");
  } else {
    console.log();
  }

  // Summary
  if (!force) {
    console.log("Run with --force to actually delete these resources");
  } else {
    console.log("Cleanup complete!");
  }
}

main().catch(console.error);
