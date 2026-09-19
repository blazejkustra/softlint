import * as core from "@actions/core";
import { existsSync, readFileSync } from "node:fs";
import { GitHub } from "./github.js";
import { jevAsk } from "./jev.js";
import { review } from "./review.js";
import { parseRules } from "./rules.js";

type PullRequestEvent = { pull_request?: { number: number; head: { sha: string } } };

const MAX_ANNOTATIONS = 10;
const percent = (p: number) => `${Math.round(p * 100)}%`;
const dollars = (usd: number) => `$${usd < 0.01 ? usd.toFixed(5) : usd.toFixed(2)}`;

async function run() {
  const rulesPath = core.getInput("rules") || "softlint.json";
  const threshold = Number(core.getInput("threshold") || 0.8);

  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8")) as PullRequestEvent;
  const pr = event.pull_request;
  if (!pr) return core.info("softlint only reviews pull requests; nothing to do for this event.");
  const github = new GitHub(core.getInput("github-token", { required: true }), process.env.GITHUB_REPOSITORY!, process.env.GITHUB_API_URL);

  // Rules come from the checked-out repo if there is one, otherwise straight from the PR's head.
  const config = existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : await github.fileAt(rulesPath, pr.head.sha);
  if (config === undefined) return core.setFailed(`No ${rulesPath} found. Add one with your rules (see the softlint README).`);
  const rules = parseRules(config, rulesPath);

  const jev = jevAsk(core.getInput("jev-api-key", { required: true }), core.getInput("model") || undefined);
  const { findings, hunks } = await review(await github.pullRequestDiff(pr.number), rules, jev, threshold);
  const cost = `${dollars(jev.usage.costUsd)} (${jev.usage.requests} Jev requests, ${jev.usage.inputTokens.toLocaleString("en-US")} input tokens)`;

  core.info(`Checked ${hunks} changes against ${rules.length} rules from ${rulesPath}: ${findings.length} finding(s) at ≥ ${percent(threshold)}.`);
  core.info(`Cost: ${cost}.`);

  // Each finding is a warning annotation, shown inline on the PR's "Files changed" tab. GitHub shows at
  // most 10 warnings per step, so the most confident 10 get one; the summary lists every finding.
  const annotated = new Set([...findings].sort((a, b) => b.probability - a.probability).slice(0, MAX_ANNOTATIONS));
  for (const f of findings) {
    core.info(`  ${percent(f.probability).padStart(4)}  ${f.hunk.file}:${f.line}`);
    if (annotated.has(f)) core.warning(f.rule.text, { title: `softlint (${percent(f.probability)})`, file: f.hunk.file, startLine: f.line });
  }
  if (findings.length > MAX_ANNOTATIONS) core.info(`GitHub shows 10 annotations per step; all ${findings.length} findings are in the job summary.`);

  core.summary.addHeading("softlint", 3);
  if (findings.length) {
    core.summary.addTable([
      [{ data: "Where", header: true }, { data: "Rule", header: true }, { data: "Jev", header: true }],
      ...findings.map((f) => [`${f.hunk.file}:${f.line}`, f.rule.text, percent(f.probability)]),
    ]);
  } else {
    core.summary.addRaw("No rule violations found.", true);
  }
  await core.summary.addRaw(`<sub>Cost: ${cost}.</sub>`, true).write();

  core.setOutput("findings", findings.length);
  core.setOutput("cost-usd", jev.usage.costUsd.toFixed(6));
  if (core.getBooleanInput("fail-on-findings") && findings.length) core.setFailed(`softlint found ${findings.length} rule violation(s).`);
}

run().catch((error) => core.setFailed(error instanceof Error ? error.message : String(error)));
