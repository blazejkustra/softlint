export type Hunk = {
  file: string;
  /** Line number (in the new file) of the first non-blank added line. */
  line: number;
  /** The piece of the diff Jev judges: the `@@` header, then context, `-` and `+` lines. */
  text: string;
  /** Every non-blank added line with its line number in the new file, so a finding can point at the exact line. */
  added: { line: number; text: string }[];
};

// Generated or binary files are never worth a review comment.
const SKIP = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum)$|\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|min\.js|map|snap)$|(^|\/)dist\//;

type Line = { raw: string; newLine?: number };

/**
 * Splits a unified diff (`git diff` or GitHub's `application/vnd.github.diff`) into small pieces that
 * add code. Git merges nearby changes into one hunk, so a hunk can hold a harmless change right next
 * to a rule violation; each hunk is further split at top-level boundaries (a blank line followed by
 * an unindented line, i.e. the next function, route or statement), so each piece is judged on its own.
 * Pieces that only delete lines are dropped: there is no added line to comment on.
 */
export function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let file = "";
  let header = "";
  let lines: Line[] | undefined;
  let newLine = 0;

  const flush = () => {
    if (lines && !SKIP.test(file)) hunks.push(...split(file, header, lines));
    lines = undefined;
  };

  let previous = "";
  for (const raw of diff.split(/\r?\n/)) {
    const isFileHeader = raw.startsWith("+++ ") && previous.startsWith("--- ");
    previous = raw;
    if (raw.startsWith("diff --git ")) {
      flush();
      file = "";
    } else if (isFileHeader) {
      const path = raw.slice(4).trim();
      file = path === "/dev/null" ? "" : path.replace(/^b\//, "");
    } else if (raw.startsWith("@@")) {
      flush();
      header = raw;
      newLine = Number(raw.match(/\+(\d+)/)?.[1] ?? 1);
      if (file) lines = [];
    } else if (lines) {
      // "-" lines and "\ No newline at end of file" don't exist in the new file.
      const inNewFile = raw.startsWith("+") || raw.startsWith(" ") || raw === "";
      lines.push({ raw, newLine: inNewFile ? newLine++ : undefined });
    }
  }
  flush();
  return hunks;
}

function split(file: string, header: string, lines: Line[]): Hunk[] {
  while (lines.at(-1)?.raw === "") lines.pop();
  const pieces: Line[][] = [[]];
  lines.forEach((line, i) => {
    const code = line.raw.slice(1);
    const previousBlank = i > 0 && lines[i - 1].raw.slice(1).trim() === "";
    const topLevel = line.newLine !== undefined && /^[^\s})\]]/.test(code);
    if (previousBlank && topLevel && pieces.at(-1)!.length) pieces.push([]);
    pieces.at(-1)!.push(line);
  });

  return pieces.flatMap((piece) => {
    // Blank lines are never what a comment should point at, and a piece of only blank lines isn't worth judging.
    const added = piece.filter((l) => l.raw.startsWith("+") && l.raw.slice(1).trim()).map((l) => ({ line: l.newLine!, text: l.raw.slice(1) }));
    if (!added.length) return [];
    return [{ file, line: added[0].line, text: [header, ...piece.map((l) => l.raw)].join("\n"), added }];
  });
}
