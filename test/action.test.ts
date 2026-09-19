// End-to-end test of the built action (dist/index.js), fully offline: a local server plays both the
// GitHub API and the Jev API. Run `pnpm build` first.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const diff = `diff --git a/billing/refunds.py b/billing/refunds.py
--- a/billing/refunds.py
+++ b/billing/refunds.py
@@ -12,2 +12,6 @@ def refund_order(order):
     payment = Payment.objects.get(order=order)
+    for attempt in range(3):
+        try:
+            return stripe.Refund.create(payment_intent=payment.intent_id)
+        except stripe.error.APIConnectionError:
+            time.sleep(2 ** attempt)
`;
const rules = JSON.stringify({
  rules: [{ rule: "Refunds must not be retried without an idempotency key." }, { rule: "Never log personal data." }],
});

// State shared with the fake servers.
let existingComments: { body: string }[] = [];
const reviews: any[] = [];
const jevRequests: any[] = [];

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { "content-type": typeof data === "string" ? "text/plain" : "application/json" });
    res.end(typeof data === "string" ? data : JSON.stringify(data));
  };
  const url = req.url ?? "";
  if (url === "/v1/systemone") {
    // Fake Jev: confident about the idempotency rule, not about the others.
    const { questions } = JSON.parse(body);
    jevRequests.push(JSON.parse(body));
    const answers = Object.fromEntries(
      Object.entries<any>(questions).map(([id, q]) =>
        q.type === "choice"
          ? // "Which added line breaks the rule?" → the Stripe call.
            [id, { type: "choice", choice: "L15", confidence: 0.9, probabilities: {} }]
          : [id, { type: "noul", noul: q.instructions.includes("idempotency") ? 0.95 : 0.05 }],
      ),
    );
    return send(200, { model: "jev-test", answers, usage: { input_tokens: 1, output_tokens: 1 } });
  }
  if (url === "/repos/acme/shop/pulls/7") return send(200, diff);
  if (url.startsWith("/repos/acme/shop/contents/softlint.json?ref=abc123")) return send(200, rules);
  if (url.startsWith("/repos/acme/shop/pulls/7/comments")) return send(200, existingComments);
  if (url === "/repos/acme/shop/pulls/7/reviews" && req.method === "POST") {
    reviews.push(JSON.parse(body));
    return send(200, { id: reviews.length });
  }
  send(404, { message: `unexpected ${req.method} ${url}` });
});

let baseUrl = "";
before(() => new Promise<void>((resolve) => server.listen(0, () => ((baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`), resolve()))));
after(() => server.close());

/** Runs dist/index.js like GitHub Actions would, in an empty workspace (no checkout). */
async function runAction(inputs: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "softlint-"));
  const event = join(dir, "event.json");
  writeFileSync(event, JSON.stringify({ pull_request: { number: 7, head: { sha: "abc123" } } }));
  const files = { output: join(dir, "output"), summary: join(dir, "summary") };
  writeFileSync(files.output, "");
  writeFileSync(files.summary, "");
  const input = (name: string, value: string) => [`INPUT_${name.toUpperCase()}`, value];
  // Async on purpose: the fake servers live in this process and must keep answering while the action runs.
  const child = spawn(process.execPath, [new URL("../dist/index.js", import.meta.url).pathname], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      GITHUB_EVENT_PATH: event,
      GITHUB_REPOSITORY: "acme/shop",
      GITHUB_API_URL: baseUrl,
      GITHUB_OUTPUT: files.output,
      GITHUB_STEP_SUMMARY: files.summary,
      TYPESAFE_BASE_URL: baseUrl,
      ...Object.fromEntries([
        input("jev-api-key", "test-key"),
        input("github-token", "gh-token"),
        input("fail-on-findings", "false"),
        ...Object.entries(inputs).map(([k, v]) => input(k, v)),
      ]),
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const status = await new Promise<number | null>((resolve) => child.on("close", resolve));
  return { status, stdout, stderr, output: readFileSync(files.output, "utf8"), summary: readFileSync(files.summary, "utf8") };
}

test("reviews the PR: one inline comment on the first added line, plus annotations and a summary", async () => {
  const run = await runAction();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(jevRequests.length, 2); // judge (1 hunk × 2 rules), then locate (1 finding)
  assert.equal(Object.keys(jevRequests[0].questions).length, 2);
  assert.equal(jevRequests[1].questions.f0.type, "choice");

  assert.equal(reviews.length, 1);
  const [comment] = reviews[0].comments;
  assert.deepEqual([comment.path, comment.line, comment.side], ["billing/refunds.py", 15, "RIGHT"]); // the line Jev picked
  assert.match(comment.body, /idempotency key.*95%/s);
  assert.match(comment.body, /<!-- softlint:\w+ -->/);
  assert.equal(reviews[0].commit_id, "abc123");

  assert.match(run.stdout, /::warning title=softlint \(95%25\),file=billing\/refunds\.py,line=15::Refunds must not be retried/);
  assert.match(run.output, /findings[\s\S]*1/);
  assert.match(run.summary, /billing\/refunds\.py:15/);
});

test("doesn't repeat a comment that's already on the PR", async () => {
  existingComments = [{ body: reviews[0].comments[0].body }];
  const run = await runAction();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(reviews.length, 1); // no new review
  existingComments = [];
});

test("fail-on-findings turns softlint into a gate", async () => {
  const run = await runAction({ "fail-on-findings": "true" });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /softlint found 1 rule violation/);
});

test("a higher threshold means no findings and no review", async () => {
  const before = reviews.length;
  const run = await runAction({ threshold: "0.99" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(reviews.length, before);
  assert.match(run.summary, /No rule violations found/);
});
