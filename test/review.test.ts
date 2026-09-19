import assert from "node:assert/strict";
import { test } from "node:test";
import { marker } from "../src/github.ts";
import type { Ask } from "../src/jev.ts";
import { commentBody, review } from "../src/review.ts";
import { rules as makeRules } from "./helpers/rules.ts";

const diff = (file: string, line: number, added: string) =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -${line},1 +${line},2 @@\n ctx\n+${added}\n`;

const fixed = (p: number): Ask => async (_s, qs) => Object.fromEntries(Object.keys(qs).map((id) => [id, p]));

test("reports only judgments at or above the threshold, sorted by file and line", async () => {
  const rules = makeRules("A rule.");
  const answers: Ask = async (state: any, qs) =>
    Object.fromEntries(Object.keys(qs).map((id) => [id, state.hunks[id.split("_")[0]].file === "b.ts" ? 0.9 : 0.4]));
  const { findings, judgments } = await review(diff("b.ts", 5, "x") + diff("a.ts", 1, "y"), rules, answers, 0.8);
  assert.equal(judgments.length, 2);
  assert.deepEqual(findings.map((f) => f.hunk.file), ["b.ts"]);
});

test("no rules means no Jev calls", async () => {
  let called = false;
  await review(diff("a.ts", 1, "x"), [], async () => ((called = true), {}));
  assert.equal(called, false);
});

test("comment body names the rule and the confidence", async () => {
  const { findings } = await review(diff("a.ts", 1, "x"), makeRules("Be kind."), fixed(0.93));
  assert.match(commentBody(findings[0]), /Be kind\..*93%/s);
});

test("duplicate markers survive line shifts but change with the code", async () => {
  const rules = makeRules("Be kind.");
  const [a] = (await review(diff("a.ts", 10, "rude()"), rules, fixed(0.9))).findings;
  const [moved] = (await review(diff("a.ts", 42, "rude()"), rules, fixed(0.9))).findings;
  const [other] = (await review(diff("a.ts", 10, "ruder()"), rules, fixed(0.9))).findings;
  assert.equal(marker(a), marker(moved));
  assert.notEqual(marker(a), marker(other));
});
