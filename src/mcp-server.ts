#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { parseAllowlist, resolveValidations, type ValidationAllowlist } from "./allowlist.js";
import { reviewRepository } from "./core.js";

const USAGE = 'Usage: mcp-server [--allow-validation <name>=<command>]...  e.g. --allow-validation "test=npm test"';

/**
 * Server arguments come from the MCP client configuration written by a human,
 * not from tool calls, so this is where shell commands are allowed to be named.
 */
function parseServerArgs(argv: string[]): string[] {
  const entries: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--allow-validation" && value !== undefined) {
      entries.push(value);
      index++;
    } else {
      throw new Error(`Unknown or incomplete argument "${token}". ${USAGE}`);
    }
  }
  return entries;
}

let allowlist: ValidationAllowlist;
try {
  allowlist = parseAllowlist(parseServerArgs(process.argv.slice(2)));
} catch (error) {
  // stderr only: stdout belongs to the MCP protocol.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const allowedNames = [...allowlist.keys()];
const validationName =
  allowedNames.length > 0
    ? z.enum(allowedNames as [string, ...string[]])
    : z.string().refine(() => false, "No validations are enabled on this server.");

const inputSchema = z
  .object({
    // The server's working directory is not visible to the calling agent, so a
    // relative path would silently resolve somewhere the agent did not intend.
    repo_path: z
      .string()
      .min(1)
      .refine(isAbsolute, "repo_path must be an absolute path.")
      .describe("Absolute path of the Git repository to inspect."),
    base_ref: z
      .string()
      .min(1)
      .optional()
      .describe("Branch or commit to compare HEAD against (merge base). Defaults to main."),
    validations: z
      .array(validationName)
      .optional()
      .describe(
        allowedNames.length > 0
          ? `Names of operator-approved validations to run: ${allowedNames
              .map((name) => `${name} (${allowlist.get(name)})`)
              .join(", ")}.`
          : "No validations are enabled on this server.",
      ),
  })
  // Reject unknown fields (e.g. the old `validationCommands`) instead of
  // silently dropping them and reporting that nothing was run.
  .strict();

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.registerTool(
  "review_repository",
  {
    description:
      "Lists files changed on the current branch relative to base_ref and optionally runs " +
      "operator-approved validations by name. Does not accept arbitrary shell commands.",
    inputSchema,
  },
  async (input) => {
    const report = await reviewRepository({
      repositoryPath: input.repo_path,
      baseRef: input.base_ref,
      validationCommands: resolveValidations(input.validations ?? [], allowlist),
    });
    return { content: [{ type: "text", text: report }] };
  },
);

await server.connect(new StdioServerTransport());
