/* global appWinApi */

const byId = (id) => document.getElementById(id);

const els = {
  cloudApiUrl: byId("cloudApiUrl"),
  agentMasterToken: byId("agentMasterToken"),
  toggleTokenBtn: byId("toggleTokenBtn"),
  terminalAlias: byId("terminalAlias"),
  siteName: byId("siteName"),
  pollMs: byId("pollMs"),
  nodeExePath: byId("nodeExePath"),
  bridgeInstallerPath: byId("bridgeInstallerPath"),
  bridgePickInstallerBtn: byId("bridgePickInstallerBtn"),
  bridgeInstallAppBtn: byId("bridgeInstallAppBtn"),
  bridgeExePath: byId("bridgeExePath"),
  bridgeArgs: byId("bridgeArgs"),
  bridgeHealthUrl: byId("bridgeHealthUrl"),
  bridgeLocalPort: byId("bridgeLocalPort"),
  bridgeLocalToken: byId("bridgeLocalToken"),
  bridgeTaskName: byId("bridgeTaskName"),
  bridgeServerStatusText: byId("bridgeServerStatusText"),
  saveBtn: byId("saveBtn"),
  testConnectionBtn: byId("testConnectionBtn"),
  syncPrintersBtn: byId("syncPrintersBtn"),
  startBtn: byId("startBtn"),
  stopBtn: byId("stopBtn"),
  statusText: byId("statusText"),
  taskHealthBadge: byId("taskHealthBadge"),
  agentPathText: byId("agentPathText"),
  serviceStatusText: byId("serviceStatusText"),
  installServiceBtn: byId("installServiceBtn"),
  patchServiceBtn: byId("patchServiceBtn"),
  restartTaskBtn: byId("restartTaskBtn"),
  openWorkerLogBtn: byId("openWorkerLogBtn"),
  uninstallServiceBtn: byId("uninstallServiceBtn"),
  refreshServiceBtn: byId("refreshServiceBtn"),
  bridgeStartBtn: byId("bridgeStartBtn"),
  bridgeInstallBtn: byId("bridgeInstallBtn"),
  bridgeUninstallBtn: byId("bridgeUninstallBtn"),
  bridgeStatusBtn: byId("bridgeStatusBtn"),
  bridgeServerRestartBtn: byId("bridgeServerRestartBtn"),
  bridgeServerStatusBtn: byId("bridgeServerStatusBtn"),
  bridgeHealthBtn: byId("bridgeHealthBtn"),
  tplRefreshBtn: byId("tplRefreshBtn"),
  tplImportClientNacefBtn: byId("tplImportClientNacefBtn"),
  tplImportClientDefaultBtn: byId("tplImportClientDefaultBtn"),
  tplImportKitchenBtn: byId("tplImportKitchenBtn"),
  tplImportBarBtn: byId("tplImportBarBtn"),
  tplClearClientNacefBtn: byId("tplClearClientNacefBtn"),
  tplClearClientDefaultBtn: byId("tplClearClientDefaultBtn"),
  tplClearKitchenBtn: byId("tplClearKitchenBtn"),
  tplClearBarBtn: byId("tplClearBarBtn"),
  templatesStatus: byId("templatesStatus"),
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

function setTaskHealth(label, kind) {
  const el = els.taskHealthBadge;
  if (!el) return;
  el.textContent = label;
  el.className = `badge badge-${kind}`;
}

function describeTaskResult(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return "Code inconnu.";
  const bySigned = {
    0: "Succès : dernière exécution terminée correctement.",
    267009: "0x41301 : tâche en cours d'exécution.",
    267008: "0x41300 : tâche prête à s'exécuter.",
    267011: "0x41303 : tâche n'a pas encore été exécutée.",
    "-1073740791": "0xC0000409 : crash du processus (arrêt anormal).",
  };
  if (Object.prototype.hasOwnProperty.call(bySigned, String(n))) {
    return bySigned[String(n)];
  }
  const unsigned = n < 0 ? 0x100000000 + n : n;
  const hex = `0x${unsigned.toString(16).toUpperCase()}`;
  return `${hex} : résultat non mappé (voir Journaux des tâches Windows).`;
}

function setServiceStatus(statusObj) {
  if (!statusObj || statusObj.installed === false) {
    setTaskHealth("Non installée", "neutral");
    if (els.taskHealthBadge) {
      els.taskHealthBadge.title = "Aucune tâche planifiée détectée.";
    }
    els.serviceStatusText.textContent =
      "Demarrage auto: aucune tache planifiee (remplace le service Windows pour eviter l erreur 1053 avec Node.js).";
    return;
  }
  if (statusObj.mode === "task") {
    const lr = statusObj.lastRunTime ? String(statusObj.lastRunTime) : "—";
    const lrCode =
      statusObj.lastTaskResult != null ? String(statusObj.lastTaskResult) : "?";
    const codeNum = Number(statusObj.lastTaskResult);
    const tooltip = describeTaskResult(codeNum);
    if (els.taskHealthBadge) {
      els.taskHealthBadge.title = tooltip;
    }
    if (statusObj.state === "Running" || codeNum === 267009) {
      setTaskHealth("En cours", "warn");
    } else if (codeNum === 0) {
      setTaskHealth("OK", "ok");
    } else {
      setTaskHealth(`Erreur (${lrCode})`, "err");
    }
    els.serviceStatusText.textContent = `Tache "${statusObj.taskName || "AxiaPrintersPrintAgent"}": ${statusObj.state || "?"} | dernier run: ${lr} | code: ${lrCode}`;
    return;
  }
  setTaskHealth("Inconnu", "neutral");
  if (els.taskHealthBadge) {
    els.taskHealthBadge.title = "Statut de tâche non disponible.";
  }
  els.serviceStatusText.textContent = `Statut: ${JSON.stringify(statusObj)}`;
}

function setBridgeServerStatusText(s) {
  const msg = s?.running
    ? `Bridge local AxiaPrinters: ONLINE sur port ${s.port || "?"}`
    : `Bridge local AxiaPrinters: OFFLINE (enabled=${Boolean(s?.enabled)})`;
  els.bridgeServerStatusText.textContent = msg;
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

async function refreshTemplatesStatus() {
  const res = await appWinApi.listTemplates();
  if (!res?.ok) {
    els.templatesStatus.textContent = `Erreur templates: ${res?.error || "inconnue"}`;
    return;
  }
  const slots = res?.slots || {};
  const order = ["client_nacef", "client_default", "kitchen", "bar"];
  els.templatesStatus.textContent = order
    .map((k) => {
      const s = slots[k] || {};
      return s.exists
        ? `${k}: OK (${Number(s.size || 0)} bytes) - ${String(s.updatedAt || "")}`
        : `${k}: non défini`;
    })
    .join("\n");
}

async function saveConfig() {
  await appWinApi.saveConfig({
    cloudApiUrl: els.cloudApiUrl.value.trim(),
    agentMasterToken: els.agentMasterToken.value.trim(),
    terminalAlias: els.terminalAlias.value.trim(),
    siteName: els.siteName.value.trim(),
    pollMs: Number.parseInt(els.pollMs.value || "3000", 10),
    nodeExePath: String(els.nodeExePath.value || "").trim(),
    desktopBridge: {
      installerPath: String(els.bridgeInstallerPath.value || "").trim(),
      exePath: String(els.bridgeExePath.value || "").trim(),
      args: String(els.bridgeArgs.value || "").trim(),
      healthUrl: String(els.bridgeHealthUrl.value || "").trim(),
      taskName:
        String(els.bridgeTaskName.value || "").trim() ||
        "AxiaPrintersDesktopBridgeAutostart",
      localServerEnabled: true,
      localServerPort: Number(els.bridgeLocalPort.value || 17888),
      localServerToken: String(els.bridgeLocalToken.value || "").trim(),
    },
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
  els.nodeExePath.value = String(cfg.nodeExePath || "");
  const bridge = cfg?.desktopBridge || {};
  els.bridgeInstallerPath.value = String(bridge.installerPath || "");
  els.bridgeExePath.value = String(bridge.exePath || "");
  els.bridgeArgs.value = String(bridge.args || "");
  els.bridgeHealthUrl.value = String(
    bridge.healthUrl || "http://127.0.0.1:17888/health",
  );
  els.bridgeLocalPort.value = String(bridge.localServerPort || 17888);
  els.bridgeLocalToken.value = String(bridge.localServerToken || "");
  els.bridgeTaskName.value = String(
    bridge.taskName || "AxiaPrintersDesktopBridgeAutostart",
  );

  const status = await appWinApi.getAgentStatus();
  setStatus(Boolean(status.running));
  els.agentPathText.textContent = `Script agent: ${status.agentScriptPath || "N/A"}`;
  (status.logs || []).forEach((line) => appendLog(line));
  await refreshServiceStatus();
  const bridgeSrv = await appWinApi.desktopBridgeServerStatus();
  setBridgeServerStatusText(bridgeSrv);
  await refreshPrinters();
  await refreshTemplatesStatus();
}

els.saveBtn.addEventListener("click", async () => {
  await saveConfig();
});

els.testConnectionBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.testConnection();
  appendLog(
    res?.ok
      ? `Connexion cloud OK. Terminal: ${res?.alias || "?"} (${res?.terminalId || "id?"})`
      : `Connexion cloud KO: ${res?.error || "inconnue"}`,
  );
});

els.syncPrintersBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.syncPrintersNow();
  appendLog(
    res?.ok
      ? `Sync imprimantes OK. Terminal: ${res?.terminalAlias || "?"}, imprimantes: ${Number(res?.count || 0)}`
      : `Sync imprimantes KO: ${res?.error || "inconnue"}`,
  );
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

els.patchServiceBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.patchService();
  appendLog(
    res?.ok
      ? `Patch demarrage auto: ${res.stdout || "OK"}`
      : `Erreur patch demarrage auto: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
  await refreshServiceStatus();
});

els.restartTaskBtn.addEventListener("click", async () => {
  const res = await appWinApi.restartTask();
  appendLog(
    res?.ok
      ? `Redemarrage tache: ${res.stdout || "OK"}`
      : `Erreur redemarrage tache: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
  await refreshServiceStatus();
});

els.openWorkerLogBtn.addEventListener("click", async () => {
  const res = await appWinApi.openWorkerLog();
  appendLog(
    res?.ok
      ? `Ouverture log agent: ${res.path || "OK"}`
      : `Erreur ouverture log agent: ${res?.error || "inconnue"}`,
  );
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

els.bridgeStartBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeStartNow();
  appendLog(
    res?.ok
      ? "Desktop Bridge demarre."
      : `Erreur Desktop Bridge start: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
});

els.bridgePickInstallerBtn.addEventListener("click", async () => {
  const res = await appWinApi.desktopBridgePickInstaller();
  if (res?.ok && res?.path) {
    els.bridgeInstallerPath.value = String(res.path);
    appendLog(`Installateur sélectionné: ${res.path}`);
  }
});

els.bridgeInstallAppBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeInstallApp();
  appendLog(
    res?.ok
      ? `Installation Bridge terminée: ${res?.stdout || "OK"}`
      : `Erreur installation Bridge: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
});

els.bridgeInstallBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeInstallAutostart();
  appendLog(
    res?.ok
      ? `Auto-start Desktop Bridge installe: ${res?.stdout || "OK"}`
      : `Erreur install auto-start Desktop Bridge: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
});

els.bridgeUninstallBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeUninstallAutostart();
  appendLog(
    res?.ok
      ? `Auto-start Desktop Bridge supprime: ${res?.stdout || "OK"}`
      : `Erreur suppression auto-start Desktop Bridge: ${res?.stderr || res?.stdout || res?.error || "inconnue"}`,
  );
});

els.bridgeStatusBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeStatus();
  appendLog(
    res?.ok
      ? `Desktop Bridge task status: ${JSON.stringify(res?.status || {})}`
      : `Erreur statut Desktop Bridge: ${res?.error || "inconnue"}`,
  );
});

els.bridgeServerStatusBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeServerStatus();
  setBridgeServerStatusText(res);
  appendLog(`Bridge local status: ${JSON.stringify(res || {})}`);
});

els.bridgeServerRestartBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeServerRestart();
  const status = await appWinApi.desktopBridgeServerStatus();
  setBridgeServerStatusText(status);
  appendLog(
    res?.ok
      ? `Bridge local redémarré: ${JSON.stringify(res)}`
      : `Erreur redémarrage bridge local: ${res?.error || "inconnue"}`,
  );
});

els.bridgeHealthBtn.addEventListener("click", async () => {
  await saveConfig();
  const res = await appWinApi.desktopBridgeTestHealth();
  appendLog(
    res?.ok
      ? `Desktop Bridge health OK: ${res?.stdout || ""}`
      : `Desktop Bridge health KO: ${res?.stderr || res?.stdout || res?.error || "offline"}`,
  );
});

els.tplRefreshBtn.addEventListener("click", async () => {
  await refreshTemplatesStatus();
});
els.tplImportClientNacefBtn.addEventListener("click", async () => {
  const res = await appWinApi.importTemplate("client_nacef");
  appendLog(res?.ok ? "Template client NACEF importé." : `Import KO: ${res?.error || "annulé"}`);
  await refreshTemplatesStatus();
});
els.tplImportClientDefaultBtn.addEventListener("click", async () => {
  const res = await appWinApi.importTemplate("client_default");
  appendLog(res?.ok ? "Template client défaut importé." : `Import KO: ${res?.error || "annulé"}`);
  await refreshTemplatesStatus();
});
els.tplImportKitchenBtn.addEventListener("click", async () => {
  const res = await appWinApi.importTemplate("kitchen");
  appendLog(res?.ok ? "Template cuisine importé." : `Import KO: ${res?.error || "annulé"}`);
  await refreshTemplatesStatus();
});
els.tplImportBarBtn.addEventListener("click", async () => {
  const res = await appWinApi.importTemplate("bar");
  appendLog(res?.ok ? "Template bar importé." : `Import KO: ${res?.error || "annulé"}`);
  await refreshTemplatesStatus();
});
els.tplClearClientNacefBtn.addEventListener("click", async () => {
  const res = await appWinApi.clearTemplate("client_nacef");
  appendLog(res?.ok ? "Template client NACEF supprimé." : `Suppression KO: ${res?.error || "inconnue"}`);
  await refreshTemplatesStatus();
});
els.tplClearClientDefaultBtn.addEventListener("click", async () => {
  const res = await appWinApi.clearTemplate("client_default");
  appendLog(res?.ok ? "Template client défaut supprimé." : `Suppression KO: ${res?.error || "inconnue"}`);
  await refreshTemplatesStatus();
});
els.tplClearKitchenBtn.addEventListener("click", async () => {
  const res = await appWinApi.clearTemplate("kitchen");
  appendLog(res?.ok ? "Template cuisine supprimé." : `Suppression KO: ${res?.error || "inconnue"}`);
  await refreshTemplatesStatus();
});
els.tplClearBarBtn.addEventListener("click", async () => {
  const res = await appWinApi.clearTemplate("bar");
  appendLog(res?.ok ? "Template bar supprimé." : `Suppression KO: ${res?.error || "inconnue"}`);
  await refreshTemplatesStatus();
});

els.refreshPrintersBtn.addEventListener("click", async () => {
  await refreshPrinters();
});

els.testPrintBtn.addEventListener("click", async () => {
  const printerName = String(els.printersSelect.value || "").trim();
  const text = String(els.testPrintText.value || "").trim() || "Test impression AxiaPrinters";
  if (!printerName) {
    appendLog("Choisissez une imprimante.");
    return;
  }
  const res = await appWinApi.testPrint(printerName, text);
  appendLog(res?.ok ? "Test impression envoye." : `Erreur test impression: ${res?.error || "inconnue"}`);
});

els.toggleTokenBtn.addEventListener("click", () => {
  const isPwd = els.agentMasterToken.type === "password";
  els.agentMasterToken.type = isPwd ? "text" : "password";
  els.toggleTokenBtn.textContent = isPwd ? "masquer" : "oeil";
});

appWinApi.onAgentLog((line) => appendLog(line));
appWinApi.onAgentStatus((running) => setStatus(Boolean(running)));

init().catch((e) => appendLog(`Erreur init: ${String(e?.message || e)}`));
