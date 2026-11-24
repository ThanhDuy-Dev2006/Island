const T = window.__TAURI__ || {};
const invoke = T.core?.invoke || (async () => null);
const listen = T.event?.listen || (async () => () => {});

const params = new URLSearchParams(window.location.search);
const viewMode = params.get("view") || "widgets";

const widgetsStage = document.getElementById("widgetsStage");
const widgetsCanvas = document.getElementById("widgetsCanvas");
const widgetCtxMenu = document.getElementById("widgetCtxMenu");
const widgetGallery = document.getElementById("widgetGallery");
const sceneStage = document.getElementById("sceneStage");

const WIDGET_TYPES = [
  { type: "clock", ico: "🕒", title: "Đồng hồ Kim", desc: "Mặt đồng hồ kim mượt theo giây" },
  { type: "digital", ico: "⌚", title: "Đồng hồ Số", desc: "Giờ lớn tabular & thứ ngày Việt" },
  { type: "world", ico: "🌍", title: "Giờ Thế Giới", desc: "Hà Nội · Tokyo · London" },
  { type: "calendar", ico: "📅", title: "Lịch & Cuộc họp", desc: "Hiển thị sự kiện Windows Calendar" },
  { type: "month", ico: "🗓️", title: "Lịch Tháng", desc: "Bảng ngày cả tháng hiện tại" },
  { type: "battery", ico: "🔋", title: "Pin Hệ Thống", desc: "Phần trăm pin & trạng thái sạc" },
  { type: "system", ico: "⚡", title: "Hiệu năng Hệ thống", desc: "CPU, RAM và tốc độ mạng" }
];

let widSettings = {
  colorMode: "dark",
  accentColor: "auto",
  widgetsStyle: "original",
  widgetsTopmost: false
};

let placedWidgets = [];
let hwSnapshot = { cpu_pct: 0, ram_pct: 0, net_down_kbps: 0, battery_pct: 100, is_charging: false };
let calendarEvents = [];
let rectsRaf = null;
let sceneWindows = [];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyThemeTokens() {
  const prefDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const mode = widSettings.colorMode === "auto" ? (prefDark ? "dark" : "light") : (widSettings.colorMode || "dark");
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.accent = widSettings.accentColor || "auto";
}

function scheduleSyncRects() {
  if (rectsRaf) return;
  rectsRaf = requestAnimationFrame(() => {
    rectsRaf = null;
    if (viewMode === "scene") {
      const r = sceneStage?.getBoundingClientRect();
      const rects = r && r.width > 2 ? [[r.left, r.top, r.right, r.bottom]] : [];
      invoke("set_shell_interactive_rects", { label: "scene_strip", rects, topmost: true }).catch(() => {});
      return;
    }
    const rects = [];
    document.querySelectorAll(".widget-card").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) rects.push([r.left, r.top, r.right, r.bottom]);
    });
    [widgetGallery, widgetCtxMenu].forEach((el) => {
      if (el && !el.hidden) {
        const r = el.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) rects.push([r.left, r.top, r.right, r.bottom]);
      }
    });
    invoke("set_shell_interactive_rects", {
      label: "desktop_widgets",
      rects,
      topmost: !!widSettings.widgetsTopmost
    }).catch(() => {});
  });
}

// ============================================================
// DESKTOP WIDGETS MODE
// ============================================================
async function loadWidgetsData() {
  try {
    const raw = await invoke("load_data_file", { filename: "desktop_widgets.txt" });
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        placedWidgets = arr;
        return;
      }
    }
  } catch (_) {}
  placedWidgets = [
    { id: "w_clock", type: "clock", x: 32, y: 48 },
    { id: "w_sys", type: "system", x: 32, y: 240 }
  ];
  saveWidgetsData();
}

async function saveWidgetsData() {
  await invoke("save_data_file", {
    filename: "desktop_widgets.txt",
    content: JSON.stringify(placedWidgets, null, 2)
  }).catch(() => {});
}

async function fetchAgenda() {
  const d = new Date();
  const res = await invoke("get_calendar_agenda", {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate()
  }).catch(() => null);
  calendarEvents = Array.isArray(res?.events) ? res.events : [];
}

function buildWidgetInnerHtml(w) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const DAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

  if (w.type === "clock") {
    const secDeg = now.getSeconds() * 6;
    const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
    const hrDeg = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
    return `
      <div class="wc-hdr"><span>ĐỒNG HỒ</span><span>${DAYS[now.getDay()]}</span></div>
      <div class="wc-analog">
        <i class="wc-hand hr" style="transform:rotate(${hrDeg.toFixed(1)}deg)"></i>
        <i class="wc-hand min" style="transform:rotate(${minDeg.toFixed(1)}deg)"></i>
        <i class="wc-hand sec" style="transform:rotate(${secDeg.toFixed(1)}deg)"></i>
        <i class="wc-dot"></i>
      </div>
    `;
  }
  if (w.type === "digital") {
    return `
      <div class="wc-hdr"><span>GIỜ HIỆN TẠI</span><span>⌚</span></div>
      <div class="wc-big-time tabular">${pad(now.getHours())}:${pad(now.getMinutes())}</div>
      <div class="wc-sub">${DAYS[now.getDay()]}, ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}</div>
    `;
  }
  if (w.type === "world") {
    const fmt = (tz) => new Intl.DateTimeFormat("vi-VN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    return `
      <div class="wc-hdr"><span>GIỜ THẾ GIỚI</span><span>🌍</span></div>
      <div class="wc-rows">
        <div class="wc-row"><span>🇻🇳 Hà Nội</span><b class="tabular">${fmt("Asia/Ho_Chi_Minh")}</b></div>
        <div class="wc-row"><span>🇯🇵 Tokyo</span><b class="tabular">${fmt("Asia/Tokyo")}</b></div>
        <div class="wc-row"><span>🇬🇧 London</span><b class="tabular">${fmt("Europe/London")}</b></div>
      </div>
    `;
  }
  if (w.type === "calendar") {
    const evs = calendarEvents.slice(0, 3);
    const evHtml = evs.length > 0
      ? evs.map((ev) => {
          const t = ev.all_day ? "Cả ngày" : `${pad(Math.floor(ev.start_minute / 60))}:${pad(ev.start_minute % 60)}`;
          return `<div class="wc-row"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:116px">${escapeHtml(ev.title)}</span><b class="tabular">${t}</b></div>`;
        }).join("")
      : `<div class="wc-sub">Không có lịch hẹn nào hôm nay.</div>`;
    return `
      <div class="wc-hdr"><span>LỊCH HÔM NAY</span><span>${now.getDate()}/${now.getMonth() + 1}</span></div>
      <div class="wc-rows">${evHtml}</div>
    `;
  }
  if (w.type === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMon = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const wds = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    let cells = wds.map((d) => `<span class="wd">${d}</span>`).join("");
    for (let i = 0; i < offset; i++) cells += `<span class="dy dim"></span>`;
    for (let d = 1; d <= daysInMon; d++) {
      cells += `<span class="dy${d === now.getDate() ? " today" : ""}">${d}</span>`;
    }
    return `
      <div class="wc-hdr"><span>THÁNG ${now.getMonth() + 1}</span><span>${now.getFullYear()}</span></div>
      <div class="wc-cal-grid">${cells}</div>
    `;
  }
  if (w.type === "battery") {
    const pct = hwSnapshot.battery_pct <= 100 ? hwSnapshot.battery_pct : 100;
    return `
      <div class="wc-hdr"><span>PIN HỆ THỐNG</span><span>${hwSnapshot.is_charging ? "⚡ Đang sạc" : "🔋 Pin"}</span></div>
      <div class="wc-big-time tabular">${pct}%</div>
      <div class="wc-bar"><i style="width:${pct}%"></i></div>
    `;
  }
  // system default
  const dl = hwSnapshot.net_down_kbps >= 1024
    ? `${(hwSnapshot.net_down_kbps / 1024).toFixed(1)} MB/s`
    : `${hwSnapshot.net_down_kbps || 0} KB/s`;
  return `
    <div class="wc-hdr"><span>HỆ THỐNG</span><span>⚡</span></div>
    <div class="wc-rows">
      <div><div class="wc-row"><span>CPU</span><b class="tabular">${hwSnapshot.cpu_pct || 0}%</b></div><div class="wc-bar"><i style="width:${hwSnapshot.cpu_pct || 0}%"></i></div></div>
      <div><div class="wc-row"><span>RAM</span><b class="tabular">${hwSnapshot.ram_pct || 0}%</b></div><div class="wc-bar"><i style="width:${hwSnapshot.ram_pct || 0}%"></i></div></div>
      <div class="wc-row"><span>Mạng tải</span><b class="tabular">${dl}</b></div>
    </div>
  `;
}

function renderWidgets() {
  if (!widgetsCanvas) return;
  widgetsCanvas.innerHTML = "";
  const styleCls = (widSettings.widgetsStyle === "crystal") ? "style-crystal" : "";

  placedWidgets.forEach((w, idx) => {
    const card = document.createElement("div");
    card.className = `widget-card glass-surface ${styleCls}`.trim();
    card.dataset.wid = w.id;
    card.style.left = `${Math.max(8, Math.min(window.innerWidth - 210, w.x || 32))}px`;
    card.style.top = `${Math.max(36, Math.min(window.innerHeight - 150, w.y || 48))}px`;
    card.innerHTML = buildWidgetInnerHtml(w);

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;

    card.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      card.classList.add("dragging");
      card.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      origX = parseFloat(card.style.left) || 0;
      origY = parseFloat(card.style.top) || 0;
    });

    card.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const nx = Math.max(8, Math.min(window.innerWidth - 210, origX + (e.clientX - startX)));
      const ny = Math.max(36, Math.min(window.innerHeight - 150, origY + (e.clientY - startY)));
      card.style.left = `${nx}px`;
      card.style.top = `${ny}px`;
    });

    card.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("dragging");
      try { card.releasePointerCapture(e.pointerId); } catch (_) {}
      const snapX = Math.round((parseFloat(card.style.left) || 0) / 16) * 16;
      const snapY = Math.round((parseFloat(card.style.top) || 0) / 16) * 16;
      w.x = Math.max(16, Math.min(window.innerWidth - 210, snapX));
      w.y = Math.max(32, Math.min(window.innerHeight - 150, snapY));
      card.style.left = `${w.x}px`;
      card.style.top = `${w.y}px`;
      saveWidgetsData();
      scheduleSyncRects();
    });

    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showWidgetCtxMenu(e.clientX, e.clientY, idx);
    });

    widgetsCanvas.appendChild(card);
  });
  scheduleSyncRects();
}

function updateWidgetsTick() {
  document.querySelectorAll(".widget-card").forEach((card) => {
    if (card.classList.contains("dragging")) return;
    const w = placedWidgets.find((x) => x.id === card.dataset.wid);
    if (w) card.innerHTML = buildWidgetInnerHtml(w);
  });
}

function showWidgetCtxMenu(x, y, idx) {
  widgetCtxMenu.innerHTML = "";
  const actions = [
    { label: "🧱 Mở Thư viện Widgets", fn: openGallery },
    {
      label: widSettings.widgetsStyle === "crystal" ? "Chuyển kiểu Original" : "Chuyển kiểu Crystal",
      fn: () => {
        widSettings.widgetsStyle = widSettings.widgetsStyle === "crystal" ? "original" : "crystal";
        renderWidgets();
      }
    },
    {
      label: "Xóa Widget này",
      danger: true,
      fn: () => {
        placedWidgets.splice(idx, 1);
        saveWidgetsData();
        renderWidgets();
      }
    }
  ];
  actions.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    if (a.danger) b.className = "danger";
    b.textContent = a.label;
    b.addEventListener("click", () => {
      widgetCtxMenu.hidden = true;
      a.fn();
      scheduleSyncRects();
    });
    widgetCtxMenu.appendChild(b);
  });
  widgetCtxMenu.hidden = false;
  widgetCtxMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - 185, x))}px`;
  widgetCtxMenu.style.top = `${Math.max(8, Math.min(window.innerHeight - 130, y))}px`;
  scheduleSyncRects();
}

function openGallery() {
  const list = document.getElementById("widgetGalleryList");
  if (!list) return;
  list.innerHTML = "";
  WIDGET_TYPES.forEach((wt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dwg-item";
    btn.innerHTML = `
      <span class="dwg-item-ico">${wt.ico}</span>
      <div>
        <div class="dwg-item-title">${wt.title}</div>
        <div class="dwg-item-desc">${wt.desc}</div>
      </div>
    `;
    btn.addEventListener("click", () => {
      const offset = (placedWidgets.length % 5) * 32;
      placedWidgets.push({
        id: `w_${Date.now()}_${Math.floor(Math.random() * 99)}`,
        type: wt.type,
        x: 48 + offset,
        y: 64 + offset
      });
      saveWidgetsData();
      renderWidgets();
    });
    list.appendChild(btn);
  });
  widgetGallery.hidden = false;
  scheduleSyncRects();
}

document.getElementById("btnCloseGallery")?.addEventListener("click", () => {
  widgetGallery.hidden = true;
  scheduleSyncRects();
});

document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#widgetCtxMenu") && !widgetCtxMenu.hidden) {
    widgetCtxMenu.hidden = true;
    scheduleSyncRects();
  }
});

// ============================================================
// SCENE WORKSPACE STRIP MODE (?view=scene)
// ============================================================
async function refreshSceneStrip() {
  const cardsEl = document.getElementById("sceneCards");
  if (!cardsEl) return;
  const wins = await invoke("list_open_windows").catch(() => []);
  if (!Array.isArray(wins)) return;
  sceneWindows = wins.slice(0, 7);
  cardsEl.innerHTML = "";
  sceneWindows.forEach((w) => {
    const card = document.createElement("div");
    card.className = "sc-card" + (w.is_foreground ? " fg" : "");
    card.title = `${w.title || w.app_name}\n• Bấm: Chuyển sang cửa sổ\n• Shift + Bấm: Gom cùng nhóm ứng dụng`;
    const thumb = document.createElement("div");
    thumb.className = "sc-thumb";
    thumb.textContent = w.app_name || "";
    const lbl = document.createElement("div");
    lbl.className = "sc-label";
    lbl.textContent = w.app_name || w.title || "App";
    card.append(thumb, lbl);

    invoke("capture_window_thumb", { hwnd: w.hwnd, maxW: 210 }).then((b64) => {
      if (b64) thumb.innerHTML = `<img src="${b64}" alt="" />`;
    }).catch(() => {});

    card.addEventListener("click", async (e) => {
      await invoke("scene_focus_window", { hwnd: w.hwnd, group: !!e.shiftKey }).catch(() => {});
      setTimeout(refreshSceneStrip, 180);
    });
    cardsEl.appendChild(card);
  });
  scheduleSyncRects();
}

document.getElementById("btnSceneTuck")?.addEventListener("click", async () => {
  await invoke("scene_tuck_all").catch(() => {});
  setTimeout(refreshSceneStrip, 180);
});
document.getElementById("btnSceneRestore")?.addEventListener("click", async () => {
  await invoke("scene_unpark_all").catch(() => {});
  setTimeout(refreshSceneStrip, 180);
});

// ============================================================
// EVENTS & BOOT
// ============================================================
listen("island-open-widget-gallery", () => {
  if (viewMode === "widgets") openGallery();
}).catch(() => {});

listen("island-hw", (e) => {
  if (!e?.payload) return;
  hwSnapshot = e.payload;
  if (viewMode === "widgets") updateWidgetsTick();
}).catch(() => {});

listen("island-settings", (e) => {
  if (e?.payload?.settings) {
    Object.assign(widSettings, e.payload.settings);
    applyThemeTokens();
    if (viewMode === "widgets") renderWidgets();
  }
}).catch(() => {});

window.addEventListener("resize", scheduleSyncRects);

(async () => {
  try {
    const raw = await invoke("load_data_file", { filename: "settings.txt" });
    if (raw) Object.assign(widSettings, JSON.parse(raw));
  } catch (_) {}
  applyThemeTokens();

  if (viewMode === "scene") {
    sceneStage.hidden = false;
    await refreshSceneStrip();
    setInterval(refreshSceneStrip, 1800);
  } else {
    widgetsStage.hidden = false;
    await loadWidgetsData();
    await fetchAgenda();
    renderWidgets();
    setInterval(updateWidgetsTick, 1000);
    setInterval(fetchAgenda, 5 * 60 * 1000);
  }
})();
