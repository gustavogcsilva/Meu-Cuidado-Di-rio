import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typeScriptCli = path.join(frontendDirectory, "node_modules", "typescript", "bin", "tsc");
const viteCli = path.join(frontendDirectory, "node_modules", "vite", "bin", "vite.js");

function run(cli, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(typeScriptCli, ["-b"]);
run(viteCli, ["build"]);
