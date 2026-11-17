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

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  const output = git(repositoryPath, ["diff", "--name-status", `${base}...HEAD`]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}