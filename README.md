# softlint

**Enforce the rules a linter can't.**

Linters are great at `no-console` and `no-explicit-any`. They can't tell you that a new endpoint returns
*anyone's* invoice, that a refund is retried without an idempotency key, or that a docstring promises
`null` while the code throws. Those rules live in your head, in onboarding docs, and in review comments
you've written fifty times.

softlint is a GitHub Action that reviews every pull request against rules written in **plain English**.
Each changed hunk is judged against each rule by [Jev](https://typesafe.ai), a model built for fast,
calibrated yes/no decisions. softlint only comments when Jev is confident, so it stays quiet.

```
⚠ softlint (95%)                                         src/routes/invoices.ts, line 22
  Every endpoint that reads or changes one user's data must check that the requester may access
  that specific record. Looking a record up by its id alone, without also filtering by the
  requesting user or their account, breaks this rule.
```

Findings show up as warnings right on the changed line in the PR's "Files changed" tab. The job summary
lists them all, with what the run cost (usually a small fraction of a cent).

## Setup (2 minutes)

**1. Add your Jev API key** as a repository secret named `JEV_API_KEY`
(Settings → Secrets and variables → Actions).

**2. Add the workflow** `.github/workflows/softlint.yml`:

```yaml
name: softlint
on: pull_request

permissions:
  contents: read

jobs:
  softlint:
    runs-on: ubuntu-latest
    steps:
      - uses: blazejkustra/softlint@v1
        with:
          jev-api-key: ${{ secrets.JEV_API_KEY }}
```

**3. Write your rules** in `softlint.json` at the repo root:

```json
{
  "$schema": "https://raw.githubusercontent.com/blazejkustra/softlint/main/softlint.schema.json",
  "rules": [
    { "rule": "Every endpoint that reads or changes one user's data must check that the requester may access that specific record. Looking a record up by its id alone, without also filtering by the requesting user or their account, breaks this rule." },
    { "rule": "Operations with real-world side effects (charging or refunding money, sending emails or SMS, calling webhooks) must not be retried or repeated without an idempotency key or a duplicate check." },
    { "rule": "Database migrations must keep working with the code that is currently deployed: do not drop or rename columns that existing code still uses, and add new columns as nullable or with a default.", "files": ["**/migrations/**"] }
  ]
}
```

That's it. No checkout step, and no build.

## `softlint.json`

| key | |
|---|---|
| `rules[].rule` | The rule in plain English. Required. |
| `rules[].files` | Globs of the files the rule applies to, e.g. `["src/api/**"]`. Optional (defaults to every file). |

The file is JSON on purpose. The `$schema` gives you autocomplete and inline errors in your editor.
softlint validates it strictly, so a typo like `"file"` instead of `"files"` fails the run loudly
instead of quietly turning a rule off.

A starter with 11 rules is in [`examples/softlint.json`](examples/softlint.json).

## Examples

Every example in [`examples/`](examples) has one rule, a `bad.diff` that breaks it, and a `good.diff`
that looks almost the same but is fine. That second diff is the hard part.

| example | the bad diff | the good look-alike |
|---|---|---|
| [authorization](examples/authorization) | `findUnique({ where: { id } })` on an invoice | same query, scoped to `customerId` |
| [idempotency](examples/idempotency) | Stripe refund in a retry loop (Python) | same loop, with `idempotency_key` |
| [personal-data-in-logs](examples/personal-data-in-logs) | logs `email`, `phone` on signup failure (Go) | logs `request_id`, `plan` |
| [error-exposure](examples/error-exposure) | returns `str(error)` and the traceback (Flask) | returns a support reference code |
| [swallowed-errors](examples/swallowed-errors) | an empty `catch` (just `// ignore`) in a webhook | logs and returns 500 so Stripe retries |
| [api-compatibility](examples/api-compatibility) | renames `total` → `totalAmount` in a v1 response | adds a new `currency` field |
| [docs-drift](examples/docs-drift) | "never throws, returns `null`" above code that throws | docstring says it throws |
| [ux-copy](examples/ux-copy) | "Invalid input … (ERR_SLOT_409)" (TSX) | says what to do next |
| [safe-migrations](examples/safe-migrations) | `RENAME COLUMN`, `ADD COLUMN … NOT NULL` (SQL) | nullable columns, backfill later |
| [feature-flags](examples/feature-flags) | new checkout buttons shipped directly | same buttons behind `flags.enabled(…)` |
| [meaningful-tests](examples/meaningful-tests) | tests that only check a mock was called | tests that assert on the result |

`pnpm eval` runs all of them against the real Jev API:

```
Per example (threshold 0.8): bad.diff must be flagged, good.diff must not.

example                  bad   good
✓ api-compatibility       93%    4%
✓ authorization           95%    6%
✓ docs-drift              93%    4%
✓ error-exposure          96%    9%
✓ feature-flags           85%    6%
✓ idempotency             87%    5%
✓ meaningful-tests        93%    5%
✓ personal-data-in-logs   96%   12%
✓ safe-migrations         92%    6%
✓ swallowed-errors        95%    7%
✓ ux-copy                 96%    7%

Full ruleset: 22 diffs × 11 rules
  recall    11/11 bad diffs caught by their own rule
  precision 11/11 findings were the intended violation
```

## Writing rules that work

These are lessons from building the examples, where every one of them moved a score:

- **Only write rules a linter can't check.** Formatting, unused imports and `console.log` belong in
  your linter, which is deterministic and free.
- **Name the violation concretely.** "Comments must be accurate" scored a contradicting docstring at
  61%. "What it says the code returns, throws or does must match what the code actually does" scored
  it about 80%.
- **Describe what the violation looks like in code.** "Must check the requester may access the record,
  not just that they are logged in" scored an unchecked `findUnique({ where: { id } })` at 79% in a real
  PR, because the login check wasn't in view. Adding "looking a record up by its id alone, without also
  filtering by the requesting user, breaks this rule" scored it at 91%.
- **Scope rules with `files`.** An API-compatibility rule without scope fired on a SQL migration that
  renamed a column. Scoping it to `src/api/**` fixed that, and it also means fewer questions per PR.
- **Test a rule before you add it.** Run it on a real diff and look at every score, including the ones
  below the threshold:
  ```sh
  git diff main | JEV_API_KEY=… npx github:blazejkustra/softlint --rules softlint.json --all
  ```

## Options

| input | default | |
|---|---|---|
| `jev-api-key` | required | Your Jev API key. |
| `rules` | `softlint.json` | Path to the rules file. Read from the checkout if there is one, otherwise from the PR's head commit. |
| `threshold` | `0.8` | How sure Jev must be (0–1) before softlint comments. |
| `fail-on-findings` | `false` | Fail the check when there are findings, turning softlint from a reviewer into a gate. |
| `model` | `jev-latest` | Jev model. |
| `github-token` | `${{ github.token }}` | Reads the PR diff (and the rules file when there's no checkout). softlint never writes to the PR. |

Outputs: `findings` (the number of findings at or above the threshold) and `cost-usd` (what the run cost).

## How it works

```
PR diff ─► pieces ─► (piece × rule) yes/no questions ─► Jev ─► findings ≥ threshold ─► exact line ─► one PR review
```

1. **Split.** The PR diff is split into hunks, and each hunk is split further at top-level boundaries
   (the next function, route or statement). Git happily merges a harmless change and a violation into
   one hunk, and judging them together dilutes the violation. Lockfiles, `dist/` and binaries are skipped.
2. **Judge.** Every piece is paired with every rule whose `files` match. Each pair is one yes/no question
   for Jev, and up to 200 questions go into a single request.
3. **Locate.** For each finding, one *choice* question asks Jev which added line breaks the rule, so
   the comment lands on `findUnique({ where: { id } })` and not on the imports above it. All findings
   share one request.
4. **Report.** Each finding becomes a warning annotation on its line, and the job summary lists every
   finding with the run's cost. GitHub shows at most 10 annotations per step, so the 10 most confident
   ones are annotated and the rest are in the summary.

A typical PR is **two Jev requests**. The demo PR in this repo (14 files, 30 changed pieces × 11 rules)
costs about $0.0006 per run: Jev charges $0.042 per million input tokens, and output is free. Every run
prints its cost in the log and the job summary, and sets it as the `cost-usd` output.

The code is small on purpose: [`rules.ts`](src/rules.ts) · [`diff.ts`](src/diff.ts) ·
[`jev.ts`](src/jev.ts) · [`review.ts`](src/review.ts) · [`github.ts`](src/github.ts) ·
[`action.ts`](src/action.ts) · [`cli.ts`](src/cli.ts).

## Good to know

- **Pull requests from forks** don't get repository secrets on `pull_request`, so softlint can't call Jev
  for them unless you opt in with `pull_request_target` (read GitHub's security notes first).
- **Jev is a judgment, not a proof.** Scores can move a few points between runs. Keep the threshold at
  0.8 or above for comments, and use `fail-on-findings` only for rules you've tested well.
- softlint sees each hunk with 3 lines of context, not your whole codebase. Write rules that can be judged
  from the change itself.

## Development

```sh
pnpm install
pnpm test        # 36 offline tests: parsers, batching, and the built action against fake GitHub + Jev servers
pnpm eval        # the examples catalog against the real Jev API (needs JEV_API_KEY, e.g. in .env)
pnpm build       # bundles dist/ (committed, because GitHub runs it directly)
```

## License

MIT
