import { createHash } from "node:crypto";
import { commentBody, type Finding } from "./review.js";

/** Minimal GitHub REST client: just the four calls softlint needs, over plain fetch. */
export class GitHub {
  constructor(
    private token: string,
    private repo: string, // "owner/name"
    private api = "https://api.github.com",
  ) {}

  private async request(path: string, init: RequestInit & { accept?: string } = {}) {
    const res = await fetch(`${this.api}/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: init.accept ?? "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
    });
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status} on ${path}: ${await res.text()}`), { status: res.status });
    return res;
  }

  async pullRequestDiff(pr: number): Promise<string> {
    return (await this.request(`/pulls/${pr}`, { accept: "application/vnd.github.diff" })).text();
  }

  /** A file's contents at a ref, or undefined if it doesn't exist there. */
  async fileAt(path: string, ref: string): Promise<string | undefined> {
    try {
      const res = await this.request(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, {
        accept: "application/vnd.github.raw+json",
      });
      return await res.text();
    } catch (error) {
      if ((error as { status?: number }).status === 404) return undefined;
      throw error;
    }
  }

  /** Markers of the softlint comments already on this PR, so re-runs don't repeat themselves. */
  async existingMarkers(pr: number): Promise<Set<string>> {
    const markers = new Set<string>();
    for (let page = 1; ; page++) {
      const comments = (await (await this.request(`/pulls/${pr}/comments?per_page=100&page=${page}`)).json()) as { body: string }[];
      for (const c of comments) for (const m of c.body.matchAll(/<!-- softlint:(\w+) -->/g)) markers.add(m[1]);
      if (comments.length < 100) return markers;
    }
  }

  /** Posts one review with an inline comment per finding. */
  async postReview(pr: number, commitId: string, findings: Finding[]) {
    await this.request(`/pulls/${pr}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        commit_id: commitId,
        event: "COMMENT",
        body: `**softlint** found ${findings.length} change${findings.length === 1 ? "" : "s"} that likely break${findings.length === 1 ? "s" : ""} a rule in \`softlint.json\`.`,
        comments: findings.map((f) => ({
          path: f.hunk.file,
          line: f.line,
          side: "RIGHT",
          body: `${commentBody(f)}\n<!-- softlint:${marker(f)} -->`,
        })),
      }),
    });
  }
}

/**
 * Stable id for "this rule on this change", used to skip duplicates on re-runs. Keyed on the added
 * code rather than the line number, so it survives new commits that shift lines around.
 */
export function marker(f: Finding): string {
  const added = f.hunk.text.split("\n").filter((l) => l.startsWith("+")).join("\n");
  return createHash("sha256").update(`${f.hunk.file}\0${f.rule.text}\0${added}`).digest("hex").slice(0, 16);
}
