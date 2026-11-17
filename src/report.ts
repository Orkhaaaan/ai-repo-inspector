import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${input.repositoryPath}`, "", "## Changed files"];
  for (const file of input.changedFiles) {
    lines.push(`- ${file.path} (${file.status})`);
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

/** A fence longer than any backtick run in the text, so output cannot close it early. */
function codeFenceFor(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longestRun + 1));
}