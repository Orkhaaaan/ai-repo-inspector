import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";
import type { ChangedFile } from "../src/types.js";

function render(changedFiles: ChangedFile[]): string {
  return markdownReport({ repositoryPath: "/work/sample", changedFiles, validationResults: [] });
}

describe("markdownReport changed files", () => {
  it("shows renames and copies as old -> new", () => {
    const report = render([
      { path: "GUIDE.md", oldPath: "README.md", status: "renamed" },
      { path: "copy.ts", oldPath: "source.ts", status: "copied" },
    ]);
    expect(report).toContain("- README.md -> GUIDE.md (renamed)");
    expect(report).toContain("- source.ts -> copy.ts (copied)");
  });

  it("shows the raw Git code for an unknown status", () => {
    expect(render([{ path: "weird.bin", status: "unknown", code: "X" }])).toContain("- weird.bin (unknown: X)");
  });

  it("shows untracked files", () => {
    expect(render([{ path: "notes.txt", status: "untracked" }])).toContain("- notes.txt (untracked)");
  });

  it("keeps one line per file when a path contains a newline or a tab", () => {
    const report = render([
      { path: "new\nline.txt", status: "added" },
      { path: "tab\tname.txt", status: "added" },
    ]);
    expect(report).toContain('- "new\\nline.txt" (added)');
    expect(report).toContain('- "tab\\tname.txt" (added)');
  });
});
