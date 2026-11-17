# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

To compile `src/` into `dist/` (Node.js 20 or newer):

```bash
npm run build
```

This produces `dist/cli.js` (the package's `inspector` bin) and
`dist/mcp-server.js`. Tests are not compiled into `dist/`.

## CLI

```bash
npm run inspector -- review --repo <path> [--base-ref <ref>] [--format markdown|json] [--validate <command>]...
```

After `npm run build` the same CLI can be run as `node dist/cli.js review ...`.

Examples:

```bash
npm run inspector -- review --repo ./path/to/repo
npm run inspector -- review --repo ./path/to/repo --base-ref develop --format json
npm run inspector -- review --repo ./path/to/repo --validate "npm test" --validate "npm run lint"
```

| Flag | Required | Meaning |
| --- | --- | --- |
| `--repo <path>` | yes | Repository to inspect. Relative paths are resolved against the current directory. The path must exist, be a directory, and be inside a Git work tree. Paths containing spaces are supported. |
| `--base-ref <ref>` | no, default `main` | Branch or commit to compare against. It must resolve to a commit and may not start with `-` or contain whitespace. |
| `--format <markdown\|json>` | no, default `markdown` | Report format. Any other value is an error. |
| `--validate <command>` | no, repeatable | Command to run in the repository. Commands run one after another, in the order given. |

A flag's value may not start with `--`. An unknown option, a flag without a
value, or an unknown `--format` prints the problem and the usage line, writes
no report, and exits with code 1.

### What the report contains

- **Changed files**: the output of `git diff --name-status <base-ref>...HEAD`,
  i.e. files changed on the current branch since its merge base with
  `<base-ref>`. Each file is listed as `added`, `deleted`, or `modified`.
- **Validation results**: for each command, its status (`passed`, `failed`, or
  `timed_out`), exit code, duration, and combined stdout and stderr.

Each validation command runs through the system shell, in the repository
directory, with stdin closed. It is killed together with its child processes
after **5 minutes** (status `timed_out`). Only the last **20,000 characters**
of its output are kept, and the report says how many characters were dropped.
These limits are constants in `src/validation.ts` and cannot be changed from
the command line.

### Output file

The report is written to the **current working directory**, replacing any
existing file:

- `--format markdown` (default): `review-report.md`
- `--format json`: `review-report.json`, with this shape:

```json
{
  "repositoryPath": "/absolute/path/to/repo",
  "changedFiles": [{ "path": "src/index.ts", "status": "modified" }],
  "validationResults": [
    {
      "command": "npm test",
      "status": "failed",
      "exitCode": 1,
      "durationMs": 1834,
      "output": "...",
      "truncatedChars": 0
    }
  ]
}
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Report written, and every validation passed (or none were requested). |
| `1` | Report written, but at least one validation `failed` or `timed_out`. |
| `1` | Usage error (see above). No report is written. |
| `1` | Runtime error, e.g. the repository path does not exist, is not a Git repository, or the base ref is not found. The error is printed as `Fatal error: ...` with a stack trace. No report is written. |

### Trust

`--validate` runs **any** command you pass, with your user's permissions. This
is intentional: the person typing at the terminal is the trusted party. Do not
pass commands copied from untrusted sources.

## MCP

The MCP server uses the stdio transport. Start it with the validation commands
you want to allow, each given a name:

```bash
npm run mcp-server -- --allow-validation "test=npm test" --allow-validation "typecheck=npm run typecheck"
```

After `npm run build` you can run `node dist/mcp-server.js` with the same
arguments.

`--allow-validation <name>=<command>` can be repeated. Names must start with a
letter or digit and may contain letters, digits, `_`, and `-`; each name may
be used only once. Without any `--allow-validation`, the server runs no
validations. An unknown or incomplete argument prints an error to stderr and
the server exits with code 1.

### Tool: `review_repository`

The input schema is advertised through `tools/list` with
`"additionalProperties": false`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `repo_path` | string | yes | **Absolute** path of the repository. Relative paths are rejected, because the client cannot see the server's working directory. The same existence and Git checks as the CLI apply. |
| `base_ref` | string | no | Branch or commit to compare against. Default `main`. Same rules as the CLI's `--base-ref`. |
| `validations` | string[] | no | Names of validations to run, chosen from the server's `--allow-validation` list. The schema lists the allowed names as an `enum`, and the field description shows the command behind each name. Any other name is rejected. If the server was started without `--allow-validation`, every name is rejected. |

**Unknown fields are rejected** with an input validation error instead of
being silently ignored. This includes the removed `validationCommands` and
`baseRef` fields.

The result is a single text content item containing the Markdown report (the
same renderer the CLI uses for `--format markdown`). Nothing is written to
disk. Invalid input, a bad repository path, or an unknown base ref is returned
as a tool result with `isError: true` and a message. A failing validation is
**not** a tool error: the report shows its status as `failed`.

### Example client configuration

For clients that use the `mcpServers` format (for example Claude Desktop, or
Claude Code's `.mcp.json`). Run `npm run build` first.

```json
{
  "mcpServers": {
    "repository-inspector": {
      "command": "node",
      "args": [
        "/absolute/path/to/ai-repo-inspector/dist/mcp-server.js",
        "--allow-validation", "test=npm test",
        "--allow-validation", "typecheck=npm run typecheck"
      ]
    }
  }
}
```

## Breaking changes

MCP `review_repository` input:

- `baseRef` was renamed to `base_ref`.
- `validationCommands` (raw shell commands) was removed. Use `validations`
  with names the operator approved via `--allow-validation`.
- `repo_path` must now be an absolute path. Previously it was ignored, and the
  server inspected its own working directory.
- Unknown fields are now an error instead of being ignored.

CLI: `--format json` now writes `review-report.json` (it used to write
Markdown). A failed or timed-out validation now exits with code 1. Unknown
options and flags without values are now errors.

## Security model

- **CLI: the human at the terminal is trusted.** `--validate` runs any command
  with that user's permissions.
- **MCP: the caller (usually an AI agent) is not trusted.** It can only choose
  from the commands that the person who configured the server approved by
  name. It cannot send shell commands, and fields outside the schema are
  rejected.
- **Git input is checked.** The repository path must be an existing Git work
  tree. The base ref is validated and placed after `--end-of-options`, so Git
  never parses it as an option (for example `--output=<file>`).
- **This is not a sandbox.** Approved commands run with the server's user
  permissions. Commands like `npm test` execute scripts from the inspected
  repository, and an agent may have edited those scripts. When repository
  content is untrusted, run the server in a container or similar sandbox.

## Known limitations

- Only committed changes on the current branch are listed. Uncommitted and
  untracked files do not appear.
- Only `A` (added) and `D` (deleted) Git statuses are mapped. Every other
  status, including renames and copies, is reported as `modified`. For
  renames, the path shows the old and new names separated by a tab.
- The changed-file list has no size limit. Validation output is capped per
  command, not in total.
- Exit code `1` does not distinguish failed validations from usage or runtime
  errors.

## Project layout

```text
src/core.ts            shared review orchestration (structured result)
src/cli.ts             command-line adapter
src/mcp-server.ts      MCP adapter (stdio)
src/allowlist.ts       named validation allowlist for MCP
src/git.ts             Git inspection and ref/path checks
src/validation.ts      validation execution (timeout, output cap)
src/report.ts          Markdown report generation
src/types.ts           shared types
test/                  unit, CLI, MCP end-to-end and build tests
tsconfig.json          typecheck config (src + test)
tsconfig.build.json    build config (src only, emits dist/)
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.
