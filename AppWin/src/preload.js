const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appWinApi", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (cfg) => ipcRenderer.invoke("config:save", cfg),
  startAgent: () => ipcRenderer.invoke("agent:start"),
  stopAgent: () => ipcRenderer.invoke("agent:stop"),
  getAgentStatus: () => ipcRenderer.invoke("agent:status"),
  detectPrinters: () => ipcRenderer.invoke("agent:detect-printers"),
  testPrint: (printerName, text) =>
    ipcRenderer.invoke("agent:test-print", printerName, text),
  installService: () => ipcRenderer.invoke("service:install"),
  patchService: () => ipcRenderer.invoke("service:patch"),
  restartTask: () => ipcRenderer.invoke("service:restart-task"),
  openWorkerLog: () => ipcRenderer.invoke("service:open-worker-log"),
  uninstallService: () => ipcRenderer.invoke("service:uninstall"),
  getServiceStatus: () => ipcRenderer.invoke("service:status"),
  onAgentLog: (cb) => ipcRenderer.on("agent-log", (_e, line) => cb(line)),
  onAgentStatus: (cb) => ipcRenderer.on("agent-status", (_e, running) => cb(running)),
});
