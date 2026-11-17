import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

/**
 * Creates a throwaway Git repository with a `main` branch and a `feature`
 * branch that adds `src/feature.ts`. Returns the repository path.
 */
export function createFixtureRepo(prefix = "inspector-fixture-"): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "fixture@example.com"]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  writeFile(repo, "README.md", "fixture\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "initial"]);
  git(repo, ["switch", "-q", "-c", "feature"]);
  writeFile(repo, "src/feature.ts", "export const feature = true;\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "add feature"]);
  return repo;
}

export function writeFile(repo: string, relativePath: string, content: string) {
  const fullPath = join(repo, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}
