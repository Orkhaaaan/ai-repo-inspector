import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureRepo } from "./helpers.js";

const projectRoot = resolve(__dirname, "..");
const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

/** Runs the CLI from a fresh working directory so review-report.md lands there. */
function runCli(args: string[]) {
  const workDir = mkdtempSync(join(tmpdir(), "inspector-cli-"));
  const result = spawnSync(process.execPath, [tsxCli, join(projectRoot, "src", "cli.ts"), ...args], {
    cwd: workDir,
    encoding: "utf8",
  });
  const reportPath = join(workDir, "review-report.md");
  const jsonPath = join(workDir, "review-report.json");
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    workDir,
    report: existsSync(reportPath) ? readFileSync(reportPath, "utf8") : undefined,
    json: existsSync(jsonPath) ? readFileSync(jsonPath, "utf8") : undefined,
  };
}

describe("CLI --format", () => {
  it("writes a JSON report for --format json", () => {
    const run = runCli([
      "review",
      "--repo",
      createFixtureRepo(),
      "--format",
      "json",
      "--validate",
      `node -e "process.exit(0)"`,
    ]);
    expect(run.status).toBe(0);
    expect(run.report).toBeUndefined();
    const parsed = JSON.parse(run.json ?? "null");
    expect(parsed.changedFiles).toEqual([{ path: "src/feature.ts", status: "added" }]);
    expect(parsed.validationResults[0]).toMatchObject({ status: "passed", exitCode: 0 });
  });

  it("rejects an unknown format with a clear error and writes nothing", () => {
    const run = runCli(["review", "--repo", createFixtureRepo(), "--format", "xml"]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/--format must be "markdown" or "json"/);
    expect(run.report).toBeUndefined();
    expect(run.json).toBeUndefined();
  });
});

describe("CLI argument validation", () => {
  it.each([
    ["--repo at the end", ["review", "--repo"]],
    ["--validate at the end", ["review", "--repo", "REPO", "--validate"]],
    ["--base-ref followed by another flag", ["review", "--repo", "REPO", "--base-ref", "--validate", "x"]],
    ["--format at the end", ["review", "--repo", "REPO", "--format"]],
  ])("rejects a missing value: %s", (_label, args) => {
    const repo = createFixtureRepo();
    const run = runCli(args.map((arg) => (arg === "REPO" ? repo : arg)));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/requires a value/);
    expect(run.stderr).toMatch(/Usage:/);
    expect(run.report).toBeUndefined();
  });

  it("rejects an unknown flag with a usage message", () => {
    const run = runCli(["review", "--repo", createFixtureRepo(), "--verbose"]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/Unknown option "--verbose"/);
    expect(run.stderr).toMatch(/Usage:/);
    expect(run.report).toBeUndefined();
  });
});

describe("CLI exit code", () => {
  it("exits 0 when every validation passes", () => {
    const run = runCli(["review", "--repo", createFixtureRepo(), "--validate", `node -e "process.exit(0)"`]);
    expect(run.status).toBe(0);
  });

  it("exits 1 when a validation fails, and still writes the report", () => {
    const run = runCli([
      "review",
      "--repo",
      createFixtureRepo(),
      "--validate",
      `node -e "console.log('passing one')"`,
      "--validate",
      `node -e "console.error('failing one'); process.exit(2)"`,
    ]);
    expect(run.status).toBe(1);
    expect(run.report).toContain("passing one");
    expect(run.report).toContain("failing one");
    expect(run.report).toContain("Status: **failed**, exit code 2");
  });
});
