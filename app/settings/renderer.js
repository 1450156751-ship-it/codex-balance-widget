const form = document.querySelector("#settings-form");

async function load() {
  const settings = await window.balanceWidget.getSettings();
  form.endpoint.value = settings.endpoint;
  form.apiKey.value = "";
  form.header.value = settings.header;
  form.prefix.value = settings.prefix;
  form.balancePath.value = settings.balancePath;
}

document.querySelector("#close").addEventListener("click", () => window.balanceWidget.closeSettings());
document.querySelector("#cancel").addEventListener("click", () => window.balanceWidget.closeSettings());
document.querySelector("#clear-key").addEventListener("click", async () => {
  await window.balanceWidget.clearKey();
  window.balanceWidget.closeSettings();
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
