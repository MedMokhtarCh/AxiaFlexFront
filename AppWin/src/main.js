const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const os = require("node:os");

let mainWindow = null;
let agentProcess = null;
let agentLogs = [];
let currentConfig = null;
let desktopBridgeServer = null;
const APP_BRAND = "AxiaPrinters";
const AGENT_TASK_NAME = "AxiaPrintersPrintAgent";
const BRIDGE_TASK_NAME = "AxiaPrintersDesktopBridgeAutostart";
const AGENT_HOME_DIR = "AppWinAgent";

function getConfigPath() {
  return path.join(app.getPath("userData"), "agent-config.json");
}

function getDefaultConfig() {
  return {
    cloudApiUrl: "https://axiaflex-backend.onrender.com",
    agentMasterToken: "",
    terminalAlias: "TERMINAL-1",
    siteName: "SITE-A",
    pollMs: 3000,
    desktopBridge: {
      exePath: "",
      installerPath: "",
      args: "",
      healthUrl: "http://127.0.0.1:17888/health",
      taskName: BRIDGE_TASK_NAME,
      localServerEnabled: true,
      localServerPort: 17888,
      localServerToken: "",
    },
  };
}

function loadConfig() {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return getDefaultConfig();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return { ...getDefaultConfig(), ...parsed };
  } catch {
    return getDefaultConfig();
  }
}

function saveConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf8");
}

function pushLog(line) {
  const entry = `[${new Date().toLocaleString()}] ${line}`;
  agentLogs.push(entry);
  if (agentLogs.length > 500) agentLogs = agentLogs.slice(-500);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent-log", entry);
  }
}

function resolveAgentPath() {
  const candidates = [
    path.resolve(__dirname, "agent-worker.js"),
    path.resolve(process.resourcesPath || "", "agent", "agent-worker.js"),
  ];
  return findFirstExistingPath(candidates);
}

function findFirstExistingPath(candidates) {
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function resolvePsScript(name) {
  const candidates = [
    path.resolve(process.resourcesPath || "", "agent", name),
    path.resolve(process.cwd(), "resources", "agent", name),
  ];
  return findFirstExistingPath(candidates);
}

function resolveNodeExe() {
  const candidates = [];
  if (!app.isPackaged && process.execPath) {
    candidates.push(process.execPath);
  }
  if (process.env.ProgramFiles) {
    candidates.push(path.join(process.env.ProgramFiles, "nodejs", "node.exe"));
  }
  if (process.env["ProgramFiles(x86)"]) {
    candidates.push(path.join(process.env["ProgramFiles(x86)"], "nodejs", "node.exe"));
  }
  candidates.push("node.exe");
  candidates.push("node");
  return candidates.find((p) => {
    try {
      return Boolean(p) && (p === "node" || p === "node.exe" || fs.existsSync(p));
    } catch {
      return false;
    }
  });
}

/** PowerShell 64 bits explicite (évite SysWOW64 si Electron est 32 bits). */
function getPowershellExe() {
  const root = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  const sys32 = path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    if (fs.existsSync(sys32)) return sys32;
  } catch {}
  return "powershell.exe";
}

/** Chaîne entre quotes simples PowerShell ('' pour un apostrophe). */
function escapePsSingle(s) {
  return String(s).replace(/'/g, "''");
}

/**
 * Exécute un .ps1 avec élévation UAC (le process enfant d'Electron n'est souvent pas admin).
 * flatArgs: ['-Cle', 'valeur', '-Cle2', 'valeur2', ...]
 */
function runPowershellScriptElevated(scriptPath, flatArgs = [], options = {}) {
  const { streamLog = true } = options;
  const psExe = getPowershellExe();
  const transcriptPath = path.join(
    os.tmpdir(),
    `axiaflex-elevated-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.log`,
  );
  let inv = `& '${escapePsSingle(scriptPath)}'`;
  for (let i = 0; i < flatArgs.length; i += 2) {
    const key = flatArgs[i];
    const val = flatArgs[i + 1];
    inv += ` ${key} '${escapePsSingle(val)}'`;
  }
  const errPath = `${transcriptPath}.err.txt`;
  const wrapperContent = [
    "$ErrorActionPreference = 'Stop'",
    `$transcript = '${escapePsSingle(transcriptPath)}'`,
    `$errFile = '${escapePsSingle(errPath)}'`,
    "try {",
    "  Start-Transcript -Path $transcript -Force | Out-Null",
    `  ${inv}`,
    "} catch {",
    "  try { Stop-Transcript } catch {}",
    "  try { $_ | Out-File -FilePath $errFile -Encoding utf8 } catch {}",
    "  exit 1",
    "} finally {",
    "  try { Stop-Transcript } catch {}",
    "}",
    "exit 0",
  ].join("\r\n");

  const wrapperPath = path.join(
    os.tmpdir(),
    `axiaflex-wrap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.ps1`,
  );
  fs.writeFileSync(wrapperPath, wrapperContent, "utf8");

  const launcherContent = [
    `$wp = '${escapePsSingle(wrapperPath)}'`,
    `$ps = '${escapePsSingle(psExe)}'`,
    "$p = Start-Process -FilePath $ps -Verb RunAs -ArgumentList @(",
    "  '-NoProfile',",
    "  '-ExecutionPolicy', 'Bypass',",
    "  '-File', $wp",
    ") -PassThru -Wait",
    'Write-Output "APPWIN_EXITCODE=$($p.ExitCode)"',
    "exit $p.ExitCode",
  ].join("\r\n");

  const launcherPath = path.join(
    os.tmpdir(),
    `axiaflex-launch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.ps1`,
  );
  fs.writeFileSync(launcherPath, launcherContent, "utf8");

  pushLog(
    "Élévation requise : une fenêtre « Contrôle de compte d’utilisateur » (UAC) doit s’ouvrir. Acceptez pour installer le service.",
  );

  return new Promise((resolve) => {
    const proc = spawn(psExe, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcherPath], {
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      const s = String(d || "");
      stdout += s;
      if (streamLog) {
        s.split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((line) => pushLog(line));
      }
    });
    proc.stderr.on("data", (d) => {
      const s = String(d || "");
      stderr += s;
      if (streamLog) {
        s.split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((line) => pushLog(`PS-ERR: ${line}`));
      }
    });
    proc.on("close", (code) => {
      const errPath = `${transcriptPath}.err.txt`;
      try {
        if (fs.existsSync(transcriptPath)) {
          const logContent = fs.readFileSync(transcriptPath, "utf8");
          logContent
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .forEach((line) => pushLog(`[service] ${line}`));
          fs.unlinkSync(transcriptPath);
        }
        if (fs.existsSync(errPath)) {
          const errContent = fs.readFileSync(errPath, "utf8");
          errContent
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .forEach((line) => pushLog(`[service-err] ${line}`));
          fs.unlinkSync(errPath);
        }
      } catch {}
      try {
        fs.unlinkSync(wrapperPath);
      } catch {}
      try {
        fs.unlinkSync(launcherPath);
      } catch {}
      const m = stdout.match(/APPWIN_EXITCODE=(\d+)/);
      const innerCode = m ? Number.parseInt(m[1], 10) : code;
      const ok = innerCode === 0;
      resolve({ ok, code: innerCode, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function runPowershellScript(scriptPath, args = [], options = {}) {
  const { streamLog = false } = options;
  return new Promise((resolve) => {
    const psArgs = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...args,
    ];
    const proc = spawn(getPowershellExe(), psArgs, {
      windowsHide: true,
      cwd: path.dirname(scriptPath),
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      const s = String(d || "");
      stdout += s;
      if (streamLog) {
        s.split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((line) => pushLog(line));
      }
    });
    proc.stderr.on("data", (d) => {
      const s = String(d || "");
      stderr += s;
      if (streamLog) {
        s.split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((line) => pushLog(`PS-ERR: ${line}`));
      }
    });
    proc.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function runPowershellCommand(command) {
  return new Promise((resolve) => {
    const proc = spawn(
      getPowershellExe(),
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += String(d || "");
    });
    proc.stderr.on("data", (d) => {
      stderr += String(d || "");
    });
    proc.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function parseScheduledTaskList(rawText, taskName = AGENT_TASK_NAME) {
  const text = String(rawText || "");
  if (!text.trim()) return null;
  const hasTask =
    new RegExp(`Nom de la t[âa]che:\\s*\\\\?${taskName}`, "i").test(text) ||
    new RegExp(`TaskName:\\s*\\\\?${taskName}`, "i").test(text);
  if (!hasTask) return { mode: "task", installed: false };
  const stateMatch =
    text.match(/Statut:\s*(.+)/i) || text.match(/Status:\s*(.+)/i);
  const codeMatch =
    text.match(/Dernier r[ée]sultat:\s*(-?\d+)/i) ||
    text.match(/Last Result:\s*(-?\d+)/i);
  return {
    mode: "task",
    installed: true,
    taskName,
    state: stateMatch ? String(stateMatch[1] || "").trim() : null,
    lastRunTime: null,
    lastTaskResult: codeMatch ? Number.parseInt(codeMatch[1], 10) : null,
  };
}

function normalizeDesktopBridgeConfig(cfg) {
  const base = (getDefaultConfig().desktopBridge || {});
  const raw = cfg?.desktopBridge || {};
  return {
    exePath: String(raw.exePath || base.exePath || "").trim(),
    installerPath: String(raw.installerPath || base.installerPath || "").trim(),
    args: String(raw.args || base.args || "").trim(),
    healthUrl: String(raw.healthUrl || base.healthUrl || "http://127.0.0.1:17888/health").trim(),
    taskName: String(raw.taskName || base.taskName || BRIDGE_TASK_NAME).trim(),
    localServerEnabled:
      raw.localServerEnabled !== undefined
        ? Boolean(raw.localServerEnabled)
        : Boolean(base.localServerEnabled ?? true),
    localServerPort: Math.max(
      1024,
      Math.min(65535, Number(raw.localServerPort || base.localServerPort || 17888)),
    ),
    localServerToken: String(raw.localServerToken || base.localServerToken || "").trim(),
  };
}

function buildPrintableTextFromBridgePayload(payload = {}) {
  const kind = String(payload?.kind || "").toLowerCase();
  const rendered = String(payload?.renderedText || "").trim();
  if (rendered) return rendered;
  const lines = [];
  if (kind === "client") {
    lines.push("TICKET CLIENT");
    const order = payload?.order || {};
    const ticket = payload?.ticket || {};
    if (order?.ticketNumber) lines.push(`Commande ${order.ticketNumber}`);
    if (ticket?.code) lines.push(`Ticket ${ticket.code}`);
    if (order?.tableNumber) lines.push(`Table: ${order.tableNumber}`);
    if (order?.serverName) lines.push(`Serveur: ${order.serverName}`);
    lines.push("------------------------------");
    const items = Array.isArray(payload?.items) ? payload.items : [];
    items.forEach((it) =>
      lines.push(
        `${String(it?.name || "Article")} x${Number(it?.quantity || 0)} = ${Number(
          it?.total || 0,
        ).toFixed(3)}`,
      ),
    );
    if (ticket?.total != null) lines.push(`TOTAL: ${Number(ticket.total).toFixed(3)}`);
    lines.push("");
    return lines.join("\n");
  }
  lines.push(kind === "production" ? "BON PRODUCTION" : "PRINT JOB");
  lines.push("------------------------------");
  const items = Array.isArray(payload?.items) ? payload.items : [];
  items.forEach((it) =>
    lines.push(`${String(it?.name || "Article")} x${Number(it?.quantity || 0)}`),
  );
  lines.push("");
  return lines.join("\n");
}

async function printRawTextByPowerShell(printerName, text) {
  const requested = String(printerName || "").trim();
  const tmpPath = path.join(os.tmpdir(), `axiaflex-bridge-${Date.now()}.txt`);
  fs.writeFileSync(tmpPath, String(text || ""), "utf8");
  try {
    const safeRequested = requested.replaceAll("'", "''");
    const safePath = String(tmpPath).replaceAll("'", "''");
    const cmd =
      `$ErrorActionPreference='Stop'; $requested='${safeRequested}'; $path='${safePath}'; ` +
      "$all=@(); try { $all = Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name } catch {}; " +
      "$target = $null; " +
      "if ($all -and $requested) { $target = $all | Where-Object { $_ -eq $requested } | Select-Object -First 1 }; " +
      "if (-not $target -and $all -and $requested) { $target = $all | Where-Object { $_ -like ('*' + $requested + '*') -or $requested -like ('*' + $_ + '*') } | Select-Object -First 1 }; " +
      "if (-not $target) { try { $target = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name) } catch {} }; " +
      "if (-not $target) { throw ('Printer introuvable: ' + $requested) }; " +
      "Get-Content -LiteralPath $path | Out-Printer -Name $target; " +
      "Write-Output ('USED_PRINTER=' + $target)";
    const out = await runPowershellCommand(cmd);
    if (!out.ok) throw new Error(out.stderr || out.stdout || "print failed");
    const m = String(out.stdout || "").match(/USED_PRINTER=(.+)/);
    const used = m ? String(m[1] || "").trim() : "";
    if (used && used.toLowerCase() !== requested.toLowerCase()) {
      pushLog(`[bridge] Printer mapping: requested="${requested}" -> used="${used}"`);
    }
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

function resolveWindowsPrinterNameByPowerShell(printerName) {
  return new Promise((resolve, reject) => {
    const requested = String(printerName || "").trim().replaceAll("'", "''");
    const cmd =
      `$ErrorActionPreference='Stop'; $requested='${requested}'; ` +
      "$all=@(); try { $all = Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name } catch {}; " +
      "$target=$null; " +
      "if ($all -and $requested) { $target = $all | Where-Object { $_ -eq $requested } | Select-Object -First 1 }; " +
      "if (-not $target -and $all -and $requested) { $target = $all | Where-Object { $_ -like ('*' + $requested + '*') -or $requested -like ('*' + $_ + '*') } | Select-Object -First 1 }; " +
      "if (-not $target) { try { $target = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name) } catch {} }; " +
      "if (-not $target) { throw ('Printer introuvable: ' + $requested) }; " +
      "Write-Output ('USED_PRINTER=' + $target)";
    runPowershellCommand(cmd).then((out) => {
      if (!out.ok) return reject(new Error(out.stderr || out.stdout || "printer resolve failed"));
      const m = String(out.stdout || "").match(/USED_PRINTER=(.+)/);
      const used = m ? String(m[1] || "").trim() : "";
      if (!used) return reject(new Error("Printer resolve empty"));
      resolve(used);
    }).catch(reject);
  });
}

async function printHtmlByPowerShell(printerName, html) {
  const usedPrinter = await resolveWindowsPrinterNameByPowerShell(printerName);
  let tmpDir = os.tmpdir();
  try {
    tmpDir = fs.realpathSync(tmpDir);
  } catch {}
  const htmlPath = path.join(tmpDir, `axiaflex-bridge-${Date.now()}.html`);
  const pdfPath = path.join(tmpDir, `axiaflex-bridge-${Date.now()}.pdf`);
  const normalizeThermalHtml = (rawHtml, paperWidthMm = 80) => {
    const width = Number(paperWidthMm || 80);
    const contentWidth = Math.max(42, width - 6);
    const src = String(rawHtml || "");
    const thermalHead = [
      "<meta charset='utf-8'/>",
      "<style>",
      `@page { size: ${width}mm auto; margin: 0; }`,
      "html, body { margin:0 !important; padding:0 !important; }",
      "body { width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
      `.thermal-root { box-sizing: border-box; width: ${contentWidth}mm; margin: 0 auto; padding: 2mm 0; }`,
      "img { max-width: 100% !important; height: auto !important; }",
      "pre { white-space: pre-wrap !important; word-break: break-word; }",
      "* { box-sizing: border-box; }",
      "</style>",
    ].join("");
    if (/<\s*html/i.test(src)) {
      return src
        .replace(/<\s*head[^>]*>/i, (m) => `${m}${thermalHead}`)
        .replace(/<\s*body([^>]*)>/i, "<body$1><div class='thermal-root'>")
        .replace(/<\s*\/body\s*>/i, "</div></body>");
    }
    return `<html><head>${thermalHead}</head><body><div class='thermal-root'>${src}</div></body></html>`;
  };
  const preparedHtml = normalizeThermalHtml(html, 80);
  fs.writeFileSync(htmlPath, preparedHtml, "utf8");
  try {
    const candidates = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
    const browserPath = candidates.find((p) => {
      try { return fs.existsSync(p); } catch { return false; }
    });
    if (!browserPath) throw new Error("Edge/Chrome introuvable pour rendu HTML");
    await new Promise((resolve, reject) => {
      const proc = spawn(browserPath, [
        "--headless",
        "--disable-gpu",
        "--print-to-pdf-no-header",
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).toString(),
      ], { windowsHide: true });
      let stderr = "";
      proc.stderr.on("data", (d) => {
        stderr += String(d || "");
      });
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`render html->pdf failed (${code}) ${stderr}`));
          return;
        }
        resolve();
      });
      proc.on("error", reject);
    });
    let pdfOk = false;
    try {
      const st = fs.statSync(pdfPath);
      pdfOk = st.isFile() && Number(st.size || 0) > 0;
    } catch {
      pdfOk = false;
    }
    if (!pdfOk) {
      throw new Error(`PDF render output missing: ${pdfPath}`);
    }
    const safePdf = String(pdfPath).replaceAll("'", "''");
    const safePrinter = String(usedPrinter).replaceAll("'", "''");
    const out = await runPowershellCommand(
      `$ErrorActionPreference='Stop'; Start-Process -FilePath '${safePdf}' -Verb PrintTo -ArgumentList '${safePrinter}' -WindowStyle Hidden`,
    );
    if (!out.ok) throw new Error(out.stderr || out.stdout || "print pdf failed");
  } finally {
    try { fs.unlinkSync(htmlPath); } catch {}
    try { fs.unlinkSync(pdfPath); } catch {}
  }
}

function startDesktopBridgeServerFromConfig(config) {
  const cfg = normalizeDesktopBridgeConfig(config || {});
  if (!cfg.localServerEnabled) return { ok: true, running: false };
  const desiredPort = Number(cfg.localServerPort || 17888);
  if (desktopBridgeServer && desktopBridgeServer.listening) {
    const currentPort = Number(desktopBridgeServer.address()?.port || 0);
    if (currentPort === desiredPort) return { ok: true, running: true, port: currentPort };
    try { desktopBridgeServer.close(); } catch {}
    desktopBridgeServer = null;
  }
  desktopBridgeServer = http.createServer(async (req, res) => {
    try {
      const url = String(req.url || "").split("?")[0];
      if (req.method === "GET" && (url === "/health" || url === "/ping" || url === "/")) {
        const body = JSON.stringify({ ok: true, service: "appwin-desktop-bridge" });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(body);
        return;
      }
      if (req.method === "POST" && url === "/print") {
        if (cfg.localServerToken) {
          const auth = String(req.headers.authorization || "");
          const wanted = `Bearer ${cfg.localServerToken}`;
          if (auth !== wanted) {
            res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
          }
        }
        let raw = "";
        req.on("data", (chunk) => {
          raw += String(chunk || "");
          if (raw.length > 2_000_000) req.destroy();
        });
        req.on("end", async () => {
          try {
            const payload = raw ? JSON.parse(raw) : {};
            const printerName = String(payload?.printerName || "").trim();
            const text = buildPrintableTextFromBridgePayload(payload);
            if (!printerName) {
              res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ error: "Missing printerName" }));
              return;
            }
            const renderedHtml = String(payload?.renderedHtml || "").trim();
            if (renderedHtml) {
              try {
                await printHtmlByPowerShell(printerName, renderedHtml);
              } catch (htmlErr) {
                pushLog(`[bridge] HTML render failed, fallback text: ${String(htmlErr?.message || htmlErr)}`);
                await printRawTextByPowerShell(printerName, text);
              }
            } else {
              await printRawTextByPowerShell(printerName, text);
            }
            pushLog(`[bridge] PRINT OK printer=${printerName} kind=${String(payload?.kind || "")}`);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            const msg = String(e?.message || e);
            pushLog(`[bridge] PRINT ERROR: ${msg}`);
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: msg }));
          }
        });
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  });
  desktopBridgeServer.listen(desiredPort, "127.0.0.1", () => {
    pushLog(`[bridge] Local Desktop Bridge listening on http://127.0.0.1:${desiredPort}`);
  });
  desktopBridgeServer.on("error", (e) => {
    pushLog(`[bridge] server error: ${String(e?.message || e)}`);
  });
  return { ok: true, running: true, port: desiredPort };
}

function startAgent(config) {
  if (agentProcess) return { ok: false, error: "Agent déjà démarré." };
  const agentScriptPath = resolveAgentPath();
  if (!agentScriptPath) {
    return {
      ok: false,
      error: "agent-worker.js introuvable (vérifiez resources/agent AxiaPrinters).",
    };
  }
  const env = {
    ...process.env,
    CLOUD_API_URL: String(config.cloudApiUrl || "").trim(),
    AGENT_MASTER_TOKEN: String(config.agentMasterToken || "").trim(),
    TERMINAL_ALIAS: String(config.terminalAlias || "TERMINAL-1").trim(),
    SITE_NAME: String(config.siteName || "SITE-A").trim(),
    AGENT_POLL_MS: String(Math.max(1500, Number(config.pollMs) || 3000)),
  };

  const nodeExe = resolveNodeExe();
  if (!nodeExe) {
    return { ok: false, error: "Node.js introuvable. Installez Node LTS puis relancez." };
  }
  pushLog(`Lancement agent via: ${nodeExe}`);
  try {
    agentProcess = spawn(nodeExe, [agentScriptPath], {
      cwd: path.dirname(agentScriptPath),
      env,
      windowsHide: true,
    });
  } catch (e) {
    return { ok: false, error: `Echec démarrage agent: ${String(e?.message || e)}` };
  }

  pushLog("Agent démarré.");
  agentProcess.on("error", (err) => {
    pushLog(`ERR: spawn agent: ${String(err?.message || err)}`);
    agentProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-status", false);
    }
  });
  agentProcess.stdout.on("data", (buf) => pushLog(buf.toString().trim()));
  agentProcess.stderr.on("data", (buf) => pushLog(`ERR: ${buf.toString().trim()}`));
  agentProcess.on("close", (code) => {
    pushLog(`Agent arrêté (code ${code ?? "?"}).`);
    agentProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent-status", false);
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent-status", true);
  }
  return { ok: true };
}

function stopAgent() {
  if (!agentProcess) return { ok: false, error: "Agent non démarré." };
  agentProcess.kill();
  agentProcess = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("agent-status", false);
  }
  pushLog("Arrêt demandé.");
  return { ok: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  currentConfig = loadConfig();
  try {
    startDesktopBridgeServerFromConfig(currentConfig);
  } catch (e) {
    pushLog(`[bridge] startup error: ${String(e?.message || e)}`);
  }
  createWindow();

  ipcMain.handle("config:get", () => currentConfig);
  ipcMain.handle("config:save", (_event, cfg) => {
    const nextBridge = normalizeDesktopBridgeConfig(cfg || {});
    currentConfig = {
      ...getDefaultConfig(),
      ...cfg,
      pollMs: Math.max(1500, Number(cfg?.pollMs) || 3000),
      desktopBridge: nextBridge,
    };
    saveConfig(currentConfig);
    try {
      startDesktopBridgeServerFromConfig(currentConfig);
    } catch (e) {
      pushLog(`[bridge] reload error: ${String(e?.message || e)}`);
    }
    return { ok: true };
  });
  ipcMain.handle("agent:start", () => startAgent(currentConfig || loadConfig()));
  ipcMain.handle("agent:stop", () => stopAgent());
  ipcMain.handle("agent:status", () => ({
    running: Boolean(agentProcess),
    logs: agentLogs,
    agentScriptPath: resolveAgentPath(),
  }));
  ipcMain.handle("agent:detect-printers", async () => {
    const script =
      "$items=@(); " +
      "try { $items += Get-Printer | Select-Object Name,DriverName,PortName } catch {}; " +
      "try { $items += Get-CimInstance Win32_Printer | Select-Object @{n='Name';e={$_.Name}},@{n='DriverName';e={$_.DriverName}},@{n='PortName';e={$_.PortName}} } catch {}; " +
      "$dedup = $items | Where-Object { $_.Name } | Group-Object Name | ForEach-Object { $_.Group | Select-Object -First 1 }; " +
      "$dedup | ConvertTo-Json -Compress";
    const out = await runPowershellCommand(script);
    if (!out.ok) return { ok: false, error: out.stderr || out.stdout || "detect failed", printers: [] };
    try {
      const data = JSON.parse(out.stdout || "[]");
      return { ok: true, printers: Array.isArray(data) ? data : [data] };
    } catch {
      return { ok: true, printers: [] };
    }
  });
  ipcMain.handle("agent:test-print", async (_event, printerName, text) => {
    const safePrinter = String(printerName || "").replaceAll("'", "''");
    const safeText = String(text || "").replaceAll("'", "''");
    const cmd =
      `$p='${safePrinter}'; $t='${safeText}'; ` +
      "$tmp=Join-Path $env:TEMP ('axiaflex-test-'+[Guid]::NewGuid().ToString()+'.txt'); " +
      "Set-Content -LiteralPath $tmp -Value $t -Encoding utf8; " +
      "Get-Content -LiteralPath $tmp | Out-Printer -Name $p; " +
      "Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue";
    const out = await runPowershellCommand(cmd);
    return { ok: out.ok, error: out.ok ? null : out.stderr || out.stdout || "print failed" };
  });
  ipcMain.handle("service:install", async () => {
    const cfg = currentConfig || loadConfig();
    const scriptPath = resolvePsScript("install-service.ps1");
    if (!scriptPath) {
      return { ok: false, error: "install-service.ps1 introuvable (ressources AxiaPrinters)." };
    }
    const flatArgs = [
      "-CloudApiUrl",
      String(cfg.cloudApiUrl || ""),
      "-AgentMasterToken",
      String(cfg.agentMasterToken || ""),
      "-TerminalAlias",
      String(cfg.terminalAlias || os.hostname()),
      "-SiteName",
      String(cfg.siteName || ""),
      "-PollMs",
      String(Math.max(1500, Number(cfg.pollMs) || 3000)),
      "-ServiceName",
      AGENT_TASK_NAME,
    ];
    pushLog(`Installation démarrage auto / tâche planifiée (PowerShell: ${getPowershellExe()}, UAC)…`);
    return runPowershellScriptElevated(scriptPath, flatArgs, { streamLog: true });
  });
  ipcMain.handle("service:patch", async () => {
    const cfg = currentConfig || loadConfig();
    const scriptPath = resolvePsScript("install-service.ps1");
    if (!scriptPath) {
      return { ok: false, error: "install-service.ps1 introuvable (ressources AxiaPrinters)." };
    }
    const flatArgs = [
      "-CloudApiUrl",
      String(cfg.cloudApiUrl || ""),
      "-AgentMasterToken",
      String(cfg.agentMasterToken || ""),
      "-TerminalAlias",
      String(cfg.terminalAlias || os.hostname()),
      "-SiteName",
      String(cfg.siteName || ""),
      "-PollMs",
      String(Math.max(1500, Number(cfg.pollMs) || 3000)),
      "-ServiceName",
      AGENT_TASK_NAME,
    ];
    pushLog(`Patch démarrage auto / tâche planifiée (PowerShell: ${getPowershellExe()}, UAC)…`);
    const installRes = await runPowershellScriptElevated(scriptPath, flatArgs, { streamLog: true });
    if (!installRes.ok) return installRes;
    const runRes = await runPowershellCommand(`schtasks /Run /TN '${AGENT_TASK_NAME}'`);
    if (!runRes.ok) {
      return {
        ok: false,
        code: runRes.code,
        stdout: installRes.stdout,
        stderr: runRes.stderr || runRes.stdout || "Patch applique, mais impossible de relancer la tache.",
      };
    }
    return {
      ok: true,
      code: 0,
      stdout: `${installRes.stdout || "Patch applique"}\nTache ${AGENT_TASK_NAME} relancee.`,
      stderr: installRes.stderr || "",
    };
  });
  ipcMain.handle("service:restart-task", async () => {
    const endRes = await runPowershellCommand(`schtasks /End /TN '${AGENT_TASK_NAME}'`);
    const runRes = await runPowershellCommand(`schtasks /Run /TN '${AGENT_TASK_NAME}'`);
    const ok = runRes.ok;
    return {
      ok,
      code: ok ? 0 : runRes.code,
      stdout: [endRes.stdout, runRes.stdout].filter(Boolean).join("\n"),
      stderr: [endRes.stderr, runRes.stderr].filter(Boolean).join("\n"),
    };
  });
  ipcMain.handle("service:open-worker-log", async () => {
    try {
      const logDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), APP_BRAND, AGENT_HOME_DIR);
      const logPath = path.join(logDir, "worker.log");
      try {
        fs.mkdirSync(logDir, { recursive: true });
        if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, "", "utf8");
      } catch {}
      const child = spawn("notepad.exe", [logPath], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      });
      child.unref();
      return { ok: true, path: logPath };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
  ipcMain.handle("service:uninstall", async () => {
    const scriptPath = resolvePsScript("uninstall-service.ps1");
    if (!scriptPath) {
      return { ok: false, error: "uninstall-service.ps1 introuvable (ressources AxiaPrinters)." };
    }
    pushLog("Suppression démarrage auto / tâche planifiée (UAC)…");
    return runPowershellScriptElevated(scriptPath, ["-ServiceName", AGENT_TASK_NAME], {
      streamLog: true,
    });
  });
  ipcMain.handle("service:status", async () => {
    const ps = `
$tn = '${AGENT_TASK_NAME}'
$t = Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue
if (-not $t) {
  @{ mode = 'task'; installed = $false } | ConvertTo-Json -Compress
  exit 0
}
$i = $t | Get-ScheduledTaskInfo
@{ mode = 'task'; installed = $true; taskName = $tn; state = [string]$t.State; lastRunTime = if ($i.LastRunTime) { $i.LastRunTime.ToString('o') } else { $null }; lastTaskResult = $i.LastTaskResult } | ConvertTo-Json -Compress
`.replace(/\r?\n/g, " ");
    const out = await runPowershellCommand(ps);
    if (!out.ok || !out.stdout) return { ok: true, status: null, mode: "task" };
    try {
      const j = JSON.parse(out.stdout);
      if (j && j.mode === "task" && j.installed === false) {
        const fallback = await runPowershellCommand(
          `schtasks /Query /TN "${AGENT_TASK_NAME}" /V /FO LIST`,
        );
        if (fallback.ok && fallback.stdout) {
          const parsed = parseScheduledTaskList(fallback.stdout, AGENT_TASK_NAME);
          if (parsed) return { ok: true, status: parsed };
        }
      }
      return { ok: true, status: j };
    } catch {
      const fallback = await runPowershellCommand(
        `schtasks /Query /TN "${AGENT_TASK_NAME}" /V /FO LIST`,
      );
      if (fallback.ok && fallback.stdout) {
        const parsed = parseScheduledTaskList(fallback.stdout, AGENT_TASK_NAME);
        if (parsed) return { ok: true, status: parsed };
      }
      return { ok: true, status: null, mode: "task" };
    }
  });
  ipcMain.handle("desktop-bridge:start-now", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    if (!cfg.exePath) return { ok: false, error: "Chemin EXE Desktop Bridge manquant." };
    if (!fs.existsSync(cfg.exePath)) {
      return { ok: false, error: `EXE introuvable: ${cfg.exePath}` };
    }
    try {
      const st = fs.statSync(cfg.exePath);
      if (!st.isFile()) {
        return { ok: false, error: `Chemin invalide (dossier): ${cfg.exePath}. Sélectionnez un .exe.` };
      }
    } catch {}
    const ps = `
      $exe='${escapePsSingle(cfg.exePath)}';
      $args='${escapePsSingle(cfg.args || "")}';
      if ([string]::IsNullOrWhiteSpace($args)) {
        Start-Process -FilePath $exe -WindowStyle Hidden | Out-Null;
      } else {
        Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden | Out-Null;
      };
      Write-Output "DESKTOP_BRIDGE_STARTED=1";
    `.replace(/\r?\n/g, " ");
    const out = await runPowershellCommand(ps);
    return { ok: out.ok, stdout: out.stdout, stderr: out.stderr, code: out.code };
  });
  ipcMain.handle("desktop-bridge:pick-installer", async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const picked = await dialog.showOpenDialog(win, {
      title: "Sélectionner l'installateur Desktop Bridge",
      properties: ["openFile"],
      filters: [
        { name: "Installateurs", extensions: ["exe", "msi"] },
        { name: "Tous les fichiers", extensions: ["*"] },
      ],
    });
    if (picked.canceled || !picked.filePaths?.length) return { ok: false, canceled: true };
    return { ok: true, path: String(picked.filePaths[0] || "") };
  });
  ipcMain.handle("desktop-bridge:install-app", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    const installer = String(cfg.installerPath || "").trim();
    if (!installer) return { ok: false, error: "Chemin installateur Bridge manquant." };
    if (!fs.existsSync(installer)) return { ok: false, error: `Installateur introuvable: ${installer}` };
    const ps = `
      $setup='${escapePsSingle(installer)}';
      $ext=[System.IO.Path]::GetExtension($setup).ToLowerInvariant();
      if ($ext -eq '.msi') {
        Start-Process -FilePath 'msiexec.exe' -Verb RunAs -ArgumentList '/i', $setup -Wait;
      } else {
        Start-Process -FilePath $setup -Verb RunAs -Wait;
      };
      Write-Output "DESKTOP_BRIDGE_INSTALLED=1";
    `.replace(/\r?\n/g, " ");
    const out = await runPowershellCommand(ps);
    return { ok: out.ok, stdout: out.stdout, stderr: out.stderr, code: out.code };
  });
  ipcMain.handle("desktop-bridge:test-health", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    if (!cfg.healthUrl) return { ok: false, error: "URL health manquante." };
    const ps = `
      try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri '${escapePsSingle(cfg.healthUrl)}' -TimeoutSec 3;
        Write-Output ("HEALTH_OK=" + $r.StatusCode);
        exit 0;
      } catch {
        Write-Output ("HEALTH_KO=" + $_.Exception.Message);
        exit 1;
      }
`.replace(/\r?\n/g, " ");
    const out = await runPowershellCommand(ps);
    return { ok: out.ok, stdout: out.stdout, stderr: out.stderr, code: out.code };
  });
  ipcMain.handle("desktop-bridge:install-autostart", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    if (!cfg.exePath) return { ok: false, error: "Chemin EXE Desktop Bridge manquant." };
    if (!fs.existsSync(cfg.exePath)) {
      return { ok: false, error: `EXE introuvable: ${cfg.exePath}` };
    }
    const taskName = cfg.taskName || BRIDGE_TASK_NAME;
    const userDataDir = app.getPath("userData");
    const launcherPath = path.join(userDataDir, "desktop-bridge-autostart.ps1");
    const launcherContent = [
      `$exe = '${escapePsSingle(cfg.exePath)}'`,
      `$args = '${escapePsSingle(cfg.args || "")}'`,
      "if ([string]::IsNullOrWhiteSpace($args)) {",
      "  Start-Process -FilePath $exe -WindowStyle Hidden | Out-Null",
      "} else {",
      "  Start-Process -FilePath $exe -ArgumentList $args -WindowStyle Hidden | Out-Null",
      "}",
    ].join("\r\n");
    fs.writeFileSync(launcherPath, launcherContent, "utf8");
    const psExe = getPowershellExe();
    const tr = `"${psExe}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcherPath}"`;
    const cmd = `schtasks /Create /SC ONLOGON /TN "${taskName}" /TR "${tr}" /F`;
    const out = await runPowershellCommand(cmd);
    if (out.ok) {
      return { ok: true, mode: "task", stdout: out.stdout, stderr: out.stderr, code: out.code };
    }
    const denied = /acc[eè]s refus[eé]|access is denied/i.test(
      `${out.stderr || ""}\n${out.stdout || ""}`,
    );
    if (!denied) {
      return { ok: out.ok, stdout: out.stdout, stderr: out.stderr, code: out.code };
    }
    try {
      const startupDir = app.getPath("startup");
      const vbsPath = path.join(startupDir, `${BRIDGE_TASK_NAME}.vbs`);
      const vbs = [
        'Set WshShell = CreateObject("WScript.Shell")',
        `WshShell.Run """" & "${cfg.exePath.replace(/"/g, '""')}" & """ ${String(cfg.args || "").replace(/"/g, '""')}", 0, False`,
      ].join("\r\n");
      fs.writeFileSync(vbsPath, vbs, "utf8");
      return {
        ok: true,
        mode: "startup-folder",
        stdout: `schtasks refuse. Fallback startup user installe: ${vbsPath}`,
        stderr: out.stderr || out.stdout || "",
        code: 0,
      };
    } catch (e) {
      return {
        ok: false,
        stdout: out.stdout,
        stderr: `${out.stderr || out.stdout || ""}\nFallback startup KO: ${String(e?.message || e)}`,
        code: out.code,
      };
    }
  });
  ipcMain.handle("desktop-bridge:uninstall-autostart", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    const taskName = cfg.taskName || BRIDGE_TASK_NAME;
    const out = await runPowershellCommand(`schtasks /Delete /TN "${taskName}" /F`);
    let removedStartup = false;
    try {
      const startupDir = app.getPath("startup");
      const vbsPath = path.join(startupDir, `${BRIDGE_TASK_NAME}.vbs`);
      if (fs.existsSync(vbsPath)) {
        fs.unlinkSync(vbsPath);
        removedStartup = true;
      }
    } catch {}
    return {
      ok: out.ok || removedStartup,
      stdout: [out.stdout, removedStartup ? "Startup fallback removed." : ""].filter(Boolean).join("\n"),
      stderr: out.stderr,
      code: out.code,
    };
  });
  ipcMain.handle("desktop-bridge:status", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    const taskName = cfg.taskName || BRIDGE_TASK_NAME;
    const out = await runPowershellCommand(`schtasks /Query /TN "${taskName}" /V /FO LIST`);
    if (!out.ok) {
      try {
        const startupDir = app.getPath("startup");
        const vbsPath = path.join(startupDir, `${BRIDGE_TASK_NAME}.vbs`);
        if (fs.existsSync(vbsPath)) {
          return {
            ok: true,
            status: { mode: "startup-folder", installed: true, taskName: "StartupFolder", state: "Ready" },
          };
        }
      } catch {}
      return { ok: true, status: { installed: false, taskName } };
    }
    const parsed = parseScheduledTaskList(out.stdout, taskName);
    return { ok: true, status: parsed || { installed: true, taskName } };
  });
  ipcMain.handle("desktop-bridge:server-status", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    const running = Boolean(desktopBridgeServer && desktopBridgeServer.listening);
    const port = running ? Number(desktopBridgeServer.address()?.port || 0) : 0;
    return {
      ok: true,
      running,
      port,
      enabled: Boolean(cfg.localServerEnabled),
      healthUrl: `http://127.0.0.1:${Number(cfg.localServerPort || 17888)}/health`,
    };
  });
  ipcMain.handle("desktop-bridge:server-restart", async () => {
    const cfg = normalizeDesktopBridgeConfig(currentConfig || loadConfig());
    try {
      if (desktopBridgeServer) {
        await new Promise((resolve) => {
          try {
            desktopBridgeServer.close(() => resolve());
          } catch {
            resolve();
          }
        });
        desktopBridgeServer = null;
      }
      const out = startDesktopBridgeServerFromConfig({
        ...(currentConfig || {}),
        desktopBridge: cfg,
      });
      return { ok: true, ...(out || {}) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
