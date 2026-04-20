const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceFrontend = path.resolve(root, "..", "Frontend");
const sourceBackend = path.resolve(root, "..", "Backend");
const targetFrontend = path.resolve(root, "frontend");
const targetBackend = path.resolve(root, "backend");

function ensureExists(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`${label} introuvable: ${p}`);
  }
}

function copyDir(src, dst, ignore = []) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, {
    recursive: true,
    force: true,
    filter: (sourcePath) => {
      const normalized = sourcePath.replace(/\\/g, "/");
      if (ignore.some((frag) => normalized.includes(frag))) return false;
      return true;
    },
  });
}

function writeFrontendEnv() {
  const envPath = path.resolve(targetFrontend, ".env.local");
  fs.writeFileSync(envPath, "VITE_API_URL=http://127.0.0.1:3313\n", "utf8");
}

function run() {
  ensureExists(sourceFrontend, "Source Frontend");
  ensureExists(sourceBackend, "Source Backend");

  copyDir(sourceFrontend, targetFrontend, [
    "/node_modules/",
    "/dist/",
    "/.git/",
    "/.next/",
  ]);
  copyDir(sourceBackend, targetBackend, [
    "/node_modules/",
    "/dist/",
    "/.git/",
    "/tmp/",
  ]);

  writeFrontendEnv();
  console.log("[DesktopPOS] Snapshot standalone prêt (frontend + backend).");
}

run();
