/**
 * Debt check (issue #35, round 2): exits non-zero while any owned debt
 * finding exists (aspect, effective font, edge routing, text overflow, GLM
 * topology items). Baselines record and drift-guard these findings; this
 * check keeps them visibly red in CI so they cannot be greened by editing
 * JSON. It turns green only when the owning issues (#34/#36/#39) resolve
 * the debt.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EvidenceFile, ModelDocument } from "../packages/architecture-ir/src/types.ts";
import { computeGatesReport } from "./gates-report.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const modelsRoot = `${root}models`;

let debt = 0;
for (const org of readdirSync(modelsRoot)) {
  const orgDir = `${modelsRoot}/${org}`;
  if (!existsSync(orgDir) || !statSync(orgDir).isDirectory()) continue;
  for (const model of readdirSync(orgDir)) {
    const modelDir = `${orgDir}/${model}/main`;
    if (!existsSync(`${modelDir}/architecture.json`)) continue;
    const arch = JSON.parse(readFileSync(`${modelDir}/architecture.json`, "utf8")) as ModelDocument;
    const evidence = JSON.parse(readFileSync(`${modelDir}/evidence.json`, "utf8")) as EvidenceFile;
    const report = computeGatesReport(arch, evidence);
    for (const f of report.findings) {
      debt += 1;
      console.log(`[debt:${f.owner}] ${arch.model.id} [${f.gate}] ${f.target}: ${f.message}`);
    }
  }
}
if (debt > 0) {
  console.error(`\n${debt} owned debt finding(s) remain red by design; resolve via the owning issues (#34/#36/#39) or delete this check in a reviewed change.`);
  process.exit(1);
}
console.log("no debt findings — this check may now be retired in a reviewed change.");
