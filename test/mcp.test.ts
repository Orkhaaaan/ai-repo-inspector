import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureRepo } from "./helpers.js";

// End-to-end: spawn the real stdio server the same way an MCP client would.
const projectRoot = resolve(__dirname, "..");
const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }> };

function textOf(result: ToolResult): string {
  return result.content.map((part) => part.text ?? "").join("\n");
}

describe("MCP review_repository", () => {
  let client: Client;
  let fixture: string;

  beforeAll(async () => {
    fixture = createFixtureRepo();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [tsxCli, join(projectRoot, "src", "mcp-server.ts")],
        cwd: projectRoot,
        stderr: "pipe",
      }),
    );
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  it("reviews the repository passed in repo_path, not the server's working directory", async () => {
    const result = (await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture },
    })) as ToolResult;

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("src/feature.ts (added)");
  });

  it("returns a tool error for a path that does not exist", async () => {
    const result = (await client.callTool({
      name: "review_repository",
      arguments: { repo_path: join(fixture, "does-not-exist") },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/does not exist/i);
  });

  it("rejects a relative repo_path, because the server's cwd is invisible to the agent", async () => {
    const result = (await client.callTool({
      name: "review_repository",
      arguments: { repo_path: "." },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/absolute path/i);
  });
});
