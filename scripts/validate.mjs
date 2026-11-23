import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  { name: "lint", cmd: "npm", args: ["run", "lint"], cwd: root },
  { name: "typecheck", cmd: "npm", args: ["run", "typecheck"], cwd: root },
  { name: "test", cmd: "npm", args: ["test"], cwd: root },
  { name: "build", cmd: "npm", args: ["run", "build"], cwd: root },
  { name: "cargo test", cmd: "cargo", args: ["test"], cwd: path.join(root, "src-tauri") },
  { name: "cargo check", cmd: "cargo", args: ["check"], cwd: path.join(root, "src-tauri") },
];

let failed = false;
for (const step of steps) {
  console.log(`\n==> ${step.name}`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: step.cwd,
  });
  if (result.status !== 0) {
    console.error(`\n[FAIL] ${step.name}`);
    failed = true;
    break;
  }
}

if (failed) process.exit(1);
console.log("\n[OK] validação concluída");
