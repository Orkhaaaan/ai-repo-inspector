import { existsSync } from "node:fs";
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
        // The operator approves exactly one named validation.
        args: [
          tsxCli,
          join(projectRoot, "src", "mcp-server.ts"),
          "--allow-validation",
          `smoke=node -e "console.log('approved command ran')"`,
        ],
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

  it("advertises the approved validation names in the tool schema", async () => {
    const { tools } = await client.listTools();
    const schema = tools.find((tool) => tool.name === "review_repository")?.inputSchema as {
      properties: Record<string, { items?: { enum?: string[] } }>;
      additionalProperties?: boolean;
    };
    expect(schema.properties.validations.items?.enum).toEqual(["smoke"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("runs an approved validation by name", async () => {
    const result = (await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture, validations: ["smoke"] },
    })) as ToolResult;

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("approved command ran");
    expect(textOf(result)).toContain("Status: **passed**");
  });

  it("refuses a validation name that the operator did not approve", async () => {
    const result = (await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture, validations: ["deploy"] },
    })) as ToolResult;

    expect(result.isError).toBe(true);
  });

  it("refuses raw shell commands sent in the old validationCommands field", async () => {
    const marker = join(fixture, "should-not-exist.txt");
    const result = (await client.callTool({
      name: "review_repository",
      arguments: {
        repo_path: fixture,
        validationCommands: [`node -e "require('fs').writeFileSync('${marker.replace(/\\/g, "/")}', 'x')"`],
      },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  it("refuses a base_ref that Git would read as an option", async () => {
    const result = (await client.callTool({
      name: "review_repository",
      arguments: { repo_path: fixture, base_ref: "--output=pwned.txt" },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(existsSync(join(fixture, "pwned.txt...HEAD"))).toBe(false);
  });
});
