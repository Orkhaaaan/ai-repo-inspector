# Submission

## What did you investigate first, and why?

I read all seven source files before running anything, because the README
warned that the starter only works on the happy path. I asked one question of
each file: "when does this break?". The two areas that mattered most were the
MCP adapter and validation execution. MCP is the interface an AI agent uses
without a human watching, and validation is the only place where the tool runs
commands. Before fixing anything, I wrote a failing test for each suspected bug
to prove it was real:

- The MCP tool ignored `repo_path`. The handler read `input.repoPath`, and the
  `any` type hid the mismatch. Every MCP call reviewed the server's own working
  directory and returned `# Review Report: undefined`.
- One failing validation command threw away the whole review, so the `failed`
  status could never be produced.
- `baseRef` was passed to Git unchecked. I reproduced
  `git diff --name-status "--output=pwned.txt...HEAD"`: it exited 0 and created
  a file.

## What did you choose to implement or fix?

Each fix is its own commit, and each one started with a test that failed on
the old code.

1. **MCP repo path.** The handler now reads `repo_path`, and its input type
   comes from the schema, so a wrong field name is now a compile error. The
   path must be absolute, must exist, and must be a Git work tree. The tool
   never silently falls back to the process working directory.
2. **Validation reliability.**
   - Results are always `passed`, `failed` or `timed_out`, with the exit code
     and duration.
   - After a 5-minute timeout, the command is killed together with its child
     processes (`taskkill /T` on Windows, the process group elsewhere).
   - stdin is closed, so a command that waits for input cannot hang.
   - stdout and stderr are both kept.
   - Output is capped at 20,000 characters. The tail is kept, because test
     summaries come last, and the report says how much was dropped.
   - The report shows status and exit code, and uses a code fence that output
     with backticks cannot break.
3. **MCP trust boundary.**
   - `validationCommands` (raw shell from the caller) was removed. The person
     who launches the server approves commands by name
     (`--allow-validation "test=npm test"`), and the agent may only choose
     from those names. The schema advertises them as an `enum`.
   - The schema is strict, so unknown fields are errors instead of being
     silently dropped.
   - The input fields are consistently snake_case.
4. **Git input hardening.**
   - Refs that start with `-` or contain whitespace are rejected, and a ref
     that doesn't exist gets a clear error.
   - `--end-of-options` is passed before the ref range.
5. **CLI contract.**
   - The exit code is 1 when any validation fails, and the report is still
     written.
   - `--format json` was accepted but ignored; it is now implemented on top of
     a structured `runReview()` result that both interfaces share.
   - Unknown flags and missing values are rejected with a usage message.
   - Paths with spaces work (`--repo` used to be cut at the first space).
6. **Build.** `npm run build` now produces `dist/cli.js`, which is what the
   package's `bin` points to, and test files are no longer compiled into
   `dist/`.
7. **README.** It now documents the actual behaviour: flags, exit codes, the
   MCP schema, breaking changes, the security model, and known limitations.

## What did you intentionally not do?

- **An approval gate for AI-made changes.** My first idea was that risky
  AI-made changes should need a senior's approval before commit. GitHub branch
  protection, required reviews and CODEOWNERS already do that, and this tool
  never commits. I applied the same principle inside the tool instead: an
  agent cannot run anything a human didn't approve.
- **Including uncommitted and untracked files in change detection.** I wrote
  the tests for it (renames, unstaged edits, staged files, untracked files,
  spaces, non-ASCII paths with `-z`), and they fail on the current code. The
  design changes the `git diff` invocation, which conflicts with an existing
  test that asserts the old `main...HEAD` argument. I ran out of time to settle
  that properly, so it is not committed.
- I left `npm audit` warnings in dependencies alone. `npm audit fix --force`
  would bump major versions and could break the project.

## Interface decision

- **Decision: hybrid.** Both interfaces share one core and one renderer, and
  each has a different trust model.
- **Primary user and execution environment:** a developer at a local terminal
  (CLI), and an AI coding agent calling the tool over stdio MCP on the same
  machine to check its own work before handing it to a human.
- **Trust boundary and allowed capabilities:**
  - The human at the CLI is trusted: `--validate` runs any command.
  - The MCP caller is not trusted. It may read Git state of an absolute path
    and run only operator-approved validations by name; it cannot send shell.
  - Git arguments are validated and placed after `--end-of-options`.
  - This is not a sandbox. An approved `npm test` still runs scripts from the
    repository, which the agent may have edited.
- **Reliability, discoverability, latency/context and output tradeoffs:**
  - Validations always produce a result and never crash the review.
  - Timeouts bound latency.
  - The output cap protects the agent's context window, keeping the useful
    tail, and truncation is stated explicitly.
  - Allowed validation names are discoverable in the MCP schema (`enum` plus a
    description showing each command).
- **How the interfaces stay consistent:** both call `runReview()` in
  `src/core.ts`. Path, ref and validation behaviour lives there or below, and
  Markdown is one renderer used by both. The CLI adds file output and exit
  codes; MCP returns the same Markdown as text. End-to-end tests spawn the
  real stdio server and the real CLI.
- **Evidence that would change this decision:**
  - If most usage were agents running in CI or in sandboxes, I would go
    MCP-first with structured (JSON) tool output.
  - If agents mainly used shell access instead of MCP, I would go CLI-first
    with a `--json` stdout mode and drop the server.
  - Telemetry on which interface is used, and on how often truncation hides
    the information needed, would decide it.

## How did you use an AI coding agent?

I used Claude Code as a pair programmer.

- It read the code and proposed a ranked bug list. I treated that list as
  hypotheses, not facts.
- It wrote a failing test before each fix and showed me the red result.
- After each fix it ran `npm run typecheck && npm test`.
- I reviewed every step and approved each commit separately.
- For the riskier protections, I had it temporarily re-introduce the old bug
  (remove `.strict()`, disable the ref check, use the old field name) to prove
  that the tests actually catch it.

## Where did you check, correct, or reject an AI suggestion? (required)

- **Rejected "Windows is enough".** The timeout and process-tree kill tests
  had only been verified on Windows. Before merging, I required the pushed
  branch to run on GitHub Actions (`ubuntu-latest`), which exercises the
  Linux process-group path. It passed, and only then did I fast-forward
  `main`.
- **Checked a claimed vulnerability before accepting it.** The AI listed
  `baseRef` option injection as a bug. I had it reproduced in a real repo
  first: `--output=pwned.txt...HEAD` created a file. Only then was it fixed.
- **Corrected a misleading test result.** After the build fix, `npm test`
  reported 7 failing files. Instead of accepting a "fix", I had it
  investigated. They were stale `dist/test/*.js` files from the old build
  config, which the new config never produces. A clean run passed.
- **Rejected a broad commit.** I did not let it commit the `package-lock.json`
  churn from `npm install`, or run `npm audit fix --force`.
- **Kept scope honest.** When the uncommitted-changes work turned out to
  conflict with an existing test expectation, I had it stop instead of editing
  the existing test to make it pass.

## Commands used to verify the result, with outcomes

Captured output of the main scenarios (CLI pass/fail and exit codes, JSON,
MCP allowed and refused calls, injection attempt): [docs/DEMO.md](docs/DEMO.md).

- `npm run typecheck`: no errors.
- `npm test`: 46/46 passed on Windows. The same suite passed on GitHub Actions
  `ubuntu-latest` for both the branch and `main`.
- `npm run build && node dist/cli.js review --repo .`: "Review report written
  to review-report.md", exit 0.
- Mutation checks: with `.strict()` removed and the ref check disabled, 4
  tests failed. With the old `input.repoPath`, typecheck failed. With the old
  `--repo` space split, the space test failed.
- Manual MCP check against the built server: `tools/list` shows
  `additionalProperties: false` and the validation `enum`. Unknown fields,
  relative paths and unapproved names return `isError: true`.

## A blocker you hit and how you approached it

I could not read the GitHub Actions logs. `gh` was not installed, the logs API
needs a token, and the web UI asks for a sign-in. To confirm that the Linux run
really executed the timeout tests, I used the public run and job API: every
step succeeded. I also made sure no test is skipped or `.only`, and vitest
exits non-zero on any failure, so a green `npm test` step means every test ran
and passed.

## Known limitations and the next three things you would do

Known limitations, in priority order:

1. **Uncommitted and untracked changes are not listed.** An agent usually
   wants to check its work before committing, so this is the biggest
   functional gap.
2. **Renames and copies are shown as `modified`.** The path appears as
   `old<TAB>new`, and non-ASCII names come out in Git's quoted form because
   `-z` is not used.
3. **No overall output budget.** Each validation is capped at 20,000
   characters, but the number of changed files and validations is not. Over
   MCP this can fill the agent's context. It needs a file-count limit, a
   summary, and an "N more truncated" note.
4. **Exit code 1 has three meanings:** a failed validation, a usage error, or
   a runtime error. CI cannot tell them apart. Runtime errors also print a
   stack trace.
5. **The validation environment is not hardened.**
   - Commands inherit every environment variable of the server process,
     including tokens and secrets.
   - Their output reaches the report and the agent without redaction.
   - The 5-minute timeout is fixed. Some MCP clients time out sooner, and
     there is no progress reporting or cancellation.
   - The README says a sandbox is needed, but the tool does not provide one.
6. **MCP returns only Markdown.** There is no `structuredContent` or
   `outputSchema`, and a structured result would be more reliable for agents.
   The CLI has no allowlist by design: the trust model differs, as explained
   under "Interface decision".
7. **Smaller issues:**
   - The default base `main` fails on `master` or `develop` repos; it could be
     detected from `origin/HEAD`.
   - In a shallow CI clone, `git merge-base` may not find a common ancestor.
   - The report always overwrites a file in the current directory; there is
     no `--output` option.
   - The JSON includes the absolute `repositoryPath` and has no schema
     version.
   - The breaking changes are not reflected in a version bump or a CHANGELOG.
8. **README** still contains the assessment's task, rules and time sections
   from the template. I kept them deliberately so that reviewers see the brief
   next to the docs. In a real project they would be removed.

Next three:

1. Finish change detection: diff the working tree against the merge base with
   `-z`, list untracked files, map rename/copy/unknown codes explicitly. Update
   the existing `--end-of-options` test so it checks the `merge-base` and
   `diff` calls instead of the literal range.
2. Return structured JSON from the MCP tool, with a total output budget, so
   agents don't have to parse Markdown.
3. Use separate exit codes for usage errors (2) and runtime errors, and print
   runtime errors without a stack trace.

## Approximate focused-work time

- Start: 18:55 (repository created from the template)
- Finish: 20:15
