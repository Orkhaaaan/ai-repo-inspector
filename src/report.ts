import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${input.repositoryPath}`, "", "## Changed files"];
  for (const file of input.changedFiles) {
    const name =
      file.oldPath === undefined ? displayPath(file.path) : `${displayPath(file.oldPath)} -> ${displayPath(file.path)}`;
    const status = file.status === "unknown" ? `unknown: ${file.code ?? "?"}` : file.status;
    lines.push(`- ${name} (${status})`);
  }
  lines.push("", "## Validation output");
  if (input.validationResults.length === 0) {
    lines.push("", "_No validation commands were run._");
  }
  for (const result of input.validationResults) {
    const exit = result.exitCode === null ? "" : `, exit code ${result.exitCode}`;
    const seconds = (result.durationMs / 1000).toFixed(1);
    lines.push("", `### ${result.command}`, "", `Status: **${result.status}**${exit}, ${seconds}s`);
    if (result.truncatedChars > 0) {
      lines.push("", `_Output truncated: the first ${result.truncatedChars} characters were omitted._`);
    }
    const fence = codeFenceFor(result.output);
    lines.push("", fence, result.output, fence);
  }
  return lines.join("\n");
}

/** Quotes paths with control characters (tab, newline, ...) so each file stays on one line. */
function displayPath(path: string): string {
  return /[\u0000-\u001f\u007f]/.test(path) ? JSON.stringify(path) : path;
}

/** A fence longer than any backtick run in the text, so output cannot close it early. */
function codeFenceFor(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longestRun + 1));
}