const balanceNode = document.querySelector("#balance");
const statusNode = document.querySelector("#status");
const progressNode = document.querySelector("#balance-progress");
const progressFillNode = document.querySelector("#balance-progress-fill");
const balanceStateNode = document.querySelector("#balance-state");
const pinButton = document.querySelector("#pin-button");
const card = document.querySelector(".balance-card");
let activePointerId = null;
let dragFrame = null;

function isInteractive(target) {
  return Boolean(target.closest("button, input, select, textarea, a, label"));
}

function endDrag() {
  if (activePointerId === null) return;
  if (dragFrame) cancelAnimationFrame(dragFrame);
  dragFrame = null;
  activePointerId = null;
  window.balanceWidget.endDrag();
}

card.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || isInteractive(event.target)) return;
  activePointerId = event.pointerId;
  card.setPointerCapture(event.pointerId);
  window.balanceWidget.startDrag();
  event.preventDefault();
});

card.addEventListener("pointermove", () => {
  if (activePointerId === null || dragFrame) return;
  dragFrame = requestAnimationFrame(() => {
    dragFrame = null;
    window.balanceWidget.moveDrag();
  });
});

card.addEventListener("pointerup", endDrag);
card.addEventListener("pointercancel", endDrag);

function render(state) {
  const validBalance = Number.isFinite(state.balance);
  balanceNode.textContent = validBalance ? state.balance.toFixed(2) : "--";
  statusNode.textContent = state.status;
  statusNode.dataset.error = /无效|拒绝|失败|超时|未找到/.test(state.status) ? "true" : "false";
  if (!validBalance) {
    progressNode.dataset.level = "unknown";
    progressFillNode.style.width = "8%";
    balanceStateNode.textContent = "等待余额数据";
  } else if (state.balance < 2) {
    progressNode.dataset.level = "critical";
    progressFillNode.style.width = `${Math.max(4, state.balance * 10)}%`;
    balanceStateNode.textContent = "余额不足";
  } else if (state.balance < 6) {
    progressNode.dataset.level = "warning";
    progressFillNode.style.width = `${Math.min(100, state.balance * 10)}%`;
    balanceStateNode.textContent = "余额偏低";
  } else {
    progressNode.dataset.level = "healthy";
    progressFillNode.style.width = `${Math.min(100, state.balance * 10)}%`;
    balanceStateNode.textContent = "余额充足";
  }
  pinButton.textContent = state.pinned ? "已置顶" : "不置顶";
}

document.querySelector("#refresh-button").addEventListener("click", () => window.balanceWidget.refresh());
pinButton.addEventListener("click", () => window.balanceWidget.togglePin());
document.querySelector("#minimize-button").addEventListener("click", () => window.balanceWidget.hide());
document.querySelector("#settings-button").addEventListener("click", () => window.balanceWidget.openSettings());

window.balanceWidget.onState(render);
window.balanceWidget.onDragPreview(({ side }) => {
  card.dataset.dockSide = side || "";
  card.classList.toggle("dock-preview", Boolean(side));
});
window.balanceWidget.onDock(({ side, impact }) => {
  card.dataset.dockSide = side;
  if (!impact) return;
  const className = `edge-impact-${side}`;
  card.classList.remove("edge-impact-left", "edge-impact-right", "edge-impact-top", "edge-impact-bottom");
  void card.offsetWidth;
  card.classList.add(className);
  setTimeout(() => card.classList.remove(className), 320);
});
window.balanceWidget.getState().then(render);
