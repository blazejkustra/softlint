import { TypeSafeClient, type ChoiceResponse, type NoulResponse, type Question } from "@typesafe-ai/sdk";
import type { Hunk } from "./diff.js";
import { appliesTo, type Rule } from "./rules.js";

/** One judgment: does `hunk` break `rule`, how likely is it, and which line to point at. */
export type Judgment = { hunk: Hunk; rule: Rule; probability: number; line: number };

/** Anything that can answer a batch of questions about one state (the real client, or a fake in tests). */
export type Ask = (state: unknown, questions: Record<string, Question>) => Promise<Record<string, NoulResponse | ChoiceResponse>>;

// Jev reads the state once and answers every question in parallel, so we pack as many
// (hunk × rule) questions into one request as its limits comfortably allow.
const MAX_QUESTIONS = 200;
const MAX_STATE_CHARS = 60_000; // ≈ 15k tokens; Jev allows 32k for the state plus the longest question.
const MAX_HUNK_CHARS = 6_000;
const MAX_CHOICES = 255;

/** The yes/no question for one (hunk, rule) pair. The wording matters; see the README. */
export function question(hunkId: string, rule: Rule): Question {
  return {
    type: "noul",
    instructions:
      `Look only at the diff in \`hunks.${hunkId}.diff\`. Lines starting with + were added, lines starting with - ` +
      `were removed, other lines are unchanged context. Does this change clearly violate the rule below? ` +
      `Judge the change itself, not code that was already there.\n\nRule: ${rule.text}`,
  };
}

/** Judges every hunk against every rule that applies to its file. */
export async function judge(hunks: Hunk[], rules: Rule[], ask: Ask): Promise<Judgment[]> {
  const work = hunks
    .map((hunk, i) => ({
      id: `h${i}`,
      hunk,
      diff: hunk.text.slice(0, MAX_HUNK_CHARS),
      rules: rules.filter((r) => appliesTo(r, hunk.file)),
    }))
    .filter((w) => w.rules.length);

  // Pack whole hunks (with all their rules) into requests that stay under both budgets.
  const batches: (typeof work)[] = [[]];
  let questions = 0;
  let chars = 0;
  for (const w of work) {
    const size = w.diff.length;
    if (batches.at(-1)!.length && (questions + w.rules.length > MAX_QUESTIONS || chars + size > MAX_STATE_CHARS)) {
      batches.push([]);
      questions = chars = 0;
    }
    batches.at(-1)!.push(w);
    questions += w.rules.length;
    chars += size;
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      if (!batch.length) return [];
      const state = {
        hunks: Object.fromEntries(batch.map((w) => [w.id, { file: w.hunk.file, diff: w.diff }])),
      };
      const questions: Record<string, Question> = {};
      batch.forEach((w) => w.rules.forEach((rule, r) => (questions[`${w.id}_r${r}`] = question(w.id, rule))));
      const answers = await ask(state, questions);
      return batch.flatMap((w) =>
        w.rules.map((rule, r) => {
          const answer = answers[`${w.id}_r${r}`];
          return { hunk: w.hunk, rule, probability: answer?.type === "noul" ? answer.noul : 0, line: w.hunk.line };
        }),
      );
    }),
  );
  return results.flat();
}

/**
 * Points each finding at the added line that actually breaks the rule, instead of the first line of
 * its hunk. One choice question per finding ("which of these added lines?"), all in one request.
 */
export async function locate(findings: Judgment[], ask: Ask): Promise<Judgment[]> {
  const multiLine = findings.filter((f) => f.hunk.added.length > 1);
  if (!multiLine.length) return findings;

  const state = {
    findings: Object.fromEntries(
      multiLine.map((f, i) => [`f${i}`, { file: f.hunk.file, rule: f.rule.text, addedLines: Object.fromEntries(options(f)) }]),
    ),
  };
  const questions: Record<string, Question> = Object.fromEntries(
    multiLine.map((f, i) => [
      `f${i}`,
      {
        type: "choice",
        instructions: `In \`findings.f${i}\`, a change breaks the rule "${f.rule.text}". Which added line is the one that breaks it?`,
        criteria: Object.fromEntries(options(f).map(([key]) => [key, null])),
      },
    ]),
  );
  const answers = await ask(state, questions);

  return findings.map((f) => {
    const i = multiLine.indexOf(f);
    const answer = i >= 0 ? answers[`f${i}`] : undefined;
    return answer?.type === "choice" ? { ...f, line: Number(answer.choice.slice(1)) } : f;
  });
}

/** `L42` → the code on line 42, for a finding's added lines (capped at Jev's choice limit). */
const options = (f: Judgment): [string, string][] => f.hunk.added.slice(0, MAX_CHOICES).map((a) => [`L${a.line}`, a.text]);

/** `Ask` backed by the real Jev API. */
export function jevAsk(apiKey: string, model = "jev-latest"): Ask {
  const client = new TypeSafeClient({ apiKey, defaultModel: model, retry: { maxRetries: 5 }, timeout: 60_000 });
  return async (state, questions) => (await client.systemOne({ state: state as never, questions })).answers as never;
}
