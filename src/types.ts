export type ChangedFile = {
  path: string;
  /** Previous path; only for "renamed" and "copied". */
  oldPath?: string;
  /** Raw Git status code; only for "unknown". */
  code?: string;
  status:
    | "added"
    | "modified"
    | "deleted"
    | "renamed"
    | "copied"
    | "type_changed"
    | "unmerged"
    | "untracked"
    | "unknown";
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed" | "timed_out";
  /** Process exit code; null when the command timed out or could not start. */
  exitCode: number | null;
  durationMs: number;
  /** Combined stdout and stderr, possibly truncated to its tail. */
  output: string;
  /** Number of leading output characters dropped to respect the size limit. */
  truncatedChars: number;
};

export type ReviewResult = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};