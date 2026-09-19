/** Minimal GitHub REST client: just the two reads softlint needs, over plain fetch. */
export class GitHub {
  constructor(
    private token: string,
    private repo: string, // "owner/name"
    private api = "https://api.github.com",
  ) {}

  private async get(path: string, accept: string) {
    const res = await fetch(`${this.api}/repos/${this.repo}${path}`, {
      headers: { authorization: `Bearer ${this.token}`, accept, "x-github-api-version": "2022-11-28" },
    });
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status} on ${path}: ${await res.text()}`), { status: res.status });
    return res.text();
  }

  pullRequestDiff(pr: number): Promise<string> {
    return this.get(`/pulls/${pr}`, "application/vnd.github.diff");
  }

  /** A file's contents at a ref, or undefined if it doesn't exist there. */
  async fileAt(path: string, ref: string): Promise<string | undefined> {
    try {
      return await this.get(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, "application/vnd.github.raw+json");
    } catch (error) {
      if ((error as { status?: number }).status === 404) return undefined;
      throw error;
    }
  }
}
