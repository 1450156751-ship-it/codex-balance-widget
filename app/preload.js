const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("balanceWidget", {
  getState: () => ipcRenderer.invoke("widget:get-state"),
  getCompanion: () => ipcRenderer.invoke("widget:get-companion"),
  refresh: () => ipcRenderer.invoke("widget:refresh"),
  togglePin: () => ipcRenderer.invoke("widget:toggle-pin"),
  getSettings: () => ipcRenderer.invoke("widget:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("widget:save-settings", settings),
  clearKey: () => ipcRenderer.invoke("widget:clear-key"),
  selectCompanion: () => ipcRenderer.invoke("settings:select-companion"),
  clearCompanion: () => ipcRenderer.invoke("settings:clear-companion"),
  openSettings: () => ipcRenderer.send("widget:open-settings"),
  hide: () => ipcRenderer.send("widget:hide"),
  startDrag: () => ipcRenderer.send("widget:drag-start"),
  moveDrag: () => ipcRenderer.send("widget:drag-move"),
  endDrag: () => ipcRenderer.send("widget:drag-end"),
  closeSettings: () => ipcRenderer.send("settings:close"),
  onState: (callback) => ipcRenderer.on("widget:state", (_event, state) => callback(state)),
  onCompanion: (callback) => ipcRenderer.on("widget:companion", (_event, companion) => callback(companion)),
  onDragPreview: (callback) => ipcRenderer.on("widget:drag-preview", (_event, payload) => callback(payload)),
  onDock: (callback) => ipcRenderer.on("widget:dock", (_event, payload) => callback(payload)),
});
