// Starts the App harness, runs the test file given as an argument, stops the
// harness. One command, so the vite server cannot be left running or missing.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const testFile = process.argv[2];
if (!testFile) { console.error("usage: node test/harness/run-app-harness.mjs <test.e2e.mjs>"); process.exit(2); }

const vite = spawn("npx", ["vite", "--config", path.join(here, "app.vite.config.mjs")],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let viteLog = "";
vite.stdout.on("data", d => { viteLog += d; });
vite.stderr.on("data", d => { viteLog += d; });

const up = async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch("http://127.0.0.1:4600/app.html"); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

if (!await up()) {
  console.error("harness did not start:\n" + viteLog);
  vite.kill("SIGKILL");
  process.exit(1);
}

const test = spawn("node", [testFile], { cwd: root, stdio: "inherit" });
const code = await new Promise(res => test.on("exit", res));
vite.kill("SIGKILL");
process.exit(code ?? 1);
