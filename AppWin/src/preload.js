const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appWinApi", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (cfg) => ipcRenderer.invoke("config:save", cfg),
  startAgent: () => ipcRenderer.invoke("agent:start"),
  stopAgent: () => ipcRenderer.invoke("agent:stop"),
  getAgentStatus: () => ipcRenderer.invoke("agent:status"),
  detectPrinters: () => ipcRenderer.invoke("agent:detect-printers"),
  testConnection: () => ipcRenderer.invoke("agent:test-connection"),
  syncPrintersNow: () => ipcRenderer.invoke("agent:sync-printers-now"),
  testPrint: (printerName, text) =>
    ipcRenderer.invoke("agent:test-print", printerName, text),
  listTemplates: () => ipcRenderer.invoke("templates:list"),
  importTemplate: (slot) => ipcRenderer.invoke("templates:import", slot),
  clearTemplate: (slot) => ipcRenderer.invoke("templates:clear", slot),
  importLogo: () => ipcRenderer.invoke("logo:import"),
  clearLogo: () => ipcRenderer.invoke("logo:clear"),
  installService: () => ipcRenderer.invoke("service:install"),
  patchService: () => ipcRenderer.invoke("service:patch"),
  restartTask: () => ipcRenderer.invoke("service:restart-task"),
  openWorkerLog: () => ipcRenderer.invoke("service:open-worker-log"),
  uninstallService: () => ipcRenderer.invoke("service:uninstall"),
  getServiceStatus: () => ipcRenderer.invoke("service:status"),
  desktopBridgeStartNow: () => ipcRenderer.invoke("desktop-bridge:start-now"),
  desktopBridgePickInstaller: () => ipcRenderer.invoke("desktop-bridge:pick-installer"),
  desktopBridgeInstallApp: () => ipcRenderer.invoke("desktop-bridge:install-app"),
  desktopBridgeInstallAutostart: () =>
    ipcRenderer.invoke("desktop-bridge:install-autostart"),
  desktopBridgeUninstallAutostart: () =>
    ipcRenderer.invoke("desktop-bridge:uninstall-autostart"),
  desktopBridgeStatus: () => ipcRenderer.invoke("desktop-bridge:status"),
  desktopBridgeServerStatus: () => ipcRenderer.invoke("desktop-bridge:server-status"),
  desktopBridgeServerRestart: () => ipcRenderer.invoke("desktop-bridge:server-restart"),
  desktopBridgeTestHealth: () => ipcRenderer.invoke("desktop-bridge:test-health"),
  onAgentLog: (cb) => ipcRenderer.on("agent-log", (_e, line) => cb(line)),
  onAgentStatus: (cb) => ipcRenderer.on("agent-status", (_e, running) => cb(running)),
});
