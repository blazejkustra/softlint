import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDiff } from "../src/diff.ts";

const diff = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,4 +10,5 @@ function a() {
   const x = 1;
-  const y = 2;
+  const y = 3;
+  const z = 4;
   return x;
@@ -40,3 +41,2 @@ function b() {
   keep();
-  remove();
   end();
diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,1 +1,1 @@
-"a"
+"b"
diff --git a/docs/new.md b/docs/new.md
new file mode 100644
--- /dev/null
+++ b/docs/new.md
@@ -0,0 +1,2 @@
+# Hello
+++ this line starts with two pluses
`;

test("finds the new-file line of the first added line in each hunk", () => {
  const hunks = parseDiff(diff);
  assert.deepEqual(
    hunks.map((h) => [h.file, h.line]),
    [["src/a.ts", 11], ["docs/new.md", 1]],
  );
});

test("keeps the hunk text with its header, context, - and + lines", () => {
  const [first] = parseDiff(diff);
  assert.ok(first.text.startsWith("@@ -10,4 +10,5 @@"));
  assert.ok(first.text.includes("-  const y = 2;") && first.text.includes("+  const z = 4;"));
});

test("drops deletion-only hunks, lockfiles and trailing blank lines", () => {
  const hunks = parseDiff(diff);
  assert.equal(hunks.some((h) => h.text.includes("remove()")), false);
  assert.equal(hunks.some((h) => h.file === "package-lock.json"), false);
  assert.equal(hunks.at(-1)!.text.endsWith("\n"), false);
});

test("an added line starting with ++ is content, not a file header", () => {
  const added = parseDiff(diff).at(-1)!;
  assert.equal(added.file, "docs/new.md");
  assert.ok(added.text.includes("+++ this line starts with two pluses"));
});

test("handles CRLF diffs", () => {
  assert.deepEqual(parseDiff(diff.replace(/\n/g, "\r\n")).map((h) => h.line), [11, 1]);
});
