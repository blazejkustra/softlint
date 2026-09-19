// Bundles the action and the CLI into dist/ (committed, because GitHub Actions run dist/ directly).
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  legalComments: "none",
  // Some dependencies still call require(); give the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
};

await build({ ...shared, entryPoints: ["src/action.ts"], outfile: "dist/index.js" });
await build({ ...shared, entryPoints: ["src/cli.ts"], outfile: "dist/cli.js", banner: { js: "#!/usr/bin/env node\n" + shared.banner.js } });
