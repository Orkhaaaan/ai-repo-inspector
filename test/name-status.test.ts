import { describe, expect, it } from "vitest";
import { parseNameStatus } from "../src/git.js";

/** Builds `git diff --name-status -z` output: every field is NUL-terminated. */
function zOutput(...fields: string[]): string {
  return fields.map((field) => `${field}\0`).join("");
}

describe("parseNameStatus (git diff --name-status -z)", () => {
  it("maps each known status and keeps paths verbatim", () => {
    const output = zOutput(
      "M", "a.txt",
      "A", "dir/b c.txt",
      "D", "tab\there.txt",
      "T", "link",
      "R087", "old.txt", "new.txt",
      "C100", "source.txt", "copy.txt",
      "U", "conflict.txt",
    );

    expect(parseNameStatus(output)).toEqual([
      { path: "a.txt", status: "modified" },
      { path: "dir/b c.txt", status: "added" },
      { path: "tab\there.txt", status: "deleted" },
      { path: "link", status: "type_changed" },
      { path: "new.txt", oldPath: "old.txt", status: "renamed" },
      { path: "copy.txt", oldPath: "source.txt", status: "copied" },
      { path: "conflict.txt", status: "unmerged" },
    ]);
  });

  it("reports an unknown status code as unknown with the raw code, never as modified", () => {
    expect(parseNameStatus(zOutput("X", "weird.bin"))).toEqual([
      { path: "weird.bin", status: "unknown", code: "X" },
    ]);
  });

  it("returns no entries for empty output", () => {
    expect(parseNameStatus("")).toEqual([]);
  });

  it("throws on truncated output instead of guessing", () => {
    // A rename record needs two paths; this one has only the old path.
    expect(() => parseNameStatus(zOutput("R100", "old.txt"))).toThrow(/unexpected git diff output/i);
  });
});
