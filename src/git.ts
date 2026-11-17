import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

export function assertGitWorkTree(repositoryPath: string): void {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repositoryPath,
      stdio: "pipe",
    });
  } catch {
    throw new Error(`Not a Git repository: ${repositoryPath}`);
  }
}

/**
 * Rejects refs Git could read as options (`--output=file` makes `git diff`
 * write a file) and refs that do not resolve to a commit.
 */
function assertBaseRef(repositoryPath: string, ref: string): void {
  if (ref === "" || ref.startsWith("-") || /[\s\0]/.test(ref)) {
    throw new Error(`Invalid base ref: ${JSON.stringify(ref)}`);
  }
  try {
    git(repositoryPath, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    throw new Error(`Base ref "${ref}" was not found in ${repositoryPath}. Pass an existing branch or commit.`);
  }
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  assertBaseRef(repositoryPath, base);
  // Defense in depth on top of assertBaseRef: everything after --end-of-options
  // is treated as a revision, never as an option (requires Git >= 2.24).
  const output = git(repositoryPath, ["diff", "--name-status", "--end-of-options", `${base}...HEAD`]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}