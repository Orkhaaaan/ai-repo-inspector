import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepositoryPath, reviewRepository } from "../src/core.js";
import { createFixtureRepo } from "./helpers.js";

describe("resolveRepositoryPath", () => {
  it.each([undefined, "", "   "])("rejects a missing path (%j) instead of using the process cwd", (value) => {
    expect(() => resolveRepositoryPath(value)).toThrow(/repository path is required/i);
  });

  it("rejects a path that does not exist", () => {
    expect(() => resolveRepositoryPath(join(tmpdir(), "inspector-missing-xyz"))).toThrow(/does not exist/i);
  });

  it("rejects a file path", () => {
    const repo = createFixtureRepo();
    expect(() => resolveRepositoryPath(join(repo, "README.md"))).toThrow(/not a directory/i);
  });

  it("rejects a directory that is not a Git repository", () => {
    const plain = mkdtempSync(join(tmpdir(), "inspector-plain-"));
    expect(() => resolveRepositoryPath(plain)).toThrow(/not a git repository/i);
  });
});

describe("reviewRepository", () => {
  it("reports files changed on the branch", async () => {
    const report = await reviewRepository({ repositoryPath: createFixtureRepo() });
    expect(report).toContain("src/feature.ts (added)");
  });
});

describe("CLI --repo", () => {
  it("accepts a repository path that contains spaces", () => {
    const repo = createFixtureRepo("inspector fixture with spaces-");
    const workDir = mkdtempSync(join(tmpdir(), "inspector-cli-out-"));
    const projectRoot = resolve(__dirname, "..");
    const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

    execFileSync(process.execPath, [tsxCli, join(projectRoot, "src", "cli.ts"), "review", "--repo", repo], {
      cwd: workDir,
      stdio: "pipe",
    });

    const report = readFileSync(join(workDir, "review-report.md"), "utf8");
    expect(report).toContain(`# Review Report: ${repo}`);
    expect(report).toContain("src/feature.ts (added)");
  });
});
