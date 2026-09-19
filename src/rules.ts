import picomatch from "picomatch";

export type Rule = {
  /** The rule, in plain English (the `"rule"` key in softlint.json). This is exactly what Jev judges against. */
  text: string;
  /** Globs of the files this rule applies to. Omitted = all files. */
  files?: string[];
};

/**
 * Parses and strictly validates a `softlint.json` file:
 *
 *   {
 *     "$schema": "https://raw.githubusercontent.com/blazejkustra/softlint/main/softlint.schema.json",
 *     "rules": [
 *       { "rule": "Never log personal data such as emails or phone numbers." },
 *       { "rule": "Migrations must not drop columns that deployed code still uses.", "files": ["db/migrations/**"] }
 *     ]
 *   }
 *
 * Anything unexpected (an unknown key, a missing rule, a non-string glob) is an error, so a typo can
 * never silently turn a rule off.
 */
export function parseRules(json: string, source = "softlint.json"): Rule[] {
  let config: unknown;
  try {
    config = JSON.parse(json);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${(error as Error).message}`);
  }

  const fail = (where: string, problem: string): never => {
    throw new Error(`${source}: ${where} ${problem}`);
  };
  if (!isObject(config)) fail("the file", "must be a JSON object with a \"rules\" array.");
  const { rules, ...rest } = config as Record<string, unknown>;
  for (const key of Object.keys(rest)) if (key !== "$schema") fail(`"${key}"`, `is not a known key (expected "rules").`);
  if (!Array.isArray(rules) || rules.length === 0) fail("\"rules\"", "must be a non-empty array.");

  return (rules as unknown[]).map((entry, i) => {
    const where = `rules[${i}]`;
    if (!isObject(entry)) return fail(where, `must be an object like { "rule": "…" }.`);
    for (const key of Object.keys(entry)) if (key !== "rule" && key !== "files") fail(`${where}."${key}"`, `is not a known key (expected "rule" or "files").`);
    if (typeof entry.rule !== "string" || !entry.rule.trim()) fail(`${where}.rule`, "must be a non-empty string.");
    if (entry.files !== undefined && (!Array.isArray(entry.files) || !entry.files.length || !entry.files.every((g) => typeof g === "string" && g.trim()))) {
      fail(`${where}.files`, "must be a non-empty array of glob strings.");
    }
    return { text: (entry.rule as string).trim(), ...(entry.files ? { files: entry.files as string[] } : {}) };
  });
}

/** Whether a rule applies to a file path. */
export function appliesTo(rule: Rule, path: string): boolean {
  return !rule.files || picomatch.isMatch(path, rule.files, { dot: true });
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
