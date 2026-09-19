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

test("splits a hunk at top-level boundaries so each piece is judged alone", () => {
  const routes = `diff --git a/api.ts b/api.ts
--- a/api.ts
+++ b/api.ts
@@ -1,2 +1,12 @@
 import { r } from "./r";
+
+r.get("/orders", (req, res) => {
+  res.json(ownOrders(req.user));
+});
+
+r.get("/orders/:id", (req, res) => {
+  res.json(anyOrder(req.params.id));
+});
+
+export default r;
`;
  const pieces = parseDiff(routes);
  assert.deepEqual(pieces.map((p) => p.line), [3, 7, 11]); // the lone blank line 2 isn't a piece of its own
  assert.ok(pieces[1].text.startsWith("@@ -1,2 +1,12 @@") && pieces[1].text.includes("anyOrder") && !pieces[1].text.includes("ownOrders"));
});

test("keeps an indented body with its function, and records every non-blank added line", () => {
  const [piece] = parseDiff(`diff --git a/a.py b/a.py
--- a/a.py
+++ b/a.py
@@ -1,1 +1,5 @@
 def f():
+    x = 1
+
+    return x
`);
  assert.deepEqual(piece.added, [
    { line: 2, text: "    x = 1" },
    { line: 4, text: "    return x" },
  ]);
});
