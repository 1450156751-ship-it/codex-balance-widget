const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, safeStorage, screen } = require("electron");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const path = require("node:path");

const execFileAsync = promisify(execFile);
const REFRESH_MS = 5 * 60 * 1000;
const CODEX_CHECK_MS = 3 * 1000;
const DEFAULT_ENDPOINT = "https://modcon.top/v1/usage";
const SNAP_DISTANCE = 22;
const IMPACT_VELOCITY = 1.35;

let widget;
let settingsWindow;
let tray;
let refreshTimer;
let monitorTimer;
let boundsSaveTimer;
let dragSession;
let isQuitting = false;
let codexWasRunning = false;
let state = {
  balance: null,
  status: "等待 Codex 启动",
  updatedAt: null,
  pinned: false,
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (widget && !widget.isDestroyed()) showWidget();
});

function configPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), "utf8"));
    return {
      endpoint: raw.endpoint || DEFAULT_ENDPOINT,
      header: raw.header || "Authorization",
      prefix: raw.prefix || "Bearer",
      balancePath: raw.balancePath || "auto",
      apiKey: raw.apiKey && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(raw.apiKey, "base64")) : "",
      bounds: raw.bounds,
      pinned: Boolean(raw.pinned),
    };
  } catch {
    return { endpoint: DEFAULT_ENDPOINT, header: "Authorization", prefix: "Bearer", balancePath: "auto", apiKey: "", bounds: null, pinned: false };
  }
}

async function writeSettings(next) {
  const existing = await readSettings();
  const apiKey = next.apiKey === undefined ? existing.apiKey : next.apiKey;
  const encryptedKey = apiKey && safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(apiKey).toString("base64")
    : "";
  const stored = {
    endpoint: next.endpoint ?? existing.endpoint,
    header: next.header ?? existing.header,
    prefix: next.prefix ?? existing.prefix,
    balancePath: next.balancePath ?? existing.balancePath,
    apiKey: encryptedKey,
    bounds: next.bounds ?? existing.bounds,
    pinned: next.pinned ?? existing.pinned,
  };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(stored, null, 2), "utf8");
  return { ...stored, apiKey };
}

function extractBalance(payload, customPath) {
  if (customPath && customPath !== "auto") {
    return customPath.split(".").reduce((value, part) => Array.isArray(value) ? value[Number(part)] : value?.[part], payload);
  }
  const paths = [
    ["remaining"], ["quota", "remaining"], ["balance"],
    ["data", "remaining"], ["data", "quota", "remaining"], ["data", "balance"],
  ];
  for (const parts of paths) {
    const result = parts.reduce((value, part) => value?.[part], payload);
    if (result !== undefined && result !== null) return result;
  }
  throw new Error("未找到余额字段");
}

function broadcastState() {
  if (widget && !widget.isDestroyed()) widget.webContents.send("widget:state", state);
}

async function refreshBalance() {
  const settings = await readSettings();
  if (!settings.apiKey) {
    state = { ...state, balance: null, status: "请在设置中填写 API Key", updatedAt: null };
    broadcastState();
    return state;
  }

  state = { ...state, status: "正在更新..." };
  broadcastState();
  const prefix = settings.prefix.trim();
  const authorization = prefix ? `${prefix} ${settings.apiKey}` : settings.apiKey;
  try {
    const response = await fetch(settings.endpoint, {
      headers: {
        [settings.header]: authorization,
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Codex-Balance-Widget/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(response.status === 401 ? "API Key 无效或已失效" : response.status === 403 ? "请求被平台拒绝" : `请求失败：HTTP ${response.status}`);
    const balance = extractBalance(await response.json(), settings.balancePath);
    state = { ...state, balance: Number(balance), status: "已更新", updatedAt: Date.now() };
  } catch (error) {
    state = { ...state, status: error.name === "TimeoutError" ? "请求超时" : error.message, updatedAt: null };
  }
  broadcastState();
  return state;
}

async function isCodexRunning() {
  try {
    const { stdout } = await execFileAsync("tasklist", ["/FI", "IMAGENAME eq codex.exe", "/NH"], { windowsHide: true });
    return stdout.toLowerCase().includes("codex.exe");
  } catch {
    return false;
  }
}

function showWidget() {
  if (!widget) return;
  widget.showInactive();
  widget.moveTop();
  refreshBalance();
}

function hideWidget() {
  if (widget && widget.isVisible()) widget.hide();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function edgeDistances(bounds, workArea) {
  return {
    left: Math.abs(bounds.x - workArea.x),
    right: Math.abs(workArea.x + workArea.width - (bounds.x + bounds.width)),
    top: Math.abs(bounds.y - workArea.y),
    bottom: Math.abs(workArea.y + workArea.height - (bounds.y + bounds.height)),
  };
}

function nearestDockSide(bounds, workArea) {
  const distances = edgeDistances(bounds, workArea);
  const [side, distance] = Object.entries(distances).reduce((closest, current) => current[1] < closest[1] ? current : closest);
  return distance <= SNAP_DISTANCE ? side : null;
}

function constrainBounds(bounds, workArea) {
  return {
    ...bounds,
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - bounds.width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height),
  };
}

function dockBounds(bounds, side, workArea) {
  const result = constrainBounds(bounds, workArea);
  if (side === "left") result.x = workArea.x;
  if (side === "right") result.x = workArea.x + workArea.width - result.width;
  if (side === "top") result.y = workArea.y;
  if (side === "bottom") result.y = workArea.y + workArea.height - result.height;
  return result;
}

function collisionSide(rawBounds, workArea) {
  const overflow = [
    ["left", workArea.x - rawBounds.x],
    ["right", rawBounds.x + rawBounds.width - (workArea.x + workArea.width)],
    ["top", workArea.y - rawBounds.y],
    ["bottom", rawBounds.y + rawBounds.height - (workArea.y + workArea.height)],
  ].filter(([, amount]) => amount > 0);
  if (!overflow.length) return null;
  return overflow.reduce((largest, current) => current[1] > largest[1] ? current : largest)[0];
}

function sendDragPreview(side) {
  if (widget && !widget.isDestroyed()) widget.webContents.send("widget:drag-preview", { side });
}

function saveWidgetBoundsSoon() {
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    if (widget && !widget.isDestroyed()) writeSettings({ bounds: widget.getBounds() }).catch(() => {});
  }, 260);
}

function beginWidgetDrag() {
  if (!widget || widget.isDestroyed()) return;
  const pointer = screen.getCursorScreenPoint();
  const bounds = widget.getBounds();
  dragSession = {
    startPointer: pointer,
    startBounds: bounds,
    lastPointer: pointer,
    lastAt: Date.now(),
    peakVelocity: 0,
    previewSide: null,
    collision: null,
  };
  sendDragPreview(null);
}

function moveWidgetDrag() {
  if (!dragSession || !widget || widget.isDestroyed()) return;
  const pointer = screen.getCursorScreenPoint();
  const now = Date.now();
  const elapsed = Math.max(now - dragSession.lastAt, 1);
  const distance = Math.hypot(pointer.x - dragSession.lastPointer.x, pointer.y - dragSession.lastPointer.y);
  dragSession.peakVelocity = Math.max(dragSession.peakVelocity, distance / elapsed);

  const rawBounds = {
    ...dragSession.startBounds,
    x: dragSession.startBounds.x + pointer.x - dragSession.startPointer.x,
    y: dragSession.startBounds.y + pointer.y - dragSession.startPointer.y,
  };
  const workArea = screen.getDisplayNearestPoint(pointer).workArea;
  const bounded = constrainBounds(rawBounds, workArea);
  const previewSide = nearestDockSide(bounded, workArea);
  // Keep following the pointer while dragging. The edge glow is only a preview;
  // the final snap happens on release so the motion stays fluid.
  const nextBounds = bounded;
  const collision = collisionSide(rawBounds, workArea);

  widget.setBounds(nextBounds, false);
  if (dragSession.previewSide !== previewSide) sendDragPreview(previewSide);
  dragSession.previewSide = previewSide;
  dragSession.collision = collision;
  dragSession.lastPointer = pointer;
  dragSession.lastAt = now;
}

function endWidgetDrag() {
  if (!dragSession || !widget || widget.isDestroyed()) return;
  const pointer = screen.getCursorScreenPoint();
  const workArea = screen.getDisplayNearestPoint(pointer).workArea;
  const current = widget.getBounds();
  const side = dragSession.previewSide || nearestDockSide(current, workArea);
  if (side) {
    widget.setBounds(dockBounds(current, side, workArea), false);
    const impact = dragSession.collision === side && dragSession.peakVelocity >= IMPACT_VELOCITY;
    widget.webContents.send("widget:dock", { side, impact });
  }
  sendDragPreview(null);
  dragSession = null;
  saveWidgetBoundsSoon();
}

async function monitorCodex() {
  const running = await isCodexRunning();
  if (running && !codexWasRunning) showWidget();
  if (!running && codexWasRunning) hideWidget();
  codexWasRunning = running;
}

function createTrayIcon() {
  return nativeImage.createFromPath(path.join(__dirname, "assets", "tray-icon.png"));
}

function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 540,
    height: 500,
    minWidth: 540,
    minHeight: 500,
    title: "Codex Balance 设置",
    modal: false,
    resizable: false,
    backgroundColor: "#f8faf9",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "settings", "index.html"));
  settingsWindow.once("ready-to-show", () => settingsWindow.show());
  settingsWindow.on("closed", () => { settingsWindow = undefined; });
}

function updateTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示余额", click: showWidget },
    { label: "隐藏组件", click: hideWidget },
    { type: "separator" },
    { label: "刷新余额", click: refreshBalance },
    { label: state.pinned ? "取消置顶" : "始终置顶", click: async () => setPinned(!state.pinned) },
    { label: "设置", click: showSettings },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

async function setPinned(pinned) {
  state = { ...state, pinned };
  widget.setAlwaysOnTop(pinned, "floating");
  await writeSettings({ pinned });
  updateTrayMenu();
  broadcastState();
}

async function createWidget() {
  const settings = await readSettings();
  const display = screen.getPrimaryDisplay().workArea;
  const savedBounds = settings.bounds;
  const bounds = {
    x: savedBounds?.x ?? display.x + display.width - 542,
    y: savedBounds?.y ?? display.y + display.height - 302,
    width: 510,
    height: 252,
  };
  state.pinned = settings.pinned;
  widget = new BrowserWindow({
    ...bounds,
    minWidth: 510,
    minHeight: 252,
    maxWidth: 510,
    maxHeight: 252,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    // A transparent Electron window otherwise receives a rectangular OS shadow.
    hasShadow: false,
    show: false,
    resizable: false,
    alwaysOnTop: settings.pinned,
    skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  widget.setMenuBarVisibility(false);
  widget.loadFile(path.join(__dirname, "renderer", "index.html"));
  widget.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      widget.hide();
    }
  });
  widget.on("moved", saveWidgetBoundsSoon);
  widget.webContents.on("did-finish-load", () => broadcastState());
}

function registerIpc() {
  ipcMain.on("widget:open-settings", showSettings);
  ipcMain.on("widget:hide", hideWidget);
  ipcMain.on("widget:drag-start", beginWidgetDrag);
  ipcMain.on("widget:drag-move", moveWidgetDrag);
  ipcMain.on("widget:drag-end", endWidgetDrag);
  ipcMain.on("settings:close", () => settingsWindow?.close());
  ipcMain.handle("widget:get-state", async () => state);
  ipcMain.handle("widget:refresh", refreshBalance);
  ipcMain.handle("widget:toggle-pin", () => setPinned(!state.pinned));
  ipcMain.handle("widget:get-settings", async () => {
    const settings = await readSettings();
    return { endpoint: settings.endpoint, header: settings.header, prefix: settings.prefix, balancePath: settings.balancePath, hasApiKey: Boolean(settings.apiKey) };
  });
  ipcMain.handle("widget:save-settings", async (_event, next) => {
    await writeSettings(next);
    await refreshBalance();
    return { ok: true };
  });
  ipcMain.handle("widget:clear-key", async () => {
    await writeSettings({ apiKey: "" });
    state = { ...state, balance: null, status: "API Key 已清除", updatedAt: null };
    broadcastState();
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("local.codex.balancewidget");
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  await createWidget();
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Codex Balance");
  tray.on("click", () => widget.isVisible() ? hideWidget() : showWidget());
  updateTrayMenu();
  registerIpc();
  await monitorCodex();
  monitorTimer = setInterval(monitorCodex, CODEX_CHECK_MS);
  refreshTimer = setInterval(refreshBalance, REFRESH_MS);
});

app.on("before-quit", () => { isQuitting = true; clearInterval(monitorTimer); clearInterval(refreshTimer); });
app.on("window-all-closed", (event) => event.preventDefault());
