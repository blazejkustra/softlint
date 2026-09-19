import type { Question } from "@typesafe-ai/sdk";
import type { Ask } from "../../src/jev.ts";

/**
 * A fake Jev that records every request. Yes/no questions get `noul(id, question)`; choice questions
 * get `choice(id, options)` (default: the first option).
 */
export function fakeJev(
  noul: (id: string, question: Question, state: any) => number = () => 0.1,
  choice: (id: string, options: string[]) => string = (_id, options) => options[0],
) {
  const calls: { state: any; questions: Record<string, Question> }[] = [];
  const ask: Ask = async (state, questions) => {
    calls.push({ state, questions });
    return Object.fromEntries(
      Object.entries(questions).map(([id, q]) => {
        if (q.type !== "choice") return [id, { type: "noul", noul: noul(id, q, state) }];
        const options = Object.keys(q.criteria);
        return [id, { type: "choice", choice: choice(id, options), confidence: 1, probabilities: {} }];
      }),
    );
  };
  return { ask, calls };
}
