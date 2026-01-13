/**
 * MCP Server Helper Functions Unit Tests
 *
 * Tests for commit parsing, branch naming, and other server helpers.
 */

import { describe, it, expect } from "vitest";
import {
  parseCommitMessage,
  generateBranchName,
  parseBranchName,
} from "../helpers/mcp-test-helper.js";

describe("parseCommitMessage", () => {
  describe("Conventional Commits parsing", () => {
    it("should parse simple conventional commit", () => {
      const result = parseCommitMessage("feat: add new feature");

      expect(result.type).toBe("feat");
      expect(result.scope).toBeUndefined();
      expect(result.description).toBe("add new feature");
      expect(result.breaking).toBe(false);
    });

    it("should parse commit with scope", () => {
      const result = parseCommitMessage("fix(auth): resolve login issue");

      expect(result.type).toBe("fix");
      expect(result.scope).toBe("auth");
      expect(result.description).toBe("resolve login issue");
    });

    it("should detect breaking change with !", () => {
      const result = parseCommitMessage("feat!: remove deprecated API");

      expect(result.type).toBe("feat");
      expect(result.breaking).toBe(true);
      expect(result.description).toBe("remove deprecated API");
    });

    it("should detect breaking change with scope and !", () => {
      const result = parseCommitMessage("refactor(core)!: restructure modules");

      expect(result.type).toBe("refactor");
      expect(result.scope).toBe("core");
      expect(result.breaking).toBe(true);
    });

    it("should detect BREAKING CHANGE in body", () => {
      const result = parseCommitMessage(
        "feat: new auth system\n\nBREAKING CHANGE: old tokens no longer valid"
      );

      expect(result.breaking).toBe(true);
    });

    it("should handle non-conventional commit message", () => {
      const result = parseCommitMessage("Updated readme file");

      expect(result.type).toBeUndefined();
      expect(result.scope).toBeUndefined();
      expect(result.description).toBe("Updated readme file");
      expect(result.breaking).toBe(false);
    });

    it("should parse all commit types", () => {
      const types = ["feat", "fix", "docs", "style", "refactor", "test", "chore"];

      types.forEach(type => {
        const result = parseCommitMessage(`${type}: do something`);
        expect(result.type).toBe(type);
      });
    });
  });

  describe("Magic words parsing", () => {
    it("should parse fixes magic word", () => {
      const result = parseCommitMessage("feat: implement feature fixes #42");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("fixes");
      expect(result.magicWords[0].issueIds).toContain(42);
    });

    it("should parse closes magic word", () => {
      const result = parseCommitMessage("fix: bug fix closes #123");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("fixes"); // closes maps to fixes
      expect(result.magicWords[0].issueIds).toContain(123);
    });

    it("should parse resolves magic word", () => {
      const result = parseCommitMessage("feat: resolve issue resolves #456");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("fixes");
      expect(result.magicWords[0].issueIds).toContain(456);
    });

    it("should parse refs magic word", () => {
      const result = parseCommitMessage("docs: update docs refs #100");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("refs");
      expect(result.magicWords[0].issueIds).toContain(100);
    });

    it("should parse relates magic word", () => {
      const result = parseCommitMessage("chore: cleanup relates #200");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("refs");
      expect(result.magicWords[0].issueIds).toContain(200);
    });

    it("should parse wip magic word", () => {
      const result = parseCommitMessage("feat: partial implementation wip #50");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("wip");
      expect(result.magicWords[0].issueIds).toContain(50);
    });

    it("should parse review magic word", () => {
      const result = parseCommitMessage("feat: ready for feedback review #75");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("review");
      expect(result.magicWords[0].issueIds).toContain(75);
    });

    it("should parse done magic word", () => {
      const result = parseCommitMessage("feat: completed feature done #99");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("done");
      expect(result.magicWords[0].issueIds).toContain(99);
    });

    it("should parse blocks magic word", () => {
      const result = parseCommitMessage("feat: feature blocks #10");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("blocks");
      expect(result.magicWords[0].issueIds).toContain(10);
    });

    it("should parse depends magic word", () => {
      const result = parseCommitMessage("feat: feature depends #20");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("depends");
      expect(result.magicWords[0].issueIds).toContain(20);
    });

    it("should parse multiple issues with same magic word", () => {
      const result = parseCommitMessage(
        "feat: big update fixes #1 fixes #2 fixes #3"
      );

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].issueIds).toEqual([1, 2, 3]);
    });

    it("should parse multiple different magic words", () => {
      const result = parseCommitMessage(
        "feat: update refs #10 fixes #20"
      );

      expect(result.magicWords).toHaveLength(2);

      const refs = result.magicWords.find(m => m.action === "refs");
      const fixes = result.magicWords.find(m => m.action === "fixes");

      expect(refs?.issueIds).toContain(10);
      expect(fixes?.issueIds).toContain(20);
    });

    it("should handle commit without magic words", () => {
      const result = parseCommitMessage("feat: simple feature");

      expect(result.magicWords).toHaveLength(0);
    });

    it("should handle case insensitive magic words", () => {
      const result = parseCommitMessage("feat: update FIXES #42 Refs #43");

      expect(result.magicWords).toHaveLength(2);
    });
  });

  describe("Complex messages", () => {
    it("should parse full conventional commit with magic words", () => {
      const result = parseCommitMessage(
        "feat(api)!: implement new auth system fixes #100 refs #50"
      );

      expect(result.type).toBe("feat");
      expect(result.scope).toBe("api");
      expect(result.breaking).toBe(true);
      expect(result.magicWords).toHaveLength(2);
    });

    it("should handle multiline commit message", () => {
      const result = parseCommitMessage(
        `feat: add user management

- Add user creation
- Add user deletion
- Add user update

Fixes #42
Refs #10`
      );

      expect(result.type).toBe("feat");
      expect(result.magicWords).toHaveLength(2);
    });
  });
});

describe("generateBranchName", () => {
  it("should generate branch in LEVEL_1 format", () => {
    const result = generateBranchName(
      "550e8400-e29b-41d4-a716-446655440000",
      "Add user authentication",
      "feat"
    );

    expect(result).toBe("550e8400-feat-add-user-authentication");
  });

  it("should use feat as default type", () => {
    const result = generateBranchName(
      "550e8400-e29b-41d4-a716-446655440000",
      "New feature"
    );

    expect(result).toContain("-feat-");
  });

  it("should handle special characters in title", () => {
    const result = generateBranchName(
      "12345678-abcd-1234-5678-123456789abc",
      "Fix bug: user can't login!!!"
    );

    expect(result).toBe("12345678-feat-fix-bug-user-can-t-login");
  });

  it("should truncate long descriptions", () => {
    const result = generateBranchName(
      "12345678-abcd-1234-5678-123456789abc",
      "This is a very long task title that should be truncated to fit within reasonable branch name length"
    );

    // Description should be max 30 chars
    expect(result.length).toBeLessThanOrEqual(8 + 1 + 4 + 1 + 30); // taskId-type-desc
  });

  it("should support all branch types", () => {
    const types = ["feat", "fix", "refactor", "docs", "test", "chore"];

    types.forEach(type => {
      const result = generateBranchName("12345678-id", "task", type);
      expect(result).toContain(`-${type}-`);
    });
  });

  it("should convert to lowercase", () => {
    const result = generateBranchName(
      "12345678-abcd-1234-5678-123456789abc",
      "Add NEW Feature"
    );

    expect(result).toBe("12345678-feat-add-new-feature");
  });

  it("should remove leading/trailing hyphens", () => {
    const result = generateBranchName(
      "12345678-abcd-1234-5678-123456789abc",
      "---task name---"
    );

    expect(result).not.toMatch(/--/);
    expect(result).toBe("12345678-feat-task-name");
  });
});

describe("parseBranchName", () => {
  describe("LEVEL_1 format", () => {
    it("should parse standard LEVEL_1 branch", () => {
      const result = parseBranchName("550e8400-feat-add-authentication");

      expect(result.taskId).toBe("550e8400");
      expect(result.type).toBe("feat");
      expect(result.description).toBe("add-authentication");
    });

    it("should parse fix branch", () => {
      const result = parseBranchName("12345678-fix-login-bug");

      expect(result.taskId).toBe("12345678");
      expect(result.type).toBe("fix");
      expect(result.description).toBe("login-bug");
    });

    it("should parse refactor branch", () => {
      const result = parseBranchName("abcd1234-refactor-auth-module");

      expect(result.taskId).toBe("abcd1234");
      expect(result.type).toBe("refactor");
      expect(result.description).toBe("auth-module");
    });

    it("should parse docs branch", () => {
      const result = parseBranchName("11111111-docs-update-readme");

      expect(result.taskId).toBe("11111111");
      expect(result.type).toBe("docs");
      expect(result.description).toBe("update-readme");
    });

    it("should parse test branch", () => {
      const result = parseBranchName("22222222-test-add-unit-tests");

      expect(result.taskId).toBe("22222222");
      expect(result.type).toBe("test");
      expect(result.description).toBe("add-unit-tests");
    });

    it("should parse chore branch", () => {
      const result = parseBranchName("33333333-chore-update-deps");

      expect(result.taskId).toBe("33333333");
      expect(result.type).toBe("chore");
      expect(result.description).toBe("update-deps");
    });
  });

  describe("Legacy format", () => {
    it("should parse legacy PM-123 format", () => {
      const result = parseBranchName("PM-123-feature-branch");

      expect(result.taskId).toBe("PM-123");
      expect(result.format).toBe("legacy");
    });

    it("should parse legacy JIRA-456 format", () => {
      const result = parseBranchName("JIRA-456-bugfix");

      expect(result.taskId).toBe("JIRA-456");
      expect(result.format).toBe("legacy");
    });

    it("should parse legacy ABC-1 format", () => {
      const result = parseBranchName("ABC-1");

      expect(result.taskId).toBe("ABC-1");
      expect(result.format).toBe("legacy");
    });
  });

  describe("Invalid formats", () => {
    it("should return empty for main branch", () => {
      const result = parseBranchName("main");

      expect(result.taskId).toBeUndefined();
      expect(result.type).toBeUndefined();
    });

    it("should return empty for develop branch", () => {
      const result = parseBranchName("develop");

      expect(result.taskId).toBeUndefined();
    });

    it("should return empty for feature without ID", () => {
      const result = parseBranchName("feature/my-feature");

      expect(result.taskId).toBeUndefined();
    });

    it("should return empty for random branch name", () => {
      const result = parseBranchName("some-random-branch");

      expect(result.taskId).toBeUndefined();
    });
  });

  describe("Round-trip", () => {
    it("should parse generated branch name", () => {
      const taskId = "550e8400-e29b-41d4-a716-446655440000";
      const title = "Add user authentication";
      const type = "feat";

      const branchName = generateBranchName(taskId, title, type);
      const parsed = parseBranchName(branchName);

      expect(parsed.taskId).toBe("550e8400");
      expect(parsed.type).toBe("feat");
      expect(parsed.description).toBe("add-user-authentication");
    });
  });
});
