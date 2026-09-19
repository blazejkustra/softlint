import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hunk } from "../src/diff.ts";
import { judge, locate, question } from "../src/jev.ts";
import { fakeJev } from "./helpers/jev.ts";
import { rules } from "./helpers/rules.ts";

const hunk = (file: string, i = 0): Hunk => ({ file, line: 1, text: `@@ -1,1 +1,1 @@\n+change ${i}`, added: [{ line: 1, text: `change ${i}` }] });

test("asks one question per (hunk, rule) pair, all in one request", async () => {
  const jev = fakeJev();
  const judgments = await judge([hunk("a.ts"), hunk("b.ts")], rules("One.", "Two.", "Three."), jev.ask);
  assert.equal(jev.calls.length, 1);
  assert.equal(Object.keys(jev.calls[0].questions).length, 6);
  assert.equal(judgments.length, 6);
});

test("only asks rules whose globs match the file", async () => {
  const jev = fakeJev();
  const scoped = rules("Everywhere.", { rule: "Migrations only.", files: ["**/migrations/**"] });
  await judge([hunk("src/app.ts"), hunk("db/migrations/001.sql")], scoped, jev.ask);
  const asked = Object.values(jev.calls[0].questions).map((q) => q.instructions as string);
  assert.equal(asked.filter((q) => q.includes("Migrations only.")).length, 1);
  assert.equal(asked.filter((q) => q.includes("Everywhere.")).length, 2);
});

test("splits big reviews into requests of at most 200 questions", async () => {
  const jev = fakeJev();
  const hunks = Array.from({ length: 150 }, (_, i) => hunk(`f${i}.ts`, i));
  await judge(hunks, rules("A.", "B."), jev.ask);
  assert.ok(jev.calls.length >= 2);
  assert.ok(jev.calls.every((c) => Object.keys(c.questions).length <= 200));
  assert.equal(jev.calls.reduce((n, c) => n + Object.keys(c.questions).length, 0), 300);
});

test("maps answers back to the right hunk and rule", async () => {
  const jev = fakeJev((id) => (id === "h1_r0" ? 0.97 : 0.02));
  const judgments = await judge([hunk("a.ts"), hunk("b.ts")], rules("Rule A.", "Rule B."), jev.ask);
  const hit = judgments.filter((j) => j.probability > 0.5);
  assert.deepEqual(hit.map((j) => [j.hunk.file, j.rule.text]), [["b.ts", "Rule A."]]);
});

test("the question points Jev at one hunk and explains +/- lines", () => {
  const q = question("h3", rules("No secrets in logs.")[0]);
  assert.equal(q.type, "noul");
  assert.match(q.instructions as string, /`hunks\.h3\.diff`/);
  assert.match(q.instructions as string, /\+ were added.*- were removed/s);
  assert.match(q.instructions as string, /Rule: No secrets in logs\.$/);
});

test("locate moves each finding to the added line Jev picks, in one request", async () => {
  const big: Hunk = {
    file: "a.ts",
    line: 10,
    text: "…",
    added: [
      { line: 10, text: "import x" },
      { line: 11, text: "log(email)" },
      { line: 12, text: "return x" },
    ],
  };
  const jev = fakeJev(undefined, (_id, options) => options[1]);
  const [finding, single] = await locate(
    [
      { hunk: big, rule: rules("No PII in logs.")[0], probability: 0.9, line: 10 },
      { hunk: hunk("b.ts"), rule: rules("x")[0], probability: 0.9, line: 1 },
    ],
    jev.ask,
  );
  assert.equal(jev.calls.length, 1);
  assert.equal(Object.keys(jev.calls[0].questions).length, 1); // one-line hunks need no question
  assert.deepEqual(Object.keys((jev.calls[0].questions.f0 as any).criteria), ["L10", "L11", "L12"]);
  assert.equal(finding.line, 11);
  assert.equal(single.line, 1);
});
