import { TypeSafeClient, type NoulQuestion } from "@typesafe-ai/sdk";
import type { Hunk } from "./diff.js";
import { appliesTo, type Rule } from "./rules.js";

/** One yes/no judgment: does `hunk` break `rule`, and how likely is it. */
export type Judgment = { hunk: Hunk; rule: Rule; probability: number };

/** Anything that can answer a batch of Noul questions about one state (the real client, or a fake in tests). */
export type Ask = (state: unknown, questions: Record<string, NoulQuestion>) => Promise<Record<string, number>>;

// Jev reads the state once and answers every question in parallel, so we pack as many
// (hunk × rule) questions into one request as its limits comfortably allow.
const MAX_QUESTIONS = 200;
const MAX_STATE_CHARS = 60_000; // ≈ 15k tokens; Jev allows 32k for the state plus the longest question.
const MAX_HUNK_CHARS = 6_000;

/** The question for one (hunk, rule) pair. The wording matters; see the README. */
export function question(hunkId: string, rule: Rule): NoulQuestion {
  return {
    type: "noul",
    instructions:
      `Look only at the diff hunk \`hunks.${hunkId}\`. Lines starting with + were added, lines starting with - ` +
      `were removed, other lines are unchanged context. Does this change clearly violate the rule below? ` +
      `Judge the change itself, not code that was already there.\n\nRule: ${rule.text}`,
  };
}

/** Judges every hunk against every rule that applies to its file. */
export async function judge(hunks: Hunk[], rules: Rule[], ask: Ask): Promise<Judgment[]> {
  const work = hunks
    .map((hunk, i) => ({ id: `h${i}`, hunk, diff: hunk.text.slice(0, MAX_HUNK_CHARS), rules: rules.filter((r) => appliesTo(r, hunk.file)) }))
    .filter((w) => w.rules.length);

  // Pack whole hunks (with all their rules) into requests that stay under both budgets.
  const batches: (typeof work)[] = [[]];
  let questions = 0;
  let chars = 0;
  for (const w of work) {
    const current = batches.at(-1)!;
    if (current.length && (questions + w.rules.length > MAX_QUESTIONS || chars + w.diff.length > MAX_STATE_CHARS)) {
      batches.push([]);
      questions = chars = 0;
    }
    batches.at(-1)!.push(w);
    questions += w.rules.length;
    chars += w.diff.length;
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      if (!batch.length) return [];
      const state = { hunks: Object.fromEntries(batch.map((w) => [w.id, { file: w.hunk.file, diff: w.diff }])) };
      const questions: Record<string, NoulQuestion> = {};
      batch.forEach((w) => w.rules.forEach((rule, r) => (questions[`${w.id}_r${r}`] = question(w.id, rule))));
      const answers = await ask(state, questions);
      return batch.flatMap((w) => w.rules.map((rule, r) => ({ hunk: w.hunk, rule, probability: answers[`${w.id}_r${r}`] ?? 0 })));
    }),
  );
  return results.flat();
}

/** `Ask` backed by the real Jev API. */
export function jevAsk(apiKey: string, model = "jev-latest"): Ask {
  const client = new TypeSafeClient({ apiKey, defaultModel: model, retry: { maxRetries: 5 }, timeout: 60_000 });
  return async (state, questions) => {
    const { answers } = await client.systemOne({ state: state as never, questions });
    return Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, answer.noul]));
  };
}
