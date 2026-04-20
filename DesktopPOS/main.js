const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");

function appendEarlyCrashLog(message) {
  try {
    const p = path.join(process.env.TEMP || "C:\\Windows\\Temp", "desktoppos-main-crash.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${String(message)}\n`, "utf8");
  } catch {
    // ignore
  }
}

process.on("uncaughtException", (err) => {
  appendEarlyCrashLog(`uncaughtException: ${err?.stack || err?.message || String(err)}`);
});

process.on("unhandledRejection", (reason) => {
  appendEarlyCrashLog(`unhandledRejection: ${String(reason)}`);
});

const isDev = !app.isPackaged;
const DEV_URL = process.env.DESKTOP_POS_DEV_URL || "http://127.0.0.1:3010";
const BACKEND_PORT = process.env.DESKTOP_POS_BACKEND_PORT || "3313";
let backendProc = null;

const userDataRoot = path.join(app.getPath("appData"), "DesktopPOSStandalone");
const cacheRoot = path.join(app.getPath("temp"), "DesktopPOSStandaloneCache");
try {
  fs.mkdirSync(userDataRoot, { recursive: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  app.setPath("userData", userDataRoot);
  app.commandLine.appendSwitch("disk-cache-dir", cacheRoot);
} catch {
  // Keep defaults if filesystem is restricted.
}

function resolveFrontendDist() {
  const distPath = path.resolve(__dirname, "./frontend/dist/index.html");
  if (fs.existsSync(distPath)) return distPath;
  return null;
}

function resolveBackendEntry() {
  const entry = path.resolve(__dirname, "./backend/dist/index.js");
  return fs.existsSync(entry) ? entry : null;
}

function parseEnvFile(envPath) {
  const out = {};
  try {
    if (!fs.existsSync(envPath)) return out;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of String(raw || "").split(/\r?\n/)) {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!key) continue;
      out[key] = value;
    }
  } catch {
    // ignore malformed env file
  }
  return out;
}

function waitForBackendPort(port, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = new net.Socket();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { socket.destroy(); } catch {}
        resolve(ok);
      };
      socket.setTimeout(1200);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.connect(Number(port), "127.0.0.1");
    };
    const loop = () => {
      tryConnect().then((ok) => {
        if (ok) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(loop, 500);
      });
    };
    loop();
  });
}

function tryRunBootstrapScript(scriptPath, args = []) {
  if (!fs.existsSync(scriptPath)) return true;
  let child = null;
  try {
    // In packaged mode, __dirname may resolve inside app.asar.
    // Use a real filesystem directory as cwd to avoid ENOENT on spawn.
    child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.resourcesPath || path.dirname(process.execPath),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: "ignore",
      windowsHide: true,
      detached: false,
    });
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function runPendingBootstrapIfNeeded() {
  if (isDev) return;
  try {
    const backendRoot = path.resolve(__dirname, "./backend");
    const pendingPath = path.join(backendRoot, "pending-bootstrap.json");
    if (!fs.existsSync(pendingPath)) return;
    const raw = fs.readFileSync(pendingPath, "utf8");
    const cfg = JSON.parse(raw || "{}");
    const scriptsRoot = path.join(backendRoot, "dist", "scripts");
    const okInit = await tryRunBootstrapScript(path.join(scriptsRoot, "initDeploymentDb.js"));
    const okSettings = await tryRunBootstrapScript(path.join(scriptsRoot, "configureInitialSettings.js"), [
      "--companyType",
      String(cfg?.companyType || "RESTAURANT_CAFE"),
    ]);
    const okAdmin = await tryRunBootstrapScript(path.join(scriptsRoot, "configureInitialAdmin.js"), [
      "--adminName",
      String(cfg?.adminName || "Admin"),
      "--adminPin",
      String(cfg?.adminPin || "1234"),
    ]);
    if (okInit && okSettings && okAdmin) {
      fs.unlinkSync(pendingPath);
    }
  } catch {
    // keep pending file for next launch
  }
}

async function startBundledBackendIfNeeded() {
  if (isDev) return true;
  const backendEntry = resolveBackendEntry();
  if (!backendEntry) return false;
  const installedEnvPath = path.join(path.dirname(process.execPath), "backend", ".env");
  const installedEnv = parseEnvFile(installedEnvPath);
  const backendPort = String(installedEnv.PORT || BACKEND_PORT);
  try {
    backendProc = spawn(process.execPath, [backendEntry], {
      cwd: process.resourcesPath || path.dirname(process.execPath),
      env: {
        ...process.env,
        ...installedEnv,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: backendPort,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: false,
    });
  } catch {
    backendProc = null;
    return false;
  }
  try {
    const logPath = path.join(app.getPath("userData"), "backend-runtime.log");
    const stream = fs.createWriteStream(logPath, { flags: "a" });
    if (backendProc.stdout) backendProc.stdout.on("data", (chunk) => stream.write(chunk));
    if (backendProc.stderr) backendProc.stderr.on("data", (chunk) => stream.write(chunk));
    backendProc.on("exit", () => stream.end());
  } catch {
    // no-op if log stream cannot be opened
  }
  backendProc.on("exit", () => {
    backendProc = null;
  });
  return waitForBackendPort(backendPort, 18000);
}

function createMainWindow(backendReady = true) {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    fullscreen: true,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    return;
  }

  if (!backendReady) {
    const diagPath = path.join(app.getPath("userData"), "backend-runtime.log").replace(/\\/g, "/");
    const html = `data:text/html;charset=UTF-8,${encodeURIComponent(`
      <html><body style="margin:0;background:#0b1736;color:#e2e8f0;font-family:Segoe UI,Arial,sans-serif;">
      <div style="max-width:920px;margin:64px auto;padding:28px;border:1px solid #334155;border-radius:12px;background:#0f1e45">
        <h2 style="margin:0 0 10px 0">Backend KO au lancement</h2>
        <p style="margin:0 0 12px 0">DesktopPOS n'a pas pu demarrer le backend local. Verifie PostgreSQL et la configuration DB.</p>
        <ul style="line-height:1.7">
          <li>Service PostgreSQL demarre</li>
          <li>Fichier .env present dans backend</li>
          <li>Port backend libre (${String(BACKEND_PORT)})</li>
          <li>Log backend: ${diagPath}</li>
        </ul>
      </div></body></html>
    `)}`;
    win.loadURL(html);
    return;
  }

  const indexFile = resolveFrontendDist();
  if (indexFile) {
    win.loadFile(indexFile);
    return;
  }

  win.loadURL("data:text/html;charset=UTF-8,<h2>Build Frontend introuvable</h2><p>Executer npm run build dans DesktopPOS.</p>");
}

app.whenReady().then(() => {
  runPendingBootstrapIfNeeded()
    .catch(() => undefined)
    .then(() => startBundledBackendIfNeeded())
    .then((backendReady) => {
      globalShortcut.register("F12", () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return;
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: "detach" });
      });
      globalShortcut.register("CommandOrControl+Shift+I", () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return;
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: "detach" });
      });
      createMainWindow(Boolean(backendReady));
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow(Boolean(backendReady));
      });
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (backendProc && !backendProc.killed) {
    backendProc.kill();
  }
  globalShortcut.unregisterAll();
});
