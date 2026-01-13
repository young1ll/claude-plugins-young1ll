/**
 * E2E Test Setup
 *
 * Runs before each test file to set up the environment.
 */

import { getE2EConfig, validateE2EEnvironment } from "./env.js";

// Load and validate configuration
const config = getE2EConfig();
const { valid, errors } = validateE2EEnvironment();

if (!valid) {
  console.error("E2E Environment validation failed:");
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

// Export config for use in tests
export { config };
