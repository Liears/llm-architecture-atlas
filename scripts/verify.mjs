/**
 * One-command local verification (issue #23): works on Windows/Linux/macOS
 * from a clean clone. Usage: pnpm verify [--e2e]
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd}`);
    process.exit(r.status ?? 1);
  }
};

const venvPython = process.platform === "win32"
  ? "tools/ingest/.venv/Scripts/python.exe"
  : "tools/ingest/.venv/bin/python";

if (!existsSync(venvPython)) {
  run(`${process.platform === "win32" ? "python" : "python3"} -m venv tools/ingest/.venv`);
}
run(`"${venvPython}" -m pip install -q -U pip`);
run(`"${venvPython}" -m pip install -q -e "tools/ingest[dev]"`);

run("pnpm install --frozen-lockfile");
run("pnpm build");
run("pnpm typecheck");
run("pnpm test");
run(`"${venvPython}" -m pytest tools/ingest`);
run("pnpm export:golden");
// regenerate must be a clean no-op (deterministic pipeline)
const diff = spawnSync("git", ["diff", "--exit-code", "--stat", "tests/structural", "apps/web/public/figures"], { encoding: "utf8" });
if (diff.status !== 0) {
  console.error("Regenerated artifacts differ from committed ones:\n" + diff.stdout);
  process.exit(1);
}
console.log("clean diff: generated artifacts match committed ones");

if (process.argv.includes("--e2e")) {
  run("pnpm --filter @atlas/web test:e2e");
}
console.log("\nverify: ALL GREEN");
