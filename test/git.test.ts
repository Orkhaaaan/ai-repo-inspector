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
  it("passes --end-of-options right before every ref it gives git (defense in depth)", () => {
    const repo = createFixtureRepo();
    vi.mocked(execFileSync).mockClear();

    expect(changedFiles(repo, "main")).toEqual([{ path: "src/feature.ts", status: "added" }]);

    const calls = vi.mocked(execFileSync).mock.calls.map((call) => call[1] as string[]);
    // The user-supplied base ref goes to merge-base...
    const mergeBaseArgs = calls.find((args) => args[0] === "merge-base");
    expect(mergeBaseArgs?.slice(-3)).toEqual(["--end-of-options", "main", "HEAD"]);
    // ...and diff only ever receives the resolved merge-base commit id.
    const diffArgs = calls.find((args) => args[0] === "diff");
    expect(diffArgs?.at(-2)).toBe("--end-of-options");
    expect(diffArgs?.at(-1)).toMatch(/^[0-9a-f]{40,64}$/);
  });
});
