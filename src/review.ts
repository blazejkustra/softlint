import { parseDiff } from "./diff.js";
import { judge, type Ask, type Judgment } from "./jev.js";
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
  const findings = judgments
    .filter((j) => j.probability >= threshold)
    .sort((a, b) => a.hunk.file.localeCompare(b.hunk.file) || a.hunk.line - b.hunk.line);
  return { findings, judgments, hunks: hunks.length };
}

/** Markdown for one inline review comment. */
export function commentBody(finding: Finding): string {
  return `**softlint** · ${finding.rule.text}\n\n<sub>Jev is ${Math.round(finding.probability * 100)}% sure this change breaks the rule.</sub>`;
}
