import { execFileSync } from "node:child_process";
import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedFiles } from "../src/git.js";
import type { ChangedFile } from "../src/types.js";
import { createFixtureRepo, writeFile } from "./helpers.js";

// Every test starts from createFixtureRepo(): `main` has README.md, and the
// checked-out `feature` branch has one commit that adds src/feature.ts.
const FEATURE: ChangedFile = { path: "src/feature.ts", status: "added" };

function git(repo: string, ...args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

function commitAll(repo: string, message: string) {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
}

/** Order-independent comparison: Git's output order is not part of the contract. */
function byPath(files: ChangedFile[]): ChangedFile[] {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

describe("changedFiles: committed, staged, unstaged and untracked work", () => {
  it("reports a committed rename as renamed, with the old path", () => {
    const repo = createFixtureRepo();
    git(repo, "mv", "README.md", "GUIDE.md");
    commitAll(repo, "rename");

    expect(byPath(changedFiles(repo, "main"))).toEqual([
      { path: "GUIDE.md", oldPath: "README.md", status: "renamed" },
      FEATURE,
    ]);
  });

  it("reports an uncommitted edit to a tracked file", () => {
    const repo = createFixtureRepo();
    appendFileSync(join(repo, "README.md"), "edited, not staged\n");

    expect(byPath(changedFiles(repo, "main"))).toEqual([{ path: "README.md", status: "modified" }, FEATURE]);
  });

  it("reports an uncommitted deletion of a tracked file", () => {
    const repo = createFixtureRepo();
    rmSync(join(repo, "README.md"));

    expect(byPath(changedFiles(repo, "main"))).toEqual([{ path: "README.md", status: "deleted" }, FEATURE]);
  });

  it("reports a staged but uncommitted new file as added", () => {
    const repo = createFixtureRepo();
    writeFile(repo, "staged.ts", "export const staged = 1;\n");
    git(repo, "add", "staged.ts");

    expect(byPath(changedFiles(repo, "main"))).toEqual([FEATURE, { path: "staged.ts", status: "added" }]);
  });

  it("reports untracked files, including nested ones, but not ignored ones", () => {
    const repo = createFixtureRepo();
    writeFile(repo, ".gitignore", "*.log\n");
    commitAll(repo, "ignore logs");
    writeFile(repo, "notes.txt", "todo\n");
    writeFile(repo, "drafts/idea.md", "idea\n");
    writeFile(repo, "debug.log", "noise\n");

    expect(byPath(changedFiles(repo, "main"))).toEqual([
      { path: ".gitignore", status: "added" },
      { path: "drafts/idea.md", status: "untracked" },
      { path: "notes.txt", status: "untracked" },
      FEATURE,
    ]);
  });

  it("keeps a committed path that contains a space intact", () => {
    const repo = createFixtureRepo();
    writeFile(repo, "docs/my file.md", "doc\n");
    commitAll(repo, "doc with space");

    expect(byPath(changedFiles(repo, "main"))).toEqual([{ path: "docs/my file.md", status: "added" }, FEATURE]);
  });

  it("reports an untracked path that contains a space", () => {
    const repo = createFixtureRepo();
    writeFile(repo, "my notes.txt", "todo\n");

    expect(byPath(changedFiles(repo, "main"))).toEqual([{ path: "my notes.txt", status: "untracked" }, FEATURE]);
  });

  it("returns non-ASCII paths verbatim, not in Git's quoted octal form", () => {
    const repo = createFixtureRepo();
    writeFile(repo, "şəkil.txt", "image\n");
    commitAll(repo, "non-ascii name");

    expect(byPath(changedFiles(repo, "main"))).toEqual([FEATURE, { path: "şəkil.txt", status: "added" }]);
  });

  // Windows file names cannot contain tabs or newlines; Linux CI covers this.
  it.skipIf(process.platform === "win32")("keeps tabs and newlines in paths intact", () => {
    const repo = createFixtureRepo();
    writeFile(repo, "tab\tname.txt", "t\n");
    writeFile(repo, "new\nline.txt", "n\n");
    commitAll(repo, "control characters in names");

    expect(byPath(changedFiles(repo, "main"))).toEqual([
      { path: "new\nline.txt", status: "added" },
      FEATURE,
      { path: "tab\tname.txt", status: "added" },
    ]);
  });
});

describe("changedFiles: what the changes are compared against", () => {
  it("uses the merge base, so commits that exist only on the base branch are not reported", () => {
    const repo = createFixtureRepo();
    git(repo, "switch", "-q", "main");
    writeFile(repo, "main-only.txt", "main moved on\n");
    commitAll(repo, "main moves on");
    git(repo, "switch", "-q", "feature");

    expect(changedFiles(repo, "main")).toEqual([FEATURE]);
  });

  it("with base ref HEAD, reports only uncommitted work", () => {
    const repo = createFixtureRepo();
    appendFileSync(join(repo, "README.md"), "edited\n");

    expect(changedFiles(repo, "HEAD")).toEqual([{ path: "README.md", status: "modified" }]);
  });

  it("reports changes across the whole repository when given a subdirectory", () => {
    const repo = createFixtureRepo();
    writeFile(repo, "root-notes.txt", "at the root\n");
    writeFile(repo, "src/draft.ts", "draft\n");

    expect(byPath(changedFiles(join(repo, "src"), "main"))).toEqual([
      { path: "root-notes.txt", status: "untracked" },
      { path: "src/draft.ts", status: "untracked" },
      FEATURE,
    ]);
  });

  it("explains when the base ref and HEAD share no history", () => {
    const repo = createFixtureRepo();
    git(repo, "switch", "-q", "--orphan", "lonely");
    git(repo, "commit", "-q", "--allow-empty", "-m", "unrelated history");

    expect(() => changedFiles(repo, "main")).toThrow(/no common ancestor/i);
  });
});
