export type Hunk = {
  file: string;
  /** Line number (in the new file) of the first added line. GitHub review comments anchor here. */
  line: number;
  /** The hunk as it appears in the diff: `@@` header, context, `-` and `+` lines. */
  text: string;
};

// Generated or binary files are never worth a review comment.
const SKIP = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum)$|\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|min\.js|map|snap)$|(^|\/)dist\//;

/**
 * Splits a unified diff (`git diff` or GitHub's `application/vnd.github.diff`) into hunks that add
 * code. Hunks that only delete lines are dropped: there is no added line to comment on.
 */
export function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let file = "";
  let hunk: { file: string; line: number; lines: string[] } | undefined;
  let newLine = 0;

  const flush = () => {
    if (hunk?.line && !SKIP.test(hunk.file)) {
      while (hunk.lines.at(-1) === "") hunk.lines.pop();
      hunks.push({ file: hunk.file, line: hunk.line, text: hunk.lines.join("\n") });
    }
    hunk = undefined;
  };

  let previous = "";
  for (const line of diff.split(/\r?\n/)) {
    const isHeader = line.startsWith("+++ ") && previous.startsWith("--- ");
    previous = line;
    if (line.startsWith("diff --git ")) {
      flush();
      file = "";
    } else if (isHeader) {
      const path = line.slice(4).trim();
      file = path === "/dev/null" ? "" : path.replace(/^b\//, "");
    } else if (line.startsWith("@@")) {
      flush();
      newLine = Number(line.match(/\+(\d+)/)?.[1] ?? 1);
      if (file) hunk = { file, line: 0, lines: [line] };
    } else if (hunk) {
      if (line.startsWith("+")) {
        hunk.line ||= newLine;
        newLine++;
      } else if (line.startsWith(" ") || line === "") {
        newLine++;
      }
      // "-" lines and "\ No newline at end of file" don't advance the new file.
      hunk.lines.push(line);
    }
  }
  flush();
  return hunks;
}
