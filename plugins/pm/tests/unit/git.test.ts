/**
 * Git Utilities Unit Tests
 *
 * Tests for branch parsing, commit parsing, and magic words.
 */

import { describe, it, expect } from "vitest";
import {
  parseBranchName,
  generateBranchName,
  parseCommitMessage,
  getMagicWordStatusChange,
} from "../../lib/git.js";

describe("parseBranchName", () => {
  describe("LEVEL_1 format: {issue_number}-{type}-{description}", () => {
    it("should parse numeric issue number with type and description", () => {
      const result = parseBranchName("42-feat-user-authentication");

      expect(result.format).toBe("level1");
      expect(result.issueNumber).toBe(42);
      expect(result.type).toBe("feat");
      expect(result.description).toBe("user-authentication");
    });

    it("should parse fix type branch", () => {
      const result = parseBranchName("123-fix-login-bug");

      expect(result.format).toBe("level1");
      expect(result.issueNumber).toBe(123);
      expect(result.type).toBe("fix");
      expect(result.description).toBe("login-bug");
    });

    it("should parse refactor type branch", () => {
      const result = parseBranchName("7-refactor-api-client");

      expect(result.format).toBe("level1");
      expect(result.issueNumber).toBe(7);
      expect(result.type).toBe("refactor");
      expect(result.description).toBe("api-client");
    });

    it("should parse docs type branch", () => {
      const result = parseBranchName("99-docs-readme-update");

      expect(result.format).toBe("level1");
      expect(result.issueNumber).toBe(99);
      expect(result.type).toBe("docs");
      expect(result.description).toBe("readme-update");
    });
  });

  describe("UUID-based format: {uuid}-{type}-{description}", () => {
    it("should parse 8-char hex UUID format", () => {
      const result = parseBranchName("abc12345-feat-new-feature");

      expect(result.format).toBe("level1");
      expect(result.issueNumber).toBeUndefined();
      expect(result.type).toBe("feat");
      expect(result.description).toBe("new-feature");
    });
  });

  describe("Legacy format: PM-123-description", () => {
    it("should parse legacy format with description", () => {
      const result = parseBranchName("PM-123-some-feature");

      expect(result.format).toBe("legacy");
      expect(result.description).toBe("some-feature");
    });

    it("should parse legacy format without description", () => {
      const result = parseBranchName("ENG-456");

      expect(result.format).toBe("legacy");
      expect(result.description).toBeUndefined();
    });
  });

  describe("Unknown format", () => {
    it("should return unknown for main/master branches", () => {
      expect(parseBranchName("main").format).toBe("unknown");
      expect(parseBranchName("master").format).toBe("unknown");
    });

    it("should return unknown for develop branch", () => {
      expect(parseBranchName("develop").format).toBe("unknown");
    });

    it("should return unknown for random branch names", () => {
      expect(parseBranchName("feature-something").format).toBe("unknown");
      expect(parseBranchName("hotfix").format).toBe("unknown");
    });
  });
});

describe("generateBranchName", () => {
  it("should generate branch name from issue number and title", () => {
    const result = generateBranchName(42, "feat", "User Authentication");

    expect(result).toBe("42-feat-user-authentication");
  });

  it("should sanitize special characters", () => {
    const result = generateBranchName(1, "fix", "Fix bug #123 (urgent!)");

    expect(result).toBe("1-fix-fix-bug-123-urgent");
  });

  it("should truncate long descriptions to 30 chars", () => {
    const result = generateBranchName(
      5,
      "feat",
      "This is a very long feature description that should be truncated"
    );

    expect(result.length).toBeLessThanOrEqual(40); // number + type + 30 chars
    expect(result).toMatch(/^5-feat-/);
  });

  it("should handle string issue IDs", () => {
    const result = generateBranchName("abc123", "fix", "Quick Fix");

    expect(result).toBe("abc123-fix-quick-fix");
  });
});

describe("parseCommitMessage", () => {
  describe("Conventional Commits parsing", () => {
    it("should parse simple commit message", () => {
      const result = parseCommitMessage("feat: add login endpoint");

      expect(result.type).toBe("feat");
      expect(result.scope).toBeUndefined();
      expect(result.description).toBe("add login endpoint");
      expect(result.breaking).toBe(false);
    });

    it("should parse commit with scope", () => {
      const result = parseCommitMessage("feat(auth): add JWT validation");

      expect(result.type).toBe("feat");
      expect(result.scope).toBe("auth");
      expect(result.description).toBe("add JWT validation");
    });

    it("should detect breaking change with !", () => {
      const result = parseCommitMessage("feat!: remove deprecated API");

      expect(result.breaking).toBe(true);
    });

    it("should detect breaking change in body", () => {
      const result = parseCommitMessage(
        "feat: update API\n\nBREAKING CHANGE: removed v1 endpoints"
      );

      expect(result.breaking).toBe(true);
    });

    it("should parse various commit types", () => {
      expect(parseCommitMessage("fix: resolve crash").type).toBe("fix");
      expect(parseCommitMessage("docs: update readme").type).toBe("docs");
      expect(parseCommitMessage("refactor: clean code").type).toBe("refactor");
      expect(parseCommitMessage("test: add unit tests").type).toBe("test");
      expect(parseCommitMessage("chore: update deps").type).toBe("chore");
    });
  });

  describe("Magic Words parsing", () => {
    it("should parse fixes magic word", () => {
      const result = parseCommitMessage("feat: complete auth fixes #42");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("fixes");
      expect(result.magicWords[0].issueIds).toContain(42);
    });

    it("should parse closes magic word", () => {
      const result = parseCommitMessage("feat: done closes #99");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("fixes"); // closes maps to fixes
      expect(result.magicWords[0].issueIds).toContain(99);
    });

    it("should parse refs magic word", () => {
      const result = parseCommitMessage("feat: partial impl refs #42");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("refs");
      expect(result.magicWords[0].issueIds).toContain(42);
    });

    it("should parse wip magic word", () => {
      const result = parseCommitMessage("feat: work in progress wip #42");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("wip");
      expect(result.magicWords[0].issueIds).toContain(42);
    });

    it("should parse review magic word", () => {
      const result = parseCommitMessage("feat: ready for review #42");

      expect(result.magicWords).toHaveLength(1);
      expect(result.magicWords[0].action).toBe("review");
      expect(result.magicWords[0].issueIds).toContain(42);
    });

    it("should parse multiple magic words", () => {
      const result = parseCommitMessage("feat: update fixes #42 refs #43");

      expect(result.magicWords.length).toBeGreaterThanOrEqual(2);
      expect(result.issueRefs).toContain(42);
      expect(result.issueRefs).toContain(43);
    });

    it("should capture simple #123 references", () => {
      const result = parseCommitMessage("feat: related to #42 and #43");

      expect(result.issueRefs).toContain(42);
      expect(result.issueRefs).toContain(43);
    });
  });
});

describe("getMagicWordStatusChange", () => {
  it("should map fixes to done", () => {
    const magicWords = [{ action: "fixes" as const, issueIds: [42] }];
    const changes = getMagicWordStatusChange(magicWords);

    expect(changes.get(42)).toBe("done");
  });

  it("should map closes to done", () => {
    const magicWords = [{ action: "closes" as const, issueIds: [42] }];
    const changes = getMagicWordStatusChange(magicWords);

    expect(changes.get(42)).toBe("done");
  });

  it("should map wip to in_progress", () => {
    const magicWords = [{ action: "wip" as const, issueIds: [42] }];
    const changes = getMagicWordStatusChange(magicWords);

    expect(changes.get(42)).toBe("in_progress");
  });

  it("should map review to in_review", () => {
    const magicWords = [{ action: "review" as const, issueIds: [42] }];
    const changes = getMagicWordStatusChange(magicWords);

    expect(changes.get(42)).toBe("in_review");
  });

  it("should not create status change for refs", () => {
    const magicWords = [{ action: "refs" as const, issueIds: [42] }];
    const changes = getMagicWordStatusChange(magicWords);

    expect(changes.has(42)).toBe(false);
  });

  it("should handle multiple issues", () => {
    const magicWords = [
      { action: "fixes" as const, issueIds: [42, 43] },
      { action: "wip" as const, issueIds: [44] },
    ];
    const changes = getMagicWordStatusChange(magicWords);

    expect(changes.get(42)).toBe("done");
    expect(changes.get(43)).toBe("done");
    expect(changes.get(44)).toBe("in_progress");
  });
});
