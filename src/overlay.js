const T = window.__TAURI__ || {};
const invoke = T.core?.invoke || (async () => null);
const listen = T.event?.listen || (async () => () => {});
const emit = T.event?.emit || (async () => {});
const curWin = T.window?.getCurrentWindow ? T.window.getCurrentWindow() : null;

const params = new URLSearchParams(window.location.search);
let currentView = params.get("view") || "quick_panel";

const backdropEl = document.getElementById("ovBackdrop");
const viewEls = {
  quick_panel: document.getElementById("viewQuickPanel"),
  quick_search: document.getElementById("viewQuickSearch"),
  app_grid: document.getElementById("viewAppGrid"),
  overview: document.getElementById("viewOverview")
};

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("ovToast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 1900);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setAnimatedHidden(el, hide) {
  if (!el) return;
  if (hide) {
    if (el.hidden) return;
    el.setAttribute("data-closing", "");
    setTimeout(() => {
      if (el.hasAttribute("data-closing")) {
        el.removeAttribute("data-closing");
        el.hidden = true;
      }
    }, 150);
  } else {
    el.removeAttribute("data-closing");
    el.hidden = false;
  }
}

function resolveCloseLabel() {
  try {
    const lbl = curWin?.label;
    if (lbl) return lbl;
  } catch (_) {}
  if (currentView === "quick_panel") return "quick_panel";
  if (currentView === "quick_search") return "quick_search";
  return "overlay_full";
}

function closeOverlay() {
  invoke("close_overlay_window", { label: resolveCloseLabel() }).catch(() => {});
  try {
    curWin?.hide?.().catch?.(() => {});
  } catch (_) {}
}

// ============================================================
// THEME & ACCENT SYNC
// ============================================================
const prefDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let cachedSettings = { colorMode: "dark", accentColor: "auto" };

function applyThemeTokens(s = cachedSettings) {
  const mode = s.colorMode === "auto"
    ? (prefDark?.matches ? "dark" : "light")
    : (s.colorMode || "dark");
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.accent = s.accentColor || "auto";
}
prefDark?.addEventListener?.("change", () => applyThemeTokens(cachedSettings));

// ============================================================
// ICON CACHE & SLIDER PROGRESS HELPER
// ============================================================
const shellIconCache = new Map();
async function loadShellIcon(path, size = 32) {
  if (!path) return null;
  const key = `${size}:${path}`;
  if (shellIconCache.has(key)) return shellIconCache.get(key);
  try {
    const b64 = await invoke("get_shell_icon", { path, size, thumb: false });
    shellIconCache.set(key, b64 || null);
    return b64 || null;
  } catch (_) {
    return null;
  }
}

function updateSliderCssVal(sl) {
  if (!sl) return;
  const min = Number(sl.min) || 0;
  const max = Number(sl.max) || 100;
  const v = Number(sl.value) || 0;
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
  sl.style.setProperty("--val", `${pct.toFixed(1)}%`);
}

// ============================================================
// 1. QUICK PANEL (CONTROL CENTER)
// ============================================================
const DEFAULT_CC_TILES = [
  { id: "wifi", label: "Wi-Fi", icon: "📶", kind: "picker" },
  { id: "bluetooth", label: "Bluetooth", icon: "🎧", kind: "picker" },
  { id: "dark_mode", label: "Chế độ tối", icon: "🌙", kind: "toggle" },
  { id: "focus", label: "Tập trung", icon: "🍅", kind: "toggle" },
  { id: "screenshot", label: "Chụp màn", icon: "✂️", action: "screenshot" },
  { id: "screen_mirror", label: "Truyền màn", icon: "🖥️", action: "screen_mirror" },
  { id: "sound_flyout", label: "Âm thanh", icon: "🎛️", action: "sound_flyout" },
  { id: "lock", label: "Khóa máy", icon: "🔒", action: "lock" },
  { id: "sleep", label: "Ngủ", icon: "💤", action: "sleep" },
  { id: "restart", label: "Khởi động", icon: "🔄", action: "restart", confirm: true },
  { id: "shutdown", label: "Tắt máy", icon: "⏻", action: "shutdown", confirm: true },
  { id: "task_manager", label: "Task Mgr", icon: "📊", action: "task_manager" },
  { id: "calculator", label: "Máy tính", icon: "🧮", action: "calculator" },
  { id: "notepad", label: "Notepad", icon: "📝", action: "notepad" },
  { id: "win_settings", label: "Win Settings", icon: "⚙️", action: "win_settings" },
  { id: "ms_store", label: "MS Store", icon: "🛍️", action: "ms_store" },
  { id: "show_desktop", label: "Hiện Desktop", icon: "🗔", action: "show_desktop" },
  { id: "notifications", label: "Thông báo", icon: "🔔", action: "notifications" },
  { id: "open_recycle_bin", label: "Thùng rác", icon: "🗑️", action: "open_recycle_bin" }
];

let ccHiddenIds = new Set();
let ccEditing = false;
let qpActivePicker = ""; // "" | "wifi" | "bluetooth"
let qpRadios = { wifi: true, bluetooth: true };
let qpDarkMode = true;
let qpFocusOn = false;
let qpAudioOutputsOpen = false;
let qpVolMuted = false;
let qpLastSongKey = null;
let qpBrightDebounce = null;
let qpVolDebounce = null;
let qpPendingConfirm = "";

async function loadCcLayout() {
  try {
    const raw = await invoke("load_data_file", { filename: "cc_layout.txt" });
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.hidden)) ccHiddenIds = new Set(parsed.hidden);
    }
  } catch (_) {}
}

async function saveCcLayout() {
  const payload = JSON.stringify({ hidden: Array.from(ccHiddenIds) }, null, 2);
  await invoke("save_data_file", { filename: "cc_layout.txt", content: payload }).catch(() => {});
}

function updateQpClock() {
  const el = document.getElementById("qpClock");
  if (!el) return;
  const d = new Date();
  el.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderQpTiles(hw = null) {
  const grid = document.getElementById("qpTilesGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const list = ccEditing
    ? DEFAULT_CC_TILES
    : DEFAULT_CC_TILES.filter((t) => !ccHiddenIds.has(t.id));

  list.forEach((tile) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isHidden = ccHiddenIds.has(tile.id);
    let isOn = false;
    let sub = "";
    if (tile.id === "wifi") {
      isOn = qpRadios.wifi !== false;
      sub = hw?.wifi_ssid || (isOn ? "Đang bật" : "Đã tắt");
    } else if (tile.id === "bluetooth") {
      isOn = qpRadios.bluetooth !== false;
      sub = isOn ? "Đang bật" : "Đã tắt";
    } else if (tile.id === "dark_mode") {
      isOn = qpDarkMode;
      sub = qpDarkMode ? "Tối" : "Sáng";
    } else if (tile.id === "focus") {
      isOn = qpFocusOn;
      sub = qpFocusOn ? "Đang bật" : "Tắt";
    }
    btn.className = "qp-tile" + (isOn ? " on" : "") + (ccEditing && isHidden ? " editing-hidden" : "");
    btn.innerHTML = `
      <span class="qp-tile-ico">${tile.icon}</span>
      <span class="qp-tile-lbl">${escapeHtml(tile.label)}</span>
      ${sub ? `<span class="qp-tile-sub">${escapeHtml(sub)}</span>` : ""}
    `;
    btn.title = ccEditing
      ? (isHidden ? "Bấm để hiện lại ô này" : "Bấm để ẩn ô này")
      : (tile.confirm && qpPendingConfirm === tile.id ? "Bấm lần nữa để xác nhận!" : tile.label);

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (ccEditing) {
        if (ccHiddenIds.has(tile.id)) ccHiddenIds.delete(tile.id);
        else ccHiddenIds.add(tile.id);
        await saveCcLayout();
        renderQpTiles(hw);
        return;
      }
      if (tile.id === "wifi" || tile.id === "bluetooth") {
        qpActivePicker = qpActivePicker === tile.id ? "" : tile.id;
        await renderNetPicker();
        return;
      }
      if (tile.id === "dark_mode") {
        const res = await invoke("set_windows_dark_mode", { dark: !qpDarkMode }).catch(() => null);
        if (typeof res === "boolean") qpDarkMode = res;
        renderQpTiles(hw);
        return;
      }
      if (tile.id === "focus") {
        qpFocusOn = !qpFocusOn;
        await emit("island-action", { type: "focus_toggle" }).catch(() => {});
        renderQpTiles(hw);
        showToast(qpFocusOn ? "Đã bật chế độ Tập trung" : "Đã tắt chế độ Tập trung");
        return;
      }
      if (tile.confirm && qpPendingConfirm !== tile.id) {
        qpPendingConfirm = tile.id;
        showToast(`Bấm lần nữa để ${tile.label.toLowerCase()}`);
        setTimeout(() => { if (qpPendingConfirm === tile.id) qpPendingConfirm = ""; }, 3000);
        return;
      }
      qpPendingConfirm = "";
      await invoke("run_system_action", { action: tile.action }).catch(() => {});
      closeOverlay();
    });
    grid.appendChild(btn);
  });
}

async function renderNetPicker(rescan = false) {
  const box = document.getElementById("qpNetPicker");
  const titleEl = document.getElementById("qpPickerTitle");
  const listEl = document.getElementById("qpPickerList");
  const radioBtn = document.getElementById("btnQpPickerRadio");
  if (!box || !titleEl || !listEl) return;

  if (!qpActivePicker) {
    setAnimatedHidden(box, true);
    return;
  }
  setAnimatedHidden(box, false);
  titleEl.textContent = qpActivePicker === "wifi" ? "Mạng Wi-Fi khả dụng" : "Thiết bị Bluetooth";
  if (radioBtn) {
    const isOn = qpActivePicker === "wifi" ? qpRadios.wifi !== false : qpRadios.bluetooth !== false;
    radioBtn.textContent = isOn ? "Đang BẬT · Tắt" : "Đang TẮT · Bật";
  }
  listEl.innerHTML = `<div class="qs-empty" style="padding:12px">Đang quét...</div>`;

  if (qpActivePicker === "wifi") {
    const scan = await invoke("scan_wifi_networks", { rescan }).catch(() => null);
    listEl.innerHTML = "";
    const nets = scan?.networks || [];
    if (nets.length === 0) {
      listEl.innerHTML = `<div class="qs-empty" style="padding:12px">${scan?.denied ? "Cần quyền Vị trí Windows để quét Wi-Fi." : "Không tìm thấy mạng Wi-Fi nào."}</div>`;
      return;
    }
    nets.forEach((n) => {
      const row = document.createElement("div");
      row.className = "qp-pick-row" + (n.connected ? " connected" : "");
      row.innerHTML = `
        <span>${n.connected ? "✓ " : ""}${escapeHtml(n.ssid || "(Ẩn)")}</span>
        <span>${n.secured ? "🔒 " : ""}${n.signal}%</span>
      `;
      row.addEventListener("click", async () => {
        if (!n.connected) {
          showToast(`Đang kết nối ${n.ssid}...`);
          await invoke("connect_wifi_network", { ssid: n.ssid, profile: n.profile || "" }).catch((err) => {
            showToast(String(err || "Không kết nối được"));
          });
          setTimeout(() => renderNetPicker(false), 900);
        }
      });
      listEl.appendChild(row);
    });
  } else {
    const devs = await invoke("list_bluetooth_devices").catch(() => []);
    listEl.innerHTML = "";
    if (!Array.isArray(devs) || devs.length === 0) {
      listEl.innerHTML = `<div class="qs-empty" style="padding:12px">Chưa ghép đôi thiết bị Bluetooth nào.</div>`;
      return;
    }
    devs.forEach((d) => {
      const row = document.createElement("div");
      row.className = "qp-pick-row" + (d.connected ? " connected" : "");
      const ico = d.audio ? "🎧" : "📡";
      row.innerHTML = `
        <span>${ico} ${escapeHtml(d.name)}</span>
        <span>${d.connected ? "Đã kết nối" : (d.audio ? "Kết nối" : "Đã ghép")}</span>
      `;
      row.addEventListener("click", async () => {
        if (d.audio && d.addr) {
          await invoke("toggle_bluetooth_audio", { addr: d.addr, connect: !d.connected }).catch(() => {});
          setTimeout(() => renderNetPicker(false), 700);
        } else {
          invoke("run_system_action", { action: "ms-settings:bluetooth" }).catch(() => {});
        }
      });
      listEl.appendChild(row);
    });
  }
}

async function refreshAudioOutputsUI() {
  const box = document.getElementById("qpAudioOutputs");
  const devLbl = document.getElementById("qpAudioDevName");
  const devs = await invoke("list_audio_outputs").catch(() => []);
  if (!Array.isArray(devs) || devs.length === 0) return;
  const active = devs.find((d) => d.is_default) || devs[0];
  if (devLbl && active) devLbl.textContent = active.name;
  if (!box) return;
  box.innerHTML = "";
  devs.forEach((d) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "qp-out-chip" + (d.is_default ? " active" : "");
    chip.textContent = d.name;
    chip.title = `Chọn làm đầu ra mặc định: ${d.name}`;
    chip.addEventListener("click", async () => {
      await invoke("set_default_audio_output", { deviceId: d.id }).catch(() => {});
      await refreshAudioOutputsUI();
      showToast(`Đầu ra: ${d.name}`);
    });
    box.appendChild(chip);
  });
}

async function refreshQuickPanel() {
  updateQpClock();
  const [radios, bright, dark, hw, media] = await Promise.all([
    invoke("get_radio_states").catch(() => null),
    invoke("get_display_brightness").catch(() => null),
    invoke("get_windows_dark_mode").catch(() => null),
    invoke("get_hardware_tick").catch(() => null),
    invoke("get_system_media", { knownSongKey: qpLastSongKey }).catch(() => null)
  ]);
  if (radios) {
    qpRadios.wifi = radios.wifi ?? true;
    qpRadios.bluetooth = radios.bluetooth ?? true;
  }
  if (typeof dark === "boolean") qpDarkMode = dark;

  if (bright) {
    const slB = document.getElementById("slQpBright");
    const valB = document.getElementById("qpBrightVal");
    const modeB = document.getElementById("qpBrightMode");
    if (slB) {
      slB.value = bright.level;
      updateSliderCssVal(slB);
    }
    if (valB) valB.textContent = `${bright.level}%`;
    if (modeB) modeB.textContent = bright.soft ? "Phần mềm" : (bright.mode === "ddc" ? "DDC/CI" : "WMI");
  }

  if (hw) {
    const slV = document.getElementById("slQpVol");
    const valV = document.getElementById("qpVolVal");
    const muteBtn = document.getElementById("btnQpMute");
    qpVolMuted = !!hw.volume_muted;
    if (slV && typeof hw.volume_pct === "number") {
      slV.value = hw.volume_pct;
      updateSliderCssVal(slV);
    }
    if (valV) valV.textContent = qpVolMuted ? "Tắt" : `${hw.volume_pct ?? 50}%`;
    if (muteBtn) muteBtn.textContent = qpVolMuted ? "🔇" : "🔊";
    if (hw.audio_output_name) {
      const devLbl = document.getElementById("qpAudioDevName");
      if (devLbl) devLbl.textContent = hw.audio_output_name;
    }
  }

  updateQpMediaUI(media);
  renderQpTiles(hw);
  await refreshAudioOutputsUI();
}

function updateQpMediaUI(media) {
  const titleEl = document.getElementById("qpMediaTitle");
  const artEl = document.getElementById("qpMediaArtist");
  const coverEl = document.getElementById("qpMediaArt");
  const playBtn = document.getElementById("btnQpMediaPlay");
  if (!media || !media.has_session) {
    if (titleEl) titleEl.textContent = "Chưa có nhạc đang phát";
    if (artEl) artEl.textContent = "Windows Media";
    if (coverEl) coverEl.innerHTML = "🎵";
    if (playBtn) playBtn.textContent = "▶";
    return;
  }
  qpLastSongKey = `${media.title}|${media.artist}`;
  if (titleEl) titleEl.textContent = media.title || "Không rõ bài hát";
  if (artEl) artEl.textContent = media.artist || media.source_app || "Hệ thống";
  if (playBtn) playBtn.textContent = media.playing ? "⏸" : "▶";
  if (coverEl) {
    coverEl.innerHTML = media.thumbnail_b64
      ? `<img src="${media.thumbnail_b64}" alt="" />`
      : "🎵";
  }
}

document.getElementById("btnQpClose")?.addEventListener("click", closeOverlay);
document.getElementById("btnQpSettings")?.addEventListener("click", () => {
  invoke("open_settings_window").catch(() => {});
  closeOverlay();
});
document.getElementById("btnQpEdit")?.addEventListener("click", (e) => {
  ccEditing = !ccEditing;
  e.currentTarget.classList.toggle("active", ccEditing);
  renderQpTiles();
});
document.getElementById("qpAudioDevName")?.addEventListener("click", () => {
  qpAudioOutputsOpen = !qpAudioOutputsOpen;
  const box = document.getElementById("qpAudioOutputs");
  if (box) box.hidden = !qpAudioOutputsOpen;
});
document.getElementById("btnQpPickerScan")?.addEventListener("click", () => renderNetPicker(true));
document.getElementById("btnQpPickerRadio")?.addEventListener("click", async () => {
  if (!qpActivePicker) return;
  const cur = qpActivePicker === "wifi" ? qpRadios.wifi !== false : qpRadios.bluetooth !== false;
  const st = await invoke("set_radio_state", { kind: qpActivePicker, on: !cur }).catch(() => null);
  if (st) {
    qpRadios.wifi = st.wifi ?? qpRadios.wifi;
    qpRadios.bluetooth = st.bluetooth ?? qpRadios.bluetooth;
  }
  renderQpTiles();
  renderNetPicker(true);
});

document.getElementById("slQpBright")?.addEventListener("input", (e) => {
  const sl = e.target;
  updateSliderCssVal(sl);
  const lvl = Number(sl.value);
  const lbl = document.getElementById("qpBrightVal");
  if (lbl) lbl.textContent = `${lvl}%`;
  clearTimeout(qpBrightDebounce);
  qpBrightDebounce = setTimeout(async () => {
    const st = await invoke("set_display_brightness", { level: lvl }).catch(() => null);
    const modeB = document.getElementById("qpBrightMode");
    if (st && modeB) modeB.textContent = st.soft ? "Phần mềm" : (st.mode === "ddc" ? "DDC/CI" : "WMI");
  }, 45);
});

document.getElementById("slQpVol")?.addEventListener("input", (e) => {
  const sl = e.target;
  updateSliderCssVal(sl);
  const lvl = Number(sl.value);
  const lbl = document.getElementById("qpVolVal");
  if (lbl) lbl.textContent = `${lvl}%`;
  clearTimeout(qpVolDebounce);
  qpVolDebounce = setTimeout(() => {
    invoke("set_system_volume", { levelPct: lvl, mute: false }).catch(() => {});
  }, 40);
});

document.getElementById("btnQpMute")?.addEventListener("click", async () => {
  qpVolMuted = !qpVolMuted;
  await invoke("set_system_volume", { levelPct: null, mute: qpVolMuted }).catch(() => {});
  document.getElementById("btnQpMute").textContent = qpVolMuted ? "🔇" : "🔊";
});

document.getElementById("btnQpMediaPrev")?.addEventListener("click", () => {
  invoke("media_control", { action: "prev", positionSecs: null }).catch(() => {});
});
document.getElementById("btnQpMediaPlay")?.addEventListener("click", () => {
  invoke("media_control", { action: "play_pause", positionSecs: null }).catch(() => {});
});
document.getElementById("btnQpMediaNext")?.addEventListener("click", () => {
  invoke("media_control", { action: "next", positionSecs: null }).catch(() => {});
});

// ============================================================
// 2. QUICK SEARCH (SPOTLIGHT + MATH + CLIPBOARD)
// ============================================================
const SEARCH_ACTIONS = [
  { id: "open_settings", title: "Mở Cài đặt Island", sub: "Cấu hình Island, Deck, Rail, Widgets & AI", icon: "⚙️", kind: "internal" },
  { id: "toggle_overview", title: "Tổng quan cửa sổ (Overview)", sub: "Chuyển Virtual Desktop & xem mọi cửa sổ đang mở", icon: "🪟", kind: "overlay", target: "overview" },
  { id: "toggle_app_grid", title: "Lưới ứng dụng (App Grid)", sub: "Duyệt toàn bộ ứng dụng theo danh mục", icon: "📱", kind: "overlay", target: "app_grid" },
  { id: "toggle_quick_panel", title: "Bảng điều khiển nhanh", sub: "Wi-Fi, Bluetooth, Độ sáng, Âm lượng & Nguồn", icon: "🎚️", kind: "overlay", target: "quick_panel" },
  { id: "screenshot", title: "Chụp ảnh màn hình (Snipping Tool)", sub: "Chụp vùng hoặc toàn màn hình", icon: "✂️", kind: "sys", action: "screenshot" },
  { id: "lock", title: "Khóa màn hình (Lock)", sub: "Khóa phiên Windows ngay lập tức", icon: "🔒", kind: "sys", action: "lock" },
  { id: "sleep", title: "Đưa máy vào chế độ Ngủ (Sleep)", sub: "Tạm nghỉ tiết kiệm điện", icon: "💤", kind: "sys", action: "sleep" },
  { id: "show_desktop", title: "Thu nhỏ mọi cửa sổ (Show Desktop)", sub: "Xem nhanh màn hình nền Desktop", icon: "🗔", kind: "sys", action: "show_desktop" },
  { id: "task_manager", title: "Trình quản lý tác vụ (Task Manager)", sub: "Xem CPU, RAM và các tiến trình", icon: "📊", kind: "sys", action: "task_manager" },
  { id: "win_settings", title: "Windows Settings", sub: "Mở cài đặt hệ thống Windows", icon: "🛠️", kind: "sys", action: "win_settings" },
  { id: "open_downloads", title: "Mở thư mục Downloads", sub: "Truy cập nhanh các tệp mới tải về", icon: "📥", kind: "sys", action: "open_downloads" },
  { id: "open_recycle_bin", title: "Mở Thùng rác (Recycle Bin)", sub: "Kiểm tra hoặc dọn tệp đã xóa", icon: "🗑️", kind: "sys", action: "open_recycle_bin" }
];

let qsTab = "apps";
let qsFileFilter = "all";
let qsApps = [];
let qsFiles = [];
let qsClipTexts = [];
let qsClipImages = [];
let qsSelectedIdx = 0;
let qsDisplayedItems = [];
let qsMathResult = null;
let qsFileSearchTimer = null;

function evalMathExpression(raw) {
  let s = String(raw || "").trim();
  if (s.startsWith("=")) s = s.slice(1).trim();
  if (!s || !/[0-9]/.test(s)) return null;
  const pctMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*%\s*(?:of|của)\s*(-?\d+(?:\.\d+)?)$/i);
  if (pctMatch) {
    const val = (parseFloat(pctMatch[1]) / 100) * parseFloat(pctMatch[2]);
    return Number.isFinite(val) ? Number(val.toFixed(8)).toString() : null;
  }
  const normalized = s
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/\be\b/g, "Math.E")
    .replace(/\b(sqrt|sin|cos|tan|abs|round|floor|ceil|log|pow|min|max)\b/gi, (_, fn) => `Math.${fn.toLowerCase()}`)
    .replace(/\^/g, "**");
  if (/[^0-9+\-*/().,%\sMathPIEsqrtcintabdlopwmx]/.test(normalized)) return null;
  if (!/[+\-*/%()]|Math\./.test(normalized)) return null;
  try {
    const fn = new Function(`"use strict"; return (${normalized});`);
    const val = fn();
    if (typeof val !== "number" || !Number.isFinite(val)) return null;
    return Number(val.toFixed(8)).toString();
  } catch (_) {
    return null;
  }
}

function fuzzyScoreJs(query, text) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return 1;
  const t = String(text || "").toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 700 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 500 - idx;
  let qi = 0;
  let score = 100;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 20;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}

function parseColorCss(txt) {
  const s = String(txt || "").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*[\d.]+)?\s*\)$/i.test(s)) return s;
  return null;
}

async function ensureAppsLoaded(force = false) {
  if (qsApps.length > 0 && !force) return qsApps;
  const list = await invoke("list_installed_apps", { force }).catch(() => []);
  if (Array.isArray(list)) qsApps = list;
  return qsApps;
}

async function refreshQsFiles() {
  const q = (document.getElementById("qsInput")?.value || "").trim();
  if (!q) {
    qsFiles = await invoke("get_recent_files", { limit: 16 }).catch(() => []);
  } else {
    qsFiles = await invoke("search_local_files", { query: q, filter: qsFileFilter, limit: 24 }).catch(() => []);
  }
  if (!Array.isArray(qsFiles)) qsFiles = [];
  renderQuickSearch();
}

async function refreshQsClipboard() {
  const [rawClip, imgs] = await Promise.all([
    invoke("load_data_file", { filename: "clipboard.txt" }).catch(() => ""),
    invoke("list_clipboard_images").catch(() => [])
  ]);
  try {
    qsClipTexts = rawClip ? JSON.parse(rawClip) : [];
    if (!Array.isArray(qsClipTexts)) qsClipTexts = [];
  } catch (_) {
    qsClipTexts = [];
  }
  qsClipImages = Array.isArray(imgs) ? imgs : [];
  renderQuickSearch();
}

function renderQuickSearch() {
  const inputEl = document.getElementById("qsInput");
  const clearBtn = document.getElementById("btnQsClear");
  const mathEl = document.getElementById("qsMathBanner");
  const mathExpr = document.getElementById("qsMathExpr");
  const mathRes = document.getElementById("qsMathRes");
  const filtersEl = document.getElementById("qsFileFilters");
  const resultsEl = document.getElementById("qsResults");
  const countEl = document.getElementById("qsCount");
  if (!resultsEl) return;

  const q = (inputEl?.value || "").trim();
  if (clearBtn) clearBtn.hidden = !q;
  if (filtersEl) filtersEl.hidden = qsTab !== "files";

  qsMathResult = evalMathExpression(q);
  if (mathEl) {
    mathEl.hidden = qsMathResult === null;
    if (qsMathResult !== null) {
      if (mathExpr) mathExpr.textContent = q;
      if (mathRes) mathRes.textContent = `= ${qsMathResult}`;
    }
  }

  let items = [];
  if (qsTab === "apps") {
    items = qsApps
      .map((a) => ({ ...a, _score: fuzzyScoreJs(q, a.name) }))
      .filter((a) => a._score !== null)
      .sort((a, b) => b._score - a._score)
      .slice(0, 32)
      .map((a) => ({ type: "app", title: a.name, sub: a.category || "Ứng dụng", path: a.path }));
  } else if (qsTab === "files") {
    items = (qsFiles || []).map((f) => ({
      type: "file",
      title: f.name,
      sub: f.dir_label || f.path,
      path: f.path,
      isDir: !!f.is_dir,
      ext: f.ext || ""
    }));
  } else if (qsTab === "actions") {
    items = SEARCH_ACTIONS
      .map((act) => ({ ...act, _score: fuzzyScoreJs(q, `${act.title} ${act.sub}`) }))
      .filter((a) => a._score !== null)
      .sort((a, b) => b._score - a._score)
      .map((a) => ({ type: "action", ...a }));
  } else if (qsTab === "clipboard") {
    const ql = q.toLowerCase();
    const imgs = qsClipImages.map((img) => ({
      type: "clip_img",
      id: img.id,
      title: `Ảnh Clipboard (${img.w}×${img.h})`,
      sub: img.pinned ? "★ Đã ghim · Bấm để sao chép ảnh" : "Bấm để sao chép lại vào Clipboard",
      pinned: !!img.pinned,
      thumb: img.thumb_b64
    }));
    const texts = qsClipTexts
      .filter((it) => !ql || String(it.text || "").toLowerCase().includes(ql))
      .map((it) => ({
        type: "clip_text",
        text: String(it.text || ""),
        title: String(it.text || "").replace(/\s+/g, " ").trim().slice(0, 90),
        sub: `${it.pinned ? "📌 Đã ghim · " : ""}${it.time || ""} · ${String(it.text || "").length} ký tự`,
        pinned: !!it.pinned,
        color: parseColorCss(it.text)
      }));
    items = [...imgs, ...texts];
  }

  qsDisplayedItems = items;
  if (qsSelectedIdx >= items.length) qsSelectedIdx = Math.max(0, items.length - 1);
  if (countEl) countEl.textContent = `${items.length} mục`;

  resultsEl.innerHTML = "";
  if (items.length === 0) {
    resultsEl.innerHTML = `<div class="qs-empty">Không tìm thấy mục phù hợp.</div>`;
    return;
  }

  items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "qs-row" + (idx === qsSelectedIdx ? " selected" : "");
    let icoHtml = "📄";
    if (item.type === "app") icoHtml = "🚀";
    else if (item.type === "file") icoHtml = item.isDir ? "📁" : "📄";
    else if (item.type === "action") icoHtml = item.icon || "⚡";
    else if (item.type === "clip_img") icoHtml = `<img src="${item.thumb}" alt="" />`;
    else if (item.type === "clip_text") {
      icoHtml = item.color ? `<span class="qs-swatch" style="background:${escapeHtml(item.color)}"></span>` : (item.pinned ? "📌" : "📋");
    }

    let actsHtml = "";
    if (item.type === "app" || item.type === "file") {
      actsHtml = `
        ${item.type === "file" ? '<button type="button" class="ov-chip-btn js-reveal" title="Mở thư mục chứa">📂</button>' : ""}
        <button type="button" class="ov-chip-btn js-props" title="Thuộc tính (Properties)">ℹ️</button>
      `;
    } else if (item.type === "clip_img") {
      actsHtml = `
        <button type="button" class="ov-chip-btn js-pin">${item.pinned ? "Bỏ ghim" : "Ghim"}</button>
        <button type="button" class="ov-chip-btn js-del">×</button>
      `;
    } else if (item.type === "clip_text") {
      actsHtml = `
        <button type="button" class="ov-chip-btn js-qr">QR</button>
        <button type="button" class="ov-chip-btn js-pin">${item.pinned ? "Bỏ ghim" : "Ghim"}</button>
        <button type="button" class="ov-chip-btn js-del">×</button>
      `;
    }

    row.innerHTML = `
      <div class="qs-row-ico">${icoHtml}</div>
      <div class="qs-row-body">
        <div class="qs-row-title">${escapeHtml(item.title)}</div>
        <div class="qs-row-sub">${escapeHtml(item.sub)}</div>
      </div>
      <div class="qs-row-acts">${actsHtml}</div>
    `;

    if (item.type === "app" || item.type === "file") {
      const icoSlot = row.querySelector(".qs-row-ico");
      loadShellIcon(item.path, 32).then((b64) => {
        if (b64 && icoSlot) icoSlot.innerHTML = `<img src="${b64}" alt="" />`;
      });
    }

    row.querySelector(".js-reveal")?.addEventListener("click", (e) => {
      e.stopPropagation();
      invoke("reveal_path_in_explorer", { path: item.path }).catch(() => {});
    });
    row.querySelector(".js-props")?.addEventListener("click", (e) => {
      e.stopPropagation();
      invoke("open_item_properties", { path: item.path }).catch(() => {});
    });
    row.querySelector(".js-qr")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const svg = await invoke("generate_qr_svg", { text: item.text }).catch(() => "");
      const modal = document.getElementById("qsQrModal");
      if (svg && modal) {
        document.getElementById("qsQrSvg").innerHTML = svg;
        document.getElementById("qsQrText").textContent = item.text.slice(0, 140);
        setAnimatedHidden(modal, false);
      }
    });
    row.querySelector(".js-pin")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (item.type === "clip_img") {
        await invoke("toggle_clipboard_image_pin", { id: item.id }).catch(() => {});
      } else {
        const target = qsClipTexts.find((x) => x.text === item.text);
        if (target) target.pinned = !target.pinned;
        await invoke("save_data_file", { filename: "clipboard.txt", content: JSON.stringify(qsClipTexts, null, 2) }).catch(() => {});
      }
      refreshQsClipboard();
    });
    row.querySelector(".js-del")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (item.type === "clip_img") {
        await invoke("delete_clipboard_image", { id: item.id }).catch(() => {});
      } else {
        qsClipTexts = qsClipTexts.filter((x) => x.text !== item.text);
        await invoke("save_data_file", { filename: "clipboard.txt", content: JSON.stringify(qsClipTexts, null, 2) }).catch(() => {});
      }
      refreshQsClipboard();
    });

    row.addEventListener("click", () => executeQsItem(item));
    resultsEl.appendChild(row);
  });
}

async function executeQsItem(item) {
  if (!item) return;
  if (item.type === "app" || item.type === "file") {
    await invoke("launch_shell_target", { path: item.path }).catch(() => {});
    closeOverlay();
  } else if (item.type === "action") {
    if (item.kind === "internal" && item.id === "open_settings") {
      await invoke("open_settings_window").catch(() => {});
      closeOverlay();
    } else if (item.kind === "overlay") {
      await invoke("toggle_overlay_window", { kind: item.target }).catch(() => {});
    } else if (item.kind === "sys") {
      await invoke("run_system_action", { action: item.action }).catch(() => {});
      closeOverlay();
    }
  } else if (item.type === "clip_img") {
    await invoke("copy_clipboard_image", { id: item.id }).catch(() => {});
    showToast("Đã sao chép ảnh vào Clipboard");
    closeOverlay();
  } else if (item.type === "clip_text") {
    navigator.clipboard?.writeText(item.text).catch(() => {});
    showToast("Đã sao chép văn bản vào Clipboard");
    closeOverlay();
  }
}

document.getElementById("qsTabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".qs-tab");
  if (!btn) return;
  setQsTab(btn.dataset.tab);
});

function setQsTab(tab) {
  qsTab = tab;
  qsSelectedIdx = 0;
  document.querySelectorAll(".qs-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "files") refreshQsFiles();
  else if (tab === "clipboard") refreshQsClipboard();
  else renderQuickSearch();
}

document.getElementById("qsFileFilters")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ov-chip-btn");
  if (!btn) return;
  qsFileFilter = btn.dataset.filter || "all";
  document.querySelectorAll("#qsFileFilters .ov-chip-btn").forEach((b) => b.classList.toggle("active", b === btn));
  refreshQsFiles();
});

document.getElementById("qsInput")?.addEventListener("input", () => {
  qsSelectedIdx = 0;
  if (qsTab === "files") {
    clearTimeout(qsFileSearchTimer);
    qsFileSearchTimer = setTimeout(refreshQsFiles, 130);
  } else {
    renderQuickSearch();
  }
});

document.getElementById("btnQsClear")?.addEventListener("click", () => {
  const inp = document.getElementById("qsInput");
  if (inp) {
    inp.value = "";
    inp.focus();
  }
  qsSelectedIdx = 0;
  if (qsTab === "files") refreshQsFiles();
  else renderQuickSearch();
});

document.getElementById("btnQsEsc")?.addEventListener("click", closeOverlay);
document.getElementById("btnQsClose")?.addEventListener("click", closeOverlay);

document.getElementById("qsMathBanner")?.addEventListener("click", () => {
  if (qsMathResult !== null) {
    navigator.clipboard?.writeText(qsMathResult).catch(() => {});
    showToast(`Đã chép: ${qsMathResult}`);
  }
});

document.getElementById("btnQsQrClose")?.addEventListener("click", () => {
  setAnimatedHidden(document.getElementById("qsQrModal"), true);
});

// ============================================================
// 3. APP GRID (LAUNCHPAD)
// ============================================================
let agCategory = "Tất cả";

async function renderAppGrid() {
  const catsEl = document.getElementById("agCats");
  const gridEl = document.getElementById("agGrid");
  const q = (document.getElementById("agSearch")?.value || "").trim().toLowerCase();
  if (!gridEl) return;

  const apps = await ensureAppsLoaded();
  const catSet = new Set(["Tất cả"]);
  apps.forEach((a) => {
    if (a.category) catSet.add(a.category);
  });

  if (catsEl) {
    catsEl.innerHTML = "";
    Array.from(catSet).forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ov-chip-btn" + (agCategory === c ? " active" : "");
      b.textContent = c;
      b.addEventListener("click", () => {
        agCategory = c;
        renderAppGrid();
      });
      catsEl.appendChild(b);
    });
  }

  const filtered = apps.filter((a) => {
    if (agCategory !== "Tất cả" && a.category !== agCategory) return false;
    if (q && !a.name.toLowerCase().includes(q)) return false;
    return true;
  });

  gridEl.innerHTML = "";
  filtered.forEach((a) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ag-card";
    card.innerHTML = `
      <div class="ag-card-ico">🚀</div>
      <div class="ag-card-name">${escapeHtml(a.name)}</div>
    `;
    const slot = card.querySelector(".ag-card-ico");
    loadShellIcon(a.path, 48).then((b64) => {
      if (b64 && slot) slot.innerHTML = `<img src="${b64}" alt="" />`;
    });
    card.addEventListener("click", async () => {
      await invoke("launch_shell_target", { path: a.path }).catch(() => {});
      closeOverlay();
    });
    gridEl.appendChild(card);
  });
}

document.getElementById("agSearch")?.addEventListener("input", renderAppGrid);
document.getElementById("btnAgClose")?.addEventListener("click", closeOverlay);

// ============================================================
// 4. OVERVIEW (WINDOW EXPOSE + VIRTUAL DESKTOPS)
// ============================================================
async function renderOverview() {
  const deskBar = document.getElementById("ovwDeskBar");
  const gridEl = document.getElementById("ovwGrid");
  if (!gridEl) return;

  const [vdesk, wins] = await Promise.all([
    invoke("list_virtual_desktops").catch(() => ({ names: ["Desktop 1"], current: 0 })),
    invoke("list_open_windows").catch(() => [])
  ]);

  if (deskBar && vdesk) {
    deskBar.innerHTML = "";
    (vdesk.names || ["Desktop 1"]).forEach((name, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ov-chip-btn" + (idx === vdesk.current ? " active" : "");
      btn.textContent = name;
      btn.addEventListener("click", async () => {
        await invoke("virtual_desktop_action", { action: `switch:${idx}` }).catch(() => {});
        setTimeout(renderOverview, 150);
      });
      deskBar.appendChild(btn);
    });
  }

  gridEl.innerHTML = "";
  const list = Array.isArray(wins) ? wins : [];
  if (list.length === 0) {
    gridEl.innerHTML = `<div class="qs-empty" style="grid-column:1/-1">Không có cửa sổ nào đang mở.</div>`;
    return;
  }

  list.forEach((w) => {
    const card = document.createElement("div");
    card.className = "ovw-win" + (w.is_foreground ? " fg" : "");
    card.innerHTML = `
      <div class="ovw-win-top">
        <span class="ovw-win-app">${escapeHtml(w.app_name || "Cửa sổ")}</span>
        <button type="button" class="ov-icon-btn js-min" title="Thu nhỏ">—</button>
        <button type="button" class="ov-icon-btn js-close" title="Đóng cửa sổ">✕</button>
      </div>
      <div class="ovw-win-thumb">Đang tải...</div>
      <div class="ovw-win-title">${escapeHtml(w.title || "")}</div>
    `;
    const thumbBox = card.querySelector(".ovw-win-thumb");
    invoke("capture_window_thumb", { hwnd: w.hwnd, maxW: 360 }).then((b64) => {
      if (thumbBox) {
        thumbBox.innerHTML = b64 ? `<img src="${b64}" alt="" />` : "Không thể xem trước";
      }
    }).catch(() => {
      if (thumbBox) thumbBox.textContent = w.app_name || "";
    });

    card.querySelector(".js-min")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await invoke("minimize_window", { hwnd: w.hwnd }).catch(() => {});
      setTimeout(renderOverview, 120);
    });
    card.querySelector(".js-close")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await invoke("close_window", { hwnd: w.hwnd }).catch(() => {});
      setTimeout(renderOverview, 180);
    });
    card.addEventListener("click", async () => {
      await invoke("activate_window", { hwnd: w.hwnd, toggleMinimize: false }).catch(() => {});
      closeOverlay();
    });
    gridEl.appendChild(card);
  });
}

document.getElementById("btnOvwDeskPrev")?.addEventListener("click", async () => {
  await invoke("virtual_desktop_action", { action: "prev" }).catch(() => {});
  setTimeout(renderOverview, 140);
});
document.getElementById("btnOvwDeskNext")?.addEventListener("click", async () => {
  await invoke("virtual_desktop_action", { action: "next" }).catch(() => {});
  setTimeout(renderOverview, 140);
});
document.getElementById("btnOvwDeskNew")?.addEventListener("click", async () => {
  await invoke("virtual_desktop_action", { action: "new" }).catch(() => {});
  setTimeout(renderOverview, 180);
});
document.getElementById("btnOvwClose")?.addEventListener("click", closeOverlay);

// ============================================================
// ROUTER, KEYBOARD & TAURI EVENTS
// ============================================================
async function openView(view) {
  currentView = view || "quick_panel";
  if (backdropEl) {
    backdropEl.className = `ov-backdrop mode-${currentView}`;
  }
  Object.entries(viewEls).forEach(([k, el]) => {
    setAnimatedHidden(el, k !== currentView);
  });

  if (currentView === "quick_panel") {
    qpActivePicker = "";
    await loadCcLayout();
    await refreshQuickPanel();
  } else if (currentView === "quick_search") {
    await ensureAppsLoaded();
    renderQuickSearch();
    requestAnimationFrame(() => document.getElementById("qsInput")?.focus());
  } else if (currentView === "app_grid") {
    await renderAppGrid();
    requestAnimationFrame(() => document.getElementById("agSearch")?.focus());
  } else if (currentView === "overview") {
    await renderOverview();
  }
}

backdropEl?.addEventListener("click", (e) => {
  if (e.target === backdropEl || e.target.classList.contains("ov-full")) {
    closeOverlay();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    const modal = document.getElementById("qsQrModal");
    if (modal && !modal.hidden) {
      setAnimatedHidden(modal, true);
      return;
    }
    closeOverlay();
    return;
  }
  if (currentView !== "quick_search") return;

  if (e.ctrlKey && ["1", "2", "3", "4"].includes(e.key)) {
    e.preventDefault();
    const map = { "1": "apps", "2": "files", "3": "actions", "4": "clipboard" };
    setQsTab(map[e.key]);
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (qsDisplayedItems.length > 0) {
      qsSelectedIdx = (qsSelectedIdx + 1) % qsDisplayedItems.length;
      renderQuickSearch();
      document.querySelector(".qs-row.selected")?.scrollIntoView({ block: "nearest" });
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (qsDisplayedItems.length > 0) {
      qsSelectedIdx = (qsSelectedIdx + qsDisplayedItems.length - 1) % qsDisplayedItems.length;
      renderQuickSearch();
      document.querySelector(".qs-row.selected")?.scrollIntoView({ block: "nearest" });
    }
  } else if (e.key === "Enter") {
    if (qsMathResult !== null && qsDisplayedItems.length === 0) {
      e.preventDefault();
      navigator.clipboard?.writeText(qsMathResult).catch(() => {});
      showToast(`Đã chép: ${qsMathResult}`);
      return;
    }
    const sel = qsDisplayedItems[qsSelectedIdx];
    if (sel) {
      e.preventDefault();
      executeQsItem(sel);
    }
  }
});

listen("island-overlay-open", (e) => {
  const v = e?.payload?.view;
  if (v) openView(v);
}).catch(() => {});

listen("island-settings", (e) => {
  if (e?.payload?.settings) {
    Object.assign(cachedSettings, e.payload.settings);
    applyThemeTokens(cachedSettings);
  }
}).catch(() => {});

listen("island-hw", (e) => {
  const hw = e?.payload;
  if (!hw || currentView !== "quick_panel") return;
  const slV = document.getElementById("slQpVol");
  const valV = document.getElementById("qpVolVal");
  const muteBtn = document.getElementById("btnQpMute");
  qpVolMuted = !!hw.volume_muted;
  if (slV && typeof hw.volume_pct === "number") {
    slV.value = hw.volume_pct;
    updateSliderCssVal(slV);
  }
  if (valV) valV.textContent = qpVolMuted ? "Tắt" : `${hw.volume_pct ?? 50}%`;
  if (muteBtn) muteBtn.textContent = qpVolMuted ? "🔇" : "🔊";
}).catch(() => {});

listen("island-brightness", (e) => {
  const p = e?.payload;
  if (!p || currentView !== "quick_panel") return;
  const slB = document.getElementById("slQpBright");
  const valB = document.getElementById("qpBrightVal");
  if (slB) {
    slB.value = p.level;
    updateSliderCssVal(slB);
  }
  if (valB) valB.textContent = `${p.level}%`;
}).catch(() => {});

listen("island-clipboard-image", (e) => {
  if (e?.payload?.id && currentView === "quick_search" && qsTab === "clipboard") {
    refreshQsClipboard();
  }
}).catch(() => {});

// Boot initialization
(async () => {
  try {
    const raw = await invoke("load_data_file", { filename: "settings.txt" });
    if (raw) {
      Object.assign(cachedSettings, JSON.parse(raw));
    }
  } catch (_) {}
  applyThemeTokens(cachedSettings);
  setInterval(updateQpClock, 15000);
  openView(currentView);
})();
