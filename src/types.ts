export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
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

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};