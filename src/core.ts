import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { assertGitWorkTree, changedFiles } from "./git.js";
import { markdownReport } from "./report.js";
import type { ReviewRequest, ReviewResult } from "./types.js";
import { runValidations } from "./validation.js";

/**
 * Turns the requested path into an absolute, existing Git work tree, or throws.
 * Never falls back to the process working directory: an empty or missing path
 * used to make Git silently inspect whatever directory the process ran in.
 */
export function resolveRepositoryPath(repositoryPath: string | undefined): string {
  if (typeof repositoryPath !== "string" || repositoryPath.trim() === "") {
    throw new Error("A repository path is required.");
  }
  const absolutePath = resolve(repositoryPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Repository path does not exist: ${absolutePath}`);
  }
  if (!statSync(absolutePath).isDirectory()) {
    throw new Error(`Repository path is not a directory: ${absolutePath}`);
  }
  assertGitWorkTree(absolutePath);
  return absolutePath;
}

/** Structured review result shared by every interface; renderers sit on top. */
export async function runReview(request: ReviewRequest): Promise<ReviewResult> {
  const repositoryPath = resolveRepositoryPath(request.repositoryPath);
  const files = changedFiles(repositoryPath, request.baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    repositoryPath,
  );
  return {
    repositoryPath,
    changedFiles: files,
    validationResults: validations,
  };
}

/** True when any validation did not pass (failed or timed out). */
export function hasFailedValidation(result: ReviewResult): boolean {
  return result.validationResults.some((validation) => validation.status !== "passed");
}

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  return markdownReport(await runReview(request));
}