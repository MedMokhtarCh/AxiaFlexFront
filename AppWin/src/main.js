const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const os = require("node:os");

let mainWindow = null;
let agentProcess = null;
let agentLogs = [];
let currentConfig = null;

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

function parseScheduledTaskList(rawText, taskName = "AxiaFlexPrintAgent") {
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

function startAgent(config) {
  if (agentProcess) return { ok: false, error: "Agent déjà démarré." };
  const agentScriptPath = resolveAgentPath();
  if (!agentScriptPath) {
    return {
      ok: false,
      error: "agent-worker.js introuvable (vérifiez AppWin/resources/agent).",
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
  createWindow();

  ipcMain.handle("config:get", () => currentConfig);
  ipcMain.handle("config:save", (_event, cfg) => {
    currentConfig = {
      ...getDefaultConfig(),
      ...cfg,
      pollMs: Math.max(1500, Number(cfg?.pollMs) || 3000),
    };
    saveConfig(currentConfig);
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
      return { ok: false, error: "install-service.ps1 introuvable (ressources AppWin)." };
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
      "AxiaFlexPrintAgent",
    ];
    pushLog(`Installation démarrage auto / tâche planifiée (PowerShell: ${getPowershellExe()}, UAC)…`);
    return runPowershellScriptElevated(scriptPath, flatArgs, { streamLog: true });
  });
  ipcMain.handle("service:patch", async () => {
    const cfg = currentConfig || loadConfig();
    const scriptPath = resolvePsScript("install-service.ps1");
    if (!scriptPath) {
      return { ok: false, error: "install-service.ps1 introuvable (ressources AppWin)." };
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
      "AxiaFlexPrintAgent",
    ];
    pushLog(`Patch démarrage auto / tâche planifiée (PowerShell: ${getPowershellExe()}, UAC)…`);
    const installRes = await runPowershellScriptElevated(scriptPath, flatArgs, { streamLog: true });
    if (!installRes.ok) return installRes;
    const runRes = await runPowershellCommand("schtasks /Run /TN 'AxiaFlexPrintAgent'");
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
      stdout: `${installRes.stdout || "Patch applique"}\nTache AxiaFlexPrintAgent relancee.`,
      stderr: installRes.stderr || "",
    };
  });
  ipcMain.handle("service:restart-task", async () => {
    const endRes = await runPowershellCommand("schtasks /End /TN 'AxiaFlexPrintAgent'");
    const runRes = await runPowershellCommand("schtasks /Run /TN 'AxiaFlexPrintAgent'");
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
      const logDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AxiaFlex", "AppWinAgent");
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
      return { ok: false, error: "uninstall-service.ps1 introuvable (ressources AppWin)." };
    }
    pushLog("Suppression démarrage auto / tâche planifiée (UAC)…");
    return runPowershellScriptElevated(scriptPath, ["-ServiceName", "AxiaFlexPrintAgent"], {
      streamLog: true,
    });
  });
  ipcMain.handle("service:status", async () => {
    const ps = `
$tn = 'AxiaFlexPrintAgent'
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
          'schtasks /Query /TN "AxiaFlexPrintAgent" /V /FO LIST',
        );
        if (fallback.ok && fallback.stdout) {
          const parsed = parseScheduledTaskList(fallback.stdout, "AxiaFlexPrintAgent");
          if (parsed) return { ok: true, status: parsed };
        }
      }
      return { ok: true, status: j };
    } catch {
      const fallback = await runPowershellCommand(
        'schtasks /Query /TN "AxiaFlexPrintAgent" /V /FO LIST',
      );
      if (fallback.ok && fallback.stdout) {
        const parsed = parseScheduledTaskList(fallback.stdout, "AxiaFlexPrintAgent");
        if (parsed) return { ok: true, status: parsed };
      }
      return { ok: true, status: null, mode: "task" };
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
