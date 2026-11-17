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
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    workDir,
    report: existsSync(reportPath) ? readFileSync(reportPath, "utf8") : undefined,
  };
}

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
