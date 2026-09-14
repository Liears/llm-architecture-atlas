import { defineConfig } from "astro/config";

// Static-first catalog: pages are prerendered, islands hydrate on demand.
export default defineConfig({
  site: "https://liears.github.io",
  base: "/llm-architecture-atlas",
});
