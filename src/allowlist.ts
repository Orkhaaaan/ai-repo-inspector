/**
 * Named validation commands that the person launching the MCP server has
 * approved, e.g. `test` -> `npm test`. MCP callers (AI agents) may only pick
 * names from this list; they can never supply a shell command themselves.
 */
export type ValidationAllowlist = ReadonlyMap<string, string>;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Parses `name=command` entries, e.g. `test=npm test`. */
export function parseAllowlist(entries: string[]): ValidationAllowlist {
  const allowlist = new Map<string, string>();
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    const name = entry.slice(0, separator).trim();
    const command = entry.slice(separator + 1).trim();
    if (separator <= 0 || !NAME_PATTERN.test(name) || command === "") {
      throw new Error(`Invalid validation entry "${entry}". Expected name=command, for example: test=npm test`);
    }
    if (allowlist.has(name)) {
      throw new Error(`Validation "${name}" is defined more than once.`);
    }
    allowlist.set(name, command);
  }
  return allowlist;
}

/** Maps requested names to their approved commands, or throws if any name is not allowed. */
export function resolveValidations(names: string[], allowlist: ValidationAllowlist): string[] {
  const unknown = names.filter((name) => !allowlist.has(name));
  if (unknown.length > 0) {
    const allowed = [...allowlist.keys()].join(", ") || "none (the server was started without --allow-validation)";
    throw new Error(`Validation not allowed: ${unknown.join(", ")}. Allowed: ${allowed}.`);
  }
  return names.map((name) => allowlist.get(name)!);
}
