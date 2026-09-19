import assert from "node:assert/strict";
import { test } from "node:test";
import { review } from "../src/review.ts";
import { fakeJev } from "./helpers/jev.ts";
import { rules as makeRules } from "./helpers/rules.ts";

const diff = (file: string, line: number, added: string) =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -${line},1 +${line},2 @@\n ctx\n+${added}\n`;

const fixed = (p: number) => fakeJev(() => p).ask;

test("reports only judgments at or above the threshold, sorted by file and line", async () => {
  const jev = fakeJev((id, _q, state) => (state.hunks[id.split("_")[0]].file === "b.ts" ? 0.9 : 0.4));
  const { findings, judgments } = await review(diff("b.ts", 5, "x") + diff("a.ts", 1, "y"), makeRules("A rule."), jev.ask, 0.8);
  assert.equal(judgments.length, 2);
  assert.deepEqual(findings.map((f) => f.hunk.file), ["b.ts"]);
});

test("no rules means no Jev calls", async () => {
  const jev = fakeJev();
  await review(diff("a.ts", 1, "x"), [], jev.ask);
  assert.equal(jev.calls.length, 0);
});

test("findings carry the rule, the confidence and the file", async () => {
  const [finding] = (await review(diff("a.ts", 1, "x"), makeRules("Be kind."), fixed(0.93))).findings;
  assert.deepEqual([finding.rule.text, finding.probability, finding.hunk.file, finding.line], ["Be kind.", 0.93, "a.ts", 2]);
});
