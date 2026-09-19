// Run softlint locally before you push:
//   git diff main | npx github:blazejkustra/softlint
//   npx github:blazejkustra/softlint --diff change.diff --rules softlint.json --threshold 0.7 --all
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { jevAsk } from "./jev.js";
import { review } from "./review.js";
import { parseRules } from "./rules.js";

const { values } = parseArgs({
  options: {
    diff: { type: "string" },
    rules: { type: "string", default: "softlint.json" },
    threshold: { type: "string", default: "0.8" },
    all: { type: "boolean", default: false }, // also show judgments below the threshold
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log("Usage: git diff main | softlint [--rules softlint.json] [--threshold 0.8] [--diff file] [--all]");
  process.exit(0);
}

const apiKey = process.env.JEV_API_KEY;
if (!apiKey) {
  console.error("Set JEV_API_KEY (get one at https://typesafe.ai).");
  process.exit(2);
}

const diff = values.diff ? readFileSync(values.diff, "utf8") : readFileSync(0, "utf8");
const rules = parseRules(readFileSync(values.rules!, "utf8"), values.rules);
const threshold = Number(values.threshold);
const { findings, judgments, hunks } = await review(diff, rules, jevAsk(apiKey), threshold);

// With --all, also list what fell below the threshold (findings keep the exact line they were located at).
const located = new Map(findings.map((f) => [`${f.hunk.file}:${f.hunk.line}:${f.rule.text}`, f]));
const shown = values.all
  ? judgments.map((j) => located.get(`${j.hunk.file}:${j.hunk.line}:${j.rule.text}`) ?? j).sort((a, b) => b.probability - a.probability)
  : findings;
for (const j of shown) {
  const mark = j.probability >= threshold ? "✗" : " ";
  console.log(`${mark} ${String(Math.round(j.probability * 100)).padStart(3)}%  ${j.hunk.file}:${j.line}  ${j.rule.text}`);
}
console.log(`\n${findings.length} finding(s) in ${hunks} hunks against ${rules.length} rules (threshold ${threshold}).`);
process.exit(findings.length ? 1 : 0);
