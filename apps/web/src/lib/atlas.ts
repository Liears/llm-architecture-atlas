/**
 * Build-time data loading for the static site (issues #8–#11).
 * Runs at astro build; no client-side data fetching.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { buildCatalog, type CatalogEntry } from "@atlas/catalog";
import type { EvidenceFile, ModelDocument } from "@atlas/architecture-ir";

// repo root injected by astro.config (vite define) — robust in build output
const root: string = typeof __ATLAS_ROOT__ === "string" ? __ATLAS_ROOT__ : resolve(process.cwd(), "../..");

export interface ModelData {
  slug: string;
  arch: ModelDocument;
  evidence: EvidenceFile;
}

export function loadModels(): ModelData[] {
  const modelsRoot = `${root}/models`;
  const out: ModelData[] = [];
  for (const org of readdirSync(modelsRoot)) {
    const orgDir = `${modelsRoot}/${org}`;
    if (!existsSync(orgDir) || !statSync(orgDir).isDirectory()) continue;
    for (const model of readdirSync(orgDir)) {
      const main = `${orgDir}/${model}/main`;
      if (!existsSync(`${main}/architecture.json`)) continue;
      const arch = JSON.parse(readFileSync(`${main}/architecture.json`, "utf8")) as ModelDocument;
      const evidence = JSON.parse(readFileSync(`${main}/evidence.json`, "utf8")) as EvidenceFile;
      const slug = arch.model.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push({ slug, arch, evidence });
    }
  }
  return out.sort((a, b) => a.arch.model.label.localeCompare(b.arch.model.label));
}

export function catalogEntries(models: ModelData[]): CatalogEntry[] {
  return buildCatalog(models.map((m) => m.arch));
}

export function evidenceRoot(): string {
  return root;
}
