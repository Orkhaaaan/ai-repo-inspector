import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllowlist, resolveValidations } from "../src/allowlist.js";
import { changedFiles } from "../src/git.js";
import { createFixtureRepo } from "./helpers.js";

describe("parseAllowlist", () => {
  it("parses name=command entries, keeping '=' inside the command", () => {
    const allowlist = parseAllowlist(["test=npm test", "env=node -e x=1"]);
    expect(allowlist.get("test")).toBe("npm test");
    expect(allowlist.get("env")).toBe("node -e x=1");
  });

  it.each(["npm test", "=npm test", "test=", "bad name=npm test"])("rejects malformed entry %j", (entry) => {
    expect(() => parseAllowlist([entry])).toThrow(/invalid validation entry/i);
  });

  it("rejects duplicate names", () => {
    expect(() => parseAllowlist(["test=a", "test=b"])).toThrow(/more than once/i);
  });
});

describe("resolveValidations", () => {
  const allowlist = parseAllowlist(["test=npm test"]);

  it("maps approved names to their commands", () => {
    expect(resolveValidations(["test"], allowlist)).toEqual(["npm test"]);
  });

  it("rejects names that are not approved and lists the allowed ones", () => {
    expect(() => resolveValidations(["rm"], allowlist)).toThrow("Validation not allowed: rm. Allowed: test.");
  });
});

describe("changedFiles base ref", () => {
  it("rejects a ref that git would parse as an option and writes no file", () => {
    const repo = createFixtureRepo();
    expect(() => changedFiles(repo, "--output=pwned.txt")).toThrow(/invalid base ref/i);
    expect(existsSync(join(repo, "pwned.txt...HEAD"))).toBe(false);
  });

  it("explains when the base ref does not exist (e.g. repo uses master)", () => {
    const repo = createFixtureRepo();
    expect(() => changedFiles(repo, "master")).toThrow(/base ref "master" was not found/i);
  });
});
