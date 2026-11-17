import { describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";
import { runValidation } from "../src/validation.js";
import { createFixtureRepo } from "./helpers.js";

// Commands use `node -e` with single-quoted JS so they work in both cmd.exe and sh.
const cwd = process.cwd();

describe("runValidation", () => {
  it("reports a passing command with its output and exit code", async () => {
    const result = await runValidation(`node -e "console.log('all good')"`, cwd);
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("all good");
  });

  it("reports a failing command as failed instead of throwing", async () => {
    const result = await runValidation(
      `node -e "console.log('1 test failed'); console.error('boom'); process.exit(3)"`,
      cwd,
    );
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(3);
    // Both streams are kept: the old code dropped stderr whenever stdout had text.
    expect(result.output).toContain("1 test failed");
    expect(result.output).toContain("boom");
  });

  it("kills a command that exceeds the timeout", async () => {
    const started = Date.now();
    const result = await runValidation(`node -e "setTimeout(() => {}, 60000)"`, cwd, { timeoutMs: 500 });
    expect(result.status).toBe("timed_out");
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 15_000);

  it("keeps only the tail of very large output and says how much was dropped", async () => {
    const result = await runValidation(
      `node -e "process.stdout.write('x'.repeat(200000) + 'SUMMARY-AT-END')"`,
      cwd,
      { maxOutputChars: 1_000 },
    );
    expect(result.status).toBe("passed");
    expect(result.output.length).toBeLessThanOrEqual(1_000);
    expect(result.output).toContain("SUMMARY-AT-END");
    expect(result.truncatedChars).toBe(200_014 - result.output.length);
  });
});

describe("reviewRepository with a failing validation", () => {
  it("still returns a report that shows the failure", async () => {
    const report = await reviewRepository({
      repositoryPath: createFixtureRepo(),
      validationCommands: [`node -e "process.exit(1)"`],
    });
    expect(report).toContain("src/feature.ts (added)");
    expect(report).toMatch(/failed/);
  });
});
