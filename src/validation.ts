import { spawn, type ChildProcess } from "node:child_process";
import type { ValidationResult } from "./types.js";

export type ValidationOptions = {
  /** Kill the command and its child processes after this many milliseconds. */
  timeoutMs?: number;
  /** Keep at most this many characters of combined output. The tail is kept. */
  maxOutputChars?: number;
};

export const DEFAULT_TIMEOUT_MS = 5 * 60_000;
export const DEFAULT_MAX_OUTPUT_CHARS = 20_000;

/** How long to wait for streams to close after a timeout kill before giving up. */
const KILL_GRACE_MS = 2_000;

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    // `child.kill()` would only stop cmd.exe and leave e.g. `npm test` running.
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).on("error", () =>
      child.kill(),
    );
    return;
  }
  try {
    // The child was started detached, so it leads its own process group.
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * Runs one validation command and always resolves with a result. A non-zero
 * exit, a timeout or a spawn error is reported in the result, never thrown, so
 * a failing test suite cannot take the whole review down with it.
 */
export function runValidation(
  command: string,
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let output = "";
    let truncatedChars = 0;
    let timedOut = false;
    let settled = false;
    let graceTimer: NodeJS.Timeout | undefined;

    // Keep the tail: test runners print their failure summary last.
    const trimOutput = () => {
      if (output.length > maxOutputChars) {
        const cut = output.length - maxOutputChars;
        truncatedChars += cut;
        output = output.slice(cut);
      }
    };
    const append = (chunk: string) => {
      output += chunk;
      if (output.length > maxOutputChars * 2) trimOutput();
    };

    const child = spawn(command, {
      cwd,
      shell: true,
      // stdin is closed so a command that prompts for input cannot hang the review.
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    child.stdout?.setEncoding("utf8").on("data", append);
    child.stderr?.setEncoding("utf8").on("data", append);

    const finish = (status: ValidationResult["status"], exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(graceTimer);
      trimOutput();
      resolve({ command, status, exitCode, durationMs: Date.now() - startedAt, output, truncatedChars });
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      append(`\n[inspector] Command timed out after ${timeoutMs} ms and was killed.\n`);
      killProcessTree(child);
      // If a grandchild keeps the pipes open, do not wait for it forever.
      graceTimer = setTimeout(() => finish("timed_out", null), KILL_GRACE_MS);
    }, timeoutMs);

    child.on("error", (error) => {
      append(`\n[inspector] Could not start command: ${error.message}\n`);
      finish("failed", null);
    });
    child.on("close", (code) => {
      finish(timedOut ? "timed_out" : code === 0 ? "passed" : "failed", code);
    });
  });
}

export async function runValidations(
  commands: string[],
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, options));
  }
  return results;
}
