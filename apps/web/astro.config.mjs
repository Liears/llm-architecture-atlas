import { defineConfig } from "astro/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Static-first catalog: pages are prerendered, islands hydrate on demand.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  site: "https://liears.github.io",
  base: "/llm-architecture-atlas",
  vite: {
    define: {
      __ATLAS_ROOT__: JSON.stringify(repoRoot),
    },
  },
});
