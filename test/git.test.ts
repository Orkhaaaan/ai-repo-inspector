import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { changedFiles } from "../src/git.js";
import { createFixtureRepo } from "./helpers.js";

// Spy on git invocations while still running the real git binary.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

describe("changedFiles git invocation", () => {
  it("passes --end-of-options right before the ref range (defense in depth)", () => {
    const repo = createFixtureRepo();
    vi.mocked(execFileSync).mockClear();

    expect(changedFiles(repo, "main")).toEqual([{ path: "src/feature.ts", status: "added" }]);

    const diffArgs = vi
      .mocked(execFileSync)
      .mock.calls.map((call) => call[1] as string[])
      .find((args) => args[0] === "diff");
    expect(diffArgs).toBeDefined();
    const rangeIndex = diffArgs!.indexOf("main...HEAD");
    expect(rangeIndex).toBeGreaterThan(0);
    expect(diffArgs![rangeIndex - 1]).toBe("--end-of-options");
  });
});
