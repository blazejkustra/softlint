import { parseRules, type Rule } from "../../src/rules.ts";

/** Builds rules the same way softlint.json does: rules("A.", { rule: "B.", files: ["x/**"] }). */
export const rules = (...entries: (string | { rule: string; files?: string[] })[]): Rule[] =>
  parseRules(JSON.stringify({ rules: entries.map((e) => (typeof e === "string" ? { rule: e } : e)) }));
