#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { hasFailedValidation, runReview } from "./core.js";
import { markdownReport } from "./report.js";

type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format?: "markdown" | "json";
  validations: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? "", validations: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--repo") {
      // Keep the whole argument: paths such as "C:\My Projects\app" contain spaces.
      args.repositoryPath = argv[++index];
    } else if (token === "--base-ref") {
      args.baseRef = argv[++index];
    } else if (token === "--format") {
      args.format = argv[++index] as Args["format"];
    } else if (token === "--validate") {
      args.validations.push(argv[++index]);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command !== "review" || !args.repositoryPath) {
    console.error("Usage: inspector review --repo <path> [--base-ref <ref>] [--validate <command>]");
    process.exitCode = 1;
    return;
  }

  const result = await runReview({
    repositoryPath: args.repositoryPath,
    baseRef: args.baseRef,
    validationCommands: args.validations,
    format: args.format,
  });
  writeFileSync("review-report.md", markdownReport(result), "utf8");
  console.log("Review report written to review-report.md");
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