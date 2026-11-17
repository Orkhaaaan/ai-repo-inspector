import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureRepo } from "./helpers.js";

const projectRoot = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));

describe("npm run build", () => {
  it("produces the bin entry point, excludes tests, and the built CLI runs", () => {
    rmSync(join(projectRoot, "dist"), { recursive: true, force: true });

    const build = spawnSync("npm run build", { cwd: projectRoot, shell: true, encoding: "utf8" });
    expect(build.status, build.stdout + build.stderr).toBe(0);

    const binPath = join(projectRoot, packageJson.bin.inspector);
    expect(existsSync(binPath), `${binPath} should exist`).toBe(true);
    expect(existsSync(join(projectRoot, "dist", "test"))).toBe(false);

    const run = spawnSync(process.execPath, [binPath, "review", "--repo", createFixtureRepo()], {
      cwd: createFixtureRepo(),
      encoding: "utf8",
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("Review report written");
  }, 60_000);
});
