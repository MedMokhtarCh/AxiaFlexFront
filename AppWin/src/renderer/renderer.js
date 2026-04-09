/* global appWinApi */

const byId = (id) => document.getElementById(id);

const els = {
  cloudApiUrl: byId("cloudApiUrl"),
  agentMasterToken: byId("agentMasterToken"),
  terminalAlias: byId("terminalAlias"),
  siteName: byId("siteName"),
  pollMs: byId("pollMs"),
  saveBtn: byId("saveBtn"),
  startBtn: byId("startBtn"),
  stopBtn: byId("stopBtn"),
  statusText: byId("statusText"),
  agentPathText: byId("agentPathText"),
  serviceStatusText: byId("serviceStatusText"),
  installServiceBtn: byId("installServiceBtn"),
  uninstallServiceBtn: byId("uninstallServiceBtn"),
  refreshServiceBtn: byId("refreshServiceBtn"),
  refreshPrintersBtn: byId("refreshPrintersBtn"),
  printersSelect: byId("printersSelect"),
  testPrintText: byId("testPrintText"),
  testPrintBtn: byId("testPrintBtn"),
  logs: byId("logs"),
};

function setStatus(running) {
  els.statusText.textContent = `Agent: ${running ? "en cours d'execution" : "arrete"}`;
}

function appendLog(line) {
  if (!line) return;
  const cur = els.logs.textContent || "";
  els.logs.textContent = `${cur}${cur ? "\n" : ""}${line}`;
  els.logs.scrollTop = els.logs.scrollHeight;
}

function setServiceStatus(statusObj) {
  if (!statusObj || statusObj.installed === false) {
    els.serviceStatusText.textContent =
      "Demarrage auto: aucune tache planifiee (remplace le service Windows pour eviter l erreur 1053 avec Node.js).";
    return;
  }
  if (statusObj.mode === "task") {
    const lr = statusObj.lastRunTime ? String(statusObj.lastRunTime) : "—";
    const lrCode =
      statusObj.lastTaskResult != null ? String(statusObj.lastTaskResult) : "?";
    els.serviceStatusText.textContent = `Tache "${statusObj.taskName || "AxiaFlexPrintAgent"}": ${statusObj.state || "?"} | dernier run: ${lr} | code: ${lrCode}`;
    return;
  }
  els.serviceStatusText.textContent = `Statut: ${JSON.stringify(statusObj)}`;
}

async function refreshServiceStatus() {
  const res = await appWinApi.getServiceStatus();
  setServiceStatus(res?.status || null);
}

async function refreshPrinters() {
  const res = await appWinApi.detectPrinters();
  els.printersSelect.innerHTML = "";
  const printers = Array.isArray(res?.printers) ? res.printers : [];
  if (!printers.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Aucune imprimante detectee";
    els.printersSelect.appendChild(o);
    return;
  }
  printers.forEach((p) => {
    const o = document.createElement("option");
    o.value = String(p.Name || "");
    o.textContent = `${String(p.Name || "")} (${String(p.PortName || "port?")})`;
    els.printersSelect.appendChild(o);
  });
}

async function saveConfig() {
  await appWinApi.saveConfig({
    cloudApiUrl: els.cloudApiUrl.value.trim(),
    agentMasterToken: els.agentMasterToken.value.trim(),
    terminalAlias: els.terminalAlias.value.trim(),
    siteName: els.siteName.value.trim(),
    pollMs: Number.parseInt(els.pollMs.value || "3000", 10),
  });
  appendLog("Configuration enregistree.");
}

async function init() {
  const cfg = await appWinApi.getConfig();
  els.cloudApiUrl.value = String(cfg.cloudApiUrl || "");
  els.agentMasterToken.value = String(cfg.agentMasterToken || "");
  els.terminalAlias.value = String(cfg.terminalAlias || "TERMINAL-1");
  els.siteName.value = String(cfg.siteName || "SITE-A");
  els.pollMs.value = String(cfg.pollMs || 3000);

  const status = await appWinApi.getAgentStatus();
  setStatus(Boolean(status.running));
  els.agentPathText.textContent = `Script agent: ${status.agentScriptPath || "N/A"}`;
  (status.logs || []).forEach((line) => appendLog(line));
  await refreshServiceStatus();
  await refreshPrinters();
}

els.saveBtn.addEventListener("click", async () => {
  await saveConfig();
});

els.startBtn.addEventListener("click", async () => {
  await saveConfig();
  const result = await appWinApi.startAgent();
  if (!result?.ok) appendLog(`Erreur start: ${result?.error || "inconnue"}`);
  setStatus(Boolean(result?.ok));
});

els.stopBtn.addEventListener("click", async () => {
  const result = await appWinApi.stopAgent();
  if (!result?.ok) appendLog(`Erreur stop: ${result?.error || "inconnue"}`);
  setStatus(false);
});

els.installServiceBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.installService();
  appendLog(
    res?.ok
      ? `Demarrage auto (tache planifiee): ${res.stdout || "OK"}`
      : `Erreur installation demarrage auto: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
  await refreshServiceStatus();
});

els.uninstallServiceBtn.addEventListener("click", async () => {
  const res = await appWinApi.uninstallService();
  appendLog(
    res?.ok
      ? `Demarrage auto supprime: ${res.stdout || "OK"}`
      : `Erreur suppression demarrage auto: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
  await refreshServiceStatus();
});

els.refreshServiceBtn.addEventListener("click", async () => {
  await refreshServiceStatus();
});

els.refreshPrintersBtn.addEventListener("click", async () => {
  await refreshPrinters();
});

els.testPrintBtn.addEventListener("click", async () => {
  const printerName = String(els.printersSelect.value || "").trim();
  const text = String(els.testPrintText.value || "").trim() || "Test impression AxiaFlex";
  if (!printerName) {
    appendLog("Choisissez une imprimante.");
    return;
  }
  const res = await appWinApi.testPrint(printerName, text);
  appendLog(res?.ok ? "Test impression envoye." : `Erreur test impression: ${res?.error || "inconnue"}`);
});

appWinApi.onAgentLog((line) => appendLog(line));
appWinApi.onAgentStatus((running) => setStatus(Boolean(running)));

init().catch((e) => appendLog(`Erreur init: ${String(e?.message || e)}`));
