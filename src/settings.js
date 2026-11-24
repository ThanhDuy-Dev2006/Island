// ============================================================
// CỬA SỔ CÀI ĐẶT ISLAND v1.2.0 (GỌN RÀNG · TRỰC QUAN)
// ============================================================
const T = window.__TAURI__ || {};
const invoke = T.core?.invoke || (async () => null);
const emit = T.event?.emit || (async () => {});
const listen = T.event?.listen || (async () => () => {});
const curWin = T.window?.getCurrentWindow ? T.window.getCurrentWindow() : null;

const DEFAULTS = {
  // Hệ thống & Hiệu năng
  autostart: false,
  hideFullscreen: true,
  perfMode: "balanced",
  reduceEffects: false,
  autoTrimMemory: true,
  fastAnim: false,
  globalHotkeys: true,
  liveActivity: true,
  sounds: true,
  alarmStyle: "alarm",
  alarmDuration: 10,
  // Bật / Ẩn 10 trang trên Dynamic Island
  musicPage: true,
  todayPage: true,
  weatherPage: true,
  widgetsPage: true,
  pomoPage: true,
  waterPage: true,
  shelfPage: true,
  todoPage: true,
  prayerPage: false,
  aiPage: true,
  // Giao diện, Tai thỏ & Màn hình
  notchStyle: "classic",
  themePreset: "auto",
  glass: false,
  glassTint: 78,
  scale: "auto",
  minimal: false,
  openMode: "hover",
  hoverCloseDelay: 240,
  statusRing: "auto",
  pageIcons: true,
  monitorMode: "single",
  monitor: null,
  // Thú cưng & Biểu cảm
  mascot: true,
  restStyle: "pet",
  petType: "aura",
  lastClassicPet: "island",
  petMinimalFace: false,
  petGlowColor: "island",
  petEyeSize: "normal",
  petEyeColor: "auto",
  petAutoSleep: false,
  _v121PageTogglesMigrated: true,
  _v122VnClockMigrated: true,
  _v123ClassicNotchDefault: true,
  _v125AutoWeatherThemeMigrated: true,
  _v126AuraPetDefault: true,
  _v127AutoGpsAndAiMigrated: true,
  // Thời tiết & Định vị GPS
  weatherHeaderBadge: true,
  weatherCity: "Auto",
  weatherUnit: "C",
  weatherForecastMode: "hourly",
  weatherTheme: "auto",
  weatherAlert: true,
  // Trợ lý AI Copilot
  aiProvider: "gateway",
  aiEndpoint: "",
  geminiApiKey: "",
  aiModel: "ag/gemini-3.8-flash",
  aiThinkingLevel: "high",
  aiStream: true,
  aiSaveHistory: true,
  aiSystemPrompt: "Bạn là Island AI Assistant - một trợ lý thông minh trên Desktop Windows. Hãy trả lời ngắn gọn, chuẩn xác, súc tích bằng tiếng Việt.",
  aiWidth: 520,
  aiHeight: 220,
  // Lịch, Việc cần làm, Pomodoro & Uống nước
  todoOrdered: true,
  todoStart: true,
  todoEnd: true,
  snoozeMin: 10,
  googleClientId: "",
  googleClientSecret: "",
  weekMonday: true,
  calendarView: "month",
  pomoFocus: 25,
  pomoShort: 5,
  pomoLong: 15,
  pomoAutoLong: true,
  waterRemind: true,
  waterGoal: 2000,
  waterBottle: 250,
  waterFrom: 8,
  waterTo: 22,
  waterInterval: 0,
  // Nhạc, Tiện ích Đôi, Khay tệp, Thông báo, HUD & Cầu nguyện
  albumGlow: true,
  audioVisualizer: true,
  lyrics: true,
  miniLyricsBar: true,
  showRemaining: false,
  widgetLeft: "this_week",
  widgetRight: "battery",
  widgetCity1: "Hà Nội",
  widgetCity2: "TP.HCM",
  widgetEvent: "new_year",
  shelfClear: false,
  clipboard: true,
  clipboardMax: 50,
  clipboardKeep: true,
  notifications: true,
  notificationPreview: true,
  prayerCity: "Hà Nội",
  prayerReminder: false,
  prayerEarly: true,
  prayerSound: true,
  prayerPauseMedia: false,
  prayerAdjSubuh: 0,
  prayerAdjDzuhur: 0,
  prayerAdjAshar: 0,
  prayerAdjMaghrib: 0,
  prayerAdjIsya: 0,
  hudVolume: true,
  hudBrightness: true,
  hudCaps: true,
  hudLanguage: true,
  popupBattery: true,
  popupWifi: true,
  popupBluetooth: true,
  // Tính năng mở rộng
  visualizerStyle: "bars",
  musicAurora: true,
  uiFont: "default",
  hoverOpenSensitivity: "quick",
  floatingTopGap: 6,
  pomoAutoBreak: true,
  privacyIndicator: true,
  popupDownloads: true,
  // Giao diện tổng thể & Chủ đề
  colorMode: "dark",
  accentColor: "auto",
  // Viên thuốc (Capsule Idle) & Lịch họp Windows
  capsuleLeft: "clock",
  capsuleRight: "weather",
  capsuleEdgeGlow: true,
  calendarCompanion: true,
  suppressNativeOsd: false,
  // Hệ sinh thái Desktop Shell (mặc định an toàn)
  enableIsland: true,
  enableDeck: false,
  deckBehavior: "overlay",
  deckSize: 48,
  deckMagnify: true,
  deckShowRecents: true,
  deckShowDownloads: true,
  deckShowTrash: true,
  hideTaskbar: false,
  enableRail: false,
  railBehavior: "overlay",
  railShowAppMenu: true,
  railShowWifi: true,
  railShowBattery: true,
  railShowClock: true,
  enableWidgets: false,
  widgetsStyle: "original",
  widgetsTopmost: false,
  enableScene: false,
  // Phím tắt & Góc nóng (Hot Corners)
  macShortcuts: false,
  hotCornerTL: "none",
  hotCornerTR: "none",
  hotCornerBL: "none",
  hotCornerBR: "none"
};

let S = { ...DEFAULTS };
let waterToday = { intakeMl: 0, goalMl: 2000 };
let weatherInfo = { city: "", fullAddress: "", locSource: "", lat: null, lon: null, tempC: null, updatedAt: 0 };
let googleTasksStatus = { connected: false, email: "", last_sync: "", has_default_creds: false, client_id: "" };
let isGoogleAuthBusy = false;
let currentPage = "general";

// ------------------------------------------------------------
// Biểu tượng thanh bên (SVG trắng gọn sắc nét)
// ------------------------------------------------------------
const IC = {
  gear: '<path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zm6.3 3.7-1.4.4-.4 1 .7 1.3-1.2 1.2-1.3-.7-1 .4-.4 1.4H7.6l-.4-1.4-1-.4-1.3.7-1.2-1.2.7-1.3-.4-1-1.4-.4V7.1l1.4-.4.4-1-.7-1.3 1.2-1.2 1.3.7 1-.4.4-1.4h1.7l.4 1.4 1 .4 1.3-.7 1.2 1.2-.7 1.3.4 1 1.4.4z"/>',
  appearance: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.6v9.8a4.9 4.9 0 0 1 0-9.8z"/>',
  deck: '<path d="M2 10.5h12a1 1 0 0 1 1 1v1.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.7v-1.2a1 1 0 0 1 1-1zm1.2-6h2.4v4H3.2zm3.6 0h2.4v4H6.8zm3.6 0h2.4v4h-2.4z"/>',
  rail: '<path d="M1.5 2.5h13A1 1 0 0 1 15.5 3.5v2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM2 8.5h12v1.2H2zm0 3h8v1.2H2z"/>',
  desktop: '<path d="M2 2.5h5v5H2zm7 0h5v5H9zm-7 6h5v5H2zm7 0h5v5H9z"/>',
  shortcuts: '<path d="M2 4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 2 12h12a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14 4H2zm1.5 2h2v1.5h-2V6zm3 0h3v1.5h-3V6zm4 0h2v1.5h-2V6zm-6.5 3h8v1.5H4V9z"/>',
  pet: '<path d="M4.2 5.8a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zm3.8-1a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zm3.8 1a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zM8 6.8c2.6 0 4.6 2.1 4.6 4.4 0 1.5-1.1 2.4-2.4 2.4-.8 0-1.4-.3-2.2-.3s-1.4.3-2.2.3c-1.3 0-2.4-.9-2.4-2.4C3.4 8.9 5.4 6.8 8 6.8z"/>',
  weather: '<path d="M6.5 2a3.5 3.5 0 0 1 3.4 2.7A3 3 0 1 1 11 10.5H4.8a2.8 2.8 0 1 1 .4-5.5A3.5 3.5 0 0 1 6.5 2zm-2 10h1.4l-.8 2H3.7zm3.2 0h1.4l-.8 2H6.9zm3.2 0h1.4l-.8 2h-1.4z"/>',
  ai: '<path d="M8 1.5 9.5 5l3.5 1.5L9.5 8 8 11.5 6.5 8 3 6.5 6.5 5zm4.5 7.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>',
  todo: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm-1 9.6L4.2 8.3l1.1-1.1L7 8.9l3.7-3.7 1.1 1.1z"/>',
  widgets: '<path d="M2 2h5.2v5.2H2zm6.8 0H14v5.2H8.8zM2 8.8h5.2V14H2zm6.8 0H14V14H8.8z"/>',
  about: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm.8 10.3H7.2V7h1.6zM8 5.9a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>'
};

// 11 danh mục khoa học + Giới thiệu
const PAGES = [
  { id: "general", label: "Hệ thống & Trang", sub: "Khởi động, hiệu năng, bật/ẩn Dynamic Island & âm báo", icon: "gear", color: "#636366" },
  { id: "appearance", label: "Giao diện & Viên thuốc", sub: "Sáng/Tối, màu nhấn, Capsule Idle, Kính mờ & màn hình", icon: "appearance", color: "#5e5ce6" },
  { id: "deck", label: "Thanh ứng dụng Deck", sub: "Dock phóng đại đáy màn hình, Downloads, Thùng rác & Taskbar", icon: "deck", color: "#0a84ff" },
  { id: "rail", label: "Thanh menu trên Rail", sub: "Menu ứng dụng đang mở, Wi-Fi, Pin & tự ẩn thông minh", icon: "rail", color: "#14b8a6" },
  { id: "desktop", label: "Desktop Widgets & Scene", sub: "Tiện ích nổi trên màn hình nền & không gian cửa sổ Scene", icon: "desktop", color: "#f97316" },
  { id: "shortcuts", label: "Phím tắt & Góc nóng", sub: "Phím tắt toàn cục, phím tắt nhanh, OSD âm lượng & 4 góc nóng", icon: "shortcuts", color: "#6366f1" },
  { id: "pet", label: "Thú cưng & Biểu cảm", sub: "Xem trước trực tiếp, 13 linh vật, mắt phát sáng & 16 biểu cảm", icon: "pet", color: "#ec4899" },
  { id: "weather", label: "Thời tiết & GPS", sub: "Định vị GPS tự động theo địa chỉ máy, dự báo & 13 chủ đề bầu trời", icon: "weather", color: "#0ea5e9" },
  { id: "ai", label: "Trợ lý AI Copilot", sub: "Đổi mô hình AI, mức độ tư duy & chỉ dẫn phản hồi", icon: "ai", color: "#a855f7" },
  { id: "productivity", label: "Lịch, Việc & Sức khỏe", sub: "Lịch họp Windows, Việc cần làm, Pomodoro & nhắc uống nước", icon: "todo", color: "#30d158" },
  { id: "utilities", label: "Nhạc, Tiện ích & HUD", sub: "Lời karaoke, Widgets đôi, Khay tệp/Clipboard, Thông báo & HUD", icon: "widgets", color: "#32ade6" }
];

const BOTTOM_PAGES = [
  { id: "about", label: "Giới thiệu", sub: "Thông tin phiên bản Island 1.2.0, kiến trúc hệ thống & cập nhật", icon: "about", color: "#636366" }
];

// ------------------------------------------------------------
// Tiện ích & Lưu cấu hình (IPC tức thì 0ms, Debounce ghi đĩa 120ms)
// ------------------------------------------------------------
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

let saveTimer = null;
let isSavingFromHere = false;
let hasPendingSave = false;

function writeSettingsToDisk() {
  hasPendingSave = false;
  isSavingFromHere = true;
  return invoke("save_data_file", {
    filename: "settings.txt",
    content: JSON.stringify(S, null, 2)
  })
    .catch(() => {})
    .finally(() => {
      setTimeout(() => { isSavingFromHere = false; }, 80);
    });
}

function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (hasPendingSave) {
    return writeSettingsToDisk();
  }
  return Promise.resolve();
}

const prefColorMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
prefColorMedia?.addEventListener?.("change", () => applySettingsWindowTheme());

function applySettingsWindowTheme() {
  const mode = S.colorMode === "auto"
    ? (prefColorMedia?.matches ? "dark" : "light")
    : (S.colorMode || "dark");
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.accent = S.accentColor || "auto";
}

function commit(key) {
  applySettingsWindowTheme();
  emit("island-settings", { settings: S, changed: key || "" }).catch(() => {});
  hasPendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeSettingsToDisk();
  }, 120);
}

function set(key, val) {
  S[key] = val;
  commit(key);
}

function sliderRow(key, title, desc, min, max, step = 1, unit = "") {
  const row = el("div", "row");
  row.appendChild(rowText(title, desc));
  const wrap = el("div", "slider-ctrl");
  const inp = el("input", "glass-slider");
  inp.type = "range";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  const cur = Number(S[key] ?? DEFAULTS[key] ?? min);
  inp.value = String(cur);
  const syncVar = (v) => {
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    inp.style.setProperty("--val", `${pct.toFixed(1)}%`);
  };
  syncVar(cur);
  const valEl = el("span", "slider-val", `${cur}${unit}`);
  inp.addEventListener("input", () => {
    const num = Number(inp.value);
    valEl.textContent = `${num}${unit}`;
    syncVar(num);
    set(key, num);
  });
  wrap.append(inp, valEl);
  row.appendChild(wrap);
  return row;
}

const ACCENT_PRESETS = [
  ["auto", "Tự động", "linear-gradient(135deg,#0a84ff,#ec4899)"],
  ["blue", "Xanh dương", "#0a84ff"],
  ["indigo", "Chàm", "#6366f1"],
  ["purple", "Tím", "#a855f7"],
  ["pink", "Hồng", "#ec4899"],
  ["red", "Đỏ", "#ef4444"],
  ["orange", "Cam", "#f97316"],
  ["amber", "Vàng hổ phách", "#f59e0b"],
  ["green", "Xanh lá", "#10b981"],
  ["teal", "Ngọc", "#14b8a6"],
  ["cyan", "Cyan", "#06b6d4"],
  ["slate", "Xám thép", "#64748b"]
];

function accentSwatchesRow() {
  const row = el("div", "row col");
  row.appendChild(rowText("Màu nhấn hệ thống (Accent Color)", "Áp dụng cho toàn bộ Settings, Quick Panel, Deck, Rail & Widgets"));
  const box = el("div", "accent-swatches");
  ACCENT_PRESETS.forEach(([id, label, color]) => {
    const sw = el("button", "accent-swatch" + ((S.accentColor || "auto") === id ? " active" : ""));
    sw.type = "button";
    sw.title = label;
    sw.style.background = color;
    sw.addEventListener("click", () => {
      box.querySelectorAll(".accent-swatch").forEach((b) => b.classList.remove("active"));
      sw.classList.add("active");
      set("accentColor", id);
    });
    box.appendChild(sw);
  });
  row.appendChild(box);
  return row;
}

// ------------------------------------------------------------
// Thành phần giao diện chuẩn
// ------------------------------------------------------------
function sectionLabel(text) {
  return el("div", "sec-lbl", text);
}

function card(...rows) {
  const c = el("div", "card");
  rows.filter(Boolean).forEach((r) => c.appendChild(r));
  return c;
}

function rowText(title, desc) {
  const box = el("div", "row-txt");
  box.appendChild(el("div", "row-t", title));
  if (desc) box.appendChild(el("div", "row-d", desc));
  return box;
}

function toggleRow(key, title, desc, opts = {}) {
  const row = el("div", "row" + (opts.disabled ? " disabled" : ""));
  row.appendChild(rowText(title, desc));
  const sw = el("button", "sw" + (S[key] ? " on" : ""));
  sw.title = S[key] ? "Đang bật — bấm để tắt" : "Đang tắt — bấm để bật";
  if (opts.disabled) sw.disabled = true;
  sw.addEventListener("click", async () => {
    const v = !S[key];
    if (opts.before && (await opts.before(v)) === false) return;
    set(key, v);
    sw.classList.toggle("on", v);
    sw.title = v ? "Đang bật — bấm để tắt" : "Đang tắt — bấm để bật";
    opts.after?.(v);
  });
  row.appendChild(sw);
  return row;
}

function compactToggleChip(key, title, sub) {
  const chip = el("div", "mini-toggle-chip");
  const info = el("div", "mini-toggle-info");
  info.appendChild(el("div", "mini-toggle-name", title));
  if (sub) info.appendChild(el("div", "mini-toggle-sub", sub));
  const sw = el("button", "sw" + (S[key] ? " on" : ""));
  sw.title = `${title}: ${S[key] ? "Đang bật" : "Đang tắt"}`;
  sw.addEventListener("click", () => {
    const v = !S[key];
    set(key, v);
    sw.classList.toggle("on", v);
    sw.title = `${title}: ${v ? "Đang bật" : "Đang tắt"}`;
  });
  chip.append(info, sw);
  return chip;
}

function segControl(key, options, full, onChange) {
  const seg = el("div", "seg" + (full ? " full" : ""));
  options.forEach(([val, label, tip]) => {
    const b = el("button", String(S[key]) === String(val) ? "on" : "", label);
    if (tip) b.title = tip;
    b.addEventListener("click", () => {
      set(key, val);
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      onChange?.(val);
    });
    seg.appendChild(b);
  });
  return seg;
}

function segRow(key, title, desc, options, onChange) {
  const row = el("div", "row");
  row.appendChild(rowText(title, desc));
  row.appendChild(segControl(key, options, false, onChange));
  return row;
}

function segBlockRow(key, title, desc, options, onChange) {
  const row = el("div", "row col");
  row.appendChild(rowText(title, desc));
  row.appendChild(segControl(key, options, true, onChange));
  return row;
}

function selectRow(key, title, desc, options) {
  const row = el("div", "row");
  row.appendChild(rowText(title, desc));
  const sel = el("select", "num-sel");
  options.forEach(([v, l]) => {
    const o = el("option", "", l);
    o.value = String(v);
    if (String(S[key]) === String(v)) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener("change", () => {
    const raw = sel.value;
    const num = Number(raw);
    set(key, !isNaN(num) && String(num) === raw ? num : raw);
    renderPage();
  });
  row.appendChild(sel);
  return row;
}

// ------------------------------------------------------------
// Dữ liệu cấu hình (Pet, Hào quang, Chủ đề, AI Models)
// ------------------------------------------------------------
const PET_GALLERY = [
  { id: "aura", name: "Mắt Tinh Linh Island", desc: "2 mắt trắng tối giản trên nền cực quang xanh tím", avatar: "pet-aura.svg" },
  { id: "bot", name: "Robot Cyber", desc: "Ăng-ten phát sáng & mắt LED xanh băng", avatar: "robot-avatar-dark.svg" },
  { id: "island", name: "Tinh Linh Island", desc: "Vương miện vàng & má hồng đặc trưng", avatar: "pet-island.svg" },
  { id: "cat", name: "Mèo Đêm Neko", desc: "Tai mèo vểnh, ria mèo & mắt ngọc bích", avatar: "pet-cat.svg" },
  { id: "bunny", name: "Thỏ Tuyết Mochi", desc: "Tai thỏ dài đung đưa & má hồng dễ thương", avatar: "pet-bunny.svg" },
  { id: "fox", name: "Cáo Lửa Kitsune", desc: "Tai cáo nhọn & ấn lửa hổ phách ấm áp", avatar: "pet-fox.svg" },
  { id: "dragon", name: "Rồng Ngọc Ruri", desc: "Sừng vàng kim & đôi cánh vỗ nhịp nhàng", avatar: "pet-dragon.svg" },
  { id: "panda", name: "Gấu Trúc Bambu", desc: "Tai tròn đen láy & mầm trúc xanh non", avatar: "pet-panda.svg" },
  { id: "shiba", name: "Cún Vàng Shiba", desc: "Tai cún vàng cam & chuông cổ tinh nghịch", avatar: "pet-shiba.svg" },
  { id: "axolotl", name: "Kỳ Nhông Axolotl", desc: "Mang san hô hồng phấn & bong bóng nước", avatar: "pet-axolotl.svg" },
  { id: "owl", name: "Cú Đêm Ngân Hà", desc: "Lông mày sao băng & mắt vàng kim", avatar: "pet-owl.svg" },
  { id: "penguin", name: "Cánh Cụt Pingu", desc: "Mũ len mùa đông & má hồng đáng yêu", avatar: "pet-penguin.svg" },
  { id: "unicorn", name: "Kỳ Lân Cầu Vồng", desc: "Sừng phép thuật & bờm pastel rực rỡ", avatar: "pet-unicorn.svg" }
];

const PET_GLOW_PRESETS = [
  { id: "auto", label: "🔄 Theo loài", grad: "radial-gradient(ellipse at 50% 100%, #2d5bff 0%, #7b4bff 42%, transparent 88%)" },
  { id: "island", label: "🌌 Xanh Tím", grad: "linear-gradient(90deg, #14b8ff 0%, #2563eb 50%, #6d28d9 100%)" },
  { id: "cyber", label: "💎 Xanh Băng", grad: "linear-gradient(90deg, #00f5d4 0%, #0ea5e9 52%, #3b82f6 100%)" },
  { id: "nebula", label: "🔮 Tím Neon", grad: "linear-gradient(90deg, #6366f1 0%, #9333ea 52%, #ec4899 100%)" },
  { id: "emerald", label: "🌿 Ngọc", grad: "linear-gradient(90deg, #10b981 0%, #06b6d4 52%, #2563eb 100%)" },
  { id: "sunset", label: "🌅 Cam", grad: "linear-gradient(90deg, #f59e0b 0%, #f97316 50%, #e11d48 100%)" },
  { id: "rose", label: "🌸 Hồng", grad: "linear-gradient(90deg, #f472b6 0%, #ec4899 50%, #8b5cf6 100%)" },
  { id: "off", label: "🖤 Tắt", grad: "transparent" }
];

const PET_EYE_COLOR_PRESETS = [
  { id: "auto", label: "✨ Theo loài", bg: "#ffffff", shadow: "0 0 7px 1px rgba(255,255,255,0.92), 0 0 15px 2px rgba(56,189,248,0.45)" },
  { id: "white", label: "⚪ Trắng sáng", bg: "#ffffff", shadow: "0 0 7px 1px rgba(255,255,255,0.95), 0 0 15px 2px rgba(56,189,248,0.45)" },
  { id: "cyan", label: "🩵 Xanh băng", bg: "linear-gradient(180deg, #e0f9ff, #38bdf8)", shadow: "0 0 8px 1px rgba(56,189,248,0.95)" },
  { id: "violet", label: "💜 Tím Neon", bg: "linear-gradient(180deg, #f3e8ff, #a855f7)", shadow: "0 0 8px 1px rgba(192,132,252,0.95)" },
  { id: "gold", label: "💛 Vàng kim", bg: "linear-gradient(180deg, #fef9c3, #f59e0b)", shadow: "0 0 8px 1px rgba(251,191,36,0.95)" },
  { id: "pink", label: "🩷 Hồng phấn", bg: "linear-gradient(180deg, #fce7f3, #ec4899)", shadow: "0 0 8px 1px rgba(244,114,182,0.95)" },
  { id: "emerald", label: "💚 Xanh ngọc", bg: "linear-gradient(180deg, #d1fae5, #10b981)", shadow: "0 0 8px 1px rgba(52,211,153,0.95)" }
];

const ISLAND_THEME_PRESETS = [
  ["auto", "🔄 Mặc định Island (Xanh Lam · Tím)"],
  ["island", "🌌 Island Original (Xanh Lam · Tím Neon)"],
  ["obsidian", "🖤 Obsidian Dark (Đen tuyền nguyên bản)"],
  ["prism", "💎 Prism Glass (Kính Sáng Pha Lê)"],
  ["neon", "⚡ Neon Pulse (Viền Sáng Cyber)"],
  ["aurora", "✨ Aurora Teal (Cực quang Ngọc bích)"],
  ["nebula", "🔮 Violet Nebula (Tinh vân Tím)"],
  ["emerald", "🌿 Emerald Mint (Ngọc lục bảo)"],
  ["rose", "🌸 Rose Sakura (Hồng anh đào)"],
  ["ocean", "🌊 Ocean Horizon (Đại dương xanh)"],
  ["sunset", "🌇 Sunset Amber (Hoàng hôn cam)"],
  ["crimson", "🔥 Crimson Cyber (Đỏ Neon Cyber)"],
  ["gold", "👑 Royal Gold (Vàng Hoàng gia)"],
  ["stealth", "🕶️ Stealth Black (Đen Nhám Tối Giản)"],
  ["pixel", "👾 Pixel Retro (Góc Vuông Monospace)"]
];

const SHARED_THEME_MAX_BYTES = 16 * 1024;
const SHARED_THEME_MAX_LINES = 200;
const ALLOWED_PRESETS = new Set(["auto", "island", "obsidian", "prism", "neon", "aurora", "nebula", "emerald", "rose", "ocean", "sunset", "crimson", "gold", "stealth", "pixel"]);
const ALLOWED_FONTS = new Set(["default", "inter", "bahnschrift", "mono"]);
const ALLOWED_VIS = new Set(["bars", "spectrum", "wave", "dots"]);

function parseSharedThemeText(rawText) {
  if (typeof rawText !== "string") return { ok: false, reason: "Dữ liệu không phải văn bản." };
  if (rawText.length > SHARED_THEME_MAX_BYTES) return { ok: false, reason: "Tệp chủ đề quá lớn (tối đa 16 KB)." };
  if (rawText.includes("\0")) return { ok: false, reason: "Tệp chứa byte nhị phân không hợp lệ." };
  const cleaned = rawText.replace(/^\uFEFF/, "");
  const allLines = cleaned.split(/\r?\n/);
  if (allLines.length > SHARED_THEME_MAX_LINES) return { ok: false, reason: "Tệp chủ đề vượt quá 200 dòng." };

  const lines = allLines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const head = lines.shift();
  if (!head) return { ok: false, reason: "Thiếu dòng tiêu đề island_theme=1." };
  const eq = head.indexOf("=");
  if (eq <= 0) return { ok: false, reason: "Không phải tệp chủ đề Island." };
  const hk = head.slice(0, eq).trim().toLowerCase();
  const hv = parseInt(head.slice(eq + 1).trim(), 10);
  if (hk !== "island_theme" || !Number.isFinite(hv) || hv <= 0) {
    return { ok: false, reason: "Không phải tệp chủ đề Island." };
  }
  if (hv > 1) return { ok: false, reason: "Tệp yêu cầu phiên bản ứng dụng mới hơn." };

  const patch = {};
  const ignored = [];
  let fields = 0;
  const skip = (k) => {
    const cleanKey = String(k || "").replace(/[\x00-\x1F]/g, "").trim().slice(0, 40);
    if (cleanKey && ignored.length < 20 && !ignored.includes(cleanKey)) ignored.push(cleanKey);
  };

  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx <= 0) {
      skip(line);
      continue;
    }
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    const vl = v.toLowerCase();
    let handled = false;
    if (k === "name" || k === "author") {
      handled = v.length > 0;
    } else if (k === "preset") {
      const mapped = vl === "default" ? "island" : vl;
      if (ALLOWED_PRESETS.has(mapped)) {
        patch.themePreset = mapped;
        fields++;
        handled = true;
      }
    } else if (k === "style") {
      if (vl === "classic" || vl === "floating") {
        patch.notchStyle = vl;
        fields++;
        handled = true;
      }
    } else if (k === "font") {
      const mapped = vl === "segoe" ? "default" : vl;
      if (ALLOWED_FONTS.has(mapped)) {
        patch.uiFont = mapped;
        fields++;
        handled = true;
      }
    } else if (k === "visualizer") {
      if (ALLOWED_VIS.has(vl)) {
        patch.visualizerStyle = vl;
        fields++;
        handled = true;
      }
    } else if (k === "transparency" || k === "glass_tint") {
      const n = parseInt(v.replace(/%$/, ""), 10);
      if (Number.isFinite(n)) {
        patch.glassTint = Math.max(35, Math.min(98, n));
        patch.glass = n < 95;
        fields++;
        handled = true;
      }
    } else if (k === "top_gap") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) {
        patch.floatingTopGap = Math.max(0, Math.min(24, n));
        fields++;
        handled = true;
      }
    } else if (k === "glass") {
      if (["on", "true", "yes", "1", "off", "false", "no", "0"].includes(vl)) {
        patch.glass = ["on", "true", "yes", "1"].includes(vl);
        fields++;
        handled = true;
      }
    } else if (k === "glow" || k === "aurora") {
      if (["on", "true", "yes", "1", "off", "false", "no", "0"].includes(vl)) {
        const on = ["on", "true", "yes", "1"].includes(vl);
        patch.musicAurora = on;
        patch.albumGlow = on;
        fields++;
        handled = true;
      }
    } else if (k === "motion") {
      if (["normal", "full"].includes(vl)) {
        patch.reduceEffects = false;
        fields++;
        handled = true;
      } else if (["reduce", "reduced", "minim", "minimal"].includes(vl)) {
        patch.reduceEffects = true;
        fields++;
        handled = true;
      }
    }
    if (!handled) skip(k);
  }

  if (fields === 0) return { ok: false, reason: "Không có thiết lập giao diện hợp lệ nào trong tệp." };
  return { ok: true, patch, ignored, fields };
}

function exportSharedThemeText(cur = S) {
  return [
    "island_theme=1",
    `name=Island ${cur.themePreset || "auto"}`,
    `preset=${cur.themePreset || "auto"}`,
    `style=${cur.notchStyle || "classic"}`,
    `font=${cur.uiFont || "default"}`,
    `visualizer=${cur.visualizerStyle || "bars"}`,
    `glass=${cur.glass ? "on" : "off"}`,
    `transparency=${Math.max(35, Math.min(98, Number(cur.glassTint) || 78))}`,
    `top_gap=${Math.max(0, Math.min(24, Number(cur.floatingTopGap) || 6))}`,
    `glow=${cur.musicAurora !== false ? "on" : "off"}`,
    `motion=${cur.reduceEffects ? "reduce" : "normal"}`
  ].join("\n") + "\n";
}

const WEATHER_THEME_GALLERY = [
  { id: "auto", ico: "🔄", name: "Tự động theo thời tiết thật", desc: "Đổi màu & hiệu ứng trang Thời tiết theo điều kiện ngoài trời", glow: "linear-gradient(90deg, #fbbf24 0%, #38bdf8 52%, #818cf8 100%)" },
  { id: "sunny_gold", ico: "☀️", name: "Nắng Vàng Rực Rỡ", desc: "Quầng nắng ấm áp & biểu đồ nhiệt Cam - Vàng", glow: "linear-gradient(90deg, #fbbf24 0%, #f97316 55%, #38bdf8 100%)" },
  { id: "rain_neon", ico: "🌧️", name: "Mưa Đêm Sài Gòn", desc: "Hạt mưa rơi chéo sống động trên nền xanh lam sâu", glow: "linear-gradient(90deg, #0ea5e9 0%, #2563eb 55%, #6366f1 100%)" },
  { id: "thunder_storm", ico: "⛈️", name: "Giông Bão Sấm Sét", desc: "Mưa giông kèm tia chớp tím điện quang", glow: "linear-gradient(90deg, #c084fc 0%, #6366f1 55%, #0ea5e9 100%)" },
  { id: "starry_night", ico: "🌌", name: "Đêm Sao Ngân Hà", desc: "Bầu trời đêm đầy sao & dải ngân hà Tím", glow: "linear-gradient(90deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)" },
  { id: "aurora_sky", ico: "✨", name: "Cực Quang Bắc Cực", desc: "Dải lụa cực quang Ngọc bích cùng bụi sao sáng", glow: "linear-gradient(90deg, #00f5d4 0%, #06b6d4 55%, #a855f7 100%)" },
  { id: "sunset_beach", ico: "🌇", name: "Hoàng Hôn Biển Đảo", desc: "Ánh chiều tà Đỏ San Hô - Cam rực rỡ", glow: "linear-gradient(90deg, #f43f5e 0%, #fb923c 55%, #fbbf24 100%)" },
  { id: "snow_winter", ico: "❄️", name: "Tuyết Trắng Mùa Đông", desc: "Bông tuyết rơi nhẹ trên nền Xanh Pha Lê", glow: "linear-gradient(90deg, #e0f2fe 0%, #38bdf8 55%, #818cf8 100%)" },
  { id: "sakura_breeze", ico: "🌸", name: "Gió Xuân Anh Đào", desc: "Cánh hoa hồng phấn bay trong làn gió nhẹ", glow: "linear-gradient(90deg, #f9a8d4 0%, #ec4899 55%, #c084fc 100%)" },
  { id: "cyber_weather", ico: "⚡", name: "Cyberpunk Neon", desc: "Đỏ Neon - Xanh Cyan độ tương phản cao", glow: "linear-gradient(90deg, #f43f5e 0%, #00f5d4 55%, #7c3aed 100%)" },
  { id: "emerald_forest", ico: "🌿", name: "Rừng Nhiệt Đới", desc: "Đom đóm xanh ngọc giữa rừng cây tươi mát", glow: "linear-gradient(90deg, #34d399 0%, #10b981 55%, #0ea5e9 100%)" },
  { id: "cloudy_mist", ico: "☁️", name: "Mây Mù Sương Khói", desc: "Sương mù xanh xám bạc dịu mắt", glow: "linear-gradient(90deg, #93c5fd 0%, #60a5fa 55%, #94a3b8 100%)" },
  { id: "obsidian_minimal", ico: "🖤", name: "Đen Tuyền Tối Giản", desc: "Không hiệu ứng hạt, tập trung tối đa số liệu", glow: "linear-gradient(90deg, #18181b 0%, #27272a 55%, #3f3f46 100%)" }
];

const AI_MODELS = [
  { id: "ag/gemini-3.8-flash", name: "⚡ Gemini 3.8 Flash", tag: "Đa năng · Ảnh", desc: "Phản hồi siêu nhanh, hỗ trợ phân tích ảnh/tệp & chọn đủ 4 mức tư duy" },
  { id: "ag/claude-sonnet-4-6", name: "🧠 Claude Sonnet 4.6", tag: "Viết & Code", desc: "Diễn đạt tiếng Việt mượt mà, lập trình chuẩn xác & đọc tài liệu" },
  { id: "ag/claude-opus-4-6-thinking", name: "👑 Claude Opus 4.6", tag: "Tư duy đỉnh", desc: "Chuyên xử lý bài toán khó, kiến trúc hệ thống & lập luận chuyên sâu" },
  { id: "ds/deepseek-v4-pro", name: "🚀 DeepSeek V4 Pro", tag: "Suy luận mạnh", desc: "Tối ưu cho toán học, logic phức tạp & hỗ trợ mức tư duy thấp/vừa/sâu" },
  { id: "ds/deepseek-v4.1-flash", name: "👁️ DeepSeek V4.1 Flash", tag: "Nhanh · Vision", desc: "Tốc độ cao, đọc ảnh tốt, phản hồi súc tích cho tác vụ hằng ngày" },
  { id: "ag/gpt-oss-120b-medium", name: "🤖 GPT-OSS 120B", tag: "Cân bằng", desc: "Mô hình mở 120B lý luận vững vàng cho hỏi đáp kiến thức tổng hợp" },
  { id: "oc/muse-spark-1.3-contributor-free", name: "✨ Muse Spark 1.3", tag: "Đa phương thức", desc: "Hỗ trợ đa phương thức sáng tạo, gợi ý ý tưởng và tóm tắt nhanh" }
];

const MOOD_PREVIEWS = [
  { mood: "happy", emote: "✨", label: "😊 Vui vẻ", text: "Vui quá đi thôi! ✨" },
  { mood: "wink", emote: "😉", label: "😉 Nháy mắt", text: "Chúc một ngày tốt lành 😉" },
  { mood: "love", emote: "💖", label: "💖 Siêu yêu", text: "Yêu bạn nhất luôn!! 💖" },
  { mood: "starry", emote: "✦", label: "✦ Lấp lánh", text: "Tuyệt vời xuất sắc! ✦" },
  { mood: "dancing", emote: "🎵", label: "🎵 Quẩy nhạc", text: "Nhạc hay quá đi 🎵" },
  { mood: "focused", emote: "🔥", label: "🔥 Quyết tâm", text: "Tập trung cao độ! 🔥" },
  { mood: "relaxed", emote: "☕", label: "☕ Thư giãn", text: "Nghỉ ngơi chút nhé ☕" },
  { mood: "thirsty", emote: "💧", label: "💧 Khát nước", text: "Đến giờ uống nước rồi! 💧" },
  { mood: "surprised", emote: "!", label: "😲 Ngạc nhiên", text: "Ồ có gì đó mới kìa! 😲" },
  { mood: "dizzy", emote: "💫", label: "💫 Chóng mặt", text: "Á chóng mặt quá @_@" },
  { mood: "charging", emote: "⚡", label: "⚡ Nạp điện", text: "Đang nạp năng lượng ⚡" },
  { mood: "sleepy", emote: "💤", label: "😴 Ngáp ngủ", text: "Khuya rồi, buồn ngủ quá..." },
  { mood: "pat", emote: "💕", label: "😌 Xoa đầu", text: "Ưm~ xoa đầu thích quá 😌" },
  { mood: "angry", emote: "💢", label: "😤 Giận dỗi", text: "Đừng chọc nữa mà!! 💢" },
  { mood: "cry", emote: "😭", label: "😭 Khóc nhè", text: "Hức... pin yếu rồi 😭" },
  { mood: "eating", emote: "🍪", label: "🍪 Nhóp nhép", text: "Ngon quá đi mất! 🍪" }
];

// ------------------------------------------------------------
// Bộ nhớ đệm màn hình & Khối xem trước dùng chung
// ------------------------------------------------------------
let cachedMonitorsRes = null;
let cachedMonitorsAt = 0;
async function getMonitorsCached(force = false) {
  if (!force && cachedMonitorsRes && Date.now() - cachedMonitorsAt < 2500) {
    return cachedMonitorsRes;
  }
  try {
    const res = await invoke("list_monitors");
    cachedMonitorsRes = res;
    cachedMonitorsAt = Date.now();
    return res;
  } catch (_) {
    return cachedMonitorsRes;
  }
}

function buildNotchStyleCardsRow() {
  const row = el("div", "row col");
  row.appendChild(rowText(
    "Kiểu dáng Dynamic Island",
    "Gắn liền mép trên màn hình với tai lõm cổ điển hoặc viên thuốc nổi hiện đại"
  ));
  const grid = el("div", "notch-style-cards-grid");
  [
    { id: "classic", cls: "classic", title: "📌 Dạng cũ (Dính mép trên)", desc: "Liền mạch với cạnh trên màn hình" },
    { id: "floating", cls: "floating", title: "💊 Dạng mới (Viên thuốc nổi)", desc: "Bo tròn 4 góc tách khỏi mép trên" }
  ].forEach((st) => {
    const isAct = (S.notchStyle || "classic") === st.id;
    const item = el("button", "notch-style-card" + (isAct ? " active" : ""));
    item.innerHTML = `
      <div class="ns-preview-screen">
        <div class="ns-preview-notch ${st.cls}">
          <span class="ns-eye"></span>
          <span class="ns-eye"></span>
        </div>
      </div>
      <div class="ns-title">${st.title} ${isAct ? "✔" : ""}</div>
      <div class="ns-desc">${st.desc}</div>
    `;
    item.addEventListener("click", () => {
      set("notchStyle", st.id);
      toast(`Đã chuyển kiểu tai thỏ: ${st.title}`);
      renderPage();
    });
    grid.appendChild(item);
  });
  row.appendChild(grid);
  return row;
}

function buildPetLivePreviewRow() {
  const row = el("div", "row col");
  row.appendChild(rowText(
    "Xem trước trực tiếp & Chế độ khi thu gọn",
    "Rê chuột qua khung bên dưới để xem đôi mắt Pet liếc theo; chuyển đổi nhanh giữa Đồng hồ + Pet, Chỉ Pet hoặc Chỉ Đồng hồ"
  ));

  const isMinimalNow = (S.petType || "aura") === "aura" || !!S.petMinimalFace;
  const curGlowObj = PET_GLOW_PRESETS.find((g) => g.id === (S.petGlowColor || (S.petType === "aura" ? "island" : "auto"))) || PET_GLOW_PRESETS[1];
  const curEyeColObj = PET_EYE_COLOR_PRESETS.find((c) => c.id === (S.petEyeColor || "auto")) || PET_EYE_COLOR_PRESETS[0];
  const eyeScale = S.petEyeSize === "small" ? 0.84 : (S.petEyeSize === "large" ? 1.18 : 1);
  const eyeW = (9.5 * eyeScale).toFixed(1);
  const eyeH = (14 * eyeScale).toFixed(1);
  const eyeGap = S.petEyeSize === "small" ? 13 : (S.petEyeSize === "large" ? 16.5 : 15);
  const isFloating = S.notchStyle === "floating";

  let innerNotchHtml = "";
  if (S.restStyle === "capsule") {
    innerNotchHtml = `
      <div class="pet-live-both-layout" id="petLiveEyesBox" style="gap:10px;font-size:11px;font-weight:700">
        <span>🕒 19:45</span>
        <span style="opacity:.25">|</span>
        <span>⛅ 28°C</span>
      </div>
    `;
  } else if (S.restStyle === "idle") {
    innerNotchHtml = `
      <div class="pet-live-both-layout" id="petLiveEyesBox">
        <span class="pl-ring"></span>
        <span class="pl-time">19:45</span>
        <span class="pl-bars"><i></i><i></i><i></i></span>
      </div>
    `;
  } else if (S.restStyle === "both") {
    innerNotchHtml = `
      <div class="pet-live-ambient" style="background:${curGlowObj.grad};opacity:${S.petGlowColor === "off" ? 0 : 0.65}"></div>
      <div class="pet-live-both-layout" id="petLiveEyesBox">
        <span class="pl-ring"></span>
        <span class="pl-time">19:45</span>
        <span class="pl-mini-pet">
          ${!isMinimalNow ? '<i class="pl-mini-crown"></i>' : ""}
          <b class="pl-mini-eye" style="background:${curEyeColObj.bg}"></b>
          <b class="pl-mini-eye" style="background:${curEyeColObj.bg}"></b>
          ${!isMinimalNow ? '<span class="pl-mini-blush l"></span><span class="pl-mini-mouth"></span><span class="pl-mini-blush r"></span>' : ""}
        </span>
        <span class="pl-bars"><i></i><i></i><i></i></span>
      </div>
    `;
  } else if (!isMinimalNow) {
    innerNotchHtml = `
      <div class="pet-live-ambient" style="background:${curGlowObj.grad};opacity:${S.petGlowColor === "off" ? 0 : 0.9}"></div>
      <i class="pet-live-crown"></i>
      <div class="pet-live-eyes" id="petLiveEyesBox" style="gap:${eyeGap}px">
        <span class="pet-live-eye" style="width:${eyeW}px;height:${eyeH}px;background:${curEyeColObj.bg};box-shadow:${curEyeColObj.shadow}"></span>
        <span class="pet-live-eye" style="width:${eyeW}px;height:${eyeH}px;background:${curEyeColObj.bg};box-shadow:${curEyeColObj.shadow}"></span>
      </div>
      <span class="pet-live-blush l"></span>
      <span class="pet-live-mouth"></span>
      <span class="pet-live-blush r"></span>
    `;
  } else {
    innerNotchHtml = `
      <div class="pet-live-ambient" style="background:${curGlowObj.grad};opacity:${S.petGlowColor === "off" ? 0 : 1}"></div>
      <div class="pet-live-eyes" id="petLiveEyesBox" style="gap:${eyeGap}px">
        <span class="pet-live-eye" style="width:${eyeW}px;height:${eyeH}px;background:${curEyeColObj.bg};box-shadow:${curEyeColObj.shadow}"></span>
        <span class="pet-live-eye" style="width:${eyeW}px;height:${eyeH}px;background:${curEyeColObj.bg};box-shadow:${curEyeColObj.shadow}"></span>
      </div>
    `;
  }

  const stage = el("div", "pet-live-preview-stage");
  stage.innerHTML = `
    <div class="pet-live-bezel"><span class="pet-live-cam"></span></div>
    <div class="pet-live-notch ${isFloating ? "floating" : "classic"}" id="petLiveNotchBox">
      ${innerNotchHtml}
    </div>
    <div class="pet-live-actions">
      <div class="pet-live-status">
        Loài: <b>${(PET_GALLERY.find((p) => p.id === (S.petType || "aura")) || PET_GALLERY[0]).name}</b>
      </div>
      <div class="pet-live-btn-group">
        <button class="pet-preset-classic-btn ${S.restStyle === "both" ? "active-mode" : ""}" id="btnRestBoth">🕒 Đồng hồ + Pet</button>
        <button class="pet-preset-apply-btn ${S.restStyle === "pet" ? "active-mode" : ""}" id="btnRestPet">✨ Chỉ Pet</button>
        <button class="pet-preset-classic-btn ${S.restStyle === "idle" ? "active-mode" : ""}" id="btnRestIdle">⏱️ Chỉ Đồng hồ</button>
        <button class="pet-preset-classic-btn ${S.restStyle === "capsule" ? "active-mode" : ""}" id="btnRestCapsule">💊 Viên thuốc</button>
      </div>
    </div>
  `;

  const eyesBox = stage.querySelector("#petLiveEyesBox");
  stage.addEventListener("pointermove", (e) => {
    if (!eyesBox) return;
    const r = stage.getBoundingClientRect();
    const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const dx = Math.max(-5, Math.min(5, nx * 4.5)).toFixed(1);
    const dy = Math.max(-2.5, Math.min(2.5, ny * 2.2)).toFixed(1);
    eyesBox.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  stage.addEventListener("pointerleave", () => {
    if (eyesBox) eyesBox.style.transform = "translate(0px, 0px)";
  });

  stage.querySelector("#btnRestBoth")?.addEventListener("click", () => {
    S.restStyle = "both";
    if (S.petType === "aura") {
      S.petType = S.lastClassicPet && S.lastClassicPet !== "aura" ? S.lastClassicPet : "island";
      S.petMinimalFace = false;
      S.petGlowColor = "auto";
    }
    S.mascot = true;
    commit("restStyle");
    toast("Đã bật chế độ Đồng hồ + Pet nhỏ");
    renderPage();
  });
  stage.querySelector("#btnRestPet")?.addEventListener("click", () => {
    S.restStyle = "pet";
    S.mascot = true;
    commit("restStyle");
    toast("Đã bật chế độ Chỉ Pet toàn khung");
    renderPage();
  });
  stage.querySelector("#btnRestIdle")?.addEventListener("click", () => {
    S.restStyle = "idle";
    commit("restStyle");
    toast("Đã chuyển sang Chỉ Đồng hồ khi thu gọn");
    renderPage();
  });
  stage.querySelector("#btnRestCapsule")?.addEventListener("click", () => {
    S.restStyle = "capsule";
    commit("restStyle");
    toast("Đã bật chế độ Viên thuốc Mô-đun (Capsule Idle)");
    renderPage();
  });

  row.appendChild(stage);
  return row;
}

function buildPetGalleryRow() {
  const row = el("div", "row col");
  row.appendChild(rowText(
    `Bộ sưu tập Linh vật (${PET_GALLERY.length} loài)`,
    "Chọn 'Mắt Tinh Linh Island' cho phong cách tối giản hoặc 12 thú cưng đầy đủ phụ kiện"
  ));
  const grid = el("div", "pet-gallery-grid");
  PET_GALLERY.forEach((pet) => {
    const isAct = (S.petType || "aura") === pet.id;
    const item = el("button", "pet-card" + (isAct ? " active" : ""));
    item.innerHTML = `
      <div class="pet-card-img-wrap">
        <img src="${pet.avatar}" alt="${pet.name}" class="pet-card-img" />
        ${isAct ? '<span class="pet-card-badge">Đang chọn</span>' : ""}
      </div>
      <div class="pet-card-info">
        <div class="pet-card-name">${pet.name}</div>
        <div class="pet-card-desc">${pet.desc}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      S.petType = pet.id;
      if (pet.id === "aura") {
        S.restStyle = "pet";
        S.petGlowColor = "island";
      } else {
        S.lastClassicPet = pet.id;
        S.petMinimalFace = false;
        if (S.petGlowColor === "island") S.petGlowColor = "auto";
      }
      commit("petType");
      toast(`Đã chọn thú cưng: ${pet.name}`);
      renderPage();
    });
    grid.appendChild(item);
  });
  row.appendChild(grid);
  return row;
}

function buildPetGlowSelectorRow() {
  const row = el("div", "row col");
  row.appendChild(rowText("Màu hào quang đáy Tai thỏ Pet", "Ánh sáng cực quang ở cạnh dưới đôi mắt Pet khi thu gọn"));
  const seg = el("div", "seg full");
  seg.style.flexWrap = "wrap";
  PET_GLOW_PRESETS.forEach((g) => {
    const b = el("button", (S.petGlowColor || "island") === g.id ? "on" : "", g.label);
    b.addEventListener("click", () => {
      set("petGlowColor", g.id);
      toast(`Đã chọn hào quang: ${g.label}`);
      renderPage();
    });
    seg.appendChild(b);
  });
  row.appendChild(seg);
  return row;
}

function buildPetEyeColorSelectorRow() {
  const row = el("div", "row col");
  row.appendChild(rowText("Màu sắc đôi mắt Pet", "Đổi màu phát sáng của đôi mắt hoặc giữ nguyên theo loài"));
  const seg = el("div", "seg full");
  seg.style.flexWrap = "wrap";
  PET_EYE_COLOR_PRESETS.forEach((c) => {
    const b = el("button", (S.petEyeColor || "auto") === c.id ? "on" : "", c.label);
    b.addEventListener("click", () => {
      set("petEyeColor", c.id);
      toast(`Đã chọn màu mắt: ${c.label}`);
      renderPage();
    });
    seg.appendChild(b);
  });
  row.appendChild(seg);
  return row;
}

function buildMoodTesterRow() {
  const row = el("div", "row col");
  row.appendChild(rowText(
    "Thử biểu cảm thú cưng (16 trạng thái)",
    "Bấm để xem biểu diễn trực tiếp trên tai thỏ"
  ));
  const grid = el("div", "mood-test-grid");
  MOOD_PREVIEWS.forEach((m) => {
    const btn = el("button", "mood-test-btn", m.label);
    btn.addEventListener("click", () => {
      emit("island-action", { type: "test_mood", mood: m.mood, emote: m.emote, text: m.text }).catch(() => {});
      toast(`Đang thử: ${m.label}`);
    });
    grid.appendChild(btn);
  });
  row.appendChild(grid);
  return row;
}

function buildThemeGalleryRow() {
  const row = el("div", "row col");
  row.appendChild(rowText(
    `Chủ đề Bầu trời Thời tiết (${WEATHER_THEME_GALLERY.length} chủ đề)`,
    "Chọn bảng màu & hiệu ứng hạt động cho trang Thời tiết (chạm để áp dụng ngay)"
  ));
  const grid = el("div", "theme-gallery-grid");
  WEATHER_THEME_GALLERY.forEach((th) => {
    const isAct = (S.weatherTheme || "auto") === th.id;
    const item = el("button", "theme-card" + (isAct ? " active" : ""));
    item.innerHTML = `
      <div class="theme-swatch-preview" style="--sw-glow:${th.glow}">
        <div class="theme-swatch-glow"></div>
        <span style="position:relative;z-index:2;font-size:16px">${th.ico}</span>
        ${isAct ? '<span class="pet-card-badge">Đang chọn</span>' : ""}
      </div>
      <div class="pet-card-info">
        <div class="pet-card-name">${th.name}</div>
        <div class="pet-card-desc">${th.desc}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      set("weatherTheme", th.id);
      toast(`Đã chọn chủ đề Thời tiết: ${th.name}`);
      renderPage();
    });
    grid.appendChild(item);
  });
  row.appendChild(grid);
  return row;
}

function buildGpsStatusBox() {
  const box = el("div", "gps-status-box");
  const isAuto = (S.weatherCity || "Auto") === "Auto";
  const hasLoc = !!(weatherInfo.fullAddress || weatherInfo.city);
  const coordTxt = Number.isFinite(weatherInfo.lat) && Number.isFinite(weatherInfo.lon)
    ? `${Number(weatherInfo.lat).toFixed(4)}, ${Number(weatherInfo.lon).toFixed(4)}`
    : "";

  const addrLabel = isAuto
    ? (hasLoc ? `📍 ${weatherInfo.fullAddress || weatherInfo.city}` : "📍 Đang bật Tự động lấy địa chỉ GPS của máy")
    : `📌 Khu vực cố định: ${S.weatherCity}`;
  const metaParts = [];
  if (isAuto && weatherInfo.locSource) metaParts.push(weatherInfo.locSource);
  if (coordTxt) metaParts.push(`Tọa độ ${coordTxt}`);
  if (Number.isFinite(weatherInfo.tempC)) {
    const tVal = S.weatherUnit === "F" ? Math.round((weatherInfo.tempC * 9) / 5 + 32) : Math.round(weatherInfo.tempC);
    metaParts.push(`Hiện tại ${tVal}°${S.weatherUnit === "F" ? "F" : "C"}`);
  }

  const top = el("div", "gps-status-top");
  const textCol = el("div", "");
  textCol.appendChild(el("div", "gps-addr-main", addrLabel));
  textCol.appendChild(el("div", "gps-addr-meta", metaParts.join(" · ") || "Bấm nút bên dưới để lấy tọa độ GPS & địa chỉ chi tiết"));
  top.appendChild(textCol);

  const actRow = el("div", "gps-actions-row");
  const btnGps = el("button", "btn primary", "📍 Lấy vị trí GPS ngay");
  btnGps.addEventListener("click", async () => {
    btnGps.disabled = true;
    btnGps.textContent = "⏳ Đang định vị GPS...";
    S.weatherCity = "Auto";
    commit("weatherCity");

    let gps = null;
    try {
      if (navigator.geolocation) {
        gps = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 4000);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timer);
              resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
            },
            () => {
              clearTimeout(timer);
              resolve(null);
            },
            { enableHighAccuracy: true, timeout: 3800, maximumAge: 60000 }
          );
        });
      }
      const res = await invoke("detect_device_location", {
        latHint: gps ? gps.lat : null,
        lonHint: gps ? gps.lon : null
      });
      if (res) {
        weatherInfo.city = res.city_label;
        weatherInfo.fullAddress = res.full_address;
        weatherInfo.locSource = res.source;
        weatherInfo.lat = res.lat;
        weatherInfo.lon = res.lon;
        toast(`Đã định vị: ${res.full_address || res.city_label}`);
      }
    } catch (_) {
      toast("Không thể đọc GPS, vui lòng kiểm tra kết nối mạng");
    } finally {
      emit("island-action", { type: "weather_gps_refresh" }).catch(() => {});
      btnGps.disabled = false;
      renderPage();
    }
  });

  const btnRefresh = el("button", "btn", "🔄 Cập nhật thời tiết");
  btnRefresh.addEventListener("click", () => {
    emit("island-action", { type: "weather_refresh" }).catch(() => {});
    toast("Đang làm mới dữ liệu thời tiết...");
  });

  actRow.append(btnGps, btnRefresh);
  box.append(top, actRow);
  return box;
}

// ------------------------------------------------------------
// 8 TRANG CÀI ĐẶT CHÍNH (GỌN RÀNG · KHÔNG LẶP LẠI)
// ------------------------------------------------------------
const RENDER = {
  general(p) {
    let resetArmed = false;
    let resetTimer = null;
    const resetBtn = el("button", "btn danger", "Khôi phục gốc");
    resetBtn.addEventListener("click", async () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.textContent = "Xác nhận đặt lại?";
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          resetArmed = false;
          resetBtn.textContent = "Khôi phục gốc";
        }, 3200);
        return;
      }
      resetArmed = false;
      clearTimeout(resetTimer);
      const keepAuto = !!S.autostart;
      S = { ...DEFAULTS, autostart: keepAuto };
      await flushPendingSave();
      await writeSettingsToDisk();
      emit("island-settings", { settings: S, changed: "reset" }).catch(() => {});
      toast("Đã khôi phục toàn bộ cài đặt về mặc định!");
      renderPage();
    });

    const ramRow = el("div", "row");
    ramRow.appendChild(rowText("Bảo trì Bộ nhớ & Khôi phục", "Giải phóng RAM WebView2 ngay hoặc đưa cấu hình về mặc định tối ưu"));
    const memBtns = el("div", "seg");
    const btnTrim = el("button", "on", "🧹 Dọn RAM");
    btnTrim.addEventListener("click", async () => {
      await invoke("trim_system_memory").catch(() => {});
      toast("Đã giải phóng bộ nhớ RAM dư thừa!");
    });
    memBtns.append(btnTrim, resetBtn);
    ramRow.appendChild(memBtns);

    // Lưới 2 cột quản lý bật/ẩn 10 trang trên Dynamic Island (1 nơi duy nhất)
    const pagesCard = el("div", "card");
    const pagesGrid = el("div", "pages-toggle-grid");
    [
      ["musicPage", "🎵 Âm nhạc & Lời", "Trình phát & Karaoke"],
      ["todayPage", "📅 Hôm nay", "Lịch tuần & Thông báo"],
      ["weatherPage", "⛅ Thời tiết", "Dự báo & Định vị GPS"],
      ["widgetsPage", "🧩 Tiện ích Đôi", "10 loại Widget song song"],
      ["pomoPage", "🍅 Pomodoro", "Tập trung sâu 4 phiên"],
      ["waterPage", "💧 Uống nước", "Mục tiêu & Nhắc định kỳ"],
      ["shelfPage", "📁 Khay & Clipboard", "Kéo thả tệp & Sao chép"],
      ["todoPage", "✅ Việc cần làm", "Danh sách & Hẹn giờ"],
      ["prayerPage", "🕌 Giờ cầu nguyện", "5 mốc giờ trong ngày"],
      ["aiPage", "✨ Trợ lý AI", "Hỏi đáp & Phân tích tệp"]
    ].forEach(([k, name, sub]) => pagesGrid.appendChild(compactToggleChip(k, name, sub)));
    pagesCard.appendChild(pagesGrid);

    const testRow = el("div", "row");
    testRow.appendChild(rowText("Kiểm tra chuông báo thức", "Nghe thử âm báo hiện tại hoặc dừng phát ngay"));
    const actWrap = el("div", "seg");
    const btnPlay = el("button", "on", "🔔 Nghe thử");
    const btnStop = el("button", "", "⏹ Dừng");
    btnPlay.addEventListener("click", () => {
      const dur = Number(S.alarmDuration) || 10;
      const style = S.alarmStyle || "alarm";
      emit("island-action", { type: "test_alarm", duration: dur, style }).catch(() => {});
      invoke("play_native_alert", { kind: "pomo", durationSecs: dur, style }).catch(() => {});
      toast(`Đang phát thử chuông (${dur}s)...`);
    });
    btnStop.addEventListener("click", () => {
      emit("island-action", { type: "stop_alarm" }).catch(() => {});
      invoke("stop_native_alert").catch(() => {});
      toast("Đã dừng chuông báo thức");
    });
    actWrap.append(btnPlay, btnStop);
    testRow.appendChild(actWrap);

    p.append(
      sectionLabel("Hệ thống & Hiệu năng"),
      card(
        toggleRow("autostart", "Khởi động cùng Windows", "Tự động mở Island khi đăng nhập Windows", {
          before: async (v) => {
            try {
              await invoke("set_autostart", { enable: v });
              toast(v ? "Đã bật khởi động cùng Windows" : "Đã tắt khởi động cùng Windows");
              return true;
            } catch (_) {
              toast("Không thể cập nhật thiết lập khởi động");
              return false;
            }
          }
        }),
        toggleRow("enableIsland", "Hiển thị Dynamic Island", "Tắt nếu chỉ muốn dùng Rail / Deck / Desktop Widgets"),
        toggleRow("hideFullscreen", "Ẩn khi toàn màn hình", "Tự ẩn tai thỏ khi xem phim, chơi game hoặc trình chiếu", {
          after: (v) => invoke("set_hide_fullscreen", { enable: v }).catch(() => {})
        }),
        toggleRow("globalHotkeys", "Phím tắt toàn cục", "Alt+Space mở AI · Alt+S chụp gửi AI · Alt+C hút màu · Ctrl+Alt+N thêm việc", {
          after: (v) => invoke("set_global_hotkeys", { enable: v }).catch(() => {})
        }),
        toggleRow("liveActivity", "Live Activity khi thu gọn", "Tự mở rộng nhẹ cạnh Pet để hiện đếm ngược Pomodoro hoặc việc sắp tới (≤10 phút)"),
        segBlockRow("perfMode", "Chế độ vận hành hệ thống", "Điều chỉnh tần suất đồng bộ trình phát nhạc & phản hồi giao diện", [
          ["ultra", "⚡ Siêu mượt (120Hz)"],
          ["balanced", "⚖️ Cân bằng"],
          ["eco", "🔋 Tiết kiệm pin"]
        ]),
        toggleRow("reduceEffects", "Giảm hiệu ứng hạt & mờ nền", "Tắt hạt bay và làm mờ GPU để tiết kiệm tài nguyên tối đa"),
        toggleRow("autoTrimMemory", "Tự động dọn RAM khi rảnh", "Thu hồi bộ nhớ WebView2 khi tai thỏ thu gọn", {
          after: (v) => invoke("set_auto_trim_memory", { enable: v }).catch(() => {})
        }),
        ramRow
      ),
      sectionLabel("Bật / Ẩn các trang trên Dynamic Island"),
      pagesCard,
      sectionLabel("Âm thanh & Chuông hẹn giờ"),
      card(
        toggleRow("sounds", "Âm thanh phản hồi & Nhắc nhở", "Phát âm báo khi hết Pomodoro, đến lịch việc hoặc uống nước"),
        segRow("alarmStyle", "Kiểu chuông báo", "Sắc thái âm báo khi đến hạn", [
          ["chime", "Nhẹ"],
          ["alarm", "Báo thức"],
          ["urgent", "Khẩn cấp"]
        ]),
        segBlockRow("alarmDuration", "Thời lượng chuông reo", "Tự dừng sau khoảng thời gian này (chạm tai thỏ để tắt ngay)", [
          [3, "3s"], [5, "5s"], [10, "10s"], [15, "15s"], [30, "30s"], [60, "60s"]
        ]),
        testRow
      )
    );
  },

  async appearance(p) {
    const themeIoRow = el("div", "row");
    themeIoRow.appendChild(rowText("Chia sẻ & Nhập chủ đề", "Xuất giao diện hiện tại thành .islandtheme hoặc nhập tệp .islandtheme (đã kiểm duyệt an toàn)"));
    const themeIoBtns = el("div", "seg");
    const btnExportTheme = el("button", "", "📤 Xuất Theme");
    const btnImportTheme = el("button", "on", "📥 Nhập Theme");
    btnExportTheme.addEventListener("click", () => {
      const txt = exportSharedThemeText(S);
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `island-${S.themePreset || "custom"}.islandtheme`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast("Đã xuất tệp cấu hình chủ đề .islandtheme!");
    });
    btnImportTheme.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".islandtheme,.txt";
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        if (f.size > SHARED_THEME_MAX_BYTES) {
          toast("Tệp chủ đề quá lớn (tối đa 16 KB)");
          return;
        }
        const raw = await f.text();
        const res = parseSharedThemeText(raw);
        if (!res.ok) {
          toast(`❌ ${res.reason}`);
          return;
        }
        Object.assign(S, res.patch);
        commit("themePreset");
        renderPage();
        const ign = res.ignored.length ? ` (bỏ qua khóa lạ: ${res.ignored.slice(0, 4).join(", ")})` : "";
        toast(`✅ Đã áp dụng ${res.fields} tùy chọn giao diện${ign}`);
      };
      inp.click();
    });
    themeIoBtns.append(btnExportTheme, btnImportTheme);
    themeIoRow.appendChild(themeIoBtns);

    p.append(
      sectionLabel("Giao diện Tổng thể & Điểm nhấn"),
      card(
        segBlockRow("colorMode", "Chế độ màu toàn ứng dụng", "Tự động theo Windows hoặc ép giao diện Sáng / Tối", [
          ["dark", "🌙 Tối"], ["light", "☀️ Sáng"], ["auto", "🌓 Hệ thống"]
        ]),
        accentSwatchesRow()
      ),
      sectionLabel("Kiểu dáng & Chủ đề Dynamic Island"),
      card(
        buildNotchStyleCardsRow(),
        selectRow("themePreset", "Bảng màu chủ đề Dynamic Island", "Đổi sắc thái điểm nhấn, thanh tiến trình và viền tai thỏ", ISLAND_THEME_PRESETS),
        segBlockRow("uiFont", "Phông chữ tai thỏ", "Đổi kiểu chữ hiển thị trên toàn bộ Dynamic Island", [
          ["default", "Hệ thống"], ["inter", "Inter"], ["bahnschrift", "Bahnschrift"], ["mono", "Mono"]
        ]),
        toggleRow("glass", "Hiệu ứng Kính mờ (Frosted Glass)", "Làm mờ hậu cảnh phía sau tai thỏ theo màu chủ đề"),
        sliderRow("glassTint", "Độ đậm nền Kính mờ", "Giữ chữ sắc nét trên cả nền sáng và nền tối", 35, 98, 1, "%"),
        sliderRow("floatingTopGap", "Khoảng cách mép trên (Dạng nổi)", "Độ hở từ mép trên màn hình khi dùng kiểu Viên thuốc nổi", 0, 24, 1, "px"),
        themeIoRow
      ),
      sectionLabel("Viên thuốc Mô-đun (Capsule Idle)"),
      card(
        segBlockRow("restStyle", "Chế độ hiển thị khi thu gọn", "Chọn kiểu hiển thị mặc định khi Dynamic Island đang thu nhỏ", [
          ["pet", "✨ Chỉ Pet"], ["both", "🕒 Đồng hồ + Pet"], ["idle", "⏱️ Chỉ Đồng hồ"], ["capsule", "💊 Viên thuốc"]
        ]),
        selectRow("capsuleLeft", "Mô-đun bên trái Viên thuốc", "Thông tin hiển thị bên trái khi dùng Capsule Idle", [
          ["clock", "🕒 Đồng hồ"], ["date", "📅 Ngày tháng"], ["media", "🎵 Nhạc đang phát"], ["sys", "⚡ CPU %"], ["off", "🚫 Ẩn"]
        ]),
        selectRow("capsuleRight", "Mô-đun bên phải Viên thuốc", "Thông tin hiển thị bên phải (tự ưu tiên Lịch họp khi sắp tới giờ)", [
          ["weather", "⛅ Thời tiết"], ["battery", "🔋 Pin"], ["meeting", "📅 Lịch họp sắp tới"], ["pomo", "🍅 Pomodoro"], ["sys", "⚡ CPU %"], ["off", "🚫 Ẩn"]
        ]),
        toggleRow("capsuleEdgeGlow", "Viền phát sáng theo màu nhấn (Edge Glow)", "Tỏa hào quang nhẹ quanh Viên thuốc khi thu gọn")
      ),
      sectionLabel("Kích thước & Thao tác"),
      card(
        segBlockRow("scale", "Tỷ lệ kích thước tai thỏ", "Áp dụng ngay theo độ phân giải màn hình", [
          ["auto", "Tự động"], [1, "100%"], [1.15, "115%"], [1.3, "130%"], [1.5, "150%"]
        ]),
        segRow("openMode", "Cách mở tai thỏ", "Rê chuột qua để mở nhanh hoặc bấm chuột tránh chạm nhầm", [
          ["hover", "Rê chuột"],
          ["click", "Bấm chuột"]
        ]),
        segBlockRow("hoverOpenSensitivity", "Độ nhạy mở khi rê chuột", "Trì hoãn nhẹ để không tự mở khi lướt chuột ngang qua", [
          ["quick", "Nhanh (0ms)"], ["normal", "Vừa (140ms)"], ["relaxed", "Thư thái (420ms)"]
        ]),
        segBlockRow("hoverCloseDelay", "Độ trễ tự đóng khi rời chuột", "Thời gian chờ trước khi tai thỏ thu gọn lại", [
          [150, "150ms"], [240, "240ms"], [400, "400ms"], [600, "600ms"]
        ]),
        segBlockRow("statusRing", "Vòng tròn trạng thái", "Hiển thị bên trái đồng hồ khi thu gọn", [
          ["auto", "🔋 Pin"], ["cpu", "⚡ CPU"], ["ram", "🧠 RAM"], ["water", "💧 Nước"], ["todo", "✅ Việc"], ["off", "🚫 Ẩn"]
        ]),
        segRow("fastAnim", "Tốc độ chuyển cảnh", "Độ nhanh hiệu ứng co giãn và chuyển trang", [
          [false, "Chuẩn mượt"],
          [true, "Tốc độ cao"]
        ]),
        toggleRow("minimal", "Thu gọn tối giản khi không phát nhạc", "Thu nhỏ viên thuốc để tiết kiệm không gian màn hình"),
        toggleRow("pageIcons", "Hiện tên trang khi rê lên chấm chuyển trang", "Hiện chú thích nhanh trên thanh chấm ở đáy")
      )
    );

    // Phần Màn hình hiển thị gọn gàng (1 thanh chọn + 1 sơ đồ trực quan)
    p.append(sectionLabel("Màn hình hiển thị"));
    const res = await getMonitorsCached(true);
    const mons = Array.isArray(res) ? res : (res?.monitors || []);
    const isAll = res?.all_monitors ?? (S.monitorMode === "all");

    const applyMonitorChange = async (allMonitors, target) => {
      if (allMonitors) {
        S.monitorMode = "all";
      } else if (target) {
        S.monitorMode = "single";
        S.monitor = { x: target.x, y: target.y };
      }
      clearTimeout(saveTimer);
      await writeSettingsToDisk();
      emit("island-settings", { settings: S, changed: "monitorMode" }).catch(() => {});
      const ok = await invoke("set_notch_monitors", {
        allMonitors: !!allMonitors,
        targetX: target ? target.x : null,
        targetY: target ? target.y : null
      }).catch(() => false);
      cachedMonitorsAt = 0;
      return ok;
    };

    const segOptions = [];
    mons.forEach((m, i) => segOptions.push([String(i), `Màn ${i + 1}`]));
    if (mons.length >= 2) segOptions.push(["all", `Cả ${mons.length} màn`]);
    const curSegVal = isAll ? "all" : String(Math.max(0, mons.findIndex((m) => m.current)));

    const modeRow = el("div", "row");
    modeRow.appendChild(rowText("Vị trí màn hình", "Hiển thị trên một màn hình cố định hoặc đồng bộ tất cả màn hình"));
    const seg = el("div", "seg");
    segOptions.forEach(([val, label]) => {
      const b = el("button", curSegVal === val ? "on" : "", label);
      b.addEventListener("click", async () => {
        if (val === "all") {
          if (await applyMonitorChange(true, null)) {
            toast(`Đã bật trên cả ${mons.length} màn hình!`);
            renderPage();
          }
        } else {
          const target = mons[parseInt(val, 10)];
          if (target && (await applyMonitorChange(false, target))) {
            toast(`Đã chuyển sang Màn hình ${parseInt(val, 10) + 1}`);
            renderPage();
          }
        }
      });
      seg.appendChild(b);
    });
    modeRow.appendChild(seg);

    const mapRow = el("div", "row col");
    mapRow.appendChild(rowText("Sơ đồ màn hình trực quan", "Bấm trực tiếp vào màn hình bên dưới để chuyển vị trí tai thỏ"));
    const wrap = el("div", "mon-wrap");
    mapRow.appendChild(wrap);
    p.appendChild(card(modeRow, mapRow));

    if (!mons.length) {
      wrap.style.height = "56px";
      wrap.appendChild(el("div", "row-d", "Không đọc được danh sách màn hình."));
      return;
    }

    const minX = Math.min(...mons.map((m) => m.x));
    const minY = Math.min(...mons.map((m) => m.y));
    const maxX = Math.max(...mons.map((m) => m.x + m.width));
    const maxY = Math.max(...mons.map((m) => m.y + m.height));
    const W = wrap.clientWidth || 420;
    const H = 165;
    const pad = 10;
    const k = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
    const offX = (W - (maxX - minX) * k) / 2;
    const offY = (H - (maxY - minY) * k) / 2;

    mons.forEach((m, i) => {
      const isCur = isAll || m.current;
      const d = el("button", "mon" + (isCur ? " cur" : ""));
      d.style.left = offX + (m.x - minX) * k + 3 + "px";
      d.style.top = offY + (m.y - minY) * k + 3 + "px";
      d.style.width = m.width * k - 6 + "px";
      d.style.height = m.height * k - 6 + "px";
      d.innerHTML = `<b>${i + 1}</b><span>${m.width}×${m.height}${m.primary ? " · Chính" : ""}</span><span class="mon-status">${isCur ? (isAll ? "✔ Đồng thời" : "✔ Đang hiện") : "Bấm chọn"}</span>`;
      d.addEventListener("click", async () => {
        if (await applyMonitorChange(false, m)) {
          toast(`Đã chuyển sang Màn hình ${i + 1}`);
          renderPage();
        }
      });
      wrap.appendChild(d);
    });
  },

  deck(p) {
    const note = el("div", "caution-note", "⚠️ Khi bật <b>Ẩn Taskbar Windows</b>, thanh Taskbar sẽ được khôi phục tự động nếu bạn tắt tùy chọn này, bấm Khôi phục bên dưới hoặc thoát ứng dụng.");
    const recRow = el("div", "row");
    recRow.appendChild(rowText("Khôi phục Taskbar khẩn cấp", "Hiển thị lại thanh Taskbar Windows ngay lập tức nếu đang bị ẩn"));
    const btnRec = el("button", "btn", "🛟 Khôi phục Taskbar ngay");
    btnRec.addEventListener("click", async () => {
      set("hideTaskbar", false);
      await invoke("set_taskbar_hidden", { hidden: false }).catch(() => {});
      toast("Đã khôi phục thanh Taskbar Windows!");
      renderPage();
    });
    recRow.appendChild(btnRec);

    p.append(
      sectionLabel("Thanh ứng dụng Deck (Đáy màn hình)"),
      card(
        toggleRow("enableDeck", "Bật thanh Deck ứng dụng", "Thanh chứa App Grid, ứng dụng ghim, cửa sổ đang mở, Downloads & Thùng rác"),
        segBlockRow("deckBehavior", "Chế độ hiển thị Deck", "Thông minh sẽ tự ẩn và hiện ra khi rê chuột sát cạnh đáy", [
          ["overlay", "Nổi đè nhẹ"], ["fixed", "Cố định"], ["smart", "Ẩn thông minh"]
        ]),
        sliderRow("deckSize", "Kích thước biểu tượng Deck", "Điều chỉnh độ lớn từng ô ứng dụng trên thanh Deck", 36, 72, 2, "px"),
        toggleRow("deckMagnify", "Hiệu ứng phóng đại khi rê chuột", "Biểu tượng nở mượt theo khoảng cách con trỏ"),
        toggleRow("deckShowRecents", "Hiện ứng dụng vừa đóng gần đây", "Giữ tối đa 3 ứng dụng gần nhất cạnh biểu tượng ghim"),
        toggleRow("deckShowDownloads", "Hiện ngăn xếp Tải xuống (Downloads)", "Xem nhanh các tệp mới tải về mà không cần mở Explorer"),
        toggleRow("deckShowTrash", "Hiện biểu tượng Thùng rác (Trash)", "Hiển thị trạng thái đầy/trống và hỗ trợ dọn nhanh bằng chuột phải")
      ),
      sectionLabel("Thanh tác vụ Windows"),
      card(
        toggleRow("hideTaskbar", "Ẩn thanh Taskbar Windows gốc", "Tùy chọn không gian tối đa khi dùng Deck làm thanh chính"),
        note,
        recRow
      )
    );
  },

  rail(p) {
    p.append(
      sectionLabel("Thanh menu trên Rail (Top Menu Bar)"),
      card(
        toggleRow("enableRail", "Bật thanh menu trên Rail", "Tự chừa khoảng hở trung tâm khi Dynamic Island đang hiển thị"),
        segBlockRow("railBehavior", "Chế độ hiển thị Rail", "Thông minh sẽ tự trượt xuống khi chạm chuột mép trên màn hình", [
          ["overlay", "Nổi ở mép trên"], ["fixed", "Cố định"], ["smart", "Ẩn thông minh"]
        ]),
        toggleRow("railShowAppMenu", "Hiện tên & Menu ngữ cảnh ứng dụng", "Hiển thị Tệp / Chỉnh sửa / Xem... đồng bộ theo cửa sổ đang active"),
        toggleRow("railShowWifi", "Hiện chỉ báo & trình chọn Wi-Fi", "Xem SSID và kết nối mạng trực tiếp từ thanh trên"),
        toggleRow("railShowBattery", "Hiện phần trăm Pin & Sạc", "Cập nhật theo thời gian thực từ nhân hệ thống"),
        toggleRow("railShowClock", "Hiện đồng hồ trên Rail", "Hiển thị giờ hiện tại ở góc phải thanh menu")
      )
    );
  },

  desktop(p) {
    const galRow = el("div", "row");
    galRow.appendChild(rowText("Thư viện Desktop Widgets (7 loại)", "Gồm Đồng hồ kim, Đồng hồ số, Giờ thế giới, Lịch họp, Lịch tháng, Pin & Hệ thống"));
    const btnGal = el("button", "btn primary", "🧱 Mở Thư viện Widgets");
    btnGal.addEventListener("click", async () => {
      if (!S.enableWidgets) {
        set("enableWidgets", true);
        setTimeout(() => emit("island-open-widget-gallery", true).catch(() => {}), 420);
      } else {
        emit("island-open-widget-gallery", true).catch(() => {});
      }
      toast("Đã mở Thư viện Desktop Widgets!");
    });
    galRow.appendChild(btnGal);

    const scRow = el("div", "row");
    scRow.appendChild(rowText("Khôi phục các cửa sổ đang cất", "Đưa toàn bộ cửa sổ thu gọn ở cạnh trái trở lại vị trí ban đầu"));
    const btnUnpark = el("button", "btn", "↺ Khôi phục mọi cửa sổ");
    btnUnpark.addEventListener("click", async () => {
      await invoke("scene_unpark_all").catch(() => {});
      toast("Đã khôi phục toàn bộ cửa sổ!");
    });
    scRow.appendChild(btnUnpark);

    p.append(
      sectionLabel("Tiện ích trên Màn hình nền (Desktop Widgets)"),
      card(
        toggleRow("enableWidgets", "Bật lớp Desktop Widgets trong suốt", "Vùng trống tự động xuyên chuột hoàn toàn, kéo thẻ bám lưới 16px"),
        segRow("widgetsStyle", "Phong cách thẻ Widget", "Original thanh lịch hoặc Crystal kính pha lê nổi bật", [
          ["original", "Original"], ["crystal", "Crystal"]
        ]),
        toggleRow("widgetsTopmost", "Giữ Widgets luôn nổi trên cửa sổ khác", "Bật để ghim Widget nổi lên trên; tắt để nằm nền Desktop"),
        galRow
      ),
      sectionLabel("Không gian Cửa sổ (Scene Workspace)"),
      card(
        toggleRow("enableScene", "Bật thanh Scene bên cạnh trái", "Hiển thị xem trước cửa sổ nghiêng 3D · Bấm chuyển cửa sổ · Shift+Bấm gom nhóm"),
        scRow
      )
    );
  },

  shortcuts(p) {
    const hotCard = el("div", "card");
    const hkGrid = el("div", "hotkey-grid");
    [
      ["🔍 Quick Search", "Ctrl + Space"],
      ["🎚️ Quick Panel", "Ctrl + Alt + C"],
      ["✨ Trợ lý AI", "Alt + Space"],
      ["📸 Chụp gửi AI", "Alt + S"],
      ["✅ Thêm nhanh Việc", "Ctrl + Alt + N"],
      ["🎨 Hút màu màn hình", "Alt + C"]
    ].forEach(([lbl, keys]) => {
      const it = el("div", "hotkey-item");
      it.innerHTML = `<span>${lbl}</span><kbd>${keys}</kbd>`;
      hkGrid.appendChild(it);
    });
    hotCard.appendChild(hkGrid);

    const cornerOpts = [
      ["none", "— Không làm gì —"],
      ["quick_search", "🔍 Tìm kiếm nhanh (Quick Search)"],
      ["quick_panel", "🎚️ Bảng điều khiển (Quick Panel)"],
      ["app_grid", "📱 Lưới ứng dụng (App Grid)"],
      ["overview", "🪟 Tổng quan cửa sổ (Overview)"],
      ["desktop", "🗔 Hiện màn hình nền (Desktop)"],
      ["notifications", "🔔 Trung tâm Thông báo Windows"],
      ["screenshot", "✂️ Chụp ảnh màn hình"],
      ["lock", "🔒 Khóa màn hình"],
      ["toggle_island", "👁️ Ẩn / Hiện Dynamic Island"]
    ];
    const cornerCard = el("div", "card");
    const cGrid = el("div", "corner-grid");
    [
      ["hotCornerTL", "↖️ Góc Trên - Trái"],
      ["hotCornerTR", "↗️ Góc Trên - Phải"],
      ["hotCornerBL", "↙️ Góc Dưới - Trái"],
      ["hotCornerBR", "↘️ Góc Dưới - Phải"]
    ].forEach(([key, title]) => {
      const box = el("div", "corner-box");
      const lbl = el("div", "corner-lbl", title);
      const sel = el("select", "num-sel");
      cornerOpts.forEach(([v, t]) => sel.appendChild(el("option", "", t)).value = v);
      sel.value = S[key] || "none";
      sel.addEventListener("change", () => set(key, sel.value));
      box.append(lbl, sel);
      cGrid.appendChild(box);
    });
    cornerCard.appendChild(cGrid);

    p.append(
      sectionLabel("Bảng Phím tắt Nhanh"),
      hotCard,
      sectionLabel("Tùy chọn Hệ thống & Điều khiển cửa sổ nhanh"),
      card(
        toggleRow("globalHotkeys", "Bật phím tắt toàn cục Island", "Cho phép gọi nhanh AI, Quick Search, Quick Panel, Hút màu từ mọi nơi", {
          after: (v) => invoke("set_global_hotkeys", { enable: v }).catch(() => {})
        }),
        toggleRow("macShortcuts", "Phím tắt điều khiển cửa sổ nhanh", "Hỗ trợ Alt+` chuyển cửa sổ cùng ứng dụng, Ctrl+W/M/Q tương ứng", {
          after: (v) => invoke("set_mac_shortcuts", { enable: v }).catch(() => {})
        }),
        toggleRow("suppressNativeOsd", "Ẩn thanh OSD âm lượng mặc định của Windows", "Chỉ hiển thị HUD âm lượng tinh gọn trên Dynamic Island")
      ),
      sectionLabel("Góc nóng Màn hình (Hot Corners · giữ chuột 0.25s ở góc)"),
      cornerCard
    );
  },

  pet(p) {
    p.append(
      sectionLabel("Linh vật & Chế độ thu gọn"),
      card(
        toggleRow("mascot", "Hiển thị Linh vật Island", "Thú cưng sống trong tai thỏ, liếc theo chuột & phản ứng biểu cảm"),
        buildPetLivePreviewRow()
      ),
      sectionLabel("Chọn Loài & Tùy biến Mắt / Hào quang"),
      card(
        buildPetGalleryRow(),
        segRow("petEyeSize", "Kích thước đôi mắt Pet", "Độ lớn đôi mắt ở trạng thái thu gọn", [
          ["small", "Nhỏ"], ["normal", "Chuẩn"], ["large", "Lớn"]
        ], () => renderPage()),
        buildPetGlowSelectorRow(),
        buildPetEyeColorSelectorRow(),
        toggleRow("petMinimalFace", "Mặt tối giản (Chỉ 2 mắt sáng)", "Ẩn tai, vương miện, má hồng & miệng", {
          after: () => renderPage()
        }),
        toggleRow("petAutoSleep", "Tự nhắm mắt ngủ khi rảnh", "Khi tắt (mặc định), Pet luôn mở mắt sáng và chớp tự nhiên")
      ),
      sectionLabel("Thử nhanh Biểu cảm"),
      card(buildMoodTesterRow())
    );
  },

  weather(p) {
    const cityOpts = [
      ["Auto", "📍 Tự động theo GPS của máy"],
      ["Hà Nội", "🇻🇳 Hà Nội"],
      ["TP.HCM", "🇻🇳 TP. Hồ Chí Minh"],
      ["Đà Nẵng", "🇻🇳 Đà Nẵng"],
      ["Hải Phòng", "🇻🇳 Hải Phòng"],
      ["Cần Thơ", "🇻🇳 Cần Thơ"],
      ["Huế", "🇻🇳 Huế"],
      ["Nha Trang", "🇻🇳 Nha Trang"],
      ["Đà Lạt", "🇻🇳 Đà Lạt"],
      ["Vũng Tàu", "🇻🇳 Vũng Tàu"],
      ["Quy Nhơn", "🇻🇳 Quy Nhơn"],
      ["Hạ Long", "🇻🇳 Hạ Long"],
      ["Sa Pa", "🇻🇳 Sa Pa"],
      ["Phú Quốc", "🇻🇳 Phú Quốc"],
      ["Tokyo", "🇯🇵 Tokyo"],
      ["Seoul", "🇰🇷 Seoul"],
      ["Singapore", "🇸🇬 Singapore"]
    ];

    p.append(
      sectionLabel("Định vị GPS Thiết bị & Dự báo"),
      card(
        buildGpsStatusBox(),
        selectRow("weatherCity", "Khu vực theo dõi", "Mặc định dùng GPS của máy để lấy đúng phường/quận/thành phố hiện tại", cityOpts),
        segRow("weatherUnit", "Đơn vị nhiệt độ", "Áp dụng cho toàn bộ trang Thời tiết & Widget", [
          ["C", "Độ C (°C)"],
          ["F", "Độ F (°F)"]
        ]),
        segRow("weatherForecastMode", "Biểu đồ mặc định", "Tab biểu đồ hiển thị sẵn trên trang Thời tiết", [
          ["hourly", "📈 Nhiệt độ"],
          ["rain", "🌧️ Mưa & UV"],
          ["daily", "📅 5 ngày"]
        ]),
        toggleRow("weatherHeaderBadge", "Hiện nhiệt độ trên Header", "Hiển thị thẻ ⛅ Nhiệt độ cạnh đồng hồ khi mở tai thỏ"),
        toggleRow("weatherAlert", "Cảnh báo mưa to / dông bão", "Đẩy thông báo khi phát hiện thời tiết cực đoan")
      ),
      sectionLabel("Chủ đề Bầu trời trang Thời tiết"),
      card(buildThemeGalleryRow())
    );
  },

  ai(p) {
    const PROMPT_PRESETS = [
      { id: "general", label: "⚡ Trợ lý đa năng", prompt: "Bạn là Island AI Assistant - một trợ lý thông minh trên Desktop Windows. Hãy trả lời ngắn gọn, chuẩn xác, súc tích bằng tiếng Việt." },
      { id: "translate", label: "🌐 Dịch chuẩn xác", prompt: "Bạn là chuyên gia biên dịch song ngữ Việt - Anh - Trung - Nhật. Hãy dịch tự nhiên, giữ nguyên sắc thái ngữ cảnh và giải thích thuật ngữ nếu cần." },
      { id: "coder", label: "💻 Kỹ sư Code", prompt: "Bạn là chuyên gia phần mềm Rust, JavaScript, TypeScript và hệ thống Windows. Trả lời thẳng trọng tâm, đưa mã nguồn sạch, giải thích ngắn gọn nguyên nhân và cách sửa." },
      { id: "summary", label: "📝 Tóm tắt nhanh", prompt: "Hãy tóm tắt mọi nội dung được cung cấp thành các gạch đầu dòng ngắn gọn, làm nổi bật số liệu, kết luận và hành động quan trọng bằng tiếng Việt." }
    ];

    // Chọn Mô hình AI
    const modelRow = el("div", "row col");
    modelRow.appendChild(rowText(
      "Chọn Mô hình AI mặc định",
      "Chuyển đổi linh hoạt giữa Gemini 3.8, Claude 4.6, DeepSeek V4, GPT-OSS 120B (cũng đổi nhanh được ngay trên tai thỏ)"
    ));
    const modelGrid = el("div", "ai-model-card-grid");
    const curModel = AI_MODELS.some((m) => m.id === S.aiModel) ? S.aiModel : "ag/gemini-3.8-flash";
    AI_MODELS.forEach((m) => {
      const isAct = curModel === m.id;
      const btn = el("button", "ai-model-card" + (isAct ? " active" : ""));
      btn.innerHTML = `
        <div class="ai-model-card-top">
          <span class="ai-model-card-name">${m.name}</span>
          <span class="ai-model-card-tag">${isAct ? "✔ Đang dùng" : m.tag}</span>
        </div>
        <div class="ai-model-card-desc">${m.desc}</div>
      `;
      btn.addEventListener("click", () => {
        set("aiModel", m.id);
        toast(`Đã chọn mô hình AI: ${m.name}`);
        renderPage();
      });
      modelGrid.appendChild(btn);
    });
    modelRow.appendChild(modelGrid);

    const thinkDescMap = {
      fast: "⚡ Nhanh: Trả lời trực tiếp tức thì, không tốn thời gian suy luận",
      low: "💡 Thấp: Suy luận ngắn gọn, phù hợp tác vụ đơn giản",
      medium: "⚖️ Vừa: Cân bằng giữa tốc độ phản hồi và độ sâu phân tích",
      high: "🧠 Sâu: Suy luận đa bước kỹ lưỡng nhất cho bài toán phức tạp"
    };

    const curSizeKey = (Number(S.aiHeight) || 220) >= 400 ? "large" : ((Number(S.aiHeight) || 220) >= 300 ? "medium" : "compact");
    const sizeRow = el("div", "row col");
    sizeRow.appendChild(rowText("Kích thước khung AI mặc định", "Cũng có thể kéo trực tiếp cạnh đáy tai thỏ để chỉnh tự do"));
    const sizeSeg = el("div", "seg full");
    [
      { id: "compact", w: 520, h: 220, label: "Nhỏ gọn (520×220)" },
      { id: "medium", w: 580, h: 320, label: "Tiêu chuẩn (580×320)" },
      { id: "large", w: 640, h: 440, label: "Mở rộng (640×440)" }
    ].forEach((sz) => {
      const b = el("button", curSizeKey === sz.id ? "on" : "", sz.label);
      b.addEventListener("click", () => {
        S.aiWidth = sz.w;
        S.aiHeight = sz.h;
        commit("aiWidth");
        toast(`Khung AI: ${sz.w}×${sz.h}`);
        renderPage();
      });
      sizeSeg.appendChild(b);
    });
    sizeRow.appendChild(sizeSeg);

    const promptRow = el("div", "row col");
    promptRow.appendChild(rowText("Chỉ dẫn vai trò AI (System Prompt)", "Chọn mẫu có sẵn hoặc nhập phong cách trả lời riêng"));
    const ta = el("textarea", "cfg-textarea");
    ta.rows = 3;
    ta.placeholder = "Nhập chỉ dẫn vai trò và phong cách trả lời cho Trợ lý AI...";
    ta.value = S.aiSystemPrompt || PROMPT_PRESETS[0].prompt;

    const presetsWrap = el("div", "prompt-presets-row");
    PROMPT_PRESETS.forEach((pr) => {
      const isAct = (S.aiSystemPrompt || "").trim() === pr.prompt;
      const pb = el("button", "prompt-preset-btn" + (isAct ? " active" : ""), pr.label);
      pb.addEventListener("click", () => {
        ta.value = pr.prompt;
        set("aiSystemPrompt", pr.prompt);
        toast(`Đã áp dụng mẫu: ${pr.label}`);
        renderPage();
      });
      presetsWrap.appendChild(pb);
    });
    ta.addEventListener("change", () => {
      set("aiSystemPrompt", ta.value.trim() || PROMPT_PRESETS[0].prompt);
      toast("Đã lưu chỉ dẫn AI!");
    });
    promptRow.append(presetsWrap, ta);

    const clearHistRow = el("div", "row");
    clearHistRow.appendChild(rowText("Xóa lịch sử trò chuyện AI", "Làm trống file ai_history.txt và khung hội thoại hiện tại"));
    const btnClrHist = el("button", "btn danger", "🗑️ Xóa lịch sử");
    btnClrHist.addEventListener("click", () => {
      emit("island-action", { type: "ai_clear_history" }).catch(() => {});
      toast("Đã xóa toàn bộ lịch sử trò chuyện AI");
    });
    clearHistRow.appendChild(btnClrHist);

    p.append(
      sectionLabel("Mô hình & Mức độ tư duy"),
      card(
        modelRow,
        segBlockRow("aiThinkingLevel", "Mức độ tư duy (Thinking Effort)", thinkDescMap[S.aiThinkingLevel || "high"] || thinkDescMap.high, [
          ["fast", "⚡ Nhanh"],
          ["low", "💡 Thấp"],
          ["medium", "⚖️ Vừa"],
          ["high", "🧠 Sâu (Tối đa)"]
        ], () => renderPage()),
        toggleRow("aiStream", "Hiển thị câu trả lời từng chữ (Streaming)", "Chữ chạy mượt theo thời gian thực & hiển thị khối 'Quá trình suy nghĩ' khi bật tư duy"),
        toggleRow("aiSaveHistory", "Tự động lưu lịch sử trò chuyện", "Khôi phục lại 20 tin nhắn gần nhất khi khởi động lại ứng dụng"),
        clearHistRow
      ),
      sectionLabel("Khung chat & Chỉ dẫn phản hồi"),
      card(sizeRow, promptRow)
    );
  },

  productivity(p) {
    const drinks = Math.max(1, Math.ceil(S.waterGoal / S.waterBottle));
    const activeMin = Math.max(60, (S.waterTo - S.waterFrom) * 60);
    const autoMin = Math.max(10, Math.round(activeMin / drinks));
    const hours = [];
    for (let h = 5; h <= 23; h++) hours.push([h, `${String(h).padStart(2, "0")}:00`]);

    const pct = Math.min(100, Math.round((waterToday.intakeMl / (S.waterGoal || 1)) * 100));
    const waterProgRow = el("div", "row");
    const txt = rowText("Lượng nước đã nạp hôm nay", `${(waterToday.intakeMl / 1000).toFixed(2)} L / ${(S.waterGoal / 1000).toFixed(1)} L · ${pct}%`);
    txt.appendChild(el("div", "wprog", `<i style="width:${pct}%"></i>`));
    waterProgRow.appendChild(txt);
    const resetWater = el("button", "btn danger", "Đặt lại");
    resetWater.addEventListener("click", () => {
      emit("island-action", { type: "water_reset" }).catch(() => {});
      waterToday.intakeMl = 0;
      toast("Đã đặt lại lượng nước hôm nay về 0");
      renderPage();
    });
    waterProgRow.appendChild(resetWater);

    const calRow = el("div", "row col");
    calRow.appendChild(buildCalendarPreview());

    // ☁️ Thẻ đồng bộ Google Tasks 2 chiều
    const gSyncRow = el("div", "row");
    const gStatusTitle = googleTasksStatus.connected
      ? `🟢 Đã liên kết${googleTasksStatus.email ? `: ${googleTasksStatus.email}` : ""}`
      : "⚪ Chưa liên kết tài khoản Google";
    const gStatusDesc = googleTasksStatus.connected
      ? `Tự động đồng bộ 2 chiều với Google Tasks trên điện thoại${googleTasksStatus.last_sync ? ` · Đồng bộ lúc ${googleTasksStatus.last_sync}` : ""}`
      : "Đăng nhập Google 1 lần để đồng bộ danh sách việc cần làm 2 chiều theo thời gian thực";
    gSyncRow.appendChild(rowText(gStatusTitle, gStatusDesc));
    const gBtnWrap = el("div", "");
    gBtnWrap.style.display = "flex";
    gBtnWrap.style.gap = "6px";
    gBtnWrap.style.flex = "none";
    gBtnWrap.style.alignItems = "center";
    if (googleTasksStatus.connected) {
      const btnSyncNow = el("button", "btn primary", "🔄 Đồng bộ ngay");
      btnSyncNow.addEventListener("click", async () => {
        btnSyncNow.disabled = true;
        btnSyncNow.textContent = "⏳ Đang đồng bộ...";
        toast("Đang đồng bộ Google Tasks...");
        try {
          let localTodos = [];
          try {
            const rawTodo = await invoke("load_data_file", { filename: "todo.txt" });
            if (rawTodo) {
              const parsed = JSON.parse(rawTodo);
              if (Array.isArray(parsed)) localTodos = parsed;
            }
          } catch (_) {}
          let deletedIds = [];
          try {
            const rawDel = localStorage.getItem("island_gtasks_deleted");
            if (rawDel) {
              const parsedDel = JSON.parse(rawDel);
              if (Array.isArray(parsedDel)) deletedIds = parsedDel;
            }
          } catch (_) {}
          const res = await invoke("google_tasks_sync", {
            localTodos: localTodos.map((t) => ({
              text: String(t.text || ""),
              done: !!t.done,
              google_id: t.google_id || null,
              updated: t.updated || null,
              notes: t.notes || null,
              due: t.due || null,
              local_dirty: !!t.local_dirty
            })),
            deletedGoogleIds: deletedIds
          });
          if (res?.status) googleTasksStatus = res.status;
          toast(`✅ Đã đồng bộ Google Tasks (${res?.todos?.length || 0} công việc)`);
        } catch (err) {
          const st = await invoke("google_tasks_get_status").catch(() => null);
          if (st) googleTasksStatus = st;
          toast(`❌ ${err}`);
        } finally {
          renderPage();
        }
      });
      const btnDisc = el("button", "btn danger", "Ngắt kết nối");
      btnDisc.addEventListener("click", async () => {
        await invoke("google_tasks_disconnect").catch(() => {});
        googleTasksStatus = { ...googleTasksStatus, connected: false, email: "", last_sync: "" };
        toast("Đã ngắt liên kết Google Tasks");
        renderPage();
      });
      gBtnWrap.append(btnSyncNow, btnDisc);
    } else {
      const btnAuth = el("button", "btn primary", isGoogleAuthBusy ? "⏳ Đang chờ trình duyệt..." : "🔗 Đăng nhập Google Tasks");
      if (isGoogleAuthBusy) btnAuth.disabled = true;
      btnAuth.addEventListener("click", async () => {
        if (isGoogleAuthBusy) return;
        isGoogleAuthBusy = true;
        renderPage();
        try {
          const res = await invoke("google_tasks_start_auth", {
            clientId: S.googleClientId || null,
            clientSecret: S.googleClientSecret || null
          });
          if (res) googleTasksStatus = res;
          toast(`✅ Đã liên kết & đồng bộ ${res?.email || "Google Tasks"}!`);
        } catch (err) {
          toast(`❌ ${err}`);
        } finally {
          isGoogleAuthBusy = false;
          renderPage();
        }
      });
      gBtnWrap.appendChild(btnAuth);
    }
    gSyncRow.appendChild(gBtnWrap);

    const gCredRow = el("div", "row col");
    const gCredHdr = el("div", "cfg-inline-row");
    gCredHdr.style.justifyContent = "space-between";
    gCredHdr.style.width = "100%";
    gCredHdr.appendChild(rowText(
      "Khóa Google OAuth Desktop",
      googleTasksStatus.has_default_creds
        ? "Đã nhúng sẵn khóa dự án Island Tasks — bạn chỉ cần bấm Đăng nhập ở trên (hoặc nạp file JSON riêng nếu muốn đổi)"
        : "Nạp tệp client_secret.json từ Google Cloud Console hoặc dán thủ công"
    ));
    const btnImportJson = el("button", "btn", "📂 Nạp client_secret.json");
    btnImportJson.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".json";
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          const parsed = JSON.parse(text);
          const root = parsed.installed || parsed.web || parsed;
          const cid = String(root.client_id || "").trim();
          const csec = String(root.client_secret || "").trim();
          if (!cid || !csec) {
            toast("❌ File JSON thiếu client_id hoặc client_secret");
            return;
          }
          S.googleClientId = cid;
          S.googleClientSecret = csec;
          commit("googleClientId");
          toast("Đã nạp khóa OAuth Google thành công!");
          renderPage();
        } catch (_) {
          toast("❌ Không thể đọc file JSON");
        }
      };
      inp.click();
    });
    gCredHdr.appendChild(btnImportJson);

    const gInputs = el("div", "cfg-inline-row");
    gInputs.style.width = "100%";
    const inpCid = el("input", "cfg-input");
    inpCid.placeholder = "Client ID (để trống = dùng mặc định Island)";
    inpCid.value = S.googleClientId || "";
    inpCid.addEventListener("change", () => {
      set("googleClientId", inpCid.value.trim());
      toast("Đã lưu Client ID tùy chỉnh");
    });
    const inpCsec = el("input", "cfg-input");
    inpCsec.type = "password";
    inpCsec.placeholder = "Client Secret (để trống = dùng mặc định)";
    inpCsec.value = S.googleClientSecret || "";
    inpCsec.addEventListener("change", () => {
      set("googleClientSecret", inpCsec.value.trim());
      toast("Đã lưu Client Secret tùy chỉnh");
    });
    gInputs.append(inpCid, inpCsec);
    gCredRow.append(gCredHdr, gInputs);

    p.append(
      sectionLabel("☁️ Đồng bộ Google Tasks (Điện thoại & Máy tính)"),
      card(gSyncRow, gCredRow),
      sectionLabel("Việc cần làm & Lịch biểu"),
      card(
        toggleRow("calendarCompanion", "Đồng hành Lịch họp Windows (Meeting Companion)", "Đọc lịch hẹn Windows Calendar cục bộ, báo đếm ngược 10p & nút Tham gia"),
        toggleRow("todoOrdered", "Ưu tiên việc có giờ hẹn lên đầu", "Tự sắp xếp công việc theo giờ ở trang Hôm nay"),
        toggleRow("todoStart", "Nhắc khi đến giờ bắt đầu", "Phát thông báo đúng giờ bắt đầu công việc"),
        toggleRow("todoEnd", "Nhắc khi hết thời lượng dự kiến", "Báo hoàn tất khi hết thời gian ước tính"),
        segRow("snoozeMin", "Thời gian báo lại (Snooze)", "Khoảng chờ trước khi nhắc lại", [[5, "5p"], [10, "10p"], [15, "15p"]]),
        segRow("weekMonday", "Ngày đầu tuần", "Áp dụng cho dải lịch Tuần này & Lịch xem trước", [[false, "Chủ nhật"], [true, "Thứ hai"]], () => renderPage()),
        segRow("calendarView", "Chế độ xem lịch", "Lưới lịch theo tháng hoặc tuần", [["month", "Tháng"], ["week", "Tuần"]], () => renderPage()),
        calRow
      ),
      sectionLabel("Đồng hồ Tập trung (Pomodoro)"),
      card(
        segRow("pomoFocus", "Thời lượng Tập trung", "Phút mỗi phiên làm việc sâu", [[15, "15p"], [25, "25p"], [45, "45p"], [60, "60p"]]),
        segRow("pomoShort", "Nghỉ ngắn", "Phút nghỉ giữa các phiên", [[3, "3p"], [5, "5p"], [10, "10p"]]),
        segRow("pomoLong", "Nghỉ dài", "Phút nghỉ sau chu kỳ 4 phiên", [[10, "10p"], [15, "15p"], [20, "20p"], [30, "30p"]]),
        toggleRow("pomoAutoBreak", "Tự động chuyển sang Nghỉ giải lao", "Tự bắt đầu đồng hồ nghỉ ngay khi hoàn thành một phiên tập trung"),
        toggleRow("pomoAutoLong", "Tự động Nghỉ dài sau 4 phiên", "Áp dụng thời lượng nghỉ dài sau mỗi 4 phiên tập trung")
      ),
      sectionLabel("Nhắc uống nước"),
      card(
        waterProgRow,
        toggleRow("waterRemind", "Nhắc nhở uống nước định kỳ", "Thông báo trong khung giờ hoạt động bên dưới"),
        segRow("waterInterval", "Chu kỳ nhắc", S.waterInterval === 0 ? `Tự động ≈ ${autoMin} phút/lần` : "Khoảng cách giữa các lần nhắc", [
          [0, "Tự động"], [15, "15p"], [30, "30p"], [45, "45p"], [60, "60p"]
        ], () => renderPage()),
        segRow("waterGoal", "Mục tiêu mỗi ngày", "Tổng lượng nước cần nạp", [[1500, "1.5 L"], [2000, "2 L"], [2500, "2.5 L"], [3000, "3 L"]], () => renderPage()),
        segRow("waterBottle", "Mỗi lần uống", "Lượng nước cộng thêm mỗi lần bấm", [[150, "150 ml"], [250, "250 ml"], [330, "330 ml"], [500, "500 ml"]], () => renderPage()),
        selectRow("waterFrom", "Nhắc từ giờ", "Giờ bắt đầu trong ngày", hours.filter(([h]) => h < S.waterTo)),
        selectRow("waterTo", "Ngừng lúc", "Giờ kết thúc tránh làm phiền ban đêm", hours.filter(([h]) => h > S.waterFrom))
      )
    );
  },

  utilities(p) {
    const widgetOptions = [
      ["this_week", "📅 Tuần này (Lịch & Việc)"],
      ["weather", "⛅ Thời tiết trực tiếp"],
      ["system_monitor", "📊 Hệ thống (CPU, RAM & Mạng)"],
      ["water", "💧 Nước uống 7 ngày"],
      ["focus_today", "🍅 Tập trung Pomodoro"],
      ["world_clock", "🌍 Đồng hồ thế giới"],
      ["battery", "🔋 Năng lượng Pin"],
      ["moon", "🌙 Chu kỳ Mặt trăng"],
      ["countdown", "🎆 Đếm ngược Sự kiện"],
      ["next_prayer", "🕌 Giờ cầu nguyện"]
    ];
    const cityOptions = [
      ["Hà Nội", "🇻🇳 Hà Nội (GMT+7)"],
      ["TP.HCM", "🇻🇳 TP.HCM (GMT+7)"],
      ["Đà Nẵng", "🇻🇳 Đà Nẵng (GMT+7)"],
      ["Tokyo", "🇯🇵 Tokyo (GMT+9)"],
      ["Seoul", "🇰🇷 Seoul (GMT+9)"],
      ["Singapore", "🇸🇬 Singapore (GMT+8)"],
      ["London", "🇬🇧 London"],
      ["Paris", "🇫🇷 Paris"],
      ["New York", "🇺🇸 New York"],
      ["Sydney", "🇦🇺 Sydney"],
      ["Mecca", "🇸🇦 Mecca"]
    ];
    const eventOptions = [
      ["new_year", "🎆 Tết Dương Lịch (01/01)"],
      ["tet_am", "🧧 Tết Nguyên Đán"],
      ["valentine", "💖 Lễ Tình Nhân (14/02)"],
      ["quoc_khanh", "🇻🇳 Quốc Khánh (02/09)"],
      ["christmas", "🎄 Giáng Sinh (25/12)"]
    ];

    const quickCleanRow = el("div", "row");
    quickCleanRow.appendChild(rowText("Dọn dẹp dữ liệu tạm nhanh", "Xóa nhanh danh sách khay tệp, lịch sử Clipboard hoặc thông báo đã lưu"));
    const cleanBtns = el("div", "seg");
    const bShelf = el("button", "", "🗑️ Khay tệp");
    bShelf.addEventListener("click", () => {
      emit("island-action", { type: "shelf_clear" }).catch(() => {});
      toast("Đã dọn sạch khay tệp");
    });
    const bClip = el("button", "", "📋 Clipboard");
    bClip.addEventListener("click", () => {
      emit("island-action", { type: "clipboard_clear" }).catch(() => {});
      toast("Đã xóa lịch sử Clipboard");
    });
    const bNotif = el("button", "", "🔔 Thông báo");
    bNotif.addEventListener("click", () => {
      emit("island-action", { type: "notif_clear" }).catch(() => {});
      toast("Đã xóa toàn bộ thông báo");
    });
    cleanBtns.append(bShelf, bClip, bNotif);
    quickCleanRow.appendChild(cleanBtns);

    // Lưới 2 cột HUD & Cảnh báo
    const hudCard = el("div", "card");
    const hudGrid = el("div", "pages-toggle-grid");
    [
      ["hudVolume", "🔊 HUD Âm lượng", "Vòng tròn khi tăng/giảm"],
      ["hudBrightness", "☀️ HUD Độ sáng", "Thay đổi sáng laptop"],
      ["hudCaps", "🔠 HUD Caps Lock", "Trạng thái viết hoa"],
      ["hudLanguage", "⌨️ HUD Bộ gõ", "VIE / ENG khi chuyển phím"],
      ["popupBattery", "🔋 Cảnh báo Pin", "Cắm sạc, yếu ≤20% & đầy"],
      ["popupWifi", "📶 Trạng thái Wi-Fi", "Mất hoặc có mạng lại"],
      ["popupBluetooth", "🎧 Bluetooth & USB", "Kết nối / Ngắt thiết bị"],
      ["privacyIndicator", "🟢 Camera & Micro", "Chấm báo & popup khi bật"],
      ["popupDownloads", "⬇️ Tiến trình tải về", "Chrome, Edge & Steam"]
    ].forEach(([k, name, sub]) => hudGrid.appendChild(compactToggleChip(k, name, sub)));
    hudCard.appendChild(hudGrid);

    const prayerCities = [
      ["Hà Nội", "Hà Nội"], ["TP.HCM", "TP. Hồ Chí Minh"], ["Đà Nẵng", "Đà Nẵng"],
      ["Jakarta", "Jakarta"], ["Kuala Lumpur", "Kuala Lumpur"], ["Mecca", "Mecca"], ["Tokyo", "Tokyo"]
    ];

    p.append(
      sectionLabel("Âm nhạc & Lời bài hát"),
      card(
        toggleRow("albumGlow", "Viền sáng theo bìa đĩa", "Tỏa màu chủ đạo của ảnh bài hát lên tai thỏ"),
        toggleRow("audioVisualizer", "Sóng nhạc & Pet nhún theo âm thanh thật", "Đồng bộ biên độ WASAPI 60fps với cột sóng & chuyển động linh vật"),
        segBlockRow("visualizerStyle", "Kiểu hiển thị sóng nhạc", "Áp dụng cho sóng nhạc trên thẻ Nhạc và khi thu gọn", [
          ["bars", "Cột"], ["spectrum", "Phổ 16 dải"], ["wave", "Sóng"], ["dots", "Chấm"]
        ]),
        toggleRow("musicAurora", "Cực quang Aurora theo nhịp nhạc", "Dải ánh sáng chuyển động phía dưới thẻ Âm nhạc"),
        toggleRow("lyrics", "Đồng bộ lời bài hát (Karaoke)", "Tự động tải và đồng bộ lời bài hát theo thời gian thực"),
        toggleRow("miniLyricsBar", "Thanh lời thu gọn (Mini-Lyrics)", "Tự thu thành dòng chữ chạy lời khi đóng tai thỏ"),
        toggleRow("showRemaining", "Hiện thời gian còn lại", "Đếm ngược -mm:ss thay cho tổng thời lượng")
      ),
      sectionLabel("Tiện ích Đôi (Widgets)"),
      card(
        selectRow("widgetLeft", "Thẻ bên trái", "Hoặc bấm ⇄ trực tiếp trên thẻ", widgetOptions),
        selectRow("widgetRight", "Thẻ bên phải", "Hoặc bấm ⇄ trực tiếp trên thẻ", widgetOptions),
        selectRow("widgetCity1", "Đồng hồ thế giới 1", "Thành phố dòng đầu", cityOptions),
        selectRow("widgetCity2", "Đồng hồ thế giới 2", "Thành phố dòng hai", cityOptions),
        selectRow("widgetEvent", "Sự kiện đếm ngược", "Mốc đếm ngược trong Widget", eventOptions)
      ),
      sectionLabel("Khay tệp, Clipboard & Thông báo"),
      card(
        toggleRow("clipboard", "Ghi nhớ lịch sử Clipboard", "Lưu văn bản sao chép (tự bỏ qua trình quản lý mật khẩu)"),
        segRow("clipboardMax", "Giới hạn mục lưu", "Số bản ghi giữ trong bộ nhớ", [[5, "5"], [15, "15"], [30, "30"], [50, "50"]]),
        toggleRow("clipboardKeep", "Lưu Clipboard ra đĩa", "Giữ lại sau khi khởi động lại máy"),
        toggleRow("shelfClear", "Làm trống Khay tệp khi mở app", "Tự dọn thẻ tệp tạm từ phiên trước"),
        toggleRow("notifications", "Trung tâm thông báo & Chuông", "Hiện biểu tượng chuông và lưu lịch sử nhắc nhở"),
        toggleRow("notificationPreview", "Mở hé khi có thông báo mới", "Tự hé tai thỏ tóm tắt khi có thông báo mới"),
        quickCleanRow
      ),
      sectionLabel("HUD Hệ thống & Cảnh báo nhanh"),
      hudCard,
      sectionLabel("Giờ cầu nguyện"),
      card(
        selectRow("prayerCity", "Thành phố tính giờ", "Áp dụng cho trang Cầu nguyện (bật trang tại mục Hệ thống & Trang)", prayerCities),
        toggleRow("prayerReminder", "Thông báo khi đến giờ", "Đẩy nhắc nhở tự động theo từng mốc giờ"),
        toggleRow("prayerEarly", "Nhắc sớm 15 phút", "Báo chuẩn bị trước mỗi mốc giờ"),
        toggleRow("prayerSound", "Âm báo dịu nhẹ", "Phát chuông nhẹ khi đến giờ"),
        toggleRow("prayerPauseMedia", "Tạm dừng nhạc khi đến giờ", "Tự dừng nhạc đang phát khi đúng mốc cầu nguyện")
      )
    );
  },

  about(p) {
    const top = el("div", "about-top");
    top.innerHTML = `
      <div class="about-logo"><img src="robot-avatar-dark.svg" alt="Island Avatar" /></div>
      <div>
        <div class="about-name">Island 1.2.0</div>
        <div class="row-d">Dynamic Island + Desktop Shell Suite cho Windows · GPS Thời tiết &amp; AI Đa mô hình</div>
      </div>`;
    const info = el("div", "row");
    info.appendChild(rowText(
      "Tính năng tích hợp",
      "Dynamic Island (Viên thuốc Capsule Idle + 13 Pet + Lịch họp), Phổ nhạc FFT 16 dải + Aurora, Quick Panel (19 ô + Wi-Fi/BT/WMI/DDC Độ sáng), Quick Search (Apps/Files/Math/Clipboard Text+Ảnh+QR), Deck, Rail, Desktop Widgets, Scene Workspace, Gửi tệp Wi-Fi QR &amp; AI Streaming."
    ));

    const updCard = el("div", "card");
    const updRow = el("div", "row");
    updRow.appendChild(rowText("Kiểm tra cập nhật (GitHub)", "So sánh phiên bản hiện tại (1.2.0) với bản phát hành tham chiếu"));
    const btnChkUpd = el("button", "btn", "🔄 Kiểm tra ngay");
    const updBox = el("div", "update-box");
    btnChkUpd.addEventListener("click", async () => {
      btnChkUpd.disabled = true;
      btnChkUpd.textContent = "Đang kiểm tra...";
      const res = await invoke("check_app_update", { repo: "ThanhDuy-Dev2006/Island" }).catch(() => null);
      btnChkUpd.disabled = false;
      btnChkUpd.textContent = "🔄 Kiểm tra ngay";
      if (!res || res.error) {
        updBox.textContent = `Không kiểm tra được lúc này (${res?.error || "lỗi mạng"}).`;
        return;
      }
      updBox.innerHTML = `Phiên bản hiện tại: <b>${res.current}</b> · Upstream mới nhất: <b>${res.latest || "?"}</b><br/>${res.notes ? res.notes.slice(0, 180) : ""}`;
      if (res.page_url) {
        const lnk = el("span", "link", " Mở trang phát hành →");
        lnk.addEventListener("click", () => invoke("open_path_in_explorer", { path: res.page_url }).catch(() => {}));
        updBox.appendChild(lnk);
      }
    });
    updRow.appendChild(btnChkUpd);
    updCard.append(updRow, updBox);

    const credit = el("div", "row");
    credit.appendChild(rowText(
      "Kiến trúc & Quyền riêng tư",
      "Xử lý toàn bộ bằng Rust Win32/COM/WASAPI bản địa trên Windows; mọi dữ liệu cấu hình lưu cục bộ trên máy."
    ));

    const made = el("div", "row");
    made.appendChild(rowText("Nền tảng", "Island · Tauri v2 + Rust Win32 + WebView2"));

    const recoverRow = el("div", "row");
    recoverRow.appendChild(rowText("Khôi phục Taskbar & Cửa sổ", "Hiện lại thanh Taskbar Windows và đưa mọi cửa sổ Scene về vị trí bình thường"));
    const btnRecAll = el("button", "btn", "🛟 Khôi phục ngay");
    btnRecAll.addEventListener("click", async () => {
      set("hideTaskbar", false);
      set("enableScene", false);
      await invoke("set_taskbar_hidden", { hidden: false }).catch(() => {});
      await invoke("scene_unpark_all").catch(() => {});
      toast("Đã khôi phục Taskbar và toàn bộ cửa sổ!");
    });
    recoverRow.appendChild(btnRecAll);

    const exitRow = el("div", "row");
    exitRow.appendChild(rowText("Thoát ứng dụng", "Đóng hoàn toàn Island và cửa sổ cài đặt"));
    const ex = el("button", "btn danger", "Thoát Island");
    ex.addEventListener("click", () => invoke("exit_app").catch(() => {}));
    exitRow.appendChild(ex);

    p.append(card(top), updCard, sectionLabel("Chi tiết & Bản quyền"), card(info, credit, made), sectionLabel("An toàn & Ứng dụng"), card(recoverRow, exitRow));
  }
};

// ------------------------------------------------------------
// Lịch xem trước
// ------------------------------------------------------------
function buildCalendarPreview() {
  const wrap = el("div", "cal");
  const now = new Date();
  const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
  const wdSun = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const wds = S.weekMonday ? [...wdSun.slice(1), wdSun[0]] : wdSun;
  const startIdx = (d) => (S.weekMonday ? (d.getDay() + 6) % 7 : d.getDay());

  const hd = el("div", "cal-hd");
  hd.innerHTML = `<span>${S.calendarView === "week" ? "Tuần này" : monthNames[now.getMonth()]} ${now.getFullYear()}</span><span class="row-d">${S.calendarView === "week" ? "Xem theo tuần" : "Xem theo tháng"}</span>`;
  wrap.appendChild(hd);

  const grid = el("div", "cal-grid");
  wds.forEach((w) => grid.appendChild(el("div", "wd", w)));

  let start;
  let count;
  if (S.calendarView === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - startIdx(now));
    count = 7;
  } else {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    start = new Date(first);
    start.setDate(1 - startIdx(first));
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    count = Math.ceil((startIdx(first) + last.getDate()) / 7) * 7;
  }
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const c = el("div", "d", String(d.getDate()));
    if (d.getMonth() !== now.getMonth()) c.classList.add("mute");
    if (d.toDateString() === now.toDateString()) c.classList.add("today");
    grid.appendChild(c);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ------------------------------------------------------------
// Điều hướng & Tìm kiếm Toàn cục
// ------------------------------------------------------------
let navHistory = ["general"];
let navIdx = 0;

function updateNavHistButtons() {
  const bBack = document.getElementById("btnNavBack");
  const bFwd = document.getElementById("btnNavFwd");
  if (bBack) bBack.disabled = navIdx <= 0;
  if (bFwd) bFwd.disabled = navIdx >= navHistory.length - 1;
}

function navigateToPage(id, push = true) {
  const searchInp = document.getElementById("navSearchInput");
  if (searchInp && searchInp.value.trim()) {
    searchInp.value = "";
    document.getElementById("navSearchClear")?.classList.remove("show");
  }
  if (push && id !== currentPage) {
    navHistory = navHistory.slice(0, navIdx + 1);
    navHistory.push(id);
    navIdx = navHistory.length - 1;
  }
  currentPage = id;
  document.querySelectorAll(".nav-item").forEach((x) => x.classList.toggle("active", x.dataset.id === id));
  updateNavHistButtons();
  renderPage();
}

document.getElementById("btnNavBack")?.addEventListener("click", () => {
  if (navIdx > 0) {
    navIdx--;
    navigateToPage(navHistory[navIdx], false);
  }
});

document.getElementById("btnNavFwd")?.addEventListener("click", () => {
  if (navIdx < navHistory.length - 1) {
    navIdx++;
    navigateToPage(navHistory[navIdx], false);
  }
});

function navButton(pg) {
  const b = el("button", "nav-item" + (pg.id === currentPage ? " active" : ""));
  b.dataset.id = pg.id;
  b.innerHTML = `<span class="nav-ic" style="background:${pg.color}"><svg viewBox="0 0 16 16">${IC[pg.icon]}</svg></span><span class="nav-lbl">${pg.label}</span>`;
  b.addEventListener("click", () => navigateToPage(pg.id, pg.id !== currentPage));
  return b;
}

function renderNav() {
  const nav = document.getElementById("nav");
  const bottom = document.getElementById("navBottom");
  nav.innerHTML = "";
  bottom.innerHTML = "";
  PAGES.forEach((pg) => nav.appendChild(navButton(pg)));
  BOTTOM_PAGES.forEach((pg) => bottom.appendChild(navButton(pg)));
}

let searchRenderToken = 0;

async function renderGlobalSearch(rawQuery) {
  const token = ++searchRenderToken;
  const q = String(rawQuery || "").trim().toLowerCase();
  const scroller = document.getElementById("pageScroll");
  const keepScroll = scroller.dataset.page === "__search__" ? scroller.scrollTop : 0;
  scroller.dataset.page = "__search__";

  const old = document.getElementById("page");
  const page = el("div", "page");
  page.id = "page";
  page.style.animation = "none";

  const all = [...PAGES, ...BOTTOM_PAGES];
  let totalRowsMatched = 0;
  let totalPagesMatched = 0;

  for (const pg of all) {
    if (token !== searchRenderToken) return;
    const tmp = document.createElement("div");
    await RENDER[pg.id]?.(tmp);
    if (token !== searchRenderToken) return;

    const pageLabelMatches =
      pg.label.toLowerCase().includes(q) ||
      (pg.sub && pg.sub.toLowerCase().includes(q));

    const allRows = Array.from(tmp.querySelectorAll(".card > .row, .card > .about-top, .card > .gps-status-box, .card > .corner-grid > .corner-box, .card > .hotkey-grid > .hotkey-item"));
    const allChips = Array.from(tmp.querySelectorAll(".card .mini-toggle-chip"));
    const matchedRows = pageLabelMatches
      ? allRows
      : allRows.filter((r) => r.textContent.toLowerCase().includes(q));
    const matchedChips = pageLabelMatches
      ? allChips
      : allChips.filter((c) => c.textContent.toLowerCase().includes(q));

    const matchCount = matchedRows.length + matchedChips.length;
    if (matchCount === 0) continue;
    totalPagesMatched++;
    totalRowsMatched += matchCount;

    const hdr = el("div", "search-sec-hdr");
    hdr.appendChild(sectionLabel(`${pg.label} (${matchCount})`));
    const jumpBtn = el("button", "search-jump-btn", "Mở trang →");
    jumpBtn.addEventListener("click", () => {
      const searchInp = document.getElementById("navSearchInput");
      if (searchInp) searchInp.value = "";
      document.getElementById("navSearchClear")?.classList.remove("show");
      currentPage = pg.id;
      document.querySelectorAll(".nav-item").forEach((x) => x.classList.toggle("active", x.dataset.id === pg.id));
      renderPage();
    });
    hdr.appendChild(jumpBtn);

    const groupCard = el("div", "card");
    matchedRows.forEach((r) => groupCard.appendChild(r));
    if (matchedChips.length > 0) {
      const chipGrid = el("div", "pages-toggle-grid");
      matchedChips.forEach((c) => chipGrid.appendChild(c));
      groupCard.appendChild(chipGrid);
    }
    page.append(hdr, groupCard);
  }

  if (token !== searchRenderToken) return;

  document.getElementById("pageTitle").textContent = `Tìm kiếm: "${rawQuery.trim()}"`;
  const subEl = document.getElementById("pageSubTitle");
  if (subEl) {
    subEl.textContent = totalRowsMatched > 0
      ? `Tìm thấy ${totalRowsMatched} tùy chọn phù hợp trong ${totalPagesMatched} danh mục`
      : "Không có tùy chọn nào khớp với từ khóa tìm kiếm";
  }

  if (totalRowsMatched === 0) {
    const empty = el("div", "search-empty-state");
    empty.innerHTML = `<b>Không tìm thấy kết quả cho "${rawQuery.trim().replace(/[<>&"]/g, "")}"</b>Thử tìm: GPS, mô hình AI, tư duy, thú cưng, kính mờ, pomodoro, uống nước, màn hình...`;
    page.appendChild(empty);
  }

  old.replaceWith(page);
  scroller.scrollTop = keepScroll;
}

async function renderPage() {
  const searchInp = document.getElementById("navSearchInput");
  const activeQuery = searchInp ? searchInp.value.trim() : "";
  if (activeQuery) {
    return renderGlobalSearch(activeQuery);
  }

  const all = [...PAGES, ...BOTTOM_PAGES];
  const pg = all.find((x) => x.id === currentPage) || PAGES[0];
  document.getElementById("pageTitle").textContent = pg.label;
  const subEl = document.getElementById("pageSubTitle");
  if (subEl) {
    subEl.textContent = pg.sub || "Tùy chỉnh cá nhân hóa & đồng bộ tức thì";
  }

  const scroller = document.getElementById("pageScroll");
  const keepScroll = scroller.dataset.page === pg.id ? scroller.scrollTop : 0;
  scroller.dataset.page = pg.id;

  const old = document.getElementById("page");
  const page = el("div", "page");
  page.id = "page";
  if (keepScroll) page.style.animation = "none";
  old.replaceWith(page);
  await RENDER[pg.id]?.(page);
  scroller.scrollTop = keepScroll;
}

const navSearchEl = document.getElementById("navSearchInput");
const navSearchClearEl = document.getElementById("navSearchClear");
let searchDebounceTimer = null;

if (navSearchEl) {
  navSearchEl.addEventListener("input", () => {
    const q = navSearchEl.value.trim();
    navSearchClearEl?.classList.toggle("show", q.length > 0);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderPage();
    }, q ? 90 : 0);
  });
}

if (navSearchClearEl) {
  navSearchClearEl.addEventListener("click", () => {
    if (navSearchEl) {
      navSearchEl.value = "";
      navSearchEl.focus();
    }
    navSearchClearEl.classList.remove("show");
    renderPage();
  });
}

// ------------------------------------------------------------
// Khởi tạo & Phím tắt
// ------------------------------------------------------------
async function closeSettingsSafely() {
  await flushPendingSave();
  await invoke("close_settings_window").catch(() => {});
  if (curWin) curWin.hide().catch(() => {});
}

document.getElementById("btnWinClose").addEventListener("click", closeSettingsSafely);

document.addEventListener("keydown", async (e) => {
  if (e.altKey && e.key === "ArrowLeft") {
    e.preventDefault();
    document.getElementById("btnNavBack")?.click();
    return;
  }
  if (e.altKey && e.key === "ArrowRight") {
    e.preventDefault();
    document.getElementById("btnNavFwd")?.click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    navSearchEl?.focus();
    navSearchEl?.select();
    return;
  }
  if (e.key === "Escape") {
    if (navSearchEl && navSearchEl.value.trim()) {
      navSearchEl.value = "";
      navSearchClearEl?.classList.remove("show");
      renderPage();
      return;
    }
    await closeSettingsSafely();
  }
});

window.addEventListener("beforeunload", () => {
  if (hasPendingSave) writeSettingsToDisk();
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

(async function init() {
  try {
    const raw = await invoke("load_data_file", { filename: "settings.txt" });
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(S, parsed);
      if (!parsed._v127AutoGpsAndAiMigrated) {
        S.weatherCity = "Auto";
        if (!parsed.aiModel || String(parsed.aiModel).startsWith("ag/gemini-3.8-flash")) {
          S.aiModel = "ag/gemini-3.8-flash";
        }
        if (!parsed.aiThinkingLevel) S.aiThinkingLevel = "high";
        S._v127AutoGpsAndAiMigrated = true;
      }
    }
  } catch (_) {}
  try {
    const rawWth = await invoke("load_data_file", { filename: "weather.txt" });
    if (rawWth && rawWth.trim().startsWith("{")) {
      const parsed = JSON.parse(rawWth);
      if (parsed && typeof parsed === "object") Object.assign(weatherInfo, parsed);
    }
  } catch (_) {}
  try {
    S.autostart = !!(await invoke("get_autostart_status"));
  } catch (_) {}
  try {
    const gtSt = await invoke("google_tasks_get_status");
    if (gtSt && typeof gtSt === "object") googleTasksStatus = gtSt;
  } catch (_) {}

  // Đồng bộ từ tai thỏ
  await listen("island-google-tasks-auth", (e) => {
    if (e.payload && typeof e.payload === "object") {
      googleTasksStatus = e.payload;
      if (currentPage === "productivity" || (navSearchEl && navSearchEl.value.trim())) renderPage();
    }
  });

  await listen("island-settings-sync", (e) => {
    if (e.payload?.settings) {
      Object.assign(S, e.payload.settings);
      applySettingsWindowTheme();
    }
    if (e.payload?.water) waterToday = e.payload.water;
    if (e.payload?.weather) Object.assign(weatherInfo, e.payload.weather);
    const searchActive = !!(navSearchEl && navSearchEl.value.trim());
    if (searchActive || ["general", "appearance", "pet", "weather", "ai", "productivity", "utilities"].includes(currentPage)) {
      renderPage();
    }
  });

  await listen("island-file-changed", (e) => {
    if (isSavingFromHere) return;
    const fn = e.payload?.filename;
    const content = e.payload?.content;
    if (!content) return;
    try {
      if (fn === "settings.txt") {
        Object.assign(S, JSON.parse(content));
        applySettingsWindowTheme();
        renderPage();
      } else if (fn === "water.txt") {
        const w = JSON.parse(content);
        if (typeof w.intakeMl === "number") waterToday.intakeMl = w.intakeMl;
        if (typeof w.goalMl === "number") waterToday.goalMl = w.goalMl;
        if (currentPage === "productivity") renderPage();
      } else if (fn === "weather.txt") {
        const wth = JSON.parse(content);
        if (wth && typeof wth === "object") {
          Object.assign(weatherInfo, wth);
          if (currentPage === "weather") renderPage();
        }
      }
    } catch (_) {}
  });

  applySettingsWindowTheme();
  renderNav();
  updateNavHistButtons();
  renderPage();
  emit("island-request-state", {}).catch(() => {});
})();
