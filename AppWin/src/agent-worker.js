const os = require("node:os");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const API_BASE = String(process.env.CLOUD_API_URL || "").replace(/\/$/, "");
const MASTER_TOKEN = String(process.env.AGENT_MASTER_TOKEN || "").trim();
const TERMINAL_ALIAS = String(process.env.TERMINAL_ALIAS || os.hostname()).trim();
const SITE_NAME = String(process.env.SITE_NAME || "").trim();
const POLL_MS = Math.max(1500, Number(process.env.AGENT_POLL_MS || 3000));
const AGENT_HOME = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AxiaFlex", "AppWinAgent");
const STATE_FILE = path.join(AGENT_HOME, "state.json");

async function ps(command) {
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ]);
  return String(stdout || "").trim();
}

async function readState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeState(state) {
  await fs.mkdir(AGENT_HOME, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function getFingerprint() {
  let bios = "";
  let board = "";
  try {
    bios = await ps("(Get-CimInstance Win32_BIOS | Select-Object -ExpandProperty SerialNumber)");
  } catch {}
  try {
    board = await ps("(Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber)");
  } catch {}
  const raw = `${os.hostname()}|${os.platform()}|${os.release()}|${bios}|${board}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

async function cloudFetch(pathname, init = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `${res.status}`);
  return json;
}

async function ensureRegistered() {
  const st = await readState();
  if (st.apiToken && st.terminalId) return st;
  const fingerprintHash = await getFingerprint();
  const reg = await cloudFetch("/pos/agent/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-master-token": MASTER_TOKEN,
    },
    body: JSON.stringify({
      alias: TERMINAL_ALIAS,
      fingerprintHash,
      siteName: SITE_NAME || null,
      osInfo: `${os.platform()} ${os.release()}`,
      agentVersion: "0.2.0",
      capabilities: { rawTextPrint: true, windows: true, source: "appwin" },
    }),
  });
  const next = { terminalId: reg.terminalId, apiToken: reg.apiToken, alias: reg.alias };
  await writeState(next);
  return next;
}

async function detectPrinters() {
  const script =
    "$items = @(); " +
    "try { $items += Get-Printer | Select-Object Name,DriverName,PortName } catch {}; " +
    "try { $items += Get-CimInstance Win32_Printer | Select-Object @{n='Name';e={$_.Name}},@{n='DriverName';e={$_.DriverName}},@{n='PortName';e={$_.PortName}} } catch {}; " +
    "$dedup = $items | Where-Object { $_.Name } | Group-Object Name | ForEach-Object { $_.Group | Select-Object -First 1 }; " +
    "$dedup | ConvertTo-Json -Compress";
  try {
    const out = await ps(script);
    if (!out) return [];
    const parsed = JSON.parse(out);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((p) => ({ ...p, printerLocalId: String(p.PortName || p.Name || "").trim() }));
  } catch {
    return [];
  }
}

async function printRawText(printerName, text) {
  const tmp = path.join(os.tmpdir(), `axiaflex-print-${Date.now()}.txt`);
  await fs.writeFile(tmp, String(text || ""), "utf8");
  try {
    const escapedPath = String(tmp).replace(/'/g, "''");
    const escapedPrinter = String(printerName || "").replace(/'/g, "''");
    await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `$path='${escapedPath}'; $printer='${escapedPrinter}'; Get-Content -LiteralPath $path | Out-Printer -Name $printer`,
    ]);
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function processJobs(token) {
  const pulled = await cloudFetch("/pos/agent/jobs/pull?limit=20", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const jobs = Array.isArray(pulled?.jobs) ? pulled.jobs : [];
  for (const j of jobs) {
    let ok = true;
    let error = null;
    try {
      const payload = j?.payload || {};
      if (String(payload.type || "") !== "RAW_TEXT_PRINT") {
        throw new Error("Unsupported job payload type");
      }
      const printerName = String(j?.targetPrinterName || payload.printerName || "").trim();
      if (!printerName) throw new Error("Missing printerName");
      await printRawText(printerName, String(payload.text || ""));
    } catch (e) {
      ok = false;
      error = e instanceof Error ? e.message : "print failed";
    }
    await cloudFetch(`/pos/agent/jobs/${encodeURIComponent(String(j.id || ""))}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ok, error }),
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageFromError(e) {
  return e instanceof Error ? e.message : String(e || "unknown error");
}

async function loop() {
  let lastInventory = 0;
  let token = "";
  let terminalLabel = "";

  while (true) {
    try {
      if (!API_BASE) throw new Error("CLOUD_API_URL manquant");
      if (!MASTER_TOKEN) throw new Error("AGENT_MASTER_TOKEN manquant");
      if (!token) {
        const reg = await ensureRegistered();
        token = String(reg.apiToken || "").trim();
        if (!token) throw new Error("apiToken agent manquant");
        terminalLabel = String(reg.alias || reg.terminalId || "?");
        console.log(`[appwin-agent] terminal=${terminalLabel} id=${reg.terminalId}`);
      }
      await cloudFetch("/pos/agent/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const now = Date.now();
      if (now - lastInventory > 15000) {
        const printers = await detectPrinters();
        await cloudFetch("/pos/agent/printers", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ printers }),
        });
        lastInventory = now;
      }
      await processJobs(token);
    } catch (e) {
      const msg = messageFromError(e);
      console.error("[appwin-agent] cycle error:", msg);
      if (
        msg.toLowerCase().includes("master token invalide") ||
        msg.includes("401") ||
        msg.toLowerCase().includes("unauthorized")
      ) {
        token = "";
        terminalLabel = "";
        lastInventory = 0;
        await writeState({});
      }
    }
    await sleep(POLL_MS);
  }
}

loop().catch((e) => {
  console.error("[appwin-agent] fatal non bloquant:", messageFromError(e));
});
