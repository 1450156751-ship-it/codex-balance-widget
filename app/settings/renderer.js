const form = document.querySelector("#settings-form");
const companionStatus = document.querySelector("#companion-status");
const clearCompanionButton = document.querySelector("#clear-companion");

function renderCompanionStatus(companion) {
  companionStatus.textContent = companion.custom
    ? `已使用本机图片${companion.width && companion.height ? `（${companion.width} × ${companion.height}）` : ""}`
    : "正在使用默认占位图";
  clearCompanionButton.disabled = !companion.custom;
}

async function load() {
  const settings = await window.balanceWidget.getSettings();
  form.endpoint.value = settings.endpoint;
  form.apiKey.value = "";
  form.header.value = settings.header;
  form.prefix.value = settings.prefix;
  form.balancePath.value = settings.balancePath;
  renderCompanionStatus(await window.balanceWidget.getCompanion());
}

document.querySelector("#close").addEventListener("click", () => window.balanceWidget.closeSettings());
document.querySelector("#cancel").addEventListener("click", () => window.balanceWidget.closeSettings());
document.querySelector("#clear-key").addEventListener("click", async () => {
  await window.balanceWidget.clearKey();
  window.balanceWidget.closeSettings();
});
document.querySelector("#select-companion").addEventListener("click", async () => {
  try {
    renderCompanionStatus(await window.balanceWidget.selectCompanion());
  } catch (error) {
    companionStatus.textContent = error.message;
  }
});
clearCompanionButton.addEventListener("click", async () => {
  renderCompanionStatus(await window.balanceWidget.clearCompanion());
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  await window.balanceWidget.saveSettings({
    endpoint: data.get("endpoint"),
    apiKey: data.get("apiKey") || undefined,
    header: data.get("header"),
    prefix: data.get("prefix"),
    balancePath: data.get("balancePath") || "auto",
  });
  window.balanceWidget.closeSettings();
});

load();
