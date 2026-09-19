// Runs the examples catalog against the real Jev API and checks that softlint actually works.
//   JEV_API_KEY=… npm run eval [-- --threshold 0.8]
//
// 1. Per example: its own rule must flag bad.diff and must NOT flag good.diff (a look-alike that's fine).
// 2. Full ruleset: every diff against all rules in examples/softlint.json. Bad diffs must be caught by
//    their own rule; any other finding is a false positive (e.g. the privacy rule firing on a migration).
import { readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { jevAsk } from "../src/jev.ts";
import { review, type Finding } from "../src/review.ts";
import { parseRules } from "../src/rules.ts";

const { values } = parseArgs({ options: { threshold: { type: "string", default: "0.8" } } });
const threshold = Number(values.threshold);
const apiKey = process.env.JEV_API_KEY;
if (!apiKey) {
  console.error("Set JEV_API_KEY to run the eval.");
  process.exit(2);
}
const ask = jevAsk(apiKey);

const root = new URL("../examples/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const pct = (p: number) => `${Math.round(p * 100)}%`.padStart(4);
const max = (findings: { probability: number }[]) => Math.max(0, ...findings.map((f) => f.probability));
let failures = 0;

// 1 ── each rule alone ──────────────────────────────────────────────────────────────────────────────
console.log(`Per example (threshold ${threshold}): bad.diff must be flagged, good.diff must not.\n`);
console.log(`${"example".padEnd(24)} bad   good`);
const perExample = await Promise.all(
  names.map(async (name) => {
    const rules = parseRules(read(`${name}/softlint.json`), `${name}/softlint.json`);
    const [bad, good] = await Promise.all(["bad.diff", "good.diff"].map((f) => review(read(`${name}/${f}`), rules, ask, threshold)));
    return { name, bad: max(bad.judgments), good: max(good.judgments) };
  }),
);
for (const { name, bad, good } of perExample) {
  const ok = bad >= threshold && good < threshold;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(22)} ${pct(bad)}  ${pct(good)}`);
}

// 2 ── all rules at once ────────────────────────────────────────────────────────────────────────────
const allRules = parseRules(read("softlint.json"), "examples/softlint.json");
const ownRule = (name: string) => parseRules(read(`${name}/softlint.json`))[0].text;
let caught = 0;
const falsePositives: string[] = [];
const missed: string[] = [];
await Promise.all(
  names.flatMap((name) =>
    ["bad.diff", "good.diff"].map(async (file) => {
      const { findings } = await review(read(`${name}/${file}`), allRules, ask, threshold);
      const own = (f: Finding) => file === "bad.diff" && f.rule.text === ownRule(name);
      if (file === "bad.diff" && findings.some(own)) caught++;
      else if (file === "bad.diff") missed.push(name);
      for (const f of findings.filter((f) => !own(f))) falsePositives.push(`${name}/${file} ← ${pct(f.probability)} "${f.rule.text.slice(0, 70)}…"`);
    }),
  ),
);
const flagged = caught + falsePositives.length;
console.log(`\nFull ruleset: ${names.length * 2} diffs × ${allRules.length} rules`);
console.log(`  recall    ${caught}/${names.length} bad diffs caught by their own rule`);
console.log(`  precision ${caught}/${flagged} findings were the intended violation`);
for (const m of missed) console.log(`  ✗ missed ${m}`);
for (const fp of falsePositives) console.log(`  ? ${fp}`);
failures += missed.length + falsePositives.length;

console.log(failures ? `\n${failures} problem(s).` : "\nAll good.");
process.exit(failures ? 1 : 0);
