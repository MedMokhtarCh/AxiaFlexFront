import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const API_BASE = String(process.env.CLOUD_API_URL || "").replace(/\/$/, "");
const MASTER_TOKEN = String(process.env.AGENT_MASTER_TOKEN || "").trim();
const TERMINAL_ALIAS = String(process.env.TERMINAL_ALIAS || os.hostname()).trim();
const SITE_NAME = String(process.env.SITE_NAME || "").trim();
const POLL_MS = Math.max(1500, Number(process.env.AGENT_POLL_MS || 3000));
const STATE_FILE = path.join(process.cwd(), ".agent-state.json");

async function readState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeState(s) {
  await fs.writeFile(STATE_FILE, JSON.stringify(s, null, 2), "utf8");
}

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

async function getFingerprint() {
  const host = os.hostname();
  let bios = "";
  let board = "";
  let disk = "";
  let mac = "";
  try {
    bios = await ps("(Get-CimInstance Win32_BIOS | Select-Object -ExpandProperty SerialNumber)");
  } catch {}
  try {
    board = await ps("(Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber)");
  } catch {}
  try {
    disk = await ps("(Get-CimInstance Win32_DiskDrive | Select-Object -First 1 -ExpandProperty SerialNumber)");
  } catch {}
  try {
    mac = await ps("(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.MacAddress } | Select-Object -First 1 -ExpandProperty MacAddress)");
  } catch {}
  const raw = `${host}|${bios}|${board}|${disk}|${mac}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

async function detectPrinters() {
  const script =
    "$items = @(); " +
    "try { $items += Get-Printer | Select-Object Name,DriverName,PortName,Shared,ShareName,ComputerName,Type,Comment } catch {}; " +
    "try { $items += Get-CimInstance Win32_Printer | Select-Object @{n='Name';e={$_.Name}},@{n='DriverName';e={$_.DriverName}},@{n='PortName';e={$_.PortName}},@{n='Shared';e={$_.Shared}},@{n='ShareName';e={$_.ShareName}},@{n='ComputerName';e={$_.SystemName}},@{n='Type';e={$_.PrinterStatus}},@{n='Comment';e={$_.Comment}} } catch {}; " +
    "$dedup = $items | Where-Object { $_.Name } | Group-Object Name | ForEach-Object { $_.Group | Select-Object -First 1 }; " +
    "$dedup | ConvertTo-Json -Compress";
  try {
    const out = await ps(script);
    if (!out) return [];
    const data = JSON.parse(out);
    const arr = Array.isArray(data) ? data : [data];
    return arr.map((p) => ({
      ...p,
      printerLocalId: String(p.PortName || p.Name || "").trim(),
    }));
  } catch {
    return [];
  }
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
      agentVersion: "0.1.0",
      capabilities: { rawTextPrint: true, windows: true },
    }),
  });
  const next = {
    terminalId: reg.terminalId,
    apiToken: reg.apiToken,
    alias: reg.alias,
  };
  await writeState(next);
  return next;
}

async function postHeartbeat(token) {
  await cloudFetch("/pos/agent/heartbeat", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function postPrinters(token) {
  const printers = await detectPrinters();
  await cloudFetch("/pos/agent/printers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ printers }),
  });
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
  const data = await cloudFetch(`/pos/agent/jobs/pull?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  for (const j of jobs) {
    let ok = true;
    let error = null;
    try {
      const payload = j?.payload || {};
      if (String(payload.type || "") !== "RAW_TEXT_PRINT") {
        throw new Error("Unsupported job payload type");
      }
      const printerName =
        String(j?.targetPrinterName || payload.printerName || "").trim();
      if (!printerName) throw new Error("Missing printerName");
      await printRawText(printerName, String(payload.text || ""));
    } catch (e) {
      ok = false;
      error = e instanceof Error ? e.message : "print failed";
    }
    await cloudFetch(`/pos/agent/jobs/${encodeURIComponent(String(j.id || ""))}/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ok, error }),
    });
  }
}

async function loop() {
  if (!API_BASE) throw new Error("CLOUD_API_URL manquant");
  if (!MASTER_TOKEN) throw new Error("AGENT_MASTER_TOKEN manquant");
  const reg = await ensureRegistered();
  const token = String(reg.apiToken || "").trim();
  if (!token) throw new Error("apiToken agent manquant");
  console.log(`[agent] terminal=${reg.alias} id=${reg.terminalId}`);
  let lastInv = 0;
  while (true) {
    try {
      await postHeartbeat(token);
      const now = Date.now();
      if (now - lastInv > 15000) {
        await postPrinters(token);
        lastInv = now;
      }
      await processJobs(token);
    } catch (e) {
      console.error("[agent] cycle error:", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop().catch((e) => {
  console.error("[agent] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const CLOUD_API_URL = String(process.env.CLOUD_API_URL || "").replace(/\/$/, "");
const AGENT_MASTER_TOKEN = String(process.env.AGENT_MASTER_TOKEN || "").trim();
const TERMINAL_ALIAS = String(process.env.TERMINAL_ALIAS || os.hostname()).trim();
const SITE_NAME = String(process.env.SITE_NAME || "default-site").trim();
const AGENT_POLL_MS = Math.max(1000, Number(process.env.AGENT_POLL_MS || 3000));
const STATE_DIR = path.join(process.cwd(), ".state");
const STATE_FILE = path.join(STATE_DIR, "agent-state.json");

if (!CLOUD_API_URL) {
  console.error("[agent] CLOUD_API_URL manquant.");
  process.exit(1);
}
if (!AGENT_MASTER_TOKEN) {
  console.error("[agent] AGENT_MASTER_TOKEN manquant.");
  process.exit(1);
}

async function readState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeState(next) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(next, null, 2), "utf8");
}

function hashFingerprint(parts) {
  const joined = parts.filter(Boolean).join("|");
  return crypto.createHash("sha256").update(joined, "utf8").digest("hex");
}

async function getFingerprint() {
  const hostname = os.hostname();
  const platform = os.platform();
  const release = os.release();
  let bios = "";
  let board = "";
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "(Get-CimInstance Win32_BIOS).SerialNumber",
    ]);
    bios = String(stdout || "").trim();
  } catch {}
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "(Get-CimInstance Win32_BaseBoard).SerialNumber",
    ]);
    board = String(stdout || "").trim();
  } catch {}
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .map((n) => String(n.mac || "").trim())
    .filter((m) => m && m !== "00:00:00:00:00:00")
    .sort()
    .join(",");
  return hashFingerprint([hostname, platform, release, bios, board, macs]);
}

async function discoverPrinters() {
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$items = @(); " +
        "try { $items += Get-Printer | Select-Object Name,DriverName,PortName,Shared,ShareName } catch {}; " +
        "try { $items += Get-CimInstance Win32_Printer | Select-Object @{n='Name';e={$_.Name}},@{n='DriverName';e={$_.DriverName}},@{n='PortName';e={$_.PortName}},@{n='Shared';e={$_.Shared}},@{n='ShareName';e={$_.ShareName}} } catch {}; " +
        "$dedup = $items | Where-Object { $_.Name } | Group-Object Name | ForEach-Object { $_.Group | Select-Object -First 1 }; " +
        "$dedup | ConvertTo-Json -Compress",
    ]);
    const text = String(stdout || "").trim();
    if (!text) return [];
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

async function api(pathname, init = {}, token = "") {
  const res = await fetch(`${CLOUD_API_URL}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `${res.status} ${res.statusText}`);
  }
  return json;
}

async function registerIfNeeded() {
  const state = await readState();
  if (state?.apiToken && state?.terminalId) return state;
  const fingerprintHash = await getFingerprint();
  const payload = {
    alias: TERMINAL_ALIAS,
    siteName: SITE_NAME,
    fingerprintHash,
    osInfo: `${os.platform()} ${os.release()}`,
    agentVersion: "0.1.0",
    capabilities: { print: true, detectPrinters: true },
  };
  const out = await api(
    "/pos/agent/register",
    {
      method: "POST",
      headers: { "x-agent-master-token": AGENT_MASTER_TOKEN },
      body: JSON.stringify(payload),
    },
    "",
  );
  const next = { terminalId: out.terminalId, apiToken: out.apiToken };
  await writeState(next);
  console.log("[agent] enregistré", out.terminalId, out.alias);
  return next;
}

async function printRawText(printerName, text) {
  const dir = path.join(process.cwd(), ".tmp");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `job-${Date.now()}.txt`);
  await fs.writeFile(filePath, text, "utf8");
  try {
    const escPath = filePath.replace(/'/g, "''");
    const escPrinter = String(printerName || "").replace(/'/g, "''");
    await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `$path='${escPath}'; $printer='${escPrinter}'; Get-Content -LiteralPath $path | Out-Printer -Name $printer`,
    ]);
  } finally {
    await fs.unlink(filePath).catch(() => undefined);
  }
}

async function processJob(token, job) {
  const payload = job?.payload || {};
  const content = String(payload.text || "");
  const printerName = String(
    job?.targetPrinterName || payload.printerName || payload.printerLocalId || "",
  ).trim();
  if (!printerName) throw new Error("Nom imprimante manquant.");
  await printRawText(printerName, content);
  await api(
    `/pos/agent/jobs/${encodeURIComponent(String(job.id))}/ack`,
    { method: "POST", body: JSON.stringify({ ok: true }) },
    token,
  );
}

async function mainLoop() {
  const state = await registerIfNeeded();
  const token = String(state.apiToken || "");
  if (!token) throw new Error("Token agent absent.");

  for (;;) {
    try {
      await api("/pos/agent/heartbeat", { method: "POST", body: "{}" }, token);
      const printers = await discoverPrinters();
      await api(
        "/pos/agent/printers",
        { method: "POST", body: JSON.stringify({ printers }) },
        token,
      );
      const pulled = await api("/pos/agent/jobs/pull?limit=10", { method: "GET" }, token);
      const jobs = Array.isArray(pulled?.jobs) ? pulled.jobs : [];
      for (const job of jobs) {
        try {
          await processJob(token, job);
        } catch (e) {
          await api(
            `/pos/agent/jobs/${encodeURIComponent(String(job.id))}/ack`,
            {
              method: "POST",
              body: JSON.stringify({ ok: false, error: String((e && e.message) || e || "print failed") }),
            },
            token,
          );
        }
      }
    } catch (e) {
      console.warn("[agent] cycle error:", (e && e.message) || e);
    }
    await new Promise((r) => setTimeout(r, AGENT_POLL_MS));
  }
}

mainLoop().catch((e) => {
  console.error("[agent] fatal:", (e && e.message) || e);
  process.exit(1);
});
