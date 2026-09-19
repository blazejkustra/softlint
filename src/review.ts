import { parseDiff } from "./diff.js";
import { judge, locate, type Ask, type Judgment } from "./jev.js";
import type { Rule } from "./rules.js";

export type Finding = Judgment;

export type ReviewResult = {
  findings: Finding[];
  /** Every judgment, including the ones below the threshold (useful for tuning rules). */
  judgments: Judgment[];
  hunks: number;
};

export const DEFAULT_THRESHOLD = 0.8;

/** The whole of softlint: diff + rules → the changes Jev is confident break a rule. */
export async function review(diff: string, rules: Rule[], ask: Ask, threshold = DEFAULT_THRESHOLD): Promise<ReviewResult> {
  const hunks = parseDiff(diff);
  const judgments = rules.length ? await judge(hunks, rules, ask) : [];
  const confident = judgments.filter((j) => j.probability >= threshold);
  const findings = (await locate(confident, ask)).sort((a, b) => a.hunk.file.localeCompare(b.hunk.file) || a.line - b.line);
  return { findings, judgments, hunks: hunks.length };
}
