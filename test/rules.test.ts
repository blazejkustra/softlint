import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { appliesTo, parseRules } from "../src/rules.ts";

const config = (rules: unknown, extra = {}) => JSON.stringify({ rules, ...extra });

test("parses rules and optional file globs", () => {
  const rules = parseRules(config([{ rule: "Everywhere." }, { rule: "  API only. ", files: ["src/api/**"] }]));
  assert.deepEqual(rules, [{ text: "Everywhere." }, { text: "API only.", files: ["src/api/**"] }]);
});

test("allows a $schema key for editor autocomplete", () => {
  assert.equal(parseRules(config([{ rule: "x" }], { $schema: "https://example.com/s.json" })).length, 1);
});

test("rejects anything unexpected, with a message that says where", () => {
  const bad: [string, RegExp][] = [
    ["{ not json", /not valid JSON/],
    ["[]", /must be a JSON object/],
    [config([]), /"rules" must be a non-empty array/],
    [JSON.stringify({ rule: [] }), /"rule" is not a known key/],
    [config(["just a string"]), /rules\[0\] must be an object/],
    [config([{ rule: "   " }]), /rules\[0\]\.rule must be a non-empty string/],
    [config([{ rule: "x", file: ["a"] }]), /rules\[0\]\."file" is not a known key/], // the classic typo
    [config([{ rule: "x", files: "src/**" }]), /rules\[0\]\.files must be a non-empty array/],
    [config([{ rule: "x", files: [] }]), /rules\[0\]\.files must be a non-empty array/],
  ];
  for (const [input, message] of bad) assert.throws(() => parseRules(input, "softlint.json"), message, input);
});

test("appliesTo matches globs, including dotfiles", () => {
  const [api, everywhere] = parseRules(config([{ rule: "x", files: ["src/api/**"] }, { rule: "y" }]));
  assert.equal(appliesTo(api, "src/api/users/get.ts"), true);
  assert.equal(appliesTo(api, "src/web/App.tsx"), false);
  assert.equal(appliesTo(everywhere, ".github/workflows/ci.yml"), true);
});

test("the starter examples/softlint.json has 11 rules, 5 of them scoped, and matches the schema's shape", () => {
  const rules = parseRules(readFileSync(new URL("../examples/softlint.json", import.meta.url), "utf8"));
  assert.equal(rules.length, 11);
  assert.equal(rules.filter((r) => r.files).length, 5);
});
