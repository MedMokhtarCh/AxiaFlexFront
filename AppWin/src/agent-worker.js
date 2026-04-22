const os = require("node:os");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PNG } = require("pngjs");

const execFileAsync = promisify(execFile);
const API_BASE = String(process.env.CLOUD_API_URL || "").replace(/\/$/, "");
const MASTER_TOKEN = String(process.env.AGENT_MASTER_TOKEN || "").trim();
const TERMINAL_ALIAS = String(process.env.TERMINAL_ALIAS || os.hostname()).trim();
const SITE_NAME = String(process.env.SITE_NAME || "").trim();
const POLL_MS = Math.max(500, Number(process.env.AGENT_POLL_MS || 1000));
const PAPER_WIDTH_MM = Number(process.env.PAPER_WIDTH_MM || 80) === 50 ? 50 : 80;
const PRINT_DELIVERY_MODE =
  String(process.env.PRINT_DELIVERY_MODE || "auto").trim().toLowerCase() === "pdf_preview"
    ? "pdf_preview"
    : "auto";
const AGENT_HOME = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "AxiaPrinters", "AppWinAgent");
const STATE_FILE = path.join(AGENT_HOME, "state.json");
const TEMPLATES_DIR = path.join(AGENT_HOME, "templates");

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
      capabilities: { rawTextPrint: true, htmlPrint: true, windows: true, source: "axiaprinters" },
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
  const tmp = path.join(os.tmpdir(), `axiaprinters-print-${Date.now()}.txt`);
  await fs.writeFile(tmp, String(text || ""), "utf8");
  try {
    await printRawFile(printerName, tmp, "AxiaPrinters RAW_TEXT");
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}

async function printRawFile(printerName, filePath, docName = "AxiaPrinters RAW") {
  const escapedPath = String(filePath || "").replace(/'/g, "''");
  const escapedPrinter = String(printerName || "").replace(/'/g, "''");
  const escapedDoc = String(docName || "AxiaPrinters RAW").replace(/'/g, "''");
  const csharpRaw = [
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class RawPrinterHelper {",
    " [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]",
    " public class DOC_INFO_1 {",
    "  [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;",
    "  [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;",
    "  [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;",
    " }",
    " [DllImport(\"winspool.Drv\", EntryPoint=\"OpenPrinterW\", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);",
    " [DllImport(\"winspool.Drv\", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);",
    " [DllImport(\"winspool.Drv\", EntryPoint=\"StartDocPrinterW\", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOC_INFO_1 di);",
    " [DllImport(\"winspool.Drv\", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);",
    " [DllImport(\"winspool.Drv\", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);",
    " [DllImport(\"winspool.Drv\", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);",
    " [DllImport(\"winspool.Drv\", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);",
    "}",
  ].join(" ").replace(/'/g, "''");
  const psRaw = [
    "$ErrorActionPreference='Stop'",
    `$cs='${csharpRaw}'`,
    "Add-Type -TypeDefinition $cs",
    `$printer='${escapedPrinter}'`,
    `$path='${escapedPath}'`,
    `$doc='${escapedDoc}'`,
    "$bytes=[System.IO.File]::ReadAllBytes($path)",
    "if (-not $bytes -or $bytes.Length -le 0) { throw 'RAW payload vide' }",
    "$h=[IntPtr]::Zero",
    "if (-not [RawPrinterHelper]::OpenPrinter($printer, [ref]$h, [IntPtr]::Zero)) { throw ('OpenPrinter failed: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error()) }",
    "try {",
    "  $di = New-Object RawPrinterHelper+DOC_INFO_1",
    "  $di.pDocName = $doc",
    "  $di.pDataType = 'RAW'",
    "  if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, $di)) { throw ('StartDocPrinter failed: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error()) }",
    "  try {",
    "    if (-not [RawPrinterHelper]::StartPagePrinter($h)) { throw ('StartPagePrinter failed: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error()) }",
    "    try {",
    "      $written = 0",
    "      if (-not [RawPrinterHelper]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) { throw ('WritePrinter failed: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error()) }",
    "      if ($written -lt $bytes.Length) { throw ('WritePrinter short write: ' + $written + '/' + $bytes.Length) }",
    "    } finally { [void][RawPrinterHelper]::EndPagePrinter($h) }",
    "  } finally { [void][RawPrinterHelper]::EndDocPrinter($h) }",
    "} finally { [void][RawPrinterHelper]::ClosePrinter($h) }",
  ].join("; ");
  await execFileAsync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    psRaw,
  ]);
}

function pngBufferToEscPosRaster(pngBuffer, options = {}) {
  const maxWidth = Math.max(384, Number(options.maxWidth || 576));
  const maxHeight = Math.max(400, Number(options.maxHeight || 1800));
  const threshold = Number(options.threshold || 170);
  const minContentRows = Math.max(40, Number(options.minContentRows || 80));
  const bottomMarginRows = Math.max(8, Number(options.bottomMarginRows || 24));
  const topMarginRows = Math.max(0, Number(options.topMarginRows || 4));
  const minRowInkPixels = Math.max(1, Number(options.minRowInkPixels || 6));
  const sideMarginCols = Math.max(0, Number(options.sideMarginCols || 4));
  const minColInkPixels = Math.max(1, Number(options.minColInkPixels || 6));
  const png = PNG.sync.read(pngBuffer);
  const srcW = Number(png.width || 0);
  const srcH = Number(png.height || 0);
  if (!srcW || !srcH) throw new Error("Image PNG invalide");

  const scale = Math.min(1, maxWidth / srcW);
  const outW = Math.max(1, Math.floor(srcW * scale));
  const outH = Math.max(1, Math.min(maxHeight, Math.floor(srcH * scale)));
  const xBytes = Math.ceil(outW / 8);
  const raster = Buffer.alloc(xBytes * outH);
  const rowInkCounts = new Array(outH).fill(0);
  const colInkCounts = new Array(outW).fill(0);

  for (let y = 0; y < outH; y += 1) {
    const srcY = Math.min(srcH - 1, Math.floor((y * srcH) / outH));
    let rowInkCount = 0;
    for (let x = 0; x < outW; x += 1) {
      const srcX = Math.min(srcW - 1, Math.floor((x * srcW) / outW));
      const i = (srcY * srcW + srcX) * 4;
      const r = png.data[i] || 0;
      const g = png.data[i + 1] || 0;
      const b = png.data[i + 2] || 0;
      const a = png.data[i + 3] == null ? 255 : png.data[i + 3];
      const lum = (0.299 * r) + (0.587 * g) + (0.114 * b);
      const isBlack = a > 8 && lum < threshold;
      if (isBlack) {
        const idx = y * xBytes + (x >> 3);
        raster[idx] |= 0x80 >> (x & 7);
        rowInkCount += 1;
        colInkCounts[x] += 1;
      }
    }
    rowInkCounts[y] = rowInkCount;
  }

  let firstInkY = -1;
  let lastInkY = -1;
  let firstInkX = -1;
  let lastInkX = -1;
  for (let y = 0; y < outH; y += 1) {
    if (rowInkCounts[y] >= minRowInkPixels) {
      if (firstInkY < 0) firstInkY = y;
      lastInkY = y;
    }
  }
  for (let x = 0; x < outW; x += 1) {
    if (colInkCounts[x] >= minColInkPixels) {
      if (firstInkX < 0) firstInkX = x;
      lastInkX = x;
    }
  }
  const startRow = Math.max(0, firstInkY >= 0 ? firstInkY - topMarginRows : 0);
  const startCol = Math.max(0, firstInkX >= 0 ? firstInkX - sideMarginCols : 0);
  const endCol = Math.min(outW - 1, lastInkX >= 0 ? lastInkX + sideMarginCols : outW - 1);
  const effectiveCols = Math.max(1, endCol - startCol + 1);
  const effectiveRows = Math.max(
    minContentRows,
    Math.min(outH - startRow, (lastInkY >= 0 ? lastInkY + 1 - startRow : 0) + bottomMarginRows),
  );
  const trimmedBytesPerRow = Math.ceil(effectiveCols / 8);
  const rasterTrimmed = Buffer.alloc(trimmedBytesPerRow * effectiveRows);
  for (let y = 0; y < effectiveRows; y += 1) {
    const srcY = startRow + y;
    for (let x = 0; x < effectiveCols; x += 1) {
      const srcX = startCol + x;
      const srcByte = raster[srcY * xBytes + (srcX >> 3)] || 0;
      const isSet = (srcByte & (0x80 >> (srcX & 7))) !== 0;
      if (isSet) {
        const dstIdx = y * trimmedBytesPerRow + (x >> 3);
        rasterTrimmed[dstIdx] |= 0x80 >> (x & 7);
      }
    }
  }
  const xL = trimmedBytesPerRow & 0xff;
  const xH = (trimmedBytesPerRow >> 8) & 0xff;
  const yL = effectiveRows & 0xff;
  const yH = (effectiveRows >> 8) & 0xff;
  const header = Buffer.from([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  const footer = Buffer.from([0x0a, 0x1d, 0x56, 0x41, 0x03]);
  return Buffer.concat([header, rasterTrimmed, footer]);
}

async function printHtmlAsEscPosImage(printerName, browserPath, htmlPath) {
  const tmpPng = path.join(os.tmpdir(), `axiaprinters-print-${Date.now()}.png`);
  const targetPxWidth = PAPER_WIDTH_MM === 50 ? 384 : 576;
  try {
    const url = pathToFileURL(htmlPath).toString();
    await execFileAsync(browserPath, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${targetPxWidth},2200`,
      `--screenshot=${tmpPng}`,
      url,
    ]);
    const pngBuffer = await fs.readFile(tmpPng);
    const escpos = pngBufferToEscPosRaster(pngBuffer, {
      maxWidth: targetPxWidth,
      maxHeight: 2400,
      threshold: 170,
    });
    const tmpRaw = path.join(os.tmpdir(), `axiaprinters-escpos-${Date.now()}.bin`);
    await fs.writeFile(tmpRaw, escpos);
    try {
      await printRawFile(printerName, tmpRaw, "AxiaPrinters HTML->ESC/POS");
    } finally {
      await fs.unlink(tmpRaw).catch(() => undefined);
    }
  } finally {
    await fs.unlink(tmpPng).catch(() => undefined);
  }
}

function htmlToPlainText(rawHtml) {
  return String(rawHtml || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getByPath(obj, dotPath) {
  const parts = String(dotPath || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return "";
    cur = cur[p];
  }
  if (cur == null) return "";
  return typeof cur === "object" ? JSON.stringify(cur) : String(cur);
}

function renderTemplateString(template, data) {
  let out = String(template || "");
  out = out.replace(/{{#each\s+([a-zA-Z0-9_.]+)}}([\s\S]*?){{\/each}}/g, (_m, arrPath, block) => {
    const arr = getByPath(data, arrPath);
    let items = [];
    try {
      items = Array.isArray(arr) ? arr : JSON.parse(String(arr || "[]"));
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
    return items
      .map((it) =>
        String(block || "").replace(/{{\s*(this\.)?([a-zA-Z0-9_.]+)\s*}}/g, (_x, _thisP, p) => {
          const v = getByPath(it, p);
          return String(v || "");
        }),
      )
      .join("");
  });
  out = out.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_m, p) => String(getByPath(data, p) || ""));
  return out;
}

async function loadLocalTemplate(slot) {
  const safe = String(slot || "").trim().toLowerCase();
  if (!safe) return "";
  try {
    const pJson = path.join(TEMPLATES_DIR, `${safe}.json`);
    const jsonRaw = await fs.readFile(pJson, "utf8");
    const parsed = JSON.parse(String(jsonRaw || "{}"));
    const html = String(parsed?.html || parsed?.template || "").trim();
    if (html) return html;
  } catch {}
  try {
    const pHtml = path.join(TEMPLATES_DIR, `${safe}.html`);
    return await fs.readFile(pHtml, "utf8");
  } catch {}
  return "";
}

async function loadLocalLogoDataUri() {
  const p = path.join(TEMPLATES_DIR, "logo.png");
  try {
    const data = await fs.readFile(p);
    if (!data?.length) return "";
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return "";
  }
}

async function printPdfBase64(printerName, pdfBase64) {
  const tmp = path.join(os.tmpdir(), `axiaprinters-print-${Date.now()}.pdf`);
  const data = Buffer.from(String(pdfBase64 || ""), "base64");
  await fs.writeFile(tmp, data);
  await printPdfFile(printerName, tmp);
  await fs.unlink(tmp).catch(() => undefined);
}

async function printPdfFile(printerName, pdfPath) {
  const escapedPath = String(pdfPath).replace(/'/g, "''");
  const escapedPrinter = String(printerName || "").replace(/'/g, "''");
  await execFileAsync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Start-Process -FilePath '${escapedPath}' -Verb PrintTo -ArgumentList '${escapedPrinter}' -WindowStyle Hidden`,
  ]);
}

async function previewPdfFile(pdfPath) {
  const escapedPath = String(pdfPath).replace(/'/g, "''");
  await execFileAsync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Start-Process -FilePath '${escapedPath}'`,
  ]);
}

async function printHtmlBase64(printerName, htmlBase64) {
  const tmpHtml = path.join(os.tmpdir(), `axiaprinters-print-${Date.now()}.html`);
  const tmpPdf = path.join(os.tmpdir(), `axiaprinters-print-${Date.now()}.pdf`);
  const rawHtml = Buffer.from(String(htmlBase64 || ""), "base64").toString("utf8");
  const normalizedHtml = normalizeHtmlForCloudPrint(rawHtml, PAPER_WIDTH_MM === 50 ? 384 : 576);
  await fs.writeFile(tmpHtml, Buffer.from(normalizedHtml, "utf8"));
  try {
    const browserPath = await resolveBrowserPath();
    if (!browserPath) {
      throw new Error("Aucun navigateur Chromium (Edge/Chrome) trouvé pour rendu HTML.");
    }
    if (PRINT_DELIVERY_MODE === "pdf_preview") {
      const url = pathToFileURL(tmpHtml).toString();
      await execFileAsync(browserPath, [
        "--headless",
        "--disable-gpu",
        `--print-to-pdf=${tmpPdf}`,
        url,
      ]);
      await previewPdfFile(tmpPdf);
      return;
    }
    try {
      await printHtmlAsEscPosImage(printerName, browserPath, tmpHtml);
    } catch {
      const url = pathToFileURL(tmpHtml).toString();
      await execFileAsync(browserPath, [
        "--headless",
        "--disable-gpu",
        `--print-to-pdf=${tmpPdf}`,
        url,
      ]);
      await printPdfFile(printerName, tmpPdf);
    }
  } finally {
    await fs.unlink(tmpHtml).catch(() => undefined);
    await fs.unlink(tmpPdf).catch(() => undefined);
  }
}

async function resolveBrowserPath() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  try {
    const { stdout } = await execFileAsync("where", ["msedge"]);
    const p = String(stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (p) return p;
  } catch {}
  try {
    const { stdout } = await execFileAsync("where", ["chrome"]);
    const p = String(stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (p) return p;
  } catch {}
  return "";
}

function normalizeHtmlForCloudPrint(html, targetPxWidth) {
  let out = String(html || "");
  // Replace rigid paper-size CSS that shrinks receipt inside screenshot viewport.
  out = out.replace(/@page\s*\{[^}]*\}/gi, "@page{size:auto;margin:0}");
  out = out.replace(/width\s*:\s*\d+(\.\d+)?mm/gi, "width:100%");
  // Cloud screenshot is not print media: remove popup helper banner to match local final output.
  out = out.replace(/<div[^>]*class=["'][^"']*\bnotice\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
  const isNacefLike = /FORMAT\s*NACEF|BLOC\s*FISCAL\s*NACEF|QR\s*fiscal\s*NACEF/i.test(out);
  const nacefBoostStyle = isNacefLike
    ? `
.card{padding:14px !important}
.meta{font-size:11px !important;line-height:1.65 !important}
.line{font-size:12px !important;margin-bottom:3px !important}
.tot{font-size:12px !important;line-height:2 !important}
.tot.ttc{font-size:18px !important}
.fiscal{font-size:12px !important;line-height:1.6 !important}
.qr img{width:220px !important;height:220px !important}
.qr p{font-size:11px !important}
`
    : "";
  const forceStyle = `
<style id="axiaprinters-force-width">
html,body{width:${Number(targetPxWidth || 576)}px !important;max-width:${Number(targetPxWidth || 576)}px !important;margin:0 !important;padding:0 !important;overflow:visible !important;background:#fff !important}
body>*{max-width:${Number(targetPxWidth || 576)}px !important}
.wrap,.card,.container,.ticket,.receipt{width:100% !important;max-width:none !important;margin-left:0 !important;margin-right:0 !important}
.notice{display:none !important}
${nacefBoostStyle}
</style>`;
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${forceStyle}</head>`);
  return `${forceStyle}${out}`;
}

async function resolvePrinterNameForJob(job, payload) {
  const targetLocalId = String(
    job?.targetPrinterLocalId || payload?.printerLocalId || "",
  ).trim();
  const targetName = String(
    job?.targetPrinterName || payload?.printerName || "",
  ).trim();
  if (!targetLocalId && targetName) return targetName;
  const printers = await detectPrinters();
  const byId = printers.find((p) => {
    const localId = String(p?.printerLocalId || "").trim().toLowerCase();
    const portName = String(p?.PortName || "").trim().toLowerCase();
    const name = String(p?.Name || "").trim().toLowerCase();
    const needle = targetLocalId.toLowerCase();
    return needle && (needle === localId || needle === portName || needle === name);
  });
  if (byId?.Name) return String(byId.Name).trim();
  if (targetName) {
    const normalizedTarget = targetName.toLowerCase();
    const fuzzy = printers.find((p) => String(p?.Name || "").trim().toLowerCase().includes(normalizedTarget));
    if (fuzzy?.Name) return String(fuzzy.Name).trim();
    return targetName;
  }
  const defaultP = printers.find((p) => String(p?.Default || "").toLowerCase() === "true");
  if (defaultP?.Name) return String(defaultP.Name).trim();
  if (printers[0]?.Name) return String(printers[0].Name).trim();
  return "";
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
      const printerName = await resolvePrinterNameForJob(j, payload);
      if (!printerName) throw new Error("Missing printerName");
      const type = String(payload.type || "");
      console.log(
        `[axiaprinters-agent] job=${String(j?.id || "?")} type=${type} target=${String(printerName || "?")}`,
      );
      if (type === "RAW_TEXT_PRINT") {
        await printRawText(printerName, String(payload.text || ""));
      } else if (type === "RAW_BYTES_PRINT") {
        const rawBase64 = String(payload.rawBase64 || "").trim();
        if (!rawBase64) throw new Error("Missing rawBase64");
        const tmpRaw = path.join(os.tmpdir(), `axiaprinters-raw-${Date.now()}.bin`);
        await fs.writeFile(tmpRaw, Buffer.from(rawBase64, "base64"));
        try {
          await printRawFile(printerName, tmpRaw, "AxiaPrinters RAW_BYTES");
        } finally {
          await fs.unlink(tmpRaw).catch(() => undefined);
        }
      } else if (type === "PDF_PRINT") {
        if (PRINT_DELIVERY_MODE === "pdf_preview") {
          const tmp = path.join(os.tmpdir(), `axiaprinters-preview-${Date.now()}.pdf`);
          await fs.writeFile(tmp, Buffer.from(String(payload.pdfBase64 || ""), "base64"));
          await previewPdfFile(tmp);
          setTimeout(() => {
            fs.unlink(tmp).catch(() => undefined);
          }, 10 * 60 * 1000);
        } else {
          await printPdfBase64(printerName, String(payload.pdfBase64 || ""));
        }
      } else if (type === "HTML_PRINT") {
        const htmlBase64 = String(payload.htmlBase64 || "").trim();
        const htmlRaw = String(payload.html || payload.renderedHtml || "").trim();
        let finalHtml = htmlRaw || (htmlBase64 ? Buffer.from(htmlBase64, "base64").toString("utf8") : "");
        const templateKind = String(payload.templateKind || "").trim().toLowerCase();
        const localLogo = await loadLocalLogoDataUri();
        const templateData = payload.templateData && typeof payload.templateData === "object"
          ? { ...payload.templateData }
          : {};
        if (localLogo) {
          templateData.logoSrc = localLogo;
          templateData.logoUrl = localLogo;
          templateData.logoBase64 = localLogo;
        }
        if (templateKind && templateKind !== "client_nacef") {
          const localTpl = await loadLocalTemplate(templateKind);
          if (localTpl) {
            finalHtml = renderTemplateString(localTpl, templateData);
          }
        }
        const effectiveBase64 = finalHtml ? Buffer.from(finalHtml, "utf8").toString("base64") : "";
        if (!effectiveBase64) throw new Error("Missing HTML payload");
        await printHtmlBase64(printerName, effectiveBase64);
      } else {
        throw new Error("Unsupported job payload type");
      }
    } catch (e) {
      ok = false;
      error = e instanceof Error ? e.message : "print failed";
      console.error(`[axiaprinters-agent] job=${String(j?.id || "?")} failed: ${String(error || "unknown")}`);
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
        console.log(`[axiaprinters-agent] terminal=${terminalLabel} id=${reg.terminalId}`);
      }
      await cloudFetch("/pos/agent/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await processJobs(token);
      const now = Date.now();
      if (now - lastInventory > 60000) {
        const printers = await detectPrinters();
        await cloudFetch("/pos/agent/printers", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ printers }),
        });
        lastInventory = now;
      }
    } catch (e) {
      const msg = messageFromError(e);
      console.error("[axiaprinters-agent] cycle error:", msg);
      if (
        msg.toLowerCase().includes("master token invalide") ||
        msg.toLowerCase().includes("agent token invalide") ||
        msg.toLowerCase().includes("token invalide") ||
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
  console.error("[axiaprinters-agent] fatal non bloquant:", messageFromError(e));
});
