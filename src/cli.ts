#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { hasFailedValidation, runReview } from "./core.js";
import { markdownReport } from "./report.js";

const USAGE =
  "Usage: inspector review --repo <path> [--base-ref <ref>] [--format markdown|json] [--validate <command>]...";

const FORMATS = ["markdown", "json"] as const;
type Format = (typeof FORMATS)[number];

const OUTPUT_FILES: Record<Format, string> = {
  markdown: "review-report.md",
  json: "review-report.json",
};

type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format: Format;
  validations: string[];
};

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? "", format: "markdown", validations: [] };

  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    // A flag's value must exist and must not itself look like a flag
    // (otherwise `--base-ref --validate x` would use "--validate" as the ref).
    const takeValue = (): string => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${token} requires a value.`);
      }
      index++;
      return value;
    };

    if (token === "--repo") {
      // Keep the whole argument: paths such as "C:\My Projects\app" contain spaces.
      args.repositoryPath = takeValue();
    } else if (token === "--base-ref") {
      args.baseRef = takeValue();
    } else if (token === "--format") {
      const value = takeValue();
      if (!(FORMATS as readonly string[]).includes(value)) {
        throw new UsageError(`--format must be "markdown" or "json", got "${value}".`);
      }
      args.format = value as Format;
    } else if (token === "--validate") {
      args.validations.push(takeValue());
    } else {
      throw new UsageError(`Unknown option "${token}".`);
    }
  }

  if (args.command !== "review") {
    throw new UsageError(args.command ? `Unknown command "${args.command}".` : "Missing command.");
  }
  if (!args.repositoryPath) {
    throw new UsageError("--repo is required.");
  }
  return args;
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const result = await runReview({
    repositoryPath: args.repositoryPath!,
    baseRef: args.baseRef,
    validationCommands: args.validations,
    format: args.format,
  });

  const outputFile = OUTPUT_FILES[args.format];
  const content = args.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : markdownReport(result);
  writeFileSync(outputFile, content, "utf8");
  console.log(`Review report written to ${outputFile}`);
  // Write the report first, then signal failure so scripts and CI can gate on it.
  if (hasFailedValidation(result)) {
    console.error("One or more validations failed or timed out.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
