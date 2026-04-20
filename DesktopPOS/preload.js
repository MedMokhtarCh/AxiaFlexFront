const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPOS", {
  ping: () => "pong",
  send: (channel, payload) => ipcRenderer.send(channel, payload),
});
