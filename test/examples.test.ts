// Offline sanity checks for the examples catalog (the real-Jev check is `npm run eval`).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDiff } from "../src/diff.ts";
import { appliesTo, parseRules } from "../src/rules.ts";

const root = new URL("../examples/", import.meta.url);
const examples = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

for (const name of examples) {
  test(`examples/${name}: one rule, and it applies to both diffs`, () => {
    const read = (f: string) => readFileSync(new URL(`${name}/${f}`, root), "utf8");
    const rules = parseRules(read("softlint.json"));
    assert.equal(rules.length, 1);
    for (const file of ["bad.diff", "good.diff"]) {
      const hunks = parseDiff(read(file));
      assert.ok(hunks.length > 0, `${file} has no hunks`);
      assert.ok(hunks.every((h) => appliesTo(rules[0], h.file)), `${file} is outside the rule's globs`);
    }
  });
}
