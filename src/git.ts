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

/** Untrimmed git output: with -z, leading or trailing spaces belong to file names. */
function gitRaw(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // Large untracked trees can exceed Node's 1 MiB default.
    maxBuffer: 64 * 1024 * 1024,
  });
}

const SIMPLE_STATUSES: Record<string, ChangedFile["status"]> = {
  A: "added",
  D: "deleted",
  M: "modified",
  T: "type_changed",
  U: "unmerged",
};

/**
 * Parses `git diff --name-status -z` output. Every field is NUL-terminated, so
 * paths are taken verbatim (spaces, tabs, newlines, non-ASCII). Rename and copy
 * records carry two paths. Unknown codes are reported as "unknown", never
 * guessed as "modified".
 */
export function parseNameStatus(output: string): ChangedFile[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();

  const files: ChangedFile[] = [];
  let index = 0;
  while (index < fields.length) {
    const code = fields[index++];
    const nextPath = (): string => {
      const value = fields[index++];
      if (value === undefined) {
        throw new Error(`Unexpected git diff output: status "${code}" is missing a path.`);
      }
      return value;
    };

    const kind = code.charAt(0);
    if (kind === "R" || kind === "C") {
      const oldPath = nextPath();
      const path = nextPath();
      files.push({ path, oldPath, status: kind === "R" ? "renamed" : "copied" });
    } else {
      const path = nextPath();
      const status = SIMPLE_STATUSES[code];
      files.push(status ? { path, status } : { path, status: "unknown", code });
    }
  }
  return files;
}

function findMergeBase(cwd: string, base: string): string {
  try {
    return git(cwd, ["merge-base", "--end-of-options", base, "HEAD"]);
  } catch {
    throw new Error(
      `Could not find a merge base for "${base}" and HEAD: they have no common ancestor, or HEAD has no commits.`,
    );
  }
}

/**
 * Lists committed, staged, unstaged and untracked changes on the current
 * branch, relative to the merge base of `baseRef` and HEAD.
 */
export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  assertBaseRef(repositoryPath, base);

  // Run from the top level: paths are then repository-relative, and untracked
  // files are listed repo-wide even when repositoryPath is a subdirectory.
  const top = git(repositoryPath, ["rev-parse", "--show-toplevel"]);
  // Defense in depth on top of assertBaseRef: everything after --end-of-options
  // is treated as a revision, never as an option (requires Git >= 2.24).
  const mergeBase = findMergeBase(top, base);

  // Working tree and index against the merge base. -M makes rename detection
  // independent of the user's diff.renames setting.
  const tracked = parseNameStatus(
    gitRaw(top, ["diff", "--name-status", "-z", "-M", "--end-of-options", mergeBase]),
  );
  const untracked = gitRaw(top, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((path): ChangedFile => ({ path, status: "untracked" }));

  return [...tracked, ...untracked];
}