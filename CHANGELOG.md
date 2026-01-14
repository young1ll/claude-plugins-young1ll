# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive LEVEL_2 code review document
- MIT LICENSE file
- CHANGELOG.md file

### Changed
- Updated marketplace.json description to match plugin.json

## [1.0.0] - 2025-01-14

### Added
- PM Plugin: AI-powered project management
  - MCP integration with 29 tools (7 Resources, 21 Tools, 5 Prompts)
  - Hybrid agent system (4 agents: pm-planner, pm-executor, pm-reflector, ticket-worker)
  - Event sourcing + CQRS pattern
  - Git-First workflow (GitHub Flow based)
  - Hybrid ID system (UUID + seq numeric IDs like #42)
  - GitHub integration (4 tools: status, config, issue_create, issue_link)
  - Bidirectional sync (2 tools: sync_pull, sync_push)
  - Token optimization (hierarchical summaries L0-L3, 70% compression rule)
  - 526 tests (unit + integration + E2E)
  - GitHub Actions workflow for E2E tests

### Security
- Fixed shell injection vulnerability in server-helpers.ts
  - Replaced execSync with execFileSync for git commands
  - Applied to getGitStats() and getGitHotspots()

### Changed
- Consolidated Git utilities into server-helpers.ts
- Marked lib/git.ts as @deprecated with migration guide
- Updated documentation (README, ARCHITECTURE, LEVEL_2)

### Fixed
- TypeScript type errors in projections.ts and server.ts
- GitHub write tests to skip in CI environment

## [0.1.0] - 2025-01-13

### Added
- Initial project structure
- Task management commands
- Analytics features
- Basic plugin setup

[Unreleased]: https://github.com/young1ll/done/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/young1ll/done/releases/tag/v1.0.0
[0.1.0]: https://github.com/young1ll/done/releases/tag/v0.1.0
