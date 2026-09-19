import * as core from "@actions/core";
import { existsSync, readFileSync } from "node:fs";
import { GitHub, marker } from "./github.js";
import { jevAsk } from "./jev.js";
import { review } from "./review.js";
import { parseRules } from "./rules.js";

type PullRequestEvent = { pull_request?: { number: number; head: { sha: string } } };

async function run() {
  const apiKey = core.getInput("jev-api-key", { required: true });
  const rulesPath = core.getInput("rules") || "softlint.json";
  const threshold = Number(core.getInput("threshold") || 0.8);
  const failOnFindings = core.getBooleanInput("fail-on-findings");
  const token = core.getInput("github-token", { required: true });

  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8")) as PullRequestEvent;
  const pr = event.pull_request;
  if (!pr) {
    core.info("softlint only reviews pull requests; nothing to do for this event.");
    return;
  }
  const github = new GitHub(token, process.env.GITHUB_REPOSITORY!, process.env.GITHUB_API_URL);

  // Rules come from the checked-out repo if there is one, otherwise straight from the PR's head.
  const config = existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : await github.fileAt(rulesPath, pr.head.sha);
  if (config === undefined) return core.setFailed(`No ${rulesPath} found. Add one with your rules (see the softlint README).`);
  const rules = parseRules(config, rulesPath);
  core.info(`Loaded ${rules.length} rule${rules.length === 1 ? "" : "s"} from ${rulesPath}.`);

  const diff = await github.pullRequestDiff(pr.number);
  const { findings, hunks } = await review(diff, rules, jevAsk(apiKey, core.getInput("model") || undefined), threshold);
  core.info(`Jev judged ${hunks} hunks × ${rules.length} rules: ${findings.length} finding(s) at ≥ ${threshold}.`);

  // Annotations show up on the PR's "Files changed" tab even when a review can't be posted.
  for (const f of findings) core.warning(f.rule.text, { title: `softlint (${Math.round(f.probability * 100)}%)`, file: f.hunk.file, startLine: f.line });

  const posted = await github.existingMarkers(pr.number);
  const fresh = findings.filter((f) => !posted.has(marker(f)));
  if (fresh.length) {
    try {
      await github.postReview(pr.number, pr.head.sha, fresh);
      core.info(`Posted a review with ${fresh.length} comment(s).`);
    } catch (error) {
      // Pull requests from forks get a read-only token; the annotations above still show the findings.
      core.warning(`Couldn't post the review (${(error as Error).message.slice(0, 120)}). Findings are in the annotations.`);
    }
  }

  core.summary.addHeading("softlint", 3);
  if (findings.length) {
    core.summary.addTable([
      [{ data: "Where", header: true }, { data: "Rule", header: true }, { data: "Jev", header: true }],
      ...findings.map((f) => [`${f.hunk.file}:${f.line}`, f.rule.text, `${Math.round(f.probability * 100)}%`]),
    ]);
  } else {
    core.summary.addRaw("No rule violations found.");
  }
  await core.summary.write();

  core.setOutput("findings", findings.length);
  if (failOnFindings && findings.length) core.setFailed(`softlint found ${findings.length} rule violation(s).`);
}

run().catch((error) => core.setFailed(error instanceof Error ? error.message : String(error)));
