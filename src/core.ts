import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { assertGitWorkTree, changedFiles } from "./git.js";
import { markdownReport } from "./report.js";
import type { ReviewRequest } from "./types.js";
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

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const repositoryPath = resolveRepositoryPath(request.repositoryPath);
  const files = changedFiles(repositoryPath, request.baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    repositoryPath,
  );
  return markdownReport({
    repositoryPath,
    changedFiles: files,
    validationResults: validations,
  });
}