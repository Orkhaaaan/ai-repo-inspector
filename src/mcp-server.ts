#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { reviewRepository } from "./core.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.tool(
  "review_repository",
  "Inspects a Git repository and returns a review report.",
  {
    // The server's working directory is not visible to the calling agent, so a
    // relative path would silently resolve somewhere the agent did not intend.
    repo_path: z
      .string()
      .min(1)
      .refine(isAbsolute, "repo_path must be an absolute path.")
      .describe("Absolute path of the Git repository to inspect."),
    baseRef: z.string().optional(),
    validationCommands: z.array(z.string()).optional(),
  },
  // No `any` here: the parameter type is inferred from the schema above, so a
  // mismatched field name (the old `input.repoPath`) is now a compile error.
  async (input) => {
    const report = await reviewRepository({
      repositoryPath: input.repo_path,
      baseRef: input.baseRef,
      validationCommands: input.validationCommands,
    });
    return { content: [{ type: "text", text: report }] };
  },
);

await server.connect(new StdioServerTransport());