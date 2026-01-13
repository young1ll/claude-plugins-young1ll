/**
 * E2E Test Environment Configuration
 *
 * Loads and validates environment variables for E2E tests.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface E2EConfig {
  github: {
    repo: string;
    testPrefix: string;
    cleanupAfter: boolean;
  };
  git: {
    testBranchPrefix: string;
    baseBranch: string;
  };
  db: {
    path: string;
    cleanupBefore: boolean;
  };
  timeout: number;
  skipCleanup: boolean;
}

function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env.e2e");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=");
        if (key && value !== undefined && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

export function getE2EConfig(): E2EConfig {
  loadEnvFile();

  return {
    github: {
      repo: process.env.E2E_GITHUB_REPO || "",
      testPrefix: process.env.E2E_GITHUB_TEST_PREFIX || "e2e-test-",
      cleanupAfter: process.env.E2E_GITHUB_CLEANUP_AFTER !== "false",
    },
    git: {
      testBranchPrefix: process.env.E2E_GIT_TEST_BRANCH_PREFIX || "e2e-test-",
      baseBranch: process.env.E2E_GIT_BASE_BRANCH || "main",
    },
    db: {
      path: process.env.E2E_DB_PATH || ".claude/pm-e2e-test.db",
      cleanupBefore: process.env.E2E_DB_CLEANUP_BEFORE !== "false",
    },
    timeout: parseInt(process.env.E2E_TIMEOUT || "30000", 10),
    skipCleanup: process.env.E2E_SKIP_CLEANUP === "true",
  };
}

export function validateE2EEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check gh CLI
  try {
    const { execSync } = require("child_process");
    execSync("gh auth status", { stdio: "pipe" });
  } catch {
    errors.push("GitHub CLI (gh) is not authenticated");
  }

  // Check git
  try {
    const { execSync } = require("child_process");
    execSync("git rev-parse --git-dir", { stdio: "pipe" });
  } catch {
    errors.push("Not in a git repository");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
