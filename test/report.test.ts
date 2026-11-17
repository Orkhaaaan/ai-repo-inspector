import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";
import type { ValidationResult } from "../src/types.js";

function result(overrides: Partial<ValidationResult>): ValidationResult {
  return {
    command: "npm test",
    status: "passed",
    exitCode: 0,
    durationMs: 1200,
    output: "ok",
    truncatedChars: 0,
    ...overrides,
  };
}

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      validationResults: [result({})],
    });

    expect(report).toContain("src/index.ts (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
  });

  it("shows the status and exit code of each validation", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [result({ status: "failed", exitCode: 1 })],
    });
    expect(report).toContain("Status: **failed**, exit code 1");
  });

  it("says when output was truncated", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [result({ truncatedChars: 5000 })],
    });
    expect(report).toContain("first 5000 characters were omitted");
  });

  it("does not let backticks in the output close the code block", () => {
    const output = "before\n```\nafter";
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [result({ output })],
    });
    expect(report).toContain("````\nbefore\n```\nafter\n````");
  });
});
