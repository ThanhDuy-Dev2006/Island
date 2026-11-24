// ============================================================
// ISLAND - BẢN TIẾNG VIỆT TỐI ƯU HÓA 120FPS
// ============================================================

const invoke = window.__TAURI__?.core?.invoke || (async () => ({}));
const listen = window.__TAURI__?.event?.listen || (async () => () => {});
const emit = window.__TAURI__?.event?.emit || (async () => {});

function resolveMyWindowLabel() {
  try {
    const q = new URLSearchParams(window.location.search).get("label");
    if (q) return q;
  } catch (_) {}
  try {
    const l =
      window.__TAURI__?.window?.getCurrentWindow?.()?.label ||
      window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.()?.label;
    if (l) return l;
  } catch (_) {}
  return "main";
}

let myWindowLabel = resolveMyWindowLabel();

const ALL_PAGES = ["music", "today", "weather", "widgets", "pomo", "water", "shelf", "todo", "prayer", "ai"];
const PAGE_LAYER_MAP = {
  music: ".l-music",
  today: ".l-today",
  weather: ".l-weather",
  widgets: ".l-widgets",
  pomo: ".l-pomo",
  water: ".l-water",
  shelf: ".l-shelf",
  todo: ".l-todo",
  prayer: ".l-prayer",
  ai: ".l-ai"
};

function getActivePages() {
  const active = ALL_PAGES.filter((p) => settings[`${p}Page`] !== false);
  return active.length > 0 ? active : ["music"];
}

function todayIsoKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let currentPage = "music";
let isExpanded = false;
let isPinned = false;
let hoverCloseTimer = null;
let peekReturnTimer = null;
let isDomMouseInside = false;
let hoverCollapseRetries = 0;

// Cấu hình đầy đủ Island 1.2.0
let settings = {
  // Chung
  autostart: false,
  scale: "auto",
  minimal: false,
  mascot: true,
  sounds: true,
  alarmStyle: "alarm",
  alarmDuration: 10,
  hideFullscreen: true,
  statusRing: "auto", // "auto" (pin) | "water" | "todo" | "off"
  // Màn hình
  monitorMode: "single",
  monitor: null,
  // Giao diện & Tai thỏ (Island 1.2.0 - Mặc định dính sát mép trên + Tự động đổi Theme theo Thời tiết)
  notchStyle: "classic", // "classic" | "floating"
  themePreset: "auto", // "auto" | "island" | "obsidian" | "aurora" | "nebula" | "emerald" | "rose" | "ocean" | "sunset" | "crimson" | "gold"
  glass: false,
  glassTint: 78,
  openMode: "hover",
  pageIcons: true,
  fastAnim: false,
  restStyle: "pet",
  petType: "aura",
  petMinimalFace: false,
  petGlowColor: "island", // "island" | "cyber" | "nebula" | "emerald" | "sunset" | "rose" | "off"
  petEyeSize: "normal", // "small" | "normal" | "large"
  petEyeColor: "auto", // "auto" | "white" | "cyan" | "violet" | "gold" | "pink" | "emerald"
  petAutoSleep: false,
  // Bật / Tắt hiển thị từng trang trên Dynamic Island
  musicPage: true,
  todayPage: true,
  weatherPage: true,
  widgetsPage: true,
  pomoPage: true,
  waterPage: true,
  shelfPage: true,
  todoPage: true,
  prayerPage: false, // Mặc định ẩn Giờ cầu nguyện theo yêu cầu
  aiPage: true,
  // Thời tiết trực tiếp & Dự báo + 12 Chủ đề Bầu trời Thời tiết (Weather - Island 1.2.0)
  weatherHeaderBadge: true,
  weatherCity: "Auto",
  weatherUnit: "C", // "C" | "F"
  weatherForecastMode: "hourly", // "hourly" | "rain" | "daily"
  weatherTheme: "auto", // "auto" | "sunny_gold" | "rain_neon" | "thunder_storm" | "starry_night" | "aurora_sky" | "sunset_beach" | "snow_winter" | "sakura_breeze" | "cyber_weather" | "emerald_forest" | "cloudy_mist" | "obsidian_minimal"
  weatherAlert: true,
  // Nhạc & lời
  albumGlow: true,
  lyrics: true,
  showRemaining: false,
  // Hôm nay & Thông báo (Island 1.2.0)
  notifications: true,
  notificationPreview: true,
  todoOrdered: true,
  // Tiện ích Đôi (Widgets - Island 1.2.0)
  widgetLeft: "this_week",
  widgetRight: "battery",
  widgetCity1: "Hà Nội",
  widgetCity2: "TP.HCM",
  widgetEvent: "new_year",
  // Việc cần làm & Đồng bộ Google Tasks
  todoStart: true,
  todoEnd: true,
  snoozeMin: 10,
  googleClientId: "",
  googleClientSecret: "",
  // Lịch
  weekMonday: true,
  calendarView: "month",
  // Pomodoro
  pomoFocus: 25,
  pomoShort: 5,
  pomoLong: 15,
  pomoAutoLong: true,
  // Uống nước
  waterRemind: true,
  waterGoal: 2000,
  waterBottle: 250,
  waterFrom: 8,
  waterTo: 22,
  waterInterval: 0,
  // Khay tệp & Clipboard (Island 1.2.0)
  shelfClear: false,
  clipboard: true,
  clipboardMax: 50,
  clipboardKeep: true,
  // Giờ cầu nguyện (Prayer - Island 1.2.0)
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
  // HUD & thông báo
  hudVolume: true,
  hudBrightness: true,
  hudCaps: true,
  hudLanguage: true,
  popupBattery: true,
  popupWifi: true,
  popupBluetooth: true,
  // Tính năng mở rộng
  visualizerStyle: "bars", // "bars" | "spectrum" | "wave" | "dots"
  musicAurora: true,
  uiFont: "default", // "default" | "inter" | "bahnschrift" | "mono"
  hoverOpenSensitivity: "quick", // "quick" | "normal" | "relaxed"
  floatingTopGap: 6,
  pomoAutoBreak: true,
  privacyIndicator: true,
  popupDownloads: true,
  // Trợ lý AI Copilot
  aiProvider: "gateway",
  aiEndpoint: "",
  geminiApiKey: "",
  aiModel: "ag/gemini-3.8-flash",
  aiThinkingLevel: "high",
  aiSystemPrompt: "Bạn là Island AI Assistant - một trợ lý thông minh trên Desktop Windows. Hãy trả lời ngắn gọn, chuẩn xác, súc tích bằng tiếng Việt.",
  aiWidth: 520,
  aiHeight: 220,
  // Hiệu năng & Trải nghiệm tương tác
  hoverCloseDelay: 240,
  miniLyricsBar: true,
  perfMode: "balanced",
  reduceEffects: false,
  autoTrimMemory: true,
  globalHotkeys: true,
  audioVisualizer: true,
  aiStream: true,
  aiSaveHistory: true,
  liveActivity: true,
  // Giao diện tổng thể & Chủ đề
  colorMode: "dark", // "dark" | "light" | "auto"
  accentColor: "auto", // "auto" | "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber" | "green" | "teal" | "cyan" | "slate"
  // Viên thuốc (Capsule Idle) & Lịch họp Windows
  capsuleLeft: "clock", // "clock" | "date" | "media" | "sys" | "off"
  capsuleRight: "weather", // "weather" | "battery" | "meeting" | "pomo" | "sys" | "off"
  capsuleEdgeGlow: true,
  calendarCompanion: true,
  suppressNativeOsd: false,
  // Hệ sinh thái Desktop Shell (mặc định an toàn, người dùng tự bật)
  enableIsland: true,
  enableDeck: false,
  deckBehavior: "overlay", // "fixed" | "overlay" | "smart"
  deckSize: 48,
  deckMagnify: true,
  deckShowRecents: true,
  deckShowDownloads: true,
  deckShowTrash: true,
  hideTaskbar: false,
  enableRail: false,
  railBehavior: "overlay", // "fixed" | "overlay" | "smart"
  railShowAppMenu: true,
  railShowWifi: true,
  railShowBattery: true,
  railShowClock: true,
  enableWidgets: false,
  widgetsStyle: "original", // "original" | "crystal"
  widgetsTopmost: false,
  enableScene: false,
  // Phím tắt & Góc nóng (Hot Corners)
  macShortcuts: false,
  hotCornerTL: "none",
  hotCornerTR: "none",
  hotCornerBL: "none",
  hotCornerBR: "none"
};

// Thông số hệ thống đọc từ nhân Rust Win32
let sysStats = {
  cpuPct: 0,
  ramPct: 0,
  ramUsedGb: "0.0",
  ramTotalGb: "0.0",
  netDownKbps: 0,
  netUpKbps: 0
};

// Khởi tạo sớm toàn bộ trạng thái để tránh lỗi Temporal Dead Zone (TDZ)
let isAiResizing = false;
let mediaState = {
  hasSession: false,
  playing: false,
  title: "",
  artist: "",
  album: "",
  sourceApp: "",
  pos: 0,
  dur: 0,
  thumb: ""
};

let focusData = {
  date: todayIsoKey(),
  minutesToday: 0,
  sessionsToday: 0,
  history: {},
  category: "work",
  activeSession: null
};

let activeDownloadState = null;
let activeSendProgress = null;
let hoverOpenTimer = null;
let prevCamActive = false;
let prevMicActive = false;
let privacyPollSeen = false;

let waterData = {
  date: new Date().toDateString(),
  intakeMl: 0,
  goalMl: 1500,
  reminderOn: true,
  intervalMin: 30,
  hourly: [0, 0, 0, 0, 0, 0, 0, 0],
  history: {}
};

let shelfItems = [];
let shelfActiveTab = "files"; // "files" | "clip"
let clipboardItems = [];

let todoList = [
  { text: "Bật nhạc trên YouTube để thử đồng bộ", done: false },
  { text: "Kéo thả tệp bất kỳ vào tai thỏ", done: false },
  { text: "Uống đủ nước mỗi ngày cùng Island", done: true }
];

let pendingDeletedGoogleIds = [];
try {
  const rawDel = localStorage.getItem("island_gtasks_deleted");
  if (rawDel) {
    const parsedDel = JSON.parse(rawDel);
    if (Array.isArray(parsedDel)) pendingDeletedGoogleIds = parsedDel.filter(Boolean);
  }
} catch (_) {}
let googleTasksStatus = {
  connected: false,
  email: "",
  last_sync: "",
  has_default_creds: true,
  client_id: ""
};
let isGoogleTasksSyncing = false;
let googleSyncDebounceTimer = null;
let isSavingTodoFromMain = false;

let notifList = [
  { icon: "✨", title: "Chào mừng đến với Island 1.2.0", sub: "Tai thỏ thông minh đã sẵn sàng đồng hành cùng bạn", time: "Hôm nay" }
];
let unreadNotifCount = 0;

let weatherData = {
  city: "Định vị GPS",
  fullAddress: "",
  locSource: "",
  lat: 21.0285,
  lon: 105.8542,
  tempC: 28,
  feelsLikeC: 30,
  highC: 31,
  lowC: 24,
  humidity: 68,
  windKmh: 11,
  uvIndex: 5,
  sunrise: "05:36",
  sunset: "17:42",
  wmoCode: 1,
  isDay: 1,
  hourly: [
    { label: "Bây giờ", icon: "⛅", tempC: 28, rainPct: 12, uv: 5 },
    { label: "+2g", icon: "⛅", tempC: 29, rainPct: 18, uv: 6 },
    { label: "+4g", icon: "☀️", tempC: 31, rainPct: 10, uv: 7 },
    { label: "+6g", icon: "⛅", tempC: 29, rainPct: 25, uv: 4 },
    { label: "+8g", icon: "🌤️", tempC: 27, rainPct: 30, uv: 1 },
    { label: "+10g", icon: "🌙", tempC: 25, rainPct: 15, uv: 0 }
  ],
  daily: [
    { label: "Hôm nay", icon: "⛅", tempC: 31, lowC: 24, rainPct: 20 },
    { label: "Ngày mai", icon: "☀️", tempC: 32, lowC: 25, rainPct: 10 },
    { label: "Kia", icon: "🌦️", tempC: 29, lowC: 23, rainPct: 65 },
    { label: "+3 ngày", icon: "⛅", tempC: 30, lowC: 24, rainPct: 25 },
    { label: "+4 ngày", icon: "☀️", tempC: 31, lowC: 25, rainPct: 15 }
  ],
  updatedAt: 0,
  loading: false
};

const WEATHER_LOCATIONS = {
  "Auto": { label: "Tự động (GPS)", lat: 21.0285, lon: 105.8542, auto: true },
  "Hà Nội": { label: "Hà Nội", lat: 21.0285, lon: 105.8542 },
  "TP.HCM": { label: "TP.HCM", lat: 10.8231, lon: 106.6297 },
  "Đà Nẵng": { label: "Đà Nẵng", lat: 16.0544, lon: 108.2022 },
  "Hải Phòng": { label: "Hải Phòng", lat: 20.8449, lon: 106.6881 },
  "Cần Thơ": { label: "Cần Thơ", lat: 10.0452, lon: 105.7469 },
  "Huế": { label: "Huế", lat: 16.4637, lon: 107.5909 },
  "Nha Trang": { label: "Nha Trang", lat: 12.2388, lon: 109.1967 },
  "Đà Lạt": { label: "Đà Lạt", lat: 11.9404, lon: 108.4583 },
  "Vũng Tàu": { label: "Vũng Tàu", lat: 10.3460, lon: 107.0843 },
  "Quy Nhơn": { label: "Quy Nhơn", lat: 13.7829, lon: 109.2196 },
  "Hạ Long": { label: "Hạ Long", lat: 20.9599, lon: 107.0425 },
  "Sa Pa": { label: "Sa Pa", lat: 22.3364, lon: 103.8438 },
  "Phú Quốc": { label: "Phú Quốc", lat: 10.2899, lon: 103.9840 },
  "Tokyo": { label: "Tokyo", lat: 35.6762, lon: 139.6503 },
  "Seoul": { label: "Seoul", lat: 37.5665, lon: 126.9780 },
  "Singapore": { label: "Singapore", lat: 1.3521, lon: 103.8198 }
};

const WIDGET_TYPES = [
  "this_week",
  "weather",
  "system_monitor",
  "water",
  "focus_today",
  "world_clock",
  "battery",
  "moon",
  "countdown",
  "next_prayer"
];

const WORLD_CITIES = {
  "Hà Nội": { tz: "Asia/Ho_Chi_Minh", label: "🇻🇳 Hà Nội (VN)" },
  "TP.HCM": { tz: "Asia/Ho_Chi_Minh", label: "🇻🇳 TP.HCM (VN)" },
  "Đà Nẵng": { tz: "Asia/Ho_Chi_Minh", label: "🇻🇳 Đà Nẵng (VN)" },
  "Tokyo": { tz: "Asia/Tokyo", label: "🇯🇵 Tokyo" },
  "Seoul": { tz: "Asia/Seoul", label: "🇰🇷 Seoul" },
  "Singapore": { tz: "Asia/Singapore", label: "🇸🇬 Singapore" },
  "London": { tz: "Europe/London", label: "🇬🇧 London" },
  "Paris": { tz: "Europe/Paris", label: "🇫🇷 Paris" },
  "New York": { tz: "America/New_York", label: "🇺🇸 New York" },
  "Sydney": { tz: "Australia/Sydney", label: "🇦🇺 Sydney" },
  "Mecca": { tz: "Asia/Riyadh", label: "🇸🇦 Mecca" }
};

const COUNTDOWN_EVENTS = {
  new_year: { name: "Tết Dương Lịch", icon: "🎆", month: 1, day: 1 },
  tet_am: { name: "Tết Nguyên Đán", icon: "🧧", month: 2, day: 17 },
  valentine: { name: "Lễ Tình Nhân 14/2", icon: "💖", month: 2, day: 14 },
  quoc_khanh: { name: "Quốc Khánh 2/9", icon: "🇻🇳", month: 9, day: 2 },
  christmas: { name: "Giáng Sinh 25/12", icon: "🎄", month: 12, day: 25 }
};

const PRAYER_CITY_OFFSETS = {
  "Hà Nội": { subuh: 292, dzuhur: 728, ashar: 938, maghrib: 1098, isya: 1168 },
  "TP.HCM": { subuh: 296, dzuhur: 722, ashar: 930, maghrib: 1092, isya: 1162 },
  "Đà Nẵng": { subuh: 290, dzuhur: 718, ashar: 928, maghrib: 1088, isya: 1158 },
  "Jakarta": { subuh: 282, dzuhur: 716, ashar: 924, maghrib: 1082, isya: 1152 },
  "Kuala Lumpur": { subuh: 348, dzuhur: 794, ashar: 1002, maghrib: 1162, isya: 1232 },
  "Mecca": { subuh: 304, dzuhur: 742, ashar: 952, maghrib: 1112, isya: 1202 },
  "Tokyo": { subuh: 265, dzuhur: 705, ashar: 915, maghrib: 1075, isya: 1145 }
};

function getEffectiveScale() {
  if (settings.scale === "auto") {
    return 1.15;
  }
  const n = parseFloat(settings.scale);
  return !isNaN(n) && n > 0 ? n : 1.15;
}

const mn = document.getElementById("mn");

// Khởi tạo tập trung toàn bộ DOM refs, hằng số & state cấp module để triệt tiêu hoàn toàn lỗi TDZ
const mascotEyes = document.getElementById("mascotEyes");
const miniPetWidget = document.getElementById("miniPetWidget");
const miniPetFace = document.getElementById("miniPetFace");
const miniPetEmote = document.getElementById("miniPetEmote");
const petEmoteFull = document.getElementById("petEmoteFull");
const hdrPetBtn = document.getElementById("hdrPetBtn");
const hdrPetHeart = document.getElementById("hdrPetHeart");
const petBubbleFull = document.getElementById("petBubbleFull");
const petBubbleMini = document.getElementById("petBubbleMini");
const hdrPetBubble = document.getElementById("hdrPetBubble");
const hdrLivePet = document.getElementById("hdrLivePet");
const hdrPetFace = document.getElementById("hdrPetFace");

const PET_PROFILES = {
  aura: {
    name: "Mắt Tinh Linh Island",
    avatar: "pet-aura.svg",
    idleEmotes: ["✦", "✨", "♡"],
    loveEmote: "✨",
    phrases: ["Đôi mắt tinh linh luôn dõi theo bạn ✨", "Cực quang xanh tím lung linh~ ✦", "Chúc bạn một ngày tràn đầy năng lượng! 💙"]
  },
  bot: {
    name: "Robot Cyber",
    avatar: "robot-avatar-dark.svg",
    idleEmotes: ["⚡", "✦", "🤖"],
    loveEmote: "⚡",
    phrases: ["Bíp bíp! Đầy năng lượng ⚡", "Hệ thống vui vẻ 100%! 🤖", "Thích được xoa đầu quá~ ✦"]
  },
  island: {
    name: "Tinh Linh Island",
    avatar: "pet-island.svg",
    idleEmotes: ["✦", "♡", "✨"],
    loveEmote: "💖",
    phrases: ["Hehe thích quá đi! 💖", "Chúc bạn ngày tuyệt vời! ✨", "Tinh linh luôn bên bạn~ ✦"]
  },
  cat: {
    name: "Mèo Đêm Neko",
    avatar: "pet-cat.svg",
    idleEmotes: ["🐾", "🐟", "♡"],
    loveEmote: "😻",
    phrases: ["Meo meo~ Gừ gừ 🐾", "Cho xin miếng cá đi~ 🐟", "Xoa đầu nữa đi mà 😻"]
  },
  bunny: {
    name: "Thỏ Tuyết Mochi",
    avatar: "pet-bunny.svg",
    idleEmotes: ["🥕", "🌸", "♡"],
    loveEmote: "🌸",
    phrases: ["Măm măm cà rốt! 🥕", "Mềm mịn như bánh Mochi 🌸", "Nhảy tưng tưng vui quá~ ♡"]
  },
  fox: {
    name: "Cáo Lửa Kitsune",
    avatar: "pet-fox.svg",
    idleEmotes: ["🦊", "🍁", "✨"],
    loveEmote: "🔥",
    phrases: ["Kon kon~ Cáo lửa đây! 🦊", "Ấm áp quá đi thôi 🔥", "Đuôi bông xù thích ghê~ ✨"]
  },
  dragon: {
    name: "Rồng Ngọc Ruri",
    avatar: "pet-dragon.svg",
    idleEmotes: ["💎", "✨", "🐉"],
    loveEmote: "💎",
    phrases: ["Gào nhẹ~ Ngập tràn bảo ngọc 💎", "Bay lượn cùng bạn! 🐉", "Vảy ngọc lấp lánh quá~ ✨"]
  },
  panda: {
    name: "Gấu Trúc Bambu",
    avatar: "pet-panda.svg",
    idleEmotes: ["🎋", "🐼", "🍃"],
    loveEmote: "🎋",
    phrases: ["Ngoàm ngoàm mầm trúc~ 🎋", "Lăn tròn dễ thương 🐼", "Thư giãn tuyệt vời~ 🍃"]
  },
  shiba: {
    name: "Cún Vàng Shiba",
    avatar: "pet-shiba.svg",
    idleEmotes: ["🦴", "🐾", "🐕"],
    loveEmote: "🦴",
    phrases: ["Gâu gâu! Vẫy đuôi tít mù 🐕", "Thưởng xương cho Shiba nhé! 🦴", "Cún ngoan số 1 đây~ 🐾"]
  },
  axolotl: {
    name: "Kỳ Nhông Axolotl",
    avatar: "pet-axolotl.svg",
    idleEmotes: ["🫧", "🌸", "💧"],
    loveEmote: "🫧",
    phrases: ["Bong bóng nước mát lạnh~ 🫧", "Bơi lội tung tăng! 🌸", "Cười tươi suốt ngày~ 💧"]
  },
  owl: {
    name: "Cú Đêm Ngân Hà",
    avatar: "pet-owl.svg",
    idleEmotes: ["🦉", "🌙", "⭐"],
    loveEmote: "🌙",
    phrases: ["Cú cú~ Thông thái suốt đêm 🦉", "Ngắm sao ngân hà cùng bạn ⭐", "Ánh trăng dịu nhẹ quá~ 🌙"]
  },
  penguin: {
    name: "Cánh Cụt Tuyết Pingu",
    avatar: "pet-penguin.svg",
    idleEmotes: ["❄️", "🐧", "🐟"],
    loveEmote: "❄️",
    phrases: ["Lạch bạch trên băng tuyết~ 🐧", "Mát lạnh sảng khoái! ❄️", "Đội mũ len ấm áp ghê~ 🐟"]
  },
  unicorn: {
    name: "Kỳ Lân Cầu Vồng",
    avatar: "pet-unicorn.svg",
    idleEmotes: ["🌈", "🦄", "✨"],
    loveEmote: "🌈",
    phrases: ["Phép thuật cầu vồng lấp lánh! 🌈", "Biến mọi ước mơ thành thật 🦄", "Sừng pha lê tỏa sáng~ ✨"]
  }
};
const PET_KEYS = Object.keys(PET_PROFILES);

let idleTicks = 0;
let activeTempMood = "";
let activeMoodUntil = 0;
let moodRestoreTimer = null;
let bubbleHideTimer = null;
let petClickCombo = 0;
let lastPetClickTime = 0;
let isSystemCharging = false;
let lastBubbleText = "";
let lastBubbleUntil = 0;
const fxPools = [];
const MOOD_FX = {
  love: ["💖", "💕", "💗"],
  starry: ["✦", "✨", "✦"],
  happy: ["✨", "♡"],
  angry: ["💢", "💢"],
  cry: ["💧", "💧"],
  thirsty: ["💧", "💧"],
  pat: ["💕", "♡", "💕"],
  eating: ["🍪", "✨", "🍪"],
  charging: ["⚡", "⚡"],
  surprised: ["❗"],
  dizzy: ["💫", "💫"]
};
let lastCursorTrackAt = 0;
let lastMouseX = null;
let lastMoveDir = 0;
let shakeReversals = 0;
let firstShakeAt = 0;
const PAT_PHRASES = ["Ưm~ xoa đầu thích quá 😌", "Nữa đi nữa đi~ 💕", "Dễ chịu ghê~ ˘◡˘", "Mình thích bạn lắm đó 💕"];
let pokeCount = 0;
let pokeLast = 0;
let petDragMoved = false;
let petDrag = null;
let patDist = 0;
let patLastX = null;
let patLastT = 0;
let patCooldownUntil = 0;

// Đồng hồ, Pin & HUD
const DAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
let lastClockStr = "";
let lastBattAlertLevel = "none";
let sysVolumePct = 50;
let sysVolumeMuted = false;
let lastHudTime = 0;

// Nhạc & Lời bài hát
let showRemainingMode = false;
let lastFetchedSongKey = "";
let lastThumbSongKey = "";
let lastRenderedThumb = null;
let lastRenderedPlayState = null;
let parsedLyrics = [];
let activeLyricIdx = -1;
const PLAY_SVG_PATH = '<path d="M7 5v14l12-7z"/>';
const PAUSE_SVG_PATH = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
let currentLyricsSource = "";
let lastMiniLyrText = "";
let cachedLineOverflow = 0;
let lastFetchedSongDur = 0;
let isPollingMedia = false;
let mediaToggleHoldUntil = 0;
let mediaPollTimer = null;
let lastMediaTickMs = performance.now();
let currentLyricsFetchToken = 0;

// Pomodoro
let pomoDefaultSec = 25 * 60;
let pomoTotalSec = 25 * 60;
let pomoRemSec = 25 * 60;
let pomoRunning = false;
let pomoIsBreak = false;
let pomoModeText = "Thời gian tập trung · 25 phút";
let pomoInterval = null;
let pomoCompletedCount = 0;

// Uống nước
const WATER_GOALS = [1500, 2000, 2500, 3000];
const WATER_INTERVALS = [15, 30, 45, 60, 1];
let waterResetConfirmTimer = null;
let waterResetArmed = false;
let waterCountdownSec = waterData.intervalMin * 60;
let chartBarEls = [];

// Khay tệp & Clipboard
const shCv = document.getElementById("shCv");
const sc = shCv ? shCv.getContext("2d") : null;
const PAL = [[40, 170, 240], [52, 104, 236], [104, 78, 222]];
const SH_SPEED = 0.75;
let shHov = 0, shHv = 0, shDropT = -1, shDx = 210, shCx = 210, shG = 0, shGv = 0, shHot = false, shLast = 0, shRaf = 0;
const shCl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const shSm = (x) => { x = shCl(x); return x * x * (3 - 2 * x); };
const shRgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const shelfLayer = document.getElementById("shelfLayer");
const shelfCardsRow = document.getElementById("shelfCardsRow");
let clipSearchQuery = "";

// Cài đặt, AI, Cầu nguyện & Thời tiết
let isSavingSettingsFromMain = false;
const ISLAND_THEME_PRESETS = [
  { id: "auto", name: "🌦️ Tự động theo Thời tiết hiện tại (Auto Live Weather)" },
  { id: "island", name: "Island Original (Xanh Lam · Tím Neon)" },
  { id: "obsidian", name: "Obsidian Dark (Đen Tuyền Nguyên Bản)" },
  { id: "prism", name: "Prism Glass (Kính Sáng Pha Lê)" },
  { id: "neon", name: "Neon Pulse (Viền Sáng Cyber)" },
  { id: "aurora", name: "Aurora Teal (Cực Quang Ngọc Bích)" },
  { id: "nebula", name: "Violet Nebula (Tinh Vân Tím)" },
  { id: "emerald", name: "Emerald Mint (Ngọc Lục Bảo)" },
  { id: "rose", name: "Rose Sakura (Hồng Anh Đào)" },
  { id: "ocean", name: "Ocean Horizon (Đại Dương Xanh)" },
  { id: "sunset", name: "Sunset Amber (Hoàng Hôn Cam)" },
  { id: "crimson", name: "Crimson Cyber (Đỏ Neon Cyber)" },
  { id: "gold", name: "Royal Gold (Vàng Hoàng Gia)" },
  { id: "stealth", name: "Stealth Black (Đen Nhám Tối Giản)" },
  { id: "pixel", name: "Pixel Retro (Góc Vuông Monospace)" }
];
let aiAttachments = [];
const AI_THINKING_LEVELS = {
  fast: { label: "⚡ Nhanh", desc: "Phản hồi tức thì" },
  low: { label: "💡 Thấp", desc: "Suy luận nhẹ" },
  medium: { label: "⚖️ Vừa", desc: "Tư duy cân bằng" },
  high: { label: "🧠 Sâu", desc: "Tư duy tối đa" }
};
const AI_THINKING_ORDER = ["fast", "low", "medium", "high"];
let aiChatHistory = [];
let aiActiveStream = null;
let aiReqSeq = 0;
let lastPrayerNotifiedKey = "";
let lastWeatherAlertKey = "";
let weatherFetchInFlight = false;
const WEATHER_THEME_PRESETS = [
  { id: "auto", short: "🔄 Tự động", name: "Tự động theo thời tiết thật", c1: "#38bdf8", c2: "#fbbf24", c3: "#818cf8" },
  { id: "sunny_gold", short: "☀️ Nắng Vàng", name: "Nắng Vàng Rực Rỡ (Sunny Gold)", c1: "#fbbf24", c2: "#f97316", c3: "#38bdf8" },
  { id: "rain_neon", short: "🌧️ Mưa Đêm", name: "Mưa Đêm Sài Gòn (Neon Rain)", c1: "#38bdf8", c2: "#2563eb", c3: "#818cf8" },
  { id: "thunder_storm", short: "⛈️ Giông Bão", name: "Giông Bão Sấm Sét (Thunderstorm)", c1: "#c084fc", c2: "#6366f1", c3: "#0ea5e9" },
  { id: "starry_night", short: "🌌 Đêm Sao", name: "Đêm Sao Ngân Hà (Starry Galaxy)", c1: "#818cf8", c2: "#c084fc", c3: "#f472b6" },
  { id: "aurora_sky", short: "✨ Cực Quang", name: "Cực Quang Bắc Cực (Aurora Borealis)", c1: "#00f5d4", c2: "#06b6d4", c3: "#a855f7" },
  { id: "sunset_beach", short: "🌇 Hoàng Hôn", name: "Hoàng Hôn Biển Đảo (Sunset Horizon)", c1: "#fb7185", c2: "#fb923c", c3: "#fbbf24" },
  { id: "snow_winter", short: "❄️ Tuyết Rơi", name: "Tuyết Trắng Mùa Đông (Winter Snow)", c1: "#e0f2fe", c2: "#38bdf8", c3: "#818cf8" },
  { id: "sakura_breeze", short: "🌸 Anh Đào", name: "Gió Xuân Anh Đào (Sakura Breeze)", c1: "#f9a8d4", c2: "#ec4899", c3: "#c084fc" },
  { id: "cyber_weather", short: "⚡ Cyberpunk", name: "Cyberpunk Neon (Synthwave Sky)", c1: "#00f5d4", c2: "#f43f5e", c3: "#8b5cf6" },
  { id: "emerald_forest", short: "🌿 Rừng Xanh", name: "Rừng Nhiệt Đới (Tropical Forest)", c1: "#34d399", c2: "#10b981", c3: "#0ea5e9" },
  { id: "cloudy_mist", short: "☁️ Sương Khói", name: "Mây Mù Sương Khói (Cloudy Mist)", c1: "#93c5fd", c2: "#60a5fa", c3: "#94a3b8" },
  { id: "obsidian_minimal", short: "🖤 Đen Tuyền", name: "Đen Tuyền Tối Giản (Obsidian Minimal)", c1: "#38bdf8", c2: "#818cf8", c3: "#c084fc" }
];

// ============================================================
// 1. BỘ TỔNG HỢP ÂM THANH & BÁO THỨC LIÊN TỤC (Web Audio + Native Beep)
// ============================================================
let audioCtx = null;
let alarmLoopTimer = null;
let alarmStopTimeout = null;
let isAlarmRinging = false;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function stopAlarmRing() {
  if (alarmLoopTimer) {
    clearInterval(alarmLoopTimer);
    alarmLoopTimer = null;
  }
  if (alarmStopTimeout) {
    clearTimeout(alarmStopTimeout);
    alarmStopTimeout = null;
  }
  if (isAlarmRinging) {
    isAlarmRinging = false;
    invoke("stop_native_alert").catch(() => {});
  }
}

function playSingleAlarmPattern(kind, style) {
  try {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    if (style === "urgent") {
      // Còi báo thức khẩn cấp: 4 nhịp kép tốc độ cao
      [0, 0.14, 0.34, 0.48].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "square";
        osc.frequency.setValueAtTime(i % 2 === 0 ? 1568 : 1175, now + offset);
        gain.gain.setValueAtTime(0.18, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.11);
        osc.start(now + offset);
        osc.stop(now + offset + 0.11);
      });
    } else if (kind === "water") {
      [0, 0.2, 0.4].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        const freqs = [659.25, 880, 1046.5];
        osc.frequency.setValueAtTime(freqs[i], now + offset);
        gain.gain.setValueAtTime(0.28, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
        osc.start(now + offset);
        osc.stop(now + offset + 0.18);
      });
    } else {
      const notes = [
        { f: 783.99, t: 0, d: 0.16 },
        { f: 987.77, t: 0.18, d: 0.16 },
        { f: 1174.66, t: 0.36, d: 0.2 },
        { f: 1567.98, t: 0.58, d: 0.36 }
      ];
      notes.forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "triangle";
        osc.frequency.setValueAtTime(n.f, now + n.t);
        gain.gain.setValueAtTime(0.32, now + n.t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
        osc.start(now + n.t);
        osc.stop(now + n.t + n.d);
      });
    }
  } catch (_) {}
}

function startAlarmRing(kind = "pomo", overrideDur = null, overrideStyle = null) {
  if (!settings.sounds && !overrideDur) return;
  stopAlarmRing();
  // Chỉ phát âm thanh ở cửa sổ chính để không bị dội âm kép khi bật 2 màn hình
  if (myWindowLabel !== "main") return;

  const style = overrideStyle || settings.alarmStyle || "alarm";
  const durSec = Math.max(1, Math.min(120, Number(overrideDur || settings.alarmDuration) || 10));
  isAlarmRinging = true;

  playSingleAlarmPattern(kind, style);
  invoke("play_native_alert", {
    kind,
    durationSecs: style === "chime" && !overrideDur ? 1 : durSec,
    style
  }).catch(() => {});

  if (style === "chime" && !overrideDur) {
    isAlarmRinging = false;
    return;
  }

  const cycleMs = style === "urgent" ? 780 : 1150;
  alarmLoopTimer = setInterval(() => {
    if (!isAlarmRinging) {
      clearInterval(alarmLoopTimer);
      alarmLoopTimer = null;
      return;
    }
    playSingleAlarmPattern(kind, style);
  }, cycleMs);

  alarmStopTimeout = setTimeout(() => {
    stopAlarmRing();
  }, durSec * 1000);
}

function playTone(type) {
  if (!settings.sounds) return;
  if (type === "chime") {
    startAlarmRing("pomo");
    return;
  }
  if (type === "water_alarm") {
    startAlarmRing("water");
    return;
  }
  try {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;

    if (type === "water") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.16);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === "pet") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.09);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.18);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === "tick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(740, now);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch (_) {}
}

window.addEventListener("pointerdown", () => {
  ensureAudioCtx();
  if (isAlarmRinging) stopAlarmRing();
});

// ============================================================
// 2. QUẢN LÝ TRẠNG THÁI, CHUYỂN TRANG MƯỢT & ĐỒNG BỘ VÙNG BẤM RUST
// ============================================================
let keepMiniLyricsOnCollapse = false;

function getClosedState() {
  if (
    keepMiniLyricsOnCollapse &&
    settings.miniLyricsBar !== false &&
    settings.lyrics !== false &&
    mediaState.hasSession &&
    !!mediaState.title
  ) {
    return "mini-lyrics";
  }
  if (!settings.mascot && settings.restStyle !== "capsule") return "idle";
  if (settings.restStyle === "capsule") return "capsule";
  if (settings.restStyle === "pet") return "pet";
  if (settings.restStyle === "idle") return "idle";
  return "both";
}

let currentMiniLyrWidth = 260;
let currentCapsuleWidth = 236;
let liveActivityActive = null;
let calendarEvents = [];
let calendarLastDayKey = "";
let clipboardImages = [];

function findNextCalendarMeeting(now = new Date()) {
  if (settings.calendarCompanion === false || !Array.isArray(calendarEvents) || calendarEvents.length === 0) {
    return null;
  }
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const ev of calendarEvents) {
    if (ev.all_day) continue;
    const start = Number(ev.start_minute);
    const dur = Math.max(5, Number(ev.duration_minutes) || 30);
    if (!Number.isFinite(start)) continue;
    const end = start + dur;
    if (nowMins >= start && nowMins < end) {
      return { ...ev, isLive: true, diff: 0, remaining: end - nowMins };
    }
    const diff = start - nowMins;
    if (diff >= 0 && diff <= 10) {
      return { ...ev, isLive: false, diff, remaining: dur };
    }
  }
  return null;
}

async function fetchCalendarAgenda() {
  try {
    const now = new Date();
    calendarLastDayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const res = await invoke("get_calendar_agenda", {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    });
    if (res && Array.isArray(res.events)) {
      calendarEvents = res.events;
    } else {
      calendarEvents = [];
    }
    if (typeof renderTodayPage === "function") renderTodayPage();
    if (typeof updateLiveActivityPill === "function") updateLiveActivityPill();
    if (typeof renderCapsuleState === "function") renderCapsuleState();
  } catch (_) {}
}

function getActiveLiveActivity() {
  if (settings.liveActivity === false) return null;
  const mtg = findNextCalendarMeeting();
  if (mtg) {
    return {
      kind: "meeting",
      targetPage: "today",
      icon: mtg.isLive ? "🟢" : "📅",
      text: mtg.isLive ? "Họp" : (mtg.diff === 0 ? "Ngay!" : `${mtg.diff}p`),
      title: `${mtg.isLive ? "Đang diễn ra" : `Sắp họp (${mtg.diff}p)`}: ${mtg.title || "Cuộc họp"} · Bấm để mở`,
      meeting: mtg
    };
  }
  if (activeSendProgress && activeSendProgress.active) {
    const pct = activeSendProgress.total > 0
      ? Math.round((activeSendProgress.sent / activeSendProgress.total) * 100)
      : 0;
    return {
      kind: "send",
      targetPage: "shelf",
      icon: "📱",
      text: activeSendProgress.total > 0 ? `${pct}%` : "LAN",
      title: `Đang gửi tệp sang điện thoại (${pct}%) · Bấm để mở`
    };
  }
  if (activeDownloadState && activeDownloadState.active) {
    const lbl = typeof activeDownloadState.percent === "number"
      ? `${Math.round(activeDownloadState.percent)}%`
      : (activeDownloadState.sizeStr || "...");
    return {
      kind: "dl",
      targetPage: "today",
      icon: activeDownloadState.source === "steam" ? "🎮" : "⬇️",
      text: lbl,
      title: `Đang tải: ${activeDownloadState.name} (${lbl})`
    };
  }
  if (typeof pomoRunning !== "undefined" && (pomoRunning || (pomoRemSec > 0 && pomoRemSec < pomoTotalSec))) {
    const mins = Math.floor(Math.max(0, pomoRemSec) / 60);
    const secs = Math.max(0, pomoRemSec) % 60;
    return {
      kind: "pomo",
      targetPage: "pomo",
      icon: pomoIsBreak ? "☕" : "🍅",
      text: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
      title: `${pomoIsBreak ? "Nghỉ giải lao" : "Tập trung"} Pomodoro (${pomoRunning ? "đang chạy" : "tạm dừng"}) · Bấm để mở`
    };
  }
  if (Array.isArray(todoList) && todoList.length > 0 && typeof parseTodoSchedule === "function") {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let best = null;
    for (const t of todoList) {
      if (t.done) continue;
      const p = parseTodoSchedule(t.text);
      if (p.startMins === null || p.isTomorrow) continue;
      const diff = p.startMins - nowMins;
      if (diff >= 0 && diff <= 10) {
        if (!best || diff < best.diff) {
          best = { diff, text: p.displayText, timeBadge: p.timeBadge };
        }
      }
    }
    if (best) {
      return {
        kind: "todo",
        targetPage: "todo",
        icon: "⏰",
        text: best.diff === 0 ? "Ngay!" : `${best.diff}p`,
        title: `Sắp đến: ${best.timeBadge} · ${best.text} · Bấm để mở`
      };
    }
  }
  return null;
}

function updateLiveActivityPill() {
  const prevHas = Boolean(liveActivityActive);
  liveActivityActive = getActiveLiveActivity();
  const curHas = Boolean(liveActivityActive);
  const badge = document.getElementById("petLiveActivityBadge");
  const icoEl = document.getElementById("plaIco");
  const txtEl = document.getElementById("plaTxt");

  if (badge) {
    if (liveActivityActive) {
      badge.style.display = "inline-flex";
      badge.classList.toggle("kind-todo", liveActivityActive.kind === "todo");
      badge.classList.toggle("kind-dl", liveActivityActive.kind === "dl");
      badge.classList.toggle("kind-send", liveActivityActive.kind === "send");
      badge.classList.toggle("kind-meeting", liveActivityActive.kind === "meeting");
      badge.title = liveActivityActive.title;
      badge.dataset.targetPage = liveActivityActive.targetPage;
      if (icoEl && icoEl.textContent !== liveActivityActive.icon) icoEl.textContent = liveActivityActive.icon;
      if (txtEl && txtEl.textContent !== liveActivityActive.text) txtEl.textContent = liveActivityActive.text;
    } else {
      badge.style.display = "none";
    }
  }

  const isPetState = mn?.dataset.s === "pet";
  mn?.classList.toggle("has-live-act", curHas && isPetState);
  if (prevHas !== curHas && isPetState && typeof syncNotchBounds === "function") {
    syncNotchBounds("pet");
  }
}

document.getElementById("petLiveActivityBadge")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const target = e.currentTarget.dataset.targetPage || "pomo";
  playTone("tick");
  openNotch(target);
});

function getDimensionsForState(s) {
  if (s === "pet" && liveActivityActive) {
    return { w: 214, h: 32, exp: false };
  }
  if ((s === "pet" || s === "both" || s === "idle") && settings.minimal && !mediaState.playing) {
    return { w: s === "both" ? 138 : 118, h: 28, exp: false };
  }
  switch (s) {
    case "pet":
      return { w: 155, h: 32, exp: false };
    case "both":
      return { w: 176, h: 32, exp: false };
    case "idle":
      return { w: 150, h: 30, exp: false };
    case "capsule":
      return { w: currentCapsuleWidth || 236, h: 32, exp: false };
    case "mini-lyrics":
      return { w: currentMiniLyrWidth || 260, h: 30, exp: false };
    case "bt":
    case "charge":
      return { w: 310, h: 60, exp: false };
    case "lyrics":
      return { w: 520, h: 140, exp: true };
    case "ai": {
      const w = Math.max(460, Math.min(800, Number(settings.aiWidth) || 520));
      const h = Math.max(160, Math.min(600, Number(settings.aiHeight) || 220));
      return { w, h, exp: true };
    }
    case "settings":
      return { w: 480, h: 308, exp: true };
    default:
      return { w: 480, h: 140, exp: true };
  }
}

let activeCapsuleMeetingLink = "";

function formatCapsuleSlot(slot, isRight) {
  const d = new Date();
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dateStr = `${DAYS_VI[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  if (slot === "off") return { ico: "", txt: "", show: false, dot: false, bars: false, link: "" };
  if (slot === "clock") return { ico: "🕒", txt: timeStr, show: true, dot: false, bars: false, link: "" };
  if (slot === "date") return { ico: "📅", txt: dateStr, show: true, dot: false, bars: false, link: "" };
  if (slot === "media") {
    const has = mediaState.hasSession && !!mediaState.title;
    return {
      ico: mediaState.playing ? "🎵" : "🎧",
      txt: has ? mediaState.title.slice(0, 16) : (isRight ? "Không phát" : timeStr),
      show: true,
      dot: false,
      bars: !!mediaState.playing,
      link: ""
    };
  }
  if (slot === "sys") {
    return {
      ico: "⚡",
      txt: `CPU ${sysStats.cpuPct}%`,
      show: true,
      dot: false,
      bars: false,
      link: ""
    };
  }
  if (slot === "battery") {
    const pct = prevBatteryPct <= 100 ? prevBatteryPct : 100;
    return {
      ico: isSystemCharging ? "⚡" : "🔋",
      txt: `${pct}%`,
      show: true,
      dot: false,
      bars: false,
      link: ""
    };
  }
  if (slot === "pomo") {
    const mins = Math.floor(Math.max(0, pomoRemSec) / 60);
    const secs = Math.max(0, pomoRemSec) % 60;
    return {
      ico: pomoIsBreak ? "☕" : "🍅",
      txt: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
      show: true,
      dot: !!pomoRunning,
      bars: false,
      link: ""
    };
  }
  if (slot === "meeting") {
    const mtg = findNextCalendarMeeting(d);
    if (mtg) {
      return {
        ico: "",
        txt: mtg.isLive ? (mtg.title || "Đang họp").slice(0, 14) : `${mtg.diff}p · ${(mtg.title || "Họp").slice(0, 10)}`,
        show: true,
        dot: true,
        bars: false,
        link: mtg.link || ""
      };
    }
    const evCount = Array.isArray(calendarEvents) ? calendarEvents.length : 0;
    return {
      ico: "📅",
      txt: evCount > 0 ? `${evCount} lịch` : dateStr,
      show: true,
      dot: false,
      bars: false,
      link: ""
    };
  }
  // weather default
  const info = typeof decodeWmoWeather === "function" ? decodeWmoWeather(weatherData.wmoCode, weatherData.isDay) : { icon: "⛅" };
  const temp = typeof formatTempVal === "function" ? formatTempVal(weatherData.tempC, true) : "--°";
  return { ico: info.icon || "⛅", txt: temp, show: true, dot: false, bars: false, link: "" };
}

function renderCapsuleState() {
  const leftEl = document.getElementById("capsuleLeft");
  const rightEl = document.getElementById("capsuleRight");
  const sepEl = document.getElementById("capsuleSep");
  const lIco = document.getElementById("capsuleLeftIco");
  const lTxt = document.getElementById("capsuleLeftTxt");
  const rDot = document.getElementById("capsuleRightDot");
  const rTxt = document.getElementById("capsuleRightTxt");
  const rBars = document.getElementById("capsuleBars");
  const joinBtn = document.getElementById("btnCapsuleJoin");
  if (!leftEl || !rightEl) return;

  const mtgLive = settings.calendarCompanion !== false ? findNextCalendarMeeting() : null;
  const L = formatCapsuleSlot(settings.capsuleLeft || "clock", false);
  const R = mtgLive && (settings.capsuleRight || "weather") === "meeting"
    ? formatCapsuleSlot("meeting", true)
    : (mtgLive && mtgLive.isLive
      ? formatCapsuleSlot("meeting", true)
      : formatCapsuleSlot(settings.capsuleRight || "weather", true));

  leftEl.style.display = L.show ? "inline-flex" : "none";
  if (lIco) lIco.textContent = L.ico;
  if (lTxt) lTxt.textContent = L.txt;

  rightEl.style.display = R.show ? "inline-flex" : "none";
  if (rDot) rDot.style.display = R.dot ? "inline-block" : "none";
  if (rTxt) rTxt.textContent = R.ico ? `${R.ico} ${R.txt}` : R.txt;
  if (rBars) {
    rBars.style.display = R.bars ? "inline-flex" : "none";
    rBars.classList.toggle("paused", !mediaState.playing);
  }
  activeCapsuleMeetingLink = R.link || "";
  if (joinBtn) {
    joinBtn.style.display = activeCapsuleMeetingLink ? "inline-flex" : "none";
  }
  if (sepEl) sepEl.style.display = L.show && R.show ? "block" : "none";

  mn?.classList.toggle("capsule-glow", settings.capsuleEdgeGlow !== false);

  const lLen = L.show ? L.txt.length : 0;
  const rLen = R.show ? R.txt.length + (activeCapsuleMeetingLink ? 7 : 0) + (R.bars ? 3 : 0) : 0;
  const nextW = Math.max(176, Math.min(316, 74 + (lLen + rLen) * 6.8));
  const changed = Math.abs((currentCapsuleWidth || 236) - nextW) >= 4;
  currentCapsuleWidth = Math.round(nextW);
  if (mn) mn.style.setProperty("--cap-w", `${currentCapsuleWidth}px`);
  if (changed && mn?.dataset.s === "capsule") {
    syncNotchBounds("capsule");
  }
}

document.getElementById("btnCapsuleJoin")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (activeCapsuleMeetingLink) {
    playTone("tick");
    invoke("open_path_in_explorer", { path: activeCapsuleMeetingLink }).catch(() => {});
  }
});

// ============================================================
// 5. KẾT THÚC CẤU TRÚC KÍCH THƯỚC
// ============================================================

let cachedMnRect = null;
let cachedMnRectAt = 0;

function syncNotchBounds(stateName) {
  const s = stateName || mn.dataset.s || "both";
  if (s === "capsule") {
    mn.style.setProperty("--cap-w", `${currentCapsuleWidth || 236}px`);
  }
  const dim = getDimensionsForState(s);
  const u = getEffectiveScale();
  isExpanded = dim.exp;
  cachedMnRectAt = 0;
  mn.classList.toggle("minimal", !!settings.minimal && !mediaState.playing && !isExpanded);

  if (s === "ai") {
    mn.style.setProperty("--ai-w", `${dim.w}px`);
    mn.style.setProperty("--ai-h", `${dim.h}px`);
  }
  mn.style.removeProperty("--w");
  mn.style.removeProperty("--h");

  invoke("set_notch_bounds", {
    width: dim.w * u,
    height: dim.h * u,
    expanded: dim.exp
  }).catch(() => {});
}

function showState(s, slideDir = 0) {
  const prev = mn.dataset.s;
  if (prev === s && slideDir === 0) return;

  // Xóa sạch class hiệu ứng trượt trên toàn bộ các lớp để không bao giờ bị đè lớp
  document.querySelectorAll(".ly").forEach((el) => {
    el.classList.remove("slide-next", "slide-prev");
  });

  if (slideDir !== 0 && PAGE_LAYER_MAP[s]) {
    const targetLayer = document.querySelector(PAGE_LAYER_MAP[s]);
    if (targetLayer) {
      targetLayer.classList.add(slideDir > 0 ? "slide-next" : "slide-prev");
    }
  }

  mn.dataset.s = s;
  if (typeof updateLiveActivityPill === "function") updateLiveActivityPill();
  syncNotchBounds(s);

  if (s === "music" || s === "lyrics" || s === "mini-lyrics") {
    updateMediaProgressUI();
    if (s === "music" || s === "lyrics") {
      requestAnimationFrame(() => renderMediaUI());
    }
    if (s === "lyrics") {
      requestAnimationFrame(() => syncLyricsScroll(mediaState.pos, true));
    } else if (s === "mini-lyrics") {
      lastMiniLyrText = "";
      syncLyricsScroll(mediaState.pos, true);
    }
  }
  if (s === "water" && prev !== "water") {
    updateWaterStatusLine();
    requestAnimationFrame(animateWaterChart);
  }
  if (s === "today") {
    unreadNotifCount = 0;
    document.getElementById("hdrNotifDot")?.classList.remove("show");
    renderTodayPage();
  }
  if (s === "weather") {
    if (typeof renderWeatherPage === "function") renderWeatherPage();
    if (typeof fetchWeatherLive === "function") fetchWeatherLive(false);
  }
  if (s === "widgets") {
    renderWidgetsPage();
  }
  if (s === "prayer") {
    renderPrayerPage();
  }
  if (s !== "shelf") {
    shStop();
  }
}

let lastExpandAt = 0;

function cancelHoverCloseTimer() {
  if (hoverCloseTimer !== null) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

function getHoverOpenDelayMs() {
  if (settings.hoverOpenSensitivity === "relaxed") return 420;
  if (settings.hoverOpenSensitivity === "normal") return 140;
  return 0;
}

function cancelHoverOpenTimer() {
  if (hoverOpenTimer !== null) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
  }
}

function scheduleHoverOpen() {
  if (settings.openMode !== "hover" || isExpanded) return;
  const delay = getHoverOpenDelayMs();
  if (delay <= 0) {
    cancelHoverOpenTimer();
    openNotch(currentPage);
    return;
  }
  if (hoverOpenTimer !== null) return;
  hoverOpenTimer = setTimeout(() => {
    hoverOpenTimer = null;
    if (!isExpanded && settings.openMode === "hover" && (isDomMouseInside || prevCursorInside)) {
      openNotch(currentPage);
    }
  }, delay);
}

function openNotch(targetPage) {
  cancelHoverOpenTimer();
  cancelHoverCloseTimer();
  clearTimeout(peekReturnTimer);
  lastExpandAt = performance.now();
  const activePages = getActivePages();
  let page = targetPage || currentPage || "music";
  if (!activePages.includes(page)) {
    page = activePages[0] || "music";
  }
  currentPage = page;
  if (!targetPage && keepMiniLyricsOnCollapse && page === "music" && settings.lyrics !== false) {
    showState("lyrics", 0);
  } else {
    showState(page, 0);
  }
  if (hdrPetBubble && lastBubbleText && Date.now() < lastBubbleUntil) {
    hdrPetBubble.textContent = lastBubbleText;
    hdrPetBubble.classList.add("show");
    clearTimeout(bubbleHideTimer);
    bubbleHideTimer = setTimeout(() => {
      hdrPetBubble.classList.remove("show");
    }, Math.max(800, lastBubbleUntil - Date.now()));
  }
}

function collapseNotch(force = false) {
  if (isAiResizing && !force) return;
  if (isPinned && !force) return;
  cancelHoverOpenTimer();
  cancelHoverCloseTimer();
  isDomMouseInside = false;
  prevCursorInside = false;
  hoverCollapseRetries = 0;
  try {
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  } catch (_) {}
  isPinned = false;
  document.getElementById("btnPinNotch")?.classList.remove("active");
  const todoBox = document.getElementById("todoAddBox");
  if (todoBox) todoBox.style.display = "none";
  shelfLayer?.classList.remove("hover");
  shSetHot(false);
  hdrPetBubble?.classList.remove("show");
  const closedState = getClosedState();
  showState(closedState, 0);
  syncNotchBounds(closedState);
}

function getHoverCloseDelayMs() {
  const val = Number(settings.hoverCloseDelay);
  return Number.isFinite(val) && val >= 100 ? val : 240;
}

function scheduleSafeHoverCollapse(delayMs = getHoverCloseDelayMs()) {
  cancelHoverCloseTimer();
  hoverCloseTimer = setTimeout(async () => {
    hoverCloseTimer = null;
    if (isAiResizing) return;
    if (!isExpanded || isPinned || prevFileDragHover) return;
    if (performance.now() - lastExpandAt < 340) {
      scheduleSafeHoverCollapse(180);
      return;
    }
    let osInside = false;
    try {
      const hw = await Promise.race([
        invoke("get_hardware_tick"),
        new Promise((resolve) => setTimeout(() => resolve(null), 350))
      ]);
      osInside = Boolean(
        hw && hw.cursor_inside && (!hw.hovered_notch || hw.hovered_notch === myWindowLabel)
      );
    } catch (_) {}
    if (isAiResizing || !isExpanded || isPinned || prevFileDragHover) return;
    if (osInside && !isDomMouseInside && hoverCollapseRetries < 4) {
      hoverCollapseRetries++;
      scheduleSafeHoverCollapse(260);
      return;
    }
    if (osInside && isDomMouseInside) {
      hoverCollapseRetries = 0;
      return;
    }
    isDomMouseInside = false;
    prevCursorInside = false;
    hoverCollapseRetries = 0;
    collapseNotch(false);
  }, delayMs);
}

// Bắt sự kiện rê chuột trực tiếp trên DOM ở tốc độ 120Hz (độ trễ 0ms)
mn.addEventListener("mouseenter", () => {
  isDomMouseInside = true;
  hoverCollapseRetries = 0;
  cancelHoverCloseTimer();
  if (settings.openMode === "hover" && !isExpanded) {
    scheduleHoverOpen();
  }
  idleTicks = 0;
  // Giữ nguyên biểu cảm đang thử / đang phát nhạc / đang chạy Pomodoro; chỉ vẫy chào nhẹ khi đang rảnh
  if (!activeTempMood && !mediaState.playing && !pomoRunning) {
    triggerPetExpression("happy", getActivePetProfile().loveEmote, "", 1100);
  } else {
    updatePetMood();
  }
});

mn.addEventListener("mousemove", () => {
  isDomMouseInside = true;
  hoverCollapseRetries = 0;
  cancelHoverCloseTimer();
});

mn.addEventListener("pointerdown", () => {
  isDomMouseInside = true;
  cancelHoverOpenTimer();
  cancelHoverCloseTimer();
  lastExpandAt = performance.now();
});

mn.addEventListener("mouseleave", () => {
  isDomMouseInside = false;
  hoverCollapseRetries = 0;
  cancelHoverOpenTimer();
  cancelHoverCloseTimer();
  if (isExpanded && !isPinned && !prevFileDragHover) {
    scheduleSafeHoverCollapse(getHoverCloseDelayMs());
  }
});

// Đọc trạng thái chuột, kéo thả tệp & phần cứng từ Rust
let prevCursorInside = false;
let prevOutsideClickSeq = 0;
let prevDropSeq = 0;
let prevFileDragHover = false;
let prevAcSeq = 0;
let prevCapsSeq = 0;
let prevVolSeq = 0;
let prevLangSeq = 0;
let prevBatteryPct = 255;

async function processHardwareTick(hw) {
  if (!hw) return;
  try {
    // 1. Chỉ tự động chuyển sang Khay tệp khi người dùng thực sự kéo TỆP từ Windows vào tai thỏ
    const isDragOnMe = hw.file_drag_hover && (hw.hovered_notch ? hw.hovered_notch === myWindowLabel : myWindowLabel === "main");
    if (isDragOnMe !== prevFileDragHover) {
      prevFileDragHover = isDragOnMe;
      if (isDragOnMe) {
        cancelHoverCloseTimer();
        currentPage = "shelf";
        openNotch("shelf");
        shelfLayer?.classList.add("hover");
        shSetHot(true);
      } else {
        shelfLayer?.classList.remove("hover");
        shSetHot(false);
      }
    }

    // 2. Khi người dùng thả tệp từ Windows Explorer vào tai thỏ
    if (hw.drop_seq !== prevDropSeq) {
      prevDropSeq = hw.drop_seq;
      const files = await invoke("take_dropped_files");
      if (Array.isArray(files) && files.length > 0) {
        if (mn.dataset.s === "ai") {
          for (const f of files) {
            try {
              const res = await invoke("read_file_for_ai", { path: f.path });
              if (res) {
                aiAttachments.push({
                  type: res.is_image ? "image" : "file",
                  name: res.name,
                  size: res.size_str,
                  dataUrl: res.is_image ? res.data : undefined,
                  textContent: res.is_image ? undefined : res.data
                });
              }
            } catch (_) {}
          }
          renderAiAttachments();
          showPetBubble(`Đã nhận ${files.length} tệp/ảnh vào AI`);
        } else {
          currentPage = "shelf";
          openNotch("shelf");
          shelfLayer?.classList.remove("hover");
          files.forEach((f) => {
            addShelfItem(f.name, f.path, f.size);
          });
        }
      }
    }

    // 3. Đồng bộ khi chuột đi vào / rời khỏi vùng tai thỏ ở cấp hệ điều hành (cho đúng màn hình)
    const isHoveredOnMe = hw.cursor_inside && (hw.hovered_notch ? hw.hovered_notch === myWindowLabel : myWindowLabel === "main");
    if (isHoveredOnMe !== prevCursorInside) {
      prevCursorInside = isHoveredOnMe;
      if (isHoveredOnMe) {
        isDomMouseInside = true;
        cancelHoverCloseTimer();
        if (settings.openMode === "hover" && !isExpanded) {
          scheduleHoverOpen();
        }
      } else {
        isDomMouseInside = false;
        cancelHoverOpenTimer();
        cancelHoverCloseTimer();
        if (isExpanded && !isPinned && !(hw.file_drag_hover && hw.hovered_notch === myWindowLabel)) {
          scheduleSafeHoverCollapse(getHoverCloseDelayMs());
        }
      }
    } else if (
      !isHoveredOnMe &&
      isExpanded &&
      !isPinned &&
      !isAiResizing &&
      !(hw.file_drag_hover && hw.hovered_notch === myWindowLabel) &&
      hoverCloseTimer === null &&
      performance.now() - lastExpandAt > 350
    ) {
      isDomMouseInside = false;
      scheduleSafeHoverCollapse(getHoverCloseDelayMs());
    }

    // 4. Bấm chuột bên ngoài vùng tai thỏ -> Thu gọn ngay lập tức
    if (hw.outside_click_seq !== prevOutsideClickSeq) {
      prevOutsideClickSeq = hw.outside_click_seq;
      if (isExpanded && !isPinned && !isAiResizing) {
        collapseNotch(true);
      }
    }

    // 5. Pin & Sạc
    const acChanged = hw.ac_changed_seq !== prevAcSeq;
    if (acChanged || hw.battery_pct !== prevBatteryPct) {
      prevAcSeq = hw.ac_changed_seq;
      prevBatteryPct = hw.battery_pct;
      window.__islandBatteryUpdate(hw.battery_pct, hw.is_charging, acChanged);
    }

    // 6. Phím Caps Lock
    if (hw.caps_changed_seq !== prevCapsSeq) {
      prevCapsSeq = hw.caps_changed_seq;
      window.__islandHardwareEvent("caps", hw.caps_on ? 1 : 0);
    }

    // 7. Âm lượng hệ thống thực tế & thiết bị đầu ra (đồng bộ 100% với Windows Core Audio)
    if (hw.audio_output_name) {
      lastAudioOutputName = String(hw.audio_output_name);
    }
    if (typeof hw.volume_pct === "number") {
      sysVolumePct = hw.volume_pct;
      sysVolumeMuted = !!hw.volume_muted;
    }
    if (hw.vol_seq !== prevVolSeq) {
      prevVolSeq = hw.vol_seq;
      if (hw.vol_kind) {
        window.__islandHardwareEvent(hw.vol_kind, sysVolumePct, sysVolumeMuted);
      }
    }

    // 8. Ngôn ngữ bàn phím
    if (hw.lang_seq !== prevLangSeq) {
      prevLangSeq = hw.lang_seq;
      if (hw.lang_name && settings.hudLanguage !== false) {
        document.getElementById("hudIconText").textContent = "🌐";
        document.getElementById("hudTitle").textContent = "Ngôn ngữ bàn phím";
        document.getElementById("hudSub").textContent = "Đã chuyển bố cục nhập liệu";
        document.getElementById("hudRightVal").textContent = hw.lang_name;
        document.getElementById("hudRingArc").style.strokeDashoffset = "0";
        triggerPeek("bt", 1800);
      }
    }

    // 9. Biên độ & Phổ tần số FFT 16 dải thời gian thực (WASAPI Loopback)
    if (Array.isArray(hw.audio_bands) && hw.audio_bands.length === 5) {
      for (let i = 0; i < 5; i++) latestAudioBands[i] = Number(hw.audio_bands[i]) || 0;
    }
    if (Array.isArray(hw.audio_spectrum) && hw.audio_spectrum.length === 16) {
      for (let i = 0; i < 16; i++) latestAudioSpectrum[i] = Number(hw.audio_spectrum[i]) || 0;
    }
    if (typeof hw.audio_peak === "number") {
      updateLiveAudioPeak(hw.audio_peak);
    }

    // 10. Giám sát CPU / RAM / Tốc độ mạng
    if (typeof hw.cpu_pct === "number" && typeof hw.ram_pct === "number") {
      const changedSys =
        sysStats.cpuPct !== hw.cpu_pct ||
        sysStats.ramPct !== hw.ram_pct ||
        sysStats.netDownKbps !== hw.net_down_kbps ||
        sysStats.netUpKbps !== hw.net_up_kbps;
      sysStats.cpuPct = hw.cpu_pct;
      sysStats.ramPct = hw.ram_pct;
      sysStats.ramUsedGb = ((Number(hw.ram_used_gb_x10) || 0) / 10).toFixed(1);
      sysStats.ramTotalGb = ((Number(hw.ram_total_gb_x10) || 0) / 10).toFixed(1);
      sysStats.netDownKbps = Number(hw.net_down_kbps) || 0;
      sysStats.netUpKbps = Number(hw.net_up_kbps) || 0;
      if (changedSys) {
        if (settings.statusRing === "cpu" || settings.statusRing === "ram") {
          updateStatusRing();
        }
        if (
          isExpanded &&
          mn.dataset.s === "widgets" &&
          (settings.widgetLeft === "system_monitor" || settings.widgetRight === "system_monitor") &&
          typeof renderWidgetsPage === "function"
        ) {
          renderWidgetsPage();
        }
      }
    }

    // 11. Giám sát Camera & Micro đang sử dụng (Quyền riêng tư)
    if (typeof hw.cam_active === "boolean" || typeof hw.mic_active === "boolean") {
      const cam = !!hw.cam_active;
      const mic = !!hw.mic_active;
      const privApp = String(hw.privacy_app || "").trim();
      updatePrivacyDotsUI(cam, mic, privApp);
      if (privacyPollSeen && settings.privacyIndicator !== false && myWindowLabel === "main") {
        const newlyCam = cam && !prevCamActive;
        const newlyMic = mic && !prevMicActive;
        if (newlyCam || newlyMic) {
          const ico = newlyCam ? "📷" : "🎙️";
          const title = newlyCam && newlyMic
            ? "Camera & Micro đang bật"
            : (newlyCam ? "Camera đang được sử dụng" : "Micro đang được sử dụng");
          const sub = privApp || "Ứng dụng đang truy cập thiết bị";
          document.getElementById("hudIconText").textContent = ico;
          document.getElementById("hudTitle").textContent = title;
          document.getElementById("hudSub").textContent = sub;
          document.getElementById("hudRightVal").textContent = cam && mic ? "CAM+MIC" : (cam ? "CAM" : "MIC");
          document.getElementById("hudRingArc").style.strokeDashoffset = "0";
          if (typeof pushAppNotification === "function") {
            pushAppNotification(ico, title, sub, false);
          }
          if (!isExpanded) triggerPeek("bt", 2800);
        }
      }
      privacyPollSeen = true;
      prevCamActive = cam;
      prevMicActive = mic;
    }
  } catch (_) {}
}

function updatePrivacyDotsUI(cam, mic, appName = "") {
  const show = settings.privacyIndicator !== false && (cam || mic);
  const colEl = document.getElementById("privacyDotsCollapsed");
  const hdrEl = document.getElementById("hdrPrivacyDots");
  const html = show
    ? `${cam ? '<i class="privacy-dot cam"></i>' : ""}${mic ? '<i class="privacy-dot mic"></i>' : ""}`
    : "";
  const tip = show
    ? `${[cam ? "📷 Camera" : "", mic ? "🎙️ Micro" : ""].filter(Boolean).join(" · ")}${appName ? ` (${appName})` : ""}`
    : "";
  [colEl, hdrEl].forEach((el) => {
    if (!el) return;
    el.style.display = show ? "inline-flex" : "none";
    if (el.innerHTML !== html) el.innerHTML = html;
    if (el.title !== tip) el.title = tip;
  });
}

let targetAudioPeak = 0;
let smoothAudioPeak = 0;
let audioVisRaf = null;
let audioPeakPhase = 0;
const visSpectrumPeaks = new Array(16).fill(0);
const latestAudioBands = [0, 0, 0, 0, 0];
const latestAudioSpectrum = new Array(16).fill(0);
let lastAudioOutputName = "";

function drawMusicVisualizerCanvas(energy, phase) {
  const cv = document.getElementById("musicVisCanvas");
  const auroraEl = document.getElementById("musicAuroraWave");
  if (auroraEl) {
    auroraEl.style.setProperty("--aurora-energy", settings.musicAurora !== false ? energy.toFixed(3) : "0");
  }
  if (!cv) return;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const W = cv.width;
  const H = cv.height;
  if (
    settings.audioVisualizer === false ||
    settings.reduceEffects ||
    !isExpanded ||
    mn.dataset.s !== "music" ||
    energy <= 0.012
  ) {
    ctx.clearRect(0, 0, W, H);
    return;
  }

  ctx.clearRect(0, 0, W, H);
  const rgbRaw = (mn.style.getPropertyValue("--album-glow-rgb") || "").trim() || "56, 189, 248";
  const style = settings.visualizerStyle || "bars";
  const hasRealSpectrum = latestAudioSpectrum.some((v) => v > 3);
  const binNorm = (idx, fallbackMod) =>
    hasRealSpectrum ? Math.max(0.08, Math.min(1, latestAudioSpectrum[idx % 16] / 100)) : energy * fallbackMod;

  if (style === "wave") {
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      const bass = hasRealSpectrum ? (latestAudioSpectrum[1] + latestAudioSpectrum[2]) / 200 : energy;
      const amp = H * (0.28 + Math.max(energy, bass) * 0.44) * (layer === 0 ? 1 : 0.65);
      const freq = layer === 0 ? 0.045 : 0.072;
      const spd = layer === 0 ? phase * 1.15 : -phase * 0.85;
      for (let x = 0; x <= W; x += 6) {
        const env = Math.sin((x / W) * Math.PI);
        const y = H * 0.55 + Math.sin(x * freq + spd) * amp * env;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = layer === 0 ? `rgba(${rgbRaw}, 0.78)` : "rgba(255, 255, 255, 0.54)";
      ctx.lineWidth = layer === 0 ? 2.2 : 1.3;
      ctx.stroke();
    }
    return;
  }

  if (style === "dots") {
    const cols = 16;
    const stepX = W / cols;
    for (let i = 0; i < cols; i++) {
      const mod = 0.35 + 0.65 * Math.abs(Math.sin(phase * (0.7 + i * 0.09) + i * 0.7));
      const val = Math.min(1, binNorm(i, mod) * 1.15);
      const rows = Math.max(1, Math.round(val * 5));
      for (let r = 0; r < rows; r++) {
        const cx = i * stepX + stepX * 0.5;
        const cy = H - 4 - r * 6.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = r === rows - 1 ? "rgba(255,255,255,0.88)" : `rgba(${rgbRaw}, ${0.42 + r * 0.12})`;
        ctx.fill();
      }
    }
    return;
  }

  if (style === "spectrum") {
    const bands = 16;
    const gap = 4;
    const bw = (W - gap * (bands - 1)) / bands;
    for (let i = 0; i < bands; i++) {
      const shape = 1 - Math.abs((i - 6.5) / 11) * 0.45;
      const mod = 0.38 + 0.62 * Math.abs(Math.sin(phase * (0.85 + i * 0.11) + i * 1.13));
      const level = hasRealSpectrum ? Math.max(energy * 0.25, binNorm(i, mod)) : energy * shape * mod;
      const h = Math.max(3, Math.min(H - 5, level * (H - 4)));
      if (h > visSpectrumPeaks[i]) visSpectrumPeaks[i] = h;
      else visSpectrumPeaks[i] = Math.max(h, visSpectrumPeaks[i] - 0.85);
      const x = i * (bw + gap);
      const grad = ctx.createLinearGradient(0, H - h, 0, H);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.88)");
      grad.addColorStop(1, `rgba(${rgbRaw}, 0.58)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, H - h, bw, h);
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fillRect(x, Math.max(0, H - visSpectrumPeaks[i] - 2.5), bw, 1.8);
    }
    return;
  }

  // "bars" (default)
  const bars = 20;
  const gap = 4;
  const bw = (W - gap * (bars - 1)) / bars;
  for (let i = 0; i < bars; i++) {
    const mod = 0.32 + 0.68 * Math.abs(Math.sin(phase * (0.8 + (i % 5) * 0.17) + i * 0.72));
    const binIdx = Math.floor((i * 16) / bars);
    const level = hasRealSpectrum ? Math.max(energy * 0.25, binNorm(binIdx, mod)) : energy * mod;
    const h = Math.max(3, Math.min(H - 2, level * (H - 2)));
    const x = i * (bw + gap);
    const y = H - h;
    ctx.fillStyle = `rgba(${rgbRaw}, ${(0.45 + Math.min(0.48, level * 0.5)).toFixed(2)})`;
    ctx.fillRect(x, y, bw, h);
  }
}

function updateLiveAudioPeak(peakPct) {
  const allowVis = settings.audioVisualizer !== false && !settings.reduceEffects && (mediaState.playing || peakPct > 4);
  if (!allowVis || document.hidden) {
    targetAudioPeak = 0;
    if (mn.classList.contains("live-audio-peak")) {
      mn.classList.remove("live-audio-peak");
      mn.style.removeProperty("--pet-beat");
    }
    drawMusicVisualizerCanvas(0, audioPeakPhase);
    return;
  }
  targetAudioPeak = Math.max(0, Math.min(1, peakPct / 100));
  if (!mn.classList.contains("live-audio-peak")) {
    mn.classList.add("live-audio-peak");
  }
  if (!audioVisRaf && targetAudioPeak > 0.015) {
    audioVisRaf = requestAnimationFrame(stepAudioVisualizerRAF);
  }
}

function stepAudioVisualizerRAF() {
  audioVisRaf = null;
  if (settings.audioVisualizer === false || settings.reduceEffects || document.hidden) {
    mn.classList.remove("live-audio-peak");
    drawMusicVisualizerCanvas(0, audioPeakPhase);
    return;
  }
  const rate = targetAudioPeak > smoothAudioPeak ? 0.42 : 0.16;
  smoothAudioPeak += (targetAudioPeak - smoothAudioPeak) * rate;
  audioPeakPhase += 0.24;

  const base = Math.max(0.18, Math.min(1.0, 0.2 + smoothAudioPeak * 0.95));
  const hasRealBands = latestAudioBands.some((b) => b > 2);
  const m1 = hasRealBands ? Math.max(0.18, Math.min(1, 0.18 + (latestAudioBands[0] / 100) * 0.88)) : Math.max(0.2, Math.min(1, base * (0.72 + 0.28 * Math.sin(audioPeakPhase))));
  const m2 = hasRealBands ? Math.max(0.18, Math.min(1, 0.18 + (latestAudioBands[1] / 100) * 0.88)) : Math.max(0.22, Math.min(1, base * (0.88 + 0.22 * Math.cos(audioPeakPhase * 1.35))));
  const m3 = hasRealBands ? Math.max(0.18, Math.min(1, 0.18 + (latestAudioBands[2] / 100) * 0.92)) : Math.max(0.24, Math.min(1, base * (1.02 + 0.18 * Math.sin(audioPeakPhase * 0.9 + 1.1))));
  const m4 = hasRealBands ? Math.max(0.18, Math.min(1, 0.18 + (latestAudioBands[3] / 100) * 0.88)) : Math.max(0.22, Math.min(1, base * (0.86 + 0.24 * Math.cos(audioPeakPhase * 1.15 + 2.0))));
  const m5 = hasRealBands ? Math.max(0.18, Math.min(1, 0.18 + (latestAudioBands[4] / 100) * 0.88)) : Math.max(0.2, Math.min(1, base * (0.7 + 0.28 * Math.sin(audioPeakPhase * 1.5 + 0.5))));

  mn.style.setProperty("--peak-1", m1.toFixed(3));
  mn.style.setProperty("--peak-2", m2.toFixed(3));
  mn.style.setProperty("--peak-3", m3.toFixed(3));
  mn.style.setProperty("--peak-4", m4.toFixed(3));
  mn.style.setProperty("--peak-5", m5.toFixed(3));
  mn.style.setProperty("--pet-beat", smoothAudioPeak.toFixed(3));
  drawMusicVisualizerCanvas(smoothAudioPeak, audioPeakPhase);

  if (smoothAudioPeak > 0.015 || targetAudioPeak > 0.015) {
    audioVisRaf = requestAnimationFrame(stepAudioVisualizerRAF);
  } else {
    mn.classList.remove("live-audio-peak");
    mn.style.setProperty("--pet-beat", "0");
    drawMusicVisualizerCanvas(0, audioPeakPhase);
  }
}

async function pollHardwareTick() {
  try {
    const hw = await invoke("get_hardware_tick");
    await processHardwareTick(hw);
  } catch (_) {}
}

// Lắng nghe sự kiện trực tiếp từ Rust (0% CPU khi nghỉ) + kiểm tra dự phòng mỗi 6 giây cho cửa sổ chính
listen("island-hw", (e) => {
  if (e?.payload) processHardwareTick(e.payload);
}).catch(() => {});

// Watchdog nhẹ kiểm tra mỗi 500ms khi tai thỏ đang mở rộng để đảm bảo luôn tự đóng an toàn (0% CPU khi thu gọn)
setInterval(() => {
  if (
    isExpanded &&
    !isPinned &&
    !isAiResizing &&
    !prevFileDragHover &&
    hoverCloseTimer === null &&
    performance.now() - lastExpandAt > 500
  ) {
    pollHardwareTick();
  }
}, 500);

if (myWindowLabel === "main") {
  setInterval(pollHardwareTick, 6000);
  pollHardwareTick();

  // Phím tắt toàn cục từ Rust: Alt + Space (Mở AI) · Alt + S (Chụp cửa sổ gửi AI)
  listen("island-hotkey", (e) => {
    const act = e?.payload?.action;
    if (!act || settings.globalHotkeys === false) return;
    if (act === "open_ai") {
      playTone("tick");
      openNotch("ai");
      requestAnimationFrame(() => {
        const inp = document.getElementById("aiInputPrompt");
        inp?.focus();
      });
    } else if (act === "capture_to_ai") {
      const att = e?.payload?.attachment;
      if (att && att.data) {
        aiAttachments.push({
          type: "image",
          name: att.name || "Cửa sổ hiện tại.png",
          size: att.size_str || "",
          dataUrl: att.data
        });
        renderAiAttachments();
      }
      playTone("pet");
      openNotch("ai");
      showPetBubble("📸 Đã chụp cửa sổ vào AI!");
      requestAnimationFrame(() => {
        const inp = document.getElementById("aiInputPrompt");
        inp?.focus();
      });
    } else if (act === "quick_todo") {
      playTone("tick");
      if (settings.todoPage === false) {
        settings.todoPage = true;
        applySettingsUI();
      }
      openNotch("todo");
      const box = document.getElementById("todoAddBox");
      const inp = document.getElementById("todoInput");
      if (box) box.style.display = "flex";
      requestAnimationFrame(() => {
        if (inp) {
          inp.value = "";
          inp.focus();
        }
      });
    }
  }).catch(() => {});

  // Theo dõi tải xuống trình duyệt / Steam
  listen("island-download", (e) => {
    const p = e?.payload;
    if (!p) return;
    if (p.finished) {
      activeDownloadState = null;
      updateLiveActivityPill();
      if (settings.popupDownloads !== false) {
        playTone("chime");
        triggerPetExpression("starry", "✅", "Tải xuống hoàn tất!", 2800);
        document.getElementById("hudIconText").textContent = "✅";
        document.getElementById("hudTitle").textContent = "Tải xong tệp";
        document.getElementById("hudSub").textContent = p.name || "Hoàn tất tải xuống";
        document.getElementById("hudRightVal").textContent = p.size_str || "100%";
        document.getElementById("hudRingArc").style.strokeDashoffset = "0";
        if (typeof pushAppNotification === "function") {
          pushAppNotification("✅", "Tải xuống hoàn tất", `${p.name} (${p.size_str || ""})`, false);
        }
        if (!isExpanded) triggerPeek("bt", 3800);
      }
    } else if (p.active) {
      activeDownloadState = {
        source: p.source || "browser",
        name: p.name || "Đang tải",
        percent: p.percent,
        sizeStr: p.size_str || "",
        path: p.path || ""
      };
      updateLiveActivityPill();
    } else {
      activeDownloadState = null;
      updateLiveActivityPill();
    }
  }).catch(() => {});

  // Theo dõi thiết bị Bluetooth / USB kết nối & ngắt kết nối
  let lastDeviceEvtKey = "";
  let lastDeviceEvtAt = 0;
  listen("island-device-event", (e) => {
    const p = e?.payload;
    if (!p || !p.name || settings.popupBluetooth === false) return;
    const key = `${p.kind}|${p.name}|${p.connected}`;
    const now = Date.now();
    if (key === lastDeviceEvtKey && now - lastDeviceEvtAt < 2500) return;
    lastDeviceEvtKey = key;
    lastDeviceEvtAt = now;
    const ico = p.kind === "usb" ? (p.connected ? "🔌" : "⏏️") : (p.connected ? "🎧" : "📡");
    const title = p.connected ? "Đã kết nối thiết bị" : "Đã ngắt kết nối";
    document.getElementById("hudIconText").textContent = ico;
    document.getElementById("hudTitle").textContent = title;
    document.getElementById("hudSub").textContent = p.name;
    document.getElementById("hudRightVal").textContent = p.connected ? "KẾT NỐI" : "NGẮT";
    document.getElementById("hudRingArc").style.strokeDashoffset = p.connected ? "0" : "69.1";
    playTone(p.connected ? "pet" : "tick");
    if (typeof pushAppNotification === "function") {
      pushAppNotification(ico, title, p.name, false);
    }
    if (!isExpanded) triggerPeek("bt", 3200);
  }).catch(() => {});

  // Tiến độ gửi tệp qua Wi-Fi sang điện thoại
  listen("island-send-progress", (e) => {
    const p = e?.payload;
    if (!p) return;
    activeSendProgress = p.active ? p : null;
    updateLiveActivityPill();
    const fill = document.getElementById("shelfQrProgFill");
    const txt = document.getElementById("shelfQrProgTxt");
    const pct = p.total > 0 ? Math.min(100, Math.round((p.sent / p.total) * 100)) : 0;
    if (fill) fill.style.width = `${pct}%`;
    if (txt) {
      if (p.files_done >= p.total_files && p.total_files > 0 && !p.active) {
        txt.textContent = `✓ Đã gửi xong ${p.files_done}/${p.total_files} tệp!`;
        triggerPetExpression("love", "📱", "Điện thoại đã nhận đủ tệp! 💖", 2600);
      } else {
        txt.textContent = `Đang gửi ${p.files_done}/${p.total_files} tệp (${pct}%)`;
      }
    }
  }).catch(() => {});

  // Kết quả hút màu từ màn hình (Alt+C hoặc nút Hút màu)
  listen("island-color-picked", (e) => {
    const p = e?.payload;
    if (!p || !p.hex) return;
    navigator.clipboard?.writeText(p.hex).catch(() => {});
    const timeStr = new Date().toTimeString().slice(0, 5);
    clipboardItems = clipboardItems.filter((x) => x.text !== p.hex);
    const pinned = clipboardItems.filter((x) => x.pinned);
    const recent = clipboardItems.filter((x) => !x.pinned);
    recent.unshift({ text: p.hex, time: timeStr, pinned: false });
    clipboardItems = [...pinned, ...recent];
    if (typeof renderClipboardList === "function") renderClipboardList();
    if (typeof saveClipboardState === "function") saveClipboardState();
    document.getElementById("hudIconText").textContent = "🎨";
    document.getElementById("hudTitle").textContent = "Đã hút mã màu";
    document.getElementById("hudSub").textContent = `RGB(${p.r}, ${p.g}, ${p.b}) · Đã chép vào Clipboard`;
    document.getElementById("hudRightVal").textContent = p.hex;
    document.getElementById("hudRingArc").style.strokeDashoffset = "0";
    playTone("tick");
    triggerPetExpression("starry", "🎨", `Đã chép màu ${p.hex}`, 2400);
    if (!isExpanded) triggerPeek("bt", 3200);
  }).catch(() => {});

  // Độ sáng màn hình (WMI / DDC/CI / Software Gamma)
  listen("island-brightness", (e) => {
    const p = e?.payload;
    if (!p || settings.hudBrightness === false) return;
    const lvl = Math.max(5, Math.min(100, Math.round(Number(p.level) || 100)));
    document.getElementById("hudIconText").textContent = lvl < 35 ? "🔅" : "🔆";
    document.getElementById("hudTitle").textContent = "Độ sáng màn hình";
    document.getElementById("hudSub").textContent = p.soft
      ? "Điều chỉnh phần mềm (Gamma)"
      : (p.mode === "ddc" ? "Màn hình ngoài (DDC/CI)" : "Màn hình tích hợp (WMI)");
    document.getElementById("hudRightVal").textContent = `${lvl}%`;
    document.getElementById("hudRingArc").style.strokeDashoffset = (69.1 * (1 - lvl / 100)).toFixed(1);
    if (!isExpanded) triggerPeek("bt", 2200);
  }).catch(() => {});

  // Hình ảnh vừa sao chép vào Clipboard (CF_DIB)
  listen("island-clipboard-image", (e) => {
    const img = e?.payload;
    if (!img || !img.id || settings.clipboard === false) return;
    clipboardImages = [img, ...clipboardImages.filter((x) => x.id !== img.id)].slice(0, 12);
    if (typeof renderClipboardList === "function") renderClipboardList();
  }).catch(() => {});
}

// Bấm ra ngoài vùng #mn ngay bên trong cửa sổ WebView2 -> Thu gọn tức thì
document.addEventListener("pointerdown", (e) => {
  if (isExpanded && !isPinned && !isAiResizing && mn && !mn.contains(e.target)) {
    collapseNotch(true);
  }
});

// Nhấn phím Escape khi tai thỏ đang mở -> Thu gọn tức thì
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isExpanded) {
    collapseNotch(true);
  }
});

// Bấm vào tai thỏ khi đang đóng sẽ mở ra
mn.addEventListener("click", (e) => {
  if (!isExpanded) {
    e.stopPropagation();
    openNotch(currentPage);
  }
});

// Chuột phải vào tai thỏ để mở Cửa sổ Cài đặt
mn.addEventListener("contextmenu", async (e) => {
  if (e.target.closest(".sh-card") || e.target.closest(".trow")) return;
  e.preventDefault();
  try {
    await invoke("open_settings_window");
  } catch (_) {
    showState(mn.dataset.s === "settings" ? currentPage : "settings", 0);
  }
});

// Thông báo trạng thái mạng trực tiếp
window.addEventListener("offline", () => {
  if (settings.popupWifi !== false && settings.sounds) {
    document.getElementById("hudIconText").textContent = "📡";
    document.getElementById("hudTitle").textContent = "Mất kết nối Internet";
    document.getElementById("hudSub").textContent = "Không có tín hiệu mạng";
    document.getElementById("hudRightVal").textContent = "MẤT";
    document.getElementById("hudRingArc").style.strokeDashoffset = "69.1";
    triggerPeek("bt", 3500);
  }
});
window.addEventListener("online", () => {
  if (settings.popupWifi !== false && settings.sounds) {
    document.getElementById("hudIconText").textContent = "📶";
    document.getElementById("hudTitle").textContent = "Đã kết nối Internet";
    document.getElementById("hudSub").textContent = "Mạng hoạt động bình thường";
    document.getElementById("hudRightVal").textContent = "KẾT NỐI";
    document.getElementById("hudRingArc").style.strokeDashoffset = "0";
    triggerPeek("bt", 2500);
  }
});

// Cuộn con lăn chuột để chuyển trang mượt mà (có chống dội sự kiện & không cản vùng cuộn nội bộ)
let lastWheelTime = 0;
mn.addEventListener("wheel", (e) => {
  if (!isExpanded || mn.dataset.s === "settings" || mn.dataset.s === "lyrics") return;
  if (
    e.target.closest(".todo-list-scroll") ||
    e.target.closest(".sh-cards-row") ||
    e.target.closest(".sh-clip-pane") ||
    e.target.closest(".today-notif-list") ||
    e.target.closest(".today-mini-tasks") ||
    e.target.closest(".ai-chat-body") ||
    e.target.closest(".settings-grid") ||
    e.target.closest(".wth-daily-rows")
  ) return;
  e.preventDefault();
  const now = performance.now();
  if (now - lastWheelTime < 160) return;
  lastWheelTime = now;
  const dir = e.deltaY > 0 ? 1 : -1;
  cyclePage(dir);
}, { passive: false });

function cyclePage(delta) {
  cancelHoverCloseTimer();
  lastExpandAt = performance.now();
  const activePages = getActivePages();
  const idx = Math.max(0, activePages.indexOf(currentPage));
  const nextIdx = (idx + delta + activePages.length) % activePages.length;
  currentPage = activePages[nextIdx];
  showState(currentPage, delta);
}

document.querySelectorAll(".js-prev-page").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    cancelHoverCloseTimer();
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelHoverCloseTimer();
    cyclePage(-1);
  });
});

document.querySelectorAll(".js-next-page").forEach((btn) => {
  btn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    cancelHoverCloseTimer();
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelHoverCloseTimer();
    cyclePage(1);
  });
});

document.querySelectorAll("#pageDots i").forEach((dot) => {
  dot.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    cancelHoverCloseTimer();
  });
  dot.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelHoverCloseTimer();
    lastExpandAt = performance.now();
    const p = dot.dataset.page;
    const activePages = getActivePages();
    if (p && p !== currentPage && activePages.includes(p)) {
      const oldIdx = activePages.indexOf(currentPage);
      const newIdx = activePages.indexOf(p);
      currentPage = p;
      showState(p, newIdx > oldIdx ? 1 : -1);
    }
  });
});

document.getElementById("btnHdrNotifBell")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  if (!settings.todayPage) {
    settings.todayPage = true;
    applySettingsUI();
    saveSettingsState();
  }
  currentPage = "today";
  showState("today", 0);
});

document.getElementById("hdrWeatherBadge")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  if (!settings.weatherPage) {
    settings.weatherPage = true;
    applySettingsUI();
    saveSettingsState();
  }
  currentPage = "weather";
  showState("weather", 0);
});

document.getElementById("btnPinNotch").addEventListener("click", (e) => {
  e.stopPropagation();
  isPinned = !isPinned;
  playTone("tick");
  e.currentTarget.classList.toggle("active", isPinned);
});

document.getElementById("btnHdrQuickSearch")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  collapseNotch(true);
  invoke("toggle_overlay_window", { kind: "quick_search" }).catch(() => {});
});

document.getElementById("btnHdrQuickPanel")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  collapseNotch(true);
  invoke("toggle_overlay_window", { kind: "quick_panel" }).catch(() => {});
});

document.getElementById("btnOpenSettings").addEventListener("click", async (e) => {
  e.stopPropagation();
  collapseNotch(true);
  try {
    await invoke("open_settings_window");
  } catch (_) {
    showState("settings", 0);
  }
});

document.getElementById("btnCollapseNotch")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  collapseNotch(true);
});

document.getElementById("btnOpenFullSettings")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  await invoke("open_settings_window").catch(() => {});
});

document.getElementById("btnCloseSettings").addEventListener("click", (e) => {
  e.stopPropagation();
  showState(currentPage, 0);
});

// ============================================================
// 3. HỆ THỐNG THÚ CƯNG (PET) SỐNG ĐỘNG & BIỂU CẢM ĐA TRẠNG THÁI (12 LOÀI × 12+ BIỂU CẢM)
// ============================================================

function getActivePetProfile() {
  return PET_PROFILES[settings.petType] || PET_PROFILES.island || PET_PROFILES.aura || PET_PROFILES.bot;
}

function syncPetAvatarAndTitle() {
  const prof = getActivePetProfile();
  if (hdrPetBtn) {
    hdrPetBtn.title = `${prof.name} · Bấm trái để cưng nựng (bấm 3 lần siêu yêu), chuột phải để đổi thú cưng!`;
  }
  if (miniPetWidget) {
    miniPetWidget.title = `${prof.name} · Chuột phải để đổi thú cưng`;
  }
}

function setEmoteText(txt) {
  if (miniPetEmote && miniPetEmote.textContent !== txt) miniPetEmote.textContent = txt;
  if (petEmoteFull && petEmoteFull.textContent !== txt) petEmoteFull.textContent = txt;
}

function showPetBubble(text, durationMs = 1900) {
  if (!text || !hdrPetBubble) return;
  clearTimeout(bubbleHideTimer);
  lastBubbleText = text;
  lastBubbleUntil = Date.now() + durationMs;
  hdrPetBubble.textContent = text;
  if (isExpanded) {
    hdrPetBubble.classList.add("show");
    bubbleHideTimer = setTimeout(() => {
      hdrPetBubble.classList.remove("show");
    }, durationMs);
  } else {
    hdrPetBubble.classList.remove("show");
  }
}

function applyMoodDOM(mood) {
  if (mn.dataset.mood !== mood) {
    mn.dataset.mood = mood;
  }
  const isSleep = mood === "sleep";
  const isHappy = mood === "happy";
  const isDancing = mood === "dancing";

  mn.classList.toggle("pet-sleep", isSleep);
  mascotEyes?.classList.toggle("sleep", isSleep);
  mascotEyes?.classList.toggle("happy", isHappy);
  mascotEyes?.classList.toggle("dancing", isDancing);
  [miniPetWidget, hdrLivePet].forEach((b) => {
    b?.classList.toggle("sleep", isSleep);
    b?.classList.toggle("happy", isHappy);
    b?.classList.toggle("dancing", isDancing);
  });
  if (isDancing) {
    if (mascotEyes && mascotEyes.style.transform) mascotEyes.style.transform = "";
    if (miniPetFace && miniPetFace.style.transform) miniPetFace.style.transform = "";
    if (hdrPetFace && hdrPetFace.style.transform) hdrPetFace.style.transform = "";
  }
}

// ===== HẠT BAY (Object Pool cố định 6 thẻ mỗi vị trí, không sinh thêm DOM) =====
function buildFxPool(host) {
  if (!host) return;
  const arr = [];
  for (let i = 0; i < 6; i++) {
    const s = document.createElement("span");
    s.className = "pet-particle";
    host.appendChild(s);
    arr.push(s);
  }
  fxPools.push({ host, arr, i: 0 });
}
buildFxPool(hdrPetBtn);
buildFxPool(miniPetWidget);
buildFxPool(document.getElementById("layerPet"));

function spawnPetFx(symbols, count = 3) {
  if (!symbols || document.hidden || settings.reduceEffects) return;
  const curS = mn.dataset.s;
  for (const pool of fxPools) {
    const hId = pool.host.id;
    const isVis =
      (hId === "hdrPetBtn" && isExpanded) ||
      (hId === "miniPetWidget" && curS === "both") ||
      (hId === "layerPet" && curS === "pet");
    if (!isVis) continue;
    for (let k = 0; k < count; k++) {
      const el = pool.arr[pool.i++ % pool.arr.length];
      el.textContent = symbols[k % symbols.length];
      el.style.setProperty("--dx", ((k - (count - 1) / 2) * 10 + (Math.random() - 0.5) * 4).toFixed(1) + "px");
      el.style.setProperty("--dy", (-(7 + Math.random() * 4)).toFixed(1) + "px");
      el.style.setProperty("--rot", ((Math.random() - 0.5) * 36).toFixed(0) + "deg");
      el.classList.remove("fly");
      void el.offsetWidth;
      el.style.animationDelay = k * 65 + "ms";
      el.classList.add("fly");
    }
  }
}

function triggerPetExpression(mood, emoteText = "", bubbleText = "", durationMs = 2000) {
  idleTicks = 0;
  activeTempMood = mood;
  activeMoodUntil = Date.now() + durationMs;
  clearTimeout(moodRestoreTimer);

  applyMoodDOM(mood);
  spawnPetFx(MOOD_FX[mood], 3);
  if (emoteText) {
    setEmoteText(emoteText);
    if (hdrPetHeart) hdrPetHeart.textContent = emoteText;
  }
  if (bubbleText) {
    showPetBubble(bubbleText, durationMs);
  }
  if (hdrPetBtn && (mood === "happy" || mood === "love" || mood === "starry")) {
    hdrPetBtn.classList.add("loved");
    setTimeout(() => hdrPetBtn.classList.remove("loved"), Math.min(1300, durationMs));
  }

  moodRestoreTimer = setTimeout(() => {
    activeTempMood = "";
    activeMoodUntil = 0;
    updatePetMood();
  }, durationMs);
}

function updatePetMood() {
  const prof = getActivePetProfile();
  syncPetAvatarAndTitle();

  const isMinimalPet = settings.petType === "aura" || !!settings.petMinimalFace;
  const isPlaying = mediaState.playing;
  const petMiniBars = document.getElementById("petMiniBars");
  if (petMiniBars) {
    const targetOp = isPlaying && !isMinimalPet ? "0.9" : "0";
    if (petMiniBars.style.opacity !== targetOp) petMiniBars.style.opacity = targetOp;
  }

  // Nếu đang trong thời gian biểu cảm tức thời (nháy mắt, trái tim, ngôi sao, chóng mặt...), giữ nguyên
  if (activeTempMood && Date.now() < activeMoodUntil) {
    applyMoodDOM(activeTempMood);
    return;
  }
  activeTempMood = "";

  if (isPlaying) {
    idleTicks = 0;
    applyMoodDOM("dancing");
    const notes = ["♪", "♫", "♬"];
    const note = notes[Math.floor(Date.now() / 1500) % notes.length];
    setEmoteText(note);
    if (!isMinimalPet) {
      spawnPetFx(["♪", "♫"], 1);
    }
  } else if (pomoRunning) {
    idleTicks = 0;
    if (pomoIsBreak) {
      applyMoodDOM("relaxed");
      setEmoteText("☕");
    } else {
      applyMoodDOM("focused");
      setEmoteText("🔥");
    }
  } else if (waterData.reminderOn && waterCountdownSec > 0 && waterCountdownSec <= 120) {
    idleTicks = 0;
    applyMoodDOM("thirsty");
    setEmoteText("💧");
  } else if (prevBatteryPct > 0 && prevBatteryPct < 10 && !isSystemCharging) {
    applyMoodDOM("cry");
    setEmoteText("😭");
  } else if (prevBatteryPct > 0 && prevBatteryPct < 20 && !isSystemCharging && !isMinimalPet) {
    applyMoodDOM("tired");
    setEmoteText("🪫");
  } else {
    idleTicks++;
    const hr = new Date().getHours();
    const isLateNight = hr >= 23 || hr < 5;

    // Mặc định giữ đôi mắt mở to phát sáng chuẩn ảnh mẫu (chỉ tự nhắm mắt ngủ khi người dùng bật petAutoSleep trong Cài đặt)
    if (settings.petAutoSleep && idleTicks === 8) {
      applyMoodDOM("sleepy");
      setEmoteText("💤");
    } else if (settings.petAutoSleep && idleTicks > 8) {
      applyMoodDOM("sleep");
      setEmoteText(isLateNight ? "🌙" : "zZz");
    } else if (isSystemCharging && idleTicks % 4 === 1 && !isMinimalPet) {
      applyMoodDOM("charging");
      setEmoteText("⚡");
    } else if (!isMinimalPet && idleTicks % 5 === 3) {
      applyMoodDOM("wink");
      setEmoteText("😉");
    } else {
      applyMoodDOM(!isMinimalPet && isLateNight && settings.petAutoSleep ? "tired" : "idle");
      const idleEmotes = prof.idleEmotes;
      const em = idleEmotes[idleTicks % idleEmotes.length];
      setEmoteText(em);
    }
  }
}

mn.addEventListener("pointermove", (e) => {
  const now = performance.now();

  // 1. Ánh mắt liếc theo con trỏ chuột mượt mà (cache getBoundingClientRect tránh Reflow)
  if (now - lastCursorTrackAt > 28) {
    lastCursorTrackAt = now;
    if (!cachedMnRect || now - cachedMnRectAt > 250) {
      cachedMnRect = mn.getBoundingClientRect();
      cachedMnRectAt = now;
    }
    const rect = cachedMnRect;
    if (rect.width > 0 && rect.height > 0) {
      const nx = ((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2));
      const ny = ((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2));
      const dx = Math.max(-4.5, Math.min(4.5, nx * 4.2)).toFixed(1);
      const dy = Math.max(-2.2, Math.min(2.2, ny * 2.0)).toFixed(1);
      const look = `translate(${dx}px, ${dy}px)`;
      if (mascotEyes && mn.dataset.mood !== "dancing") mascotEyes.style.transform = look;
      if (miniPetFace && mn.dataset.mood !== "dancing") miniPetFace.style.transform = look;
      if (hdrPetFace && mn.dataset.mood !== "dancing") {
        hdrPetFace.style.transform = `translate(${(dx * 0.55).toFixed(1)}px, ${(dy * 0.55).toFixed(1)}px)`;
      }
    }
  }

  // 2. Phát hiện lắc chuột nhanh trên vùng tai thỏ (ngoài vùng xoa đầu Pet) -> Thú cưng chóng mặt (@_@)
  const onPetDirect = e.target && e.target.closest && e.target.closest("#hdrPetBtn, #miniPetWidget");
  if (!onPetDirect && !petDrag && activeTempMood !== "pat" && lastMouseX !== null) {
    const vx = e.clientX - lastMouseX;
    if (Math.abs(vx) > 16) {
      const dir = vx > 0 ? 1 : -1;
      if (dir !== lastMoveDir) {
        lastMoveDir = dir;
        if (now - firstShakeAt > 900) {
          shakeReversals = 1;
          firstShakeAt = now;
        } else {
          shakeReversals++;
          if (shakeReversals >= 6 && activeTempMood !== "dizzy") {
            shakeReversals = 0;
            playTone("pet");
            triggerPetExpression("dizzy", "💫", "Á chóng mặt quá @_@", 2300);
          }
        }
      }
    }
  }
  lastMouseX = e.clientX;
});

setInterval(() => {
  // Khi đang ngủ và không phát nhạc, bỏ qua cập nhật DOM để CPU nghỉ hoàn toàn (0.0%)
  if (idleTicks > 6 && !mediaState.playing && !pomoRunning && !isExpanded && !activeTempMood) {
    return;
  }
  updatePetMood();

  if (!isExpanded && idleTicks <= 5 && performance.now() - lastCursorTrackAt > 1800) {
    const dx = ((Math.random() - 0.5) * 6.5).toFixed(1);
    const dy = ((Math.random() - 0.5) * 2.8).toFixed(1);
    const look = Math.random() < 0.5 ? `translate(${dx}px, ${dy}px)` : "translate(0px, 0px)";
    const isDancingMood = mn.dataset.mood === "dancing";
    if (mascotEyes && !isDancingMood) mascotEyes.style.transform = look;
    if (miniPetFace && !isDancingMood) miniPetFace.style.transform = look;
    if (hdrPetFace && !isDancingMood) hdrPetFace.style.transform = look;
  } else if (idleTicks > 5) {
    if (hdrPetFace && hdrPetFace.style.transform !== "translate(0px, 0px)") hdrPetFace.style.transform = "translate(0px, 0px)";
    if (mascotEyes && mascotEyes.style.transform !== "translate(0px, 0px)") mascotEyes.style.transform = "translate(0px, 0px)";
    if (miniPetFace && miniPetFace.style.transform !== "translate(0px, 0px)") miniPetFace.style.transform = "translate(0px, 0px)";
  }
}, 2800);

function triggerPetHappyWave(customBubble = "") {
  const prof = getActivePetProfile();
  const now = Date.now();
  if (now - lastPetClickTime < 1400) {
    petClickCombo++;
  } else {
    petClickCombo = 1;
  }
  lastPetClickTime = now;

  if (petClickCombo >= 3) {
    petClickCombo = 0;
    triggerPetExpression("love", "💖", customBubble || `Yêu bạn nhất luôn!! ${prof.loveEmote}`, 2400);
  } else {
    const phrases = prof.phrases || ["Hehe thích quá! ♥"];
    const msg = customBubble || phrases[Math.floor(Math.random() * phrases.length)];
    triggerPetExpression("happy", prof.loveEmote, msg, 1700);
  }
}

function cycleNextPet(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const curIdx = PET_KEYS.indexOf(settings.petType);
  const nextKey = PET_KEYS[(curIdx + 1) % PET_KEYS.length];
  settings.petType = nextKey;
  playTone("pet");
  applySettingsUI();
  saveSettingsState();
  const prof = getActivePetProfile();
  triggerPetExpression("starry", prof.loveEmote, `Xin chào! Mình là ${prof.name}`, 2000);
}

// ===== CHỌC LIÊN TỤC -> DỖI (💢), XOA ĐẦU -> HẾT GIẬN, KÉO MÁ MOCHI (JELLY) =====

function pokePet() {
  const prof = getActivePetProfile();
  const now = Date.now();
  pokeCount = now - pokeLast < 1100 ? pokeCount + 1 : 1;
  pokeLast = now;

  if (pokeCount >= 5) {
    playTone("pet");
    triggerPetExpression(
      "angry",
      "💢",
      pokeCount === 5 ? "Á nhột! Đừng chọc nữa mà!! 💢" : "Hứ! Dỗi rồi! Xoa đầu mới hết giận! 💢",
      3400
    );
    return;
  }
  if (activeTempMood === "angry" && now < activeMoodUntil) {
    triggerPetExpression("angry", "💢", "Hứ! Xoa đầu đi mới hết dỗi! 💢", 2600);
    return;
  }
  if (pokeCount >= 3) {
    triggerPetExpression("love", "💖", `Yêu bạn nhất luôn!! ${prof.loveEmote}`, 2400);
  } else {
    const phrases = prof.phrases || ["Hehe thích quá! ♥"];
    const msg = phrases[Math.floor(Math.random() * phrases.length)];
    triggerPetExpression("happy", prof.loveEmote, msg, 1800);
  }
}

function detectHeadpat(e) {
  const now = performance.now();
  if (now - patLastT > 350 || patLastX === null) {
    patDist = 0;
    patLastX = e.clientX;
  }
  patDist += Math.abs(e.clientX - patLastX);
  patLastX = e.clientX;
  patLastT = now;
  if (patDist >= 42 && now > patCooldownUntil) {
    patDist = 0;
    pokeCount = 0;
    patCooldownUntil = now + 1000;
    const wasAngry = activeTempMood === "angry";
    const msg = wasAngry ? "Hết giận rồi nè~ Ưm thích quá 😌" : PAT_PHRASES[Math.floor(Math.random() * PAT_PHRASES.length)];
    triggerPetExpression("pat", "💕", msg, 1800);
  }
}

function applyJelly(d, dx, dy) {
  const sx = Math.max(0.7, Math.min(1.5, 1 + Math.abs(dx) * 0.025 - Math.abs(dy) * 0.012));
  const sy = Math.max(0.7, Math.min(1.5, 1 + Math.abs(dy) * 0.025 - Math.abs(dx) * 0.012));
  const rot = Math.max(-14, Math.min(14, dx * 0.6));
  const tx = Math.max(-9, Math.min(9, dx * 0.35));
  const ty = Math.max(-6, Math.min(6, dy * 0.35));
  const base = d.centered ? "translate(-50%, -50%) " : "";
  d.body.style.transform = `${base}translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sx.toFixed(2)}, ${sy.toFixed(2)})`;
}

function releaseJelly(d) {
  const base = d.centered ? "translate(-50%, -50%) " : "";
  d.body.style.transition = "transform 0.55s cubic-bezier(0.3, 1.9, 0.45, 0.85)";
  d.body.style.transform = `${base}translate(0px, 0px) rotate(0deg) scale(1, 1)`;
  setTimeout(() => {
    d.body.style.transition = "";
    d.body.style.transform = "";
  }, 620);
}

function bindPetGestures(btn, body, centered) {
  if (!btn || !body) return;
  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    petDrag = { btn, body, centered, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
  });
  btn.addEventListener("pointermove", (e) => {
    if (petDrag && petDrag.btn === btn) {
      const dx = e.clientX - petDrag.x;
      const dy = e.clientY - petDrag.y;
      if (!petDrag.moved && Math.hypot(dx, dy) > 5) {
        petDrag.moved = true;
        body.style.transition = "none";
        triggerPetExpression("surprised", "🍡", "Á! Đừng kéo má mình~ 🍡", 1900);
      }
      if (petDrag.moved) applyJelly(petDrag, dx, dy);
      return;
    }
    detectHeadpat(e);
  });
  const end = (e) => {
    if (!petDrag || petDrag.btn !== btn) return;
    const d = petDrag;
    petDrag = null;
    try { btn.releasePointerCapture(d.id); } catch (_) {}
    if (d.moved) {
      petDragMoved = true;
      setTimeout(() => { petDragMoved = false; }, 120);
      releaseJelly(d);
      playTone("pet");
      triggerPetExpression("happy", "🍡", "Boing~ 🍡", 1600);
    }
  };
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
}

bindPetGestures(hdrPetBtn, hdrLivePet, false);
bindPetGestures(miniPetWidget, miniPetWidget, true);
bindPetGestures(document.getElementById("layerPet"), mascotEyes, false);

hdrPetBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (petDragMoved) return;
  playTone("pet");
  pokePet();
});

miniPetWidget?.addEventListener("click", (e) => {
  if (petDragMoved) {
    e.stopPropagation();
    return;
  }
  if (settings.openMode === "hover") {
    e.stopPropagation();
    playTone("pet");
    pokePet();
  }
});

hdrPetBtn?.addEventListener("contextmenu", cycleNextPet);
miniPetWidget?.addEventListener("contextmenu", cycleNextPet);
document.getElementById("layerPet")?.addEventListener("contextmenu", cycleNextPet);

// ============================================================
// 4. ĐỒNG HỒ TIẾNG VIỆT, PIN & THÔNG BÁO PHẦN CỨNG (PEEK)
// ============================================================

function updateClock() {
  const d = new Date();
  const t = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (t === lastClockStr) return;
  lastClockStr = t;
  const dt = `${DAYS_VI[d.getDay()]}, ${d.getDate()} Th${d.getMonth() + 1}`;
  document.querySelectorAll(".js-time").forEach((el) => (el.textContent = t));
  document.querySelectorAll(".js-date").forEach((el) => (el.textContent = dt));
  if (typeof checkPrayerSchedule === "function") checkPrayerSchedule(d);
  if (typeof updateLiveActivityPill === "function") updateLiveActivityPill();
  if (typeof renderCapsuleState === "function") renderCapsuleState();
  const curDayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  if (calendarLastDayKey && curDayKey !== calendarLastDayKey && typeof fetchCalendarAgenda === "function") {
    fetchCalendarAgenda();
  }
  if (isExpanded && mn.dataset.s === "widgets" && typeof renderWidgetsPage === "function") {
    renderWidgetsPage();
  }
  if (isExpanded && mn.dataset.s === "prayer" && typeof renderPrayerPage === "function") {
    renderPrayerPage();
  }
}
updateClock();
setInterval(updateClock, 10000);

function updateStatusRing() {
  const mode = settings.statusRing || "auto";
  if (mn) mn.dataset.ring = mode;
  let pct = 100;
  let tip = "Pin hệ thống";
  if (mode === "water") {
    const goal = Math.max(100, Number(waterData?.goalMl) || 2000);
    pct = Math.min(100, Math.round(((Number(waterData?.intakeMl) || 0) / goal) * 100));
    tip = `Nước uống hôm nay: ${pct}% (${waterData?.intakeMl || 0}/${goal} ml)`;
  } else if (mode === "todo") {
    const total = Array.isArray(todoList) ? todoList.length : 0;
    const done = total > 0 ? todoList.filter((t) => t.done).length : 0;
    pct = total > 0 ? Math.round((done / total) * 100) : 0;
    tip = `Việc cần làm: ${done}/${total} (${pct}%)`;
  } else if (mode === "cpu") {
    pct = Math.max(0, Math.min(100, Number(sysStats.cpuPct) || 0));
    tip = `CPU hệ thống: ${pct}%`;
  } else if (mode === "ram") {
    pct = Math.max(0, Math.min(100, Number(sysStats.ramPct) || 0));
    tip = `RAM hệ thống: ${pct}% (${sysStats.ramUsedGb}/${sysStats.ramTotalGb} GB)`;
  } else {
    pct = prevBatteryPct <= 100 ? Math.max(0, prevBatteryPct) : 100;
    tip = `Pin hệ thống: ${pct}%${isSystemCharging ? " (Đang sạc)" : ""}`;
  }
  const pStr = `${pct}%`;
  ["idleRing", "bothRing", "hdrRing"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.setProperty("--p", pStr);
      el.title = tip;
    }
  });
}

window.__islandBatteryUpdate = (pct, isCharging, acChanged) => {
  isSystemCharging = !!isCharging;
  const cleanPct = pct <= 100 ? Math.max(0, pct) : 100;
  const pStr = `${cleanPct}%`;
  updateStatusRing();
  document.getElementById("chargePct").textContent = pStr;
  document.getElementById("chargeTitle").textContent = isCharging ? "Đang sạc pin" : "Đang dùng pin";
  document.getElementById("chargeSub").textContent = isCharging ? "Đã kết nối bộ sạc" : "Đã rút bộ sạc";

  if (acChanged) {
    lastBattAlertLevel = "none";
    if (isCharging) {
      triggerPetExpression("charging", "⚡", "Đang nạp đầy năng lượng! ⚡", 2400);
      if (typeof pushAppNotification === "function") {
        pushAppNotification("⚡", "Đã cắm bộ sạc", `Pin hiện tại ${cleanPct}% · Đang nạp năng lượng`, false);
      }
    } else {
      triggerPetExpression("surprised", "🔋", "Đã chuyển sang dùng pin", 1800);
      if (typeof pushAppNotification === "function") {
        pushAppNotification("🔋", "Đã rút bộ sạc", `Đang dùng pin (${cleanPct}%)`, false);
      }
    }
    if (settings.popupBattery !== false && settings.sounds) {
      triggerPeek("charge");
    }
  } else if (settings.popupBattery !== false && pct <= 100) {
    // Cảnh báo pin nhiều cấp độ (Island 1.2.0: <=10% Cực yếu, <=20% Yếu, 100% Đầy pin)
    if (!isCharging && cleanPct <= 10 && lastBattAlertLevel !== "critical") {
      lastBattAlertLevel = "critical";
      document.getElementById("chargeTitle").textContent = "Pin cực yếu!";
      document.getElementById("chargeSub").textContent = `Chỉ còn ${cleanPct}% · Hãy cắm sạc ngay`;
      playTone("chime");
      triggerPetExpression("cry", "🪫", `Cứu với! Pin chỉ còn ${cleanPct}% thôi! 😭`, 3500);
      if (typeof pushAppNotification === "function") {
        pushAppNotification("🪫", `Pin cực yếu (${cleanPct}%)`, "Hãy kết nối bộ sạc ngay lập tức!", false);
      }
      triggerPeek("charge", 4200);
    } else if (!isCharging && cleanPct <= 20 && cleanPct > 10 && lastBattAlertLevel !== "low" && lastBattAlertLevel !== "critical") {
      lastBattAlertLevel = "low";
      document.getElementById("chargeTitle").textContent = "Pin yếu";
      document.getElementById("chargeSub").textContent = `Còn ${cleanPct}% · Hãy cắm sạc sớm`;
      triggerPetExpression("tired", "🪫", `Pin còn ${cleanPct}%, nhớ cắm sạc nhé~`, 2800);
      if (typeof pushAppNotification === "function") {
        pushAppNotification("🪫", `Pin yếu (${cleanPct}%)`, "Hãy chuẩn bị cắm sạc cho thiết bị", false);
      }
      triggerPeek("charge", 3500);
    } else if (isCharging && cleanPct === 100 && lastBattAlertLevel !== "full") {
      lastBattAlertLevel = "full";
      document.getElementById("chargeTitle").textContent = "Đã sạc đầy 100%";
      document.getElementById("chargeSub").textContent = "Pin đã đầy · Bạn có thể rút sạc";
      triggerPetExpression("starry", "🔋", "Pin đầy 100% rồi! ✨", 2800);
      if (typeof pushAppNotification === "function") {
        pushAppNotification("🔋", "Đã sạc đầy 100%", "Pin đã đầy, bạn có thể rút bộ sạc", false);
      }
      triggerPeek("charge", 3500);
    } else if (cleanPct > 25 && cleanPct < 100) {
      lastBattAlertLevel = "none";
    }
  }

  if (isExpanded && mn.dataset.s === "widgets" && typeof renderWidgetsPage === "function") {
    renderWidgetsPage();
  }
};

window.__islandHardwareEvent = (kind, val, mutedArg) => {
  const now = Date.now();
  if (kind === "caps") {
    if (settings.hudCaps === false) return;
    document.getElementById("hudIconText").textContent = "⌨";
    document.getElementById("hudTitle").textContent = "Phím Caps Lock";
    document.getElementById("hudSub").textContent = val ? "ĐANG BẬT VIẾT HOA" : "Đã tắt viết hoa";
    document.getElementById("hudRightVal").textContent = val ? "BẬT" : "TẮT";
    document.getElementById("hudRingArc").style.strokeDashoffset = val ? "0" : "69.1";
    triggerPeek("bt");
  } else if (kind.startsWith("vol_")) {
    if (settings.hudVolume === false) return;
    if (now - lastHudTime < 80) return;
    lastHudTime = now;
    if (typeof val === "number") sysVolumePct = Math.max(0, Math.min(100, Math.round(val)));
    if (typeof mutedArg === "boolean") sysVolumeMuted = mutedArg;
    const muted = sysVolumeMuted || kind === "vol_mute";
    document.getElementById("hudIconText").textContent = muted ? "🔇" : (sysVolumePct < 35 ? "🔉" : "🔊");
    document.getElementById("hudTitle").textContent = "Âm lượng hệ thống";
    document.getElementById("hudSub").textContent = muted ? "Đã tắt tiếng" : (lastAudioOutputName || "Đồng bộ trực tiếp với Windows");
    document.getElementById("hudRightVal").textContent = muted ? "TẮT" : `${sysVolumePct}%`;
    const offset = muted ? 69.1 : 69.1 * (1 - sysVolumePct / 100);
    document.getElementById("hudRingArc").style.strokeDashoffset = offset.toFixed(1);
    triggerPeek("bt");
  }
};

function triggerPeek(peekState, durationMs = 2500) {
  if (isExpanded) return;
  clearTimeout(peekReturnTimer);
  showState(peekState, 0);
  peekReturnTimer = setTimeout(() => {
    if (!isExpanded) showState(getClosedState(), 0);
  }, durationMs);
}

// ============================================================
// 5. BẮT NHẠC HỆ THỐNG (GSMTC) & ĐỒNG BỘ SỐ GIÂY CHÍNH XÁC (SIÊU NHẸ)
// ============================================================

function fmtTime(sec) {
  if (!sec || sec < 0 || !isFinite(sec)) return "00:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function formatSourceApp(appId) {
  if (!appId) return "Hệ thống";
  const low = appId.toLowerCase();
  if (low.includes("chrome")) return "Chrome";
  if (low.includes("msedge") || low.includes("edge")) return "Edge";
  if (low.includes("firefox")) return "Firefox";
  if (low.includes("brave")) return "Brave";
  if (low.includes("opera")) return "Opera";
  if (low.includes("coccoc") || low.includes("browser")) return "Trình duyệt";
  if (low.includes("spotify")) return "Spotify";
  if (low.includes("music")) return "Apple Music";
  if (low.includes("vlc")) return "VLC";
  return appId.split(".")[0].slice(0, 12);
}

function setTextIfChanged(id, val) {
  const el = document.getElementById(id);
  if (el && el.textContent !== val) el.textContent = val;
}

function setSmartScrollText(id, val) {
  const host = document.getElementById(id);
  if (!host) return;
  const text = String(val ?? "");
  let inner = host.querySelector(".smart-scroll-inner");
  if (!inner) {
    host.textContent = "";
    inner = document.createElement("span");
    inner.className = "smart-scroll-inner";
    host.appendChild(inner);
  }
  if (host.dataset.rawText === text && host.dataset.measuredWidth === String(host.clientWidth)) {
    return;
  }
  host.dataset.rawText = text;
  inner.textContent = text;
  host.classList.remove("is-scrolling");
  host.style.removeProperty("--smart-dist");
  host.style.removeProperty("--smart-dur");

  requestAnimationFrame(() => {
    const hostW = host.clientWidth;
    host.dataset.measuredWidth = String(hostW);
    if (hostW <= 0) return;
    const overflow = Math.ceil(inner.scrollWidth - hostW);
    if (overflow > 3) {
      const dur = Math.max(4.5, (overflow / 18) + 2.5);
      host.style.setProperty("--smart-dist", `-${overflow + 6}px`);
      host.style.setProperty("--smart-dur", `${dur.toFixed(1)}s`);
      host.classList.add("is-scrolling");
    }
  });
}

function extractAlbumArtColor(imgSrc, cb) {
  if (!imgSrc || imgSrc.includes(".svg")) return cb(null);
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    try {
      const cvs = document.createElement("canvas");
      cvs.width = 16;
      cvs.height = 16;
      const ctx = cvs.getContext("2d", { willReadFrequently: true });
      if (!ctx) return cb(null);
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;
      let maxSat = -1, bestR = 44, bestG = 100, bestB = 184;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lum = (max + min) / 2;
        if (lum < 24 || lum > 235) continue;
        const sat = max === 0 ? 0 : (max - min) / max;
        if (sat > maxSat) {
          maxSat = sat;
          bestR = r; bestG = g; bestB = b;
        }
        rTotal += r; gTotal += g; bTotal += b;
        count++;
      }
      if (maxSat > 0.15) {
        cb({ r: bestR, g: bestG, b: bestB });
      } else if (count > 0) {
        cb({
          r: Math.round(rTotal / count),
          g: Math.round(gTotal / count),
          b: Math.round(bTotal / count)
        });
      } else {
        cb(null);
      }
    } catch (_) {
      cb(null);
    }
  };
  img.onerror = () => cb(null);
  img.src = imgSrc;
}

function renderMediaUI() {
  const has = mediaState.hasSession && !!mediaState.title;
  const title = has ? mediaState.title : "Chưa phát nhạc";
  const artist = has
    ? (mediaState.artist || formatSourceApp(mediaState.sourceApp))
    : "Bật nhạc trên trình duyệt, YouTube hoặc Spotify để đồng bộ";
  const lyrSub = has && currentLyricsSource
    ? `${artist} · ${currentLyricsSource}`
    : artist;

  setSmartScrollText("musicTitle", title);
  setSmartScrollText("musicArtist", artist);
  setSmartScrollText("lyrTitle", title);
  setSmartScrollText("lyrArtist", lyrSub);
  setTextIfChanged("musicSourceBadge", has ? formatSourceApp(mediaState.sourceApp) : "Hệ thống");

  const isPaused = !has || !mediaState.playing;
  document.getElementById("idleBars")?.classList.toggle("paused", isPaused);
  document.getElementById("bothBars")?.classList.toggle("paused", isPaused);
  document.getElementById("hdrBars")?.classList.toggle("paused", isPaused);
  document.getElementById("miniLyrBars")?.classList.toggle("paused", isPaused);

  if (lastRenderedPlayState !== !isPaused) {
    lastRenderedPlayState = !isPaused;
    const svgHtml = !isPaused ? PAUSE_SVG_PATH : PLAY_SVG_PATH;
    document.querySelectorAll(".js-play-svg").forEach((svg) => {
      svg.innerHTML = svgHtml;
    });
    if (isPaused && activeTempMood === "dancing") {
      activeTempMood = "";
      activeMoodUntil = 0;
    }
    updatePetMood();
    if (settings.minimal && !isExpanded) {
      syncNotchBounds();
    }
  }

  const effectiveThumb = (has && mediaState.thumb) ? mediaState.thumb : "robot-avatar-dark.svg";
  if (lastRenderedThumb !== effectiveThumb) {
    lastRenderedThumb = effectiveThumb;
    const musicArt = document.getElementById("musicArt");
    const lyrArt = document.getElementById("lyrArt");
    const miniLyrArt = document.getElementById("miniLyrArt");
    const bg = `url("${effectiveThumb}")`;
    if (musicArt) musicArt.style.backgroundImage = bg;
    if (lyrArt) lyrArt.style.backgroundImage = bg;
    if (miniLyrArt) miniLyrArt.style.backgroundImage = bg;

    if (has && mediaState.thumb && settings.albumGlow !== false) {
      extractAlbumArtColor(effectiveThumb, (col) => {
        if (col && mn && settings.albumGlow !== false) {
          mn.style.setProperty("--album-glow-rgb", `${col.r}, ${col.g}, ${col.b}`);
          mn.style.setProperty("--album-glow", `rgba(${col.r}, ${col.g}, ${col.b}, 0.55)`);
          mn.classList.add("has-album-glow");
        } else if (mn) {
          mn.classList.remove("has-album-glow");
        }
      });
    } else if (mn) {
      mn.classList.remove("has-album-glow");
      mn.style.removeProperty("--album-glow-rgb");
      mn.style.removeProperty("--album-glow");
    }
  }

  if (isExpanded || mn.dataset.s === "mini-lyrics") {
    updateMediaProgressUI();
  }
}

function updateMiniLyricsBarText(lineText, isDim = false, lineProgress = 0) {
  const el = document.getElementById("miniLyrText");
  const stage = document.getElementById("miniLyrStage");
  if (!el || !stage) return;
  const fallback = (mediaState.hasSession && mediaState.title)
    ? `♪ ${mediaState.title}`
    : "♪ Đang chờ lời bài hát...";
  const nextText = (lineText && String(lineText).trim()) ? String(lineText).trim() : fallback;

  if (lastMiniLyrText !== nextText || el.textContent !== nextText) {
    lastMiniLyrText = nextText;
    el.classList.remove("compact-txt", "scrolling", "pop");
    el.textContent = nextText;
    el.style.removeProperty("--marquee-dist");
    el.style.removeProperty("--marquee-dur");
    void el.offsetWidth;
    el.classList.add("pop");

    // Tự động co giãn bề ngang viên thuốc Mini-Lyrics (220px -> 420px) để hiển thị trọn câu
    let rawTextW = el.scrollWidth;
    let idealW = Math.ceil(rawTextW + 78);
    if (idealW > 380) {
      el.classList.add("compact-txt");
      rawTextW = el.scrollWidth;
      idealW = Math.ceil(rawTextW + 78);
    }
    const nextPillW = Math.max(220, Math.min(420, idealW));
    if (Math.abs(nextPillW - currentMiniLyrWidth) >= 4) {
      currentMiniLyrWidth = nextPillW;
      if (mn) mn.style.setProperty("--mini-lyr-w", `${nextPillW}px`);
      if (mn && mn.dataset.s === "mini-lyrics") {
        syncNotchBounds("mini-lyrics");
      }
    }

    const availStageW = Math.max(130, currentMiniLyrWidth - 76);
    cachedLineOverflow = Math.max(0, rawTextW - availStageW);
    stage.classList.toggle("fits-all", cachedLineOverflow <= 2);
  }

  el.classList.toggle("dim", !!isDim);

  if (isDim) {
    if (cachedLineOverflow > 4) {
      el.style.margin = "0";
      const dur = Math.max(4.0, (cachedLineOverflow / 20) + 2.0);
      el.style.setProperty("--marquee-dist", `-${cachedLineOverflow + 8}px`);
      el.style.setProperty("--marquee-dur", `${dur.toFixed(1)}s`);
      el.classList.add("scrolling");
    } else {
      el.classList.remove("scrolling");
      el.style.transform = "translateX(0px)";
      el.style.margin = "0 auto";
    }
    return;
  }

  el.classList.remove("scrolling");

  // Câu ngắn vừa khung (<= 420px): căn giữa sắc nét như Spotify / ZingMP3
  // Câu quá dài (> 420px): giữ nguyên đầu câu 18% thời gian đầu, sau đó lướt nhẹ sang phải để đọc hết vế cuối
  if (cachedLineOverflow > 2) {
    el.style.margin = "0";
    const clamped = Math.min(1.0, Math.max(0.0, Number(lineProgress) || 0));
    const panRatio = clamped <= 0.18 ? 0 : Math.min(1.0, (clamped - 0.18) / 0.68);
    const tx = -(cachedLineOverflow + 8) * panRatio;
    el.style.transform = `translateX(${tx.toFixed(1)}px)`;
  } else {
    el.style.transform = "translateX(0px)";
    el.style.margin = "0 auto";
  }
}

function updateMediaProgressUI() {
  const has = mediaState.hasSession && !!mediaState.title;
  const dur = has && mediaState.dur > 0 ? mediaState.dur : 0;
  const pos = has ? (dur > 0 ? Math.min(dur, Math.max(0, mediaState.pos)) : Math.max(0, mediaState.pos)) : 0;
  const pct = has ? (dur > 0 ? Math.min(100, (pos / dur) * 100) : (mediaState.playing ? 35 : 0)) : 0;
  const rem = dur > 0 ? Math.max(0, dur - pos) : 0;

  const rightText = !has
    ? "00:00"
    : (dur > 0 ? (showRemainingMode ? "-" + fmtTime(rem) : fmtTime(dur)) : "LIVE");
  const posText = fmtTime(pos);
  const pctStr = `${pct.toFixed(1)}%`;

  setTextIfChanged("musicElapsed", posText);
  setTextIfChanged("musicRemain", rightText);
  const mFill = document.getElementById("musicProgFill");
  if (mFill && mFill.style.width !== pctStr) mFill.style.width = pctStr;

  const miniFill = document.getElementById("miniLyrProgFill");
  if (miniFill && miniFill.style.width !== pctStr) miniFill.style.width = pctStr;

  if (mn.dataset.s === "lyrics" || mn.dataset.s === "mini-lyrics") {
    if (mn.dataset.s === "lyrics") {
      setTextIfChanged("lyrElapsed", posText);
      setTextIfChanged("lyrRemain", rightText);
      const lFill = document.getElementById("lyrProgFill");
      if (lFill && lFill.style.width !== pctStr) lFill.style.width = pctStr;
    }
    syncLyricsScroll(pos);
  }
}

document.getElementById("musicRemain").addEventListener("click", (e) => {
  e.stopPropagation();
  showRemainingMode = !showRemainingMode;
  updateMediaProgressUI();
});

async function pollSystemMedia() {
  if (isPollingMedia) return;
  isPollingMedia = true;
  try {
    const t0 = performance.now();
    const info = await invoke("get_system_media", { knownSongKey: lastThumbSongKey });
    const ipcLagSec = Math.min(0.10, Math.max(0, (performance.now() - t0) / 2000));

    if (info && info.has_session && info.title && info.title.trim()) {
      const wasPlaying = mediaState.playing;
      const newSongKey = `${info.title || ""}|${info.artist || ""}`.trim();
      const isNewSong = newSongKey !== lastFetchedSongKey && !!info.title;

      mediaState.hasSession = true;
      if (Date.now() >= mediaToggleHoldUntil || isNewSong) {
        mediaState.playing = !!info.playing;
      }
      mediaState.title = info.title.trim();
      mediaState.artist = info.artist || "";
      mediaState.album = info.album || "";
      mediaState.sourceApp = info.source_app || "";
      mediaState.audioPeak = Number(info.audio_peak) || 0;

      if (info.duration_secs > 0) {
        mediaState.dur = info.duration_secs;
      } else if (isNewSong) {
        mediaState.dur = 0;
      }

      const durJustResolved =
        !isNewSong &&
        info.duration_secs > 20 &&
        Math.abs(info.duration_secs - lastFetchedSongDur) >= 1.5;

      const targetPos = info.position_secs >= 0
        ? (mediaState.playing ? info.position_secs + ipcLagSec : info.position_secs)
        : 0;

      if (isNewSong || durJustResolved) {
        lastFetchedSongKey = newSongKey;
        lastFetchedSongDur = mediaState.dur || 0;
        mediaState.pos = targetPos;
        fetchLyricsForCurrentSong(mediaState.title, mediaState.artist);
      } else if (info.position_secs >= 0) {
        const diff = Math.abs(targetPos - mediaState.pos);
        if (!wasPlaying || !mediaState.playing || diff > 0.40) {
          mediaState.pos = targetPos;
        } else if (diff > 0.08) {
          mediaState.pos += (targetPos - mediaState.pos) * 0.25;
        }
      }

      if (info.thumbnail_b64) {
        mediaState.thumb = info.thumbnail_b64;
        lastThumbSongKey = newSongKey;
      } else if (newSongKey !== lastThumbSongKey) {
        mediaState.thumb = "";
      }
    } else {
      const hadSessionOrLyrics =
        mediaState.hasSession ||
        !!lastFetchedSongKey ||
        parsedLyrics.length > 0 ||
        !!currentLyricsSource;
      mediaState.hasSession = false;
      mediaState.playing = false;
      mediaState.title = "";
      mediaState.artist = "";
      mediaState.album = "";
      mediaState.sourceApp = "";
      mediaState.pos = 0;
      mediaState.dur = 0;
      mediaState.thumb = "";
      mediaState.audioPeak = 0;
      lastThumbSongKey = "";
      lastFetchedSongKey = "";
      lastFetchedSongDur = 0;

      if (hadSessionOrLyrics) {
        currentLyricsFetchToken++;
        parsedLyrics = [];
        currentLyricsSource = "";
        activeLyricIdx = -1;
        const lyrList = document.getElementById("lyrList");
        if (lyrList) {
          lyrList.style.transform = "translateY(0px)";
          lyrList.innerHTML = `<li class="on"><span class="lyr-txt">Đang chờ lời bài hát...</span></li><li><span class="lyr-txt">Hãy bật nhạc trên YouTube hoặc Spotify</span></li>`;
        }
        updateMiniLyricsBarText("♪ Đang chờ lời bài hát...", true, 0);
      }
      if (!isExpanded && mn && mn.dataset.s === "mini-lyrics") {
        showState(getClosedState(), 0);
      }
    }
    if (!document.hidden) {
      renderMediaUI();
    }
  } catch (_) {
  } finally {
    isPollingMedia = false;
  }
}

function getMediaPollIntervalMs() {
  if (myWindowLabel !== "main") return 2500;
  if (document.hidden) return 3000;
  const mode = settings.perfMode || "balanced";
  if (mode === "ultra") return mediaState.playing ? 450 : 1200;
  if (mode === "eco") return mediaState.playing ? 1200 : 2500;
  return mediaState.playing ? 700 : 1600;
}

function scheduleMediaPoll(immediate = false) {
  clearTimeout(mediaPollTimer);
  if (immediate) {
    pollSystemMedia().finally(() => {
      mediaPollTimer = setTimeout(() => scheduleMediaPoll(true), getMediaPollIntervalMs());
    });
  } else {
    mediaPollTimer = setTimeout(() => scheduleMediaPoll(true), getMediaPollIntervalMs());
  }
}
scheduleMediaPoll(true);

setInterval(() => {
  const now = performance.now();
  const dtSec = (now - lastMediaTickMs) / 1000;
  lastMediaTickMs = now;
  if (document.hidden) return;

  if (mediaState.hasSession && mediaState.playing && dtSec > 0 && dtSec < 2.5) {
    if (mediaState.dur <= 0 || mediaState.pos < mediaState.dur) {
      mediaState.pos += dtSec;
      if (mediaState.dur > 0 && mediaState.pos > mediaState.dur) {
        mediaState.pos = mediaState.dur;
      }
    }
    // Cập nhật thanh tiến trình & lời bài hát trên DOM khi tai thỏ đang mở Nhạc, Lời bài hát hoặc thu gọn ở chế độ Mini-Lyrics
    if (
      (isExpanded && (mn.dataset.s === "music" || mn.dataset.s === "lyrics")) ||
      mn.dataset.s === "mini-lyrics"
    ) {
      updateMediaProgressUI();
    }
  }
}, 200);

document.querySelectorAll(".js-media-toggle").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!mediaState.hasSession) return;
    mediaState.playing = !mediaState.playing;
    mediaToggleHoldUntil = Date.now() + 850;
    renderMediaUI();
    await invoke("media_control", { action: "play_pause", positionSecs: null }).catch(() => {});
    setTimeout(pollSystemMedia, 380);
  });
});

document.querySelectorAll(".js-media-prev").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    mediaState.pos = 0;
    updateMediaProgressUI();
    await invoke("media_control", { action: "prev", positionSecs: null }).catch(() => {});
    setTimeout(pollSystemMedia, 400);
  });
});

document.querySelectorAll(".js-media-next").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    mediaState.pos = 0;
    updateMediaProgressUI();
    await invoke("media_control", { action: "next", positionSecs: null }).catch(() => {});
    setTimeout(pollSystemMedia, 400);
  });
});

function handleProgressSeek(e, barEl) {
  e.stopPropagation();
  if (mediaState.dur <= 0) return;
  const rect = barEl.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const targetSec = ratio * mediaState.dur;
  mediaState.pos = targetSec;
  updateMediaProgressUI();
  invoke("media_control", { action: "seek", positionSecs: targetSec }).catch(() => {});
}

document.getElementById("musicProgBar").addEventListener("click", function (e) {
  handleProgressSeek(e, this);
});
document.getElementById("lyrProgBar").addEventListener("click", function (e) {
  handleProgressSeek(e, this);
});

document.getElementById("btnToggleLyrics").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!settings.lyrics) {
    settings.lyrics = true;
    saveSettingsState();
    applySettingsUI();
  }
  keepMiniLyricsOnCollapse = true;
  showState("lyrics", 0);
  if (parsedLyrics.length === 0 && mediaState.hasSession && mediaState.title) {
    fetchLyricsForCurrentSong(mediaState.title, mediaState.artist);
  } else {
    requestAnimationFrame(() => syncLyricsScroll(mediaState.pos, true));
  }
});
document.getElementById("btnCloseLyrics").addEventListener("click", (e) => {
  e.stopPropagation();
  keepMiniLyricsOnCollapse = false;
  showState("music", 0);
});
document.getElementById("btnReloadLyrics")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (mediaState.title) {
    fetchLyricsForCurrentSong(mediaState.title, mediaState.artist, true);
  }
});

function renderParsedLyricsList(sourceLabel) {
  const lyrList = document.getElementById("lyrList");
  lyrList.innerHTML = "";
  parsedLyrics.forEach((item, idx) => {
    const li = document.createElement("li");
    const sp = document.createElement("span");
    sp.className = "lyr-txt";
    sp.textContent = item.text;
    li.appendChild(sp);
    li.title = `Tua đến câu hát này (${fmtTime(item.time)})`;
    if (idx === 0) li.classList.add("on");
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      // Chuẩn Spotify / ZingMP3: bấm vào câu hát nào thì tua nhạc tới đúng mốc câu đó
      const targetSec = Math.max(0, item.time);
      mediaState.pos = targetSec;
      updateMediaProgressUI();
      syncLyricsScroll(targetSec, true);
      invoke("media_control", { action: "seek", positionSecs: targetSec }).catch(() => {});
    });
    lyrList.appendChild(li);
  });
  currentLyricsSource = sourceLabel || "";
  renderMediaUI();
  activeLyricIdx = -1;
  syncLyricsScroll(mediaState.pos, true);
}

async function fetchLyricsForCurrentSong(title, artist, forceRefresh = false) {
  const lyrList = document.getElementById("lyrList");
  const fetchToken = ++currentLyricsFetchToken;
  parsedLyrics = [];
  currentLyricsSource = "";
  activeLyricIdx = -1;
  lyrList.style.transform = "translateY(0px)";

  if (!title || title === "Chưa phát nhạc") {
    lyrList.innerHTML = `<li class="on"><span class="lyr-txt">Đang chờ lời bài hát...</span></li><li><span class="lyr-txt">Hãy bật nhạc trên YouTube hoặc Spotify</span></li>`;
    updateMiniLyricsBarText("♪ Đang chờ lời bài hát...", true, 0);
    return;
  }

  lyrList.innerHTML = `<li class="on"><span class="lyr-txt">Đang tải lời bài hát...</span></li><li><span class="lyr-txt">${escapeHtml(title)}</span></li>`;
  updateMiniLyricsBarText(`♪ ${title}`, true, 0);

  try {
    const res = await invoke("fetch_lyrics_smart", {
      title: title || "",
      artist: artist || "",
      durationSecs: mediaState.dur || 0,
      forceRefresh: !!forceRefresh,
    });
    if (fetchToken !== currentLyricsFetchToken) return;

    if (res && res.found && Array.isArray(res.lines) && res.lines.length > 0) {
      parsedLyrics = res.lines.map((l) => ({
        time: Number(l.time) || 0,
        text: String(l.text || "").trim(),
      })).filter((l) => l.text.length > 0);

      if (parsedLyrics.length > 0) {
        renderParsedLyricsList(res.source || "");
        return;
      }
    }

    lyrList.innerHTML = `<li class="on"><span class="lyr-txt">Chưa tìm thấy lời cho bài này</span></li><li><span class="lyr-txt">${escapeHtml(title)}</span></li><li style="font-size:12px;opacity:.75"><span class="lyr-txt">Bấm vào đây để thử tải lại ↻</span></li>`;
    updateMiniLyricsBarText(`♪ ${title}`, true, 0);
    lyrList.querySelector("li:last-child")?.addEventListener("click", (e) => {
      e.stopPropagation();
      fetchLyricsForCurrentSong(mediaState.title, mediaState.artist);
    });
  } catch (_) {
    if (fetchToken !== currentLyricsFetchToken) return;
    lyrList.innerHTML = `<li class="on"><span class="lyr-txt">Không thể tải lời bài hát lúc này</span></li><li><span class="lyr-txt">Bấm nút ↻ để thử lại</span></li>`;
    updateMiniLyricsBarText(`♪ ${title}`, true, 0);
  }
}

function syncLyricsScroll(currentSec, forceLayout = false) {
  if (parsedLyrics.length === 0) {
    if (mediaState.hasSession && mediaState.title) {
      updateMiniLyricsBarText(`♪ ${mediaState.title}`, true, 0);
    } else {
      updateMiniLyricsBarText("♪ Đang chờ lời bài hát...", true, 0);
    }
    return;
  }
  let idx = 0;
  // Bù nhẹ 0.12s độ trễ render mắt nhìn như Spotify / ZingMP3
  const leadSec = currentSec + 0.12;
  const firstLineTime = parsedLyrics[0].time;
  const isInIntro = leadSec < firstLineTime - 0.35;

  for (let i = 0; i < parsedLyrics.length; i++) {
    if (leadSec >= parsedLyrics[i].time) idx = i;
    else break;
  }
  const idxChanged = idx !== activeLyricIdx;
  activeLyricIdx = idx;

  let lineProgress = 0;
  if (!isInIntro && parsedLyrics[idx]) {
    const curLineTime = parsedLyrics[idx].time;
    const nextLineTime = (idx + 1 < parsedLyrics.length)
      ? parsedLyrics[idx + 1].time
      : (mediaState.dur > curLineTime ? mediaState.dur : curLineTime + 4.5);
    const rawGap = Math.max(0.8, nextLineTime - curLineTime);
    lineProgress = Math.min(1.0, Math.max(0.0, (leadSec - curLineTime) / rawGap));
  }

  if (parsedLyrics[idx]) {
    if (isInIntro) {
      updateMiniLyricsBarText(`♪ ${parsedLyrics[0].text}`, true, 0);
    } else {
      updateMiniLyricsBarText(parsedLyrics[idx].text, !mediaState.playing, lineProgress);
    }
  }

  if (!idxChanged && !forceLayout) return;

  const lyrList = document.getElementById("lyrList");
  if (!lyrList) return;
  const items = lyrList.querySelectorAll("li");
  items.forEach((li, i) => {
    li.classList.toggle("on", i === idx);
    li.classList.toggle("past", i < idx);
  });
  const activeLi = items[idx];
  if (activeLi && (activeLi.offsetHeight > 0 || activeLi.offsetTop > 0)) {
    const offset = 54 - activeLi.offsetTop - activeLi.offsetHeight / 2;
    lyrList.style.transform = `translateY(${offset}px)`;
  }
}

// ============================================================
// 6. TRANG 2: HẸN GIỜ TẬP TRUNG (POMODORO & LỊCH SỬ FOCUS.TXT)
// ============================================================

const FOCUS_CATEGORIES = {
  work: { label: "Công việc", focus: 25, brk: 5 },
  study: { label: "Học tập", focus: 50, brk: 10 },
  read: { label: "Đọc sách", focus: 30, brk: 5 },
  custom: { label: "Tùy chỉnh", focus: null, brk: null }
};
let pomoCategory = "work";

function getActivePomoDurations() {
  const cat = FOCUS_CATEGORIES[pomoCategory] || FOCUS_CATEGORIES.custom;
  const focusMin = cat.focus !== null ? cat.focus : (Number(settings.pomoFocus) || 25);
  const shortMin = cat.brk !== null ? cat.brk : (Number(settings.pomoShort) || 5);
  return { focusMin, shortMin, label: cat.label };
}

function saveFocusState() {
  focusData.category = pomoCategory;
  focusData.activeSession = {
    running: pomoRunning,
    isBreak: pomoIsBreak,
    remSec: pomoRemSec,
    totalSec: pomoTotalSec,
    completedCount: pomoCompletedCount,
    endEpochMs: pomoRunning ? Date.now() + Math.max(0, pomoRemSec) * 1000 : 0,
    category: pomoCategory
  };
  invoke("save_data_file", {
    filename: "focus.txt",
    content: JSON.stringify(focusData, null, 2)
  }).catch(() => {});
}

function startPomoTimerLoop() {
  clearInterval(pomoInterval);
  pomoInterval = setInterval(() => {
    if (pomoRemSec > 1) {
      pomoRemSec--;
      renderPomo();
    } else {
      pomoRemSec = 0;
      onPomoCompleted();
    }
  }, 1000);
}

function applyPomoCategory(catKey, resetTimer = true) {
  pomoCategory = FOCUS_CATEGORIES[catKey] ? catKey : "work";
  focusData.category = pomoCategory;
  document.querySelectorAll("#pomoCatBar .pomo-cat-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.cat === pomoCategory);
  });
  const { focusMin, shortMin } = getActivePomoDurations();
  const breakBtn = document.getElementById("btnPomoBreak");
  if (breakBtn) {
    breakBtn.textContent = `Nghỉ ${shortMin}p`;
    breakBtn.title = `Chuyển sang Nghỉ giải lao ${shortMin} phút`;
  }
  const focusBtn = document.getElementById("btnPomoFocus");
  if (focusBtn) {
    focusBtn.textContent = `Tập trung ${focusMin}p`;
    focusBtn.title = `Chuyển sang Tập trung ${focusMin} phút`;
  }
  if (resetTimer && !pomoRunning) {
    pomoIsBreak = false;
    pomoDefaultSec = focusMin * 60;
    pomoTotalSec = focusMin * 60;
    pomoRemSec = focusMin * 60;
    pomoModeText = `Thời gian tập trung · ${focusMin} phút`;
    renderPomo();
  }
}

document.querySelectorAll("#pomoCatBar .pomo-cat-chip").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pomoRunning) {
      showPetBubble("Hãy tạm dừng đồng hồ trước khi đổi nhóm!");
      playTone("tick");
      return;
    }
    playTone("tick");
    applyPomoCategory(btn.dataset.cat || "work", true);
    saveFocusState();
  });
});

function renderPomo() {
  const timeEl = document.getElementById("pomoTimeText");
  if (timeEl) timeEl.textContent = fmtTime(pomoRemSec);

  const curRound = (pomoCompletedCount % 4) + 1;
  const { label: catLabel } = getActivePomoDurations();
  const roundBadge = document.getElementById("pomoRoundBadge");
  if (roundBadge) {
    roundBadge.textContent = pomoIsBreak
      ? `Nghỉ giải lao · Vòng ${curRound} / 4`
      : `${catLabel} · ${curRound} / 4`;
  }

  // Tính giờ kết thúc dự kiến (ví dụ: 10:27 đến khi xong)
  const endDate = new Date(Date.now() + Math.max(0, pomoRemSec) * 1000);
  const endStr = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
  const endEl = document.getElementById("pomoEndTimeText");
  if (endEl) endEl.textContent = endStr;

  const modeLbl = document.getElementById("pomoModeLabel");
  if (modeLbl) {
    modeLbl.textContent = pomoRunning ? "đến khi xong" : (pomoRemSec < pomoTotalSec ? "đang tạm dừng" : "khi bắt đầu");
  }

  // Thanh tiến độ tuyến tính bên trái & vòng tròn ẩn
  const elapsedFrac = pomoTotalSec > 0 ? Math.max(0, Math.min(1, (pomoTotalSec - pomoRemSec) / pomoTotalSec)) : 0;
  const remDeg = pomoTotalSec > 0 ? (pomoRemSec / pomoTotalSec) * 360 : 360;
  document.getElementById("pomoRing")?.style.setProperty("--pomo-deg", `${remDeg.toFixed(1)}deg`);
  const linFill = document.getElementById("pomoLinearFill");
  if (linFill) {
    linFill.style.width = `${Math.max(6, Math.round((pomoRunning || elapsedFrac > 0 ? Math.max(0.08, elapsedFrac) : 0.35) * 100))}%`;
  }

  // Nút Bắt đầu / Tạm dừng & nút chuyển chế độ
  const startSvg = document.getElementById("pomoStartSvg");
  if (startSvg) startSvg.innerHTML = pomoRunning ? PAUSE_SVG_PATH : PLAY_SVG_PATH;
  const startTxt = document.getElementById("pomoStartText");
  if (startTxt) startTxt.textContent = pomoRunning ? "Tạm dừng" : "Bắt đầu";

  const brkBtn = document.getElementById("btnPomoBreak");
  const focBtn = document.getElementById("btnPomoFocus");
  if (brkBtn && focBtn) {
    brkBtn.style.display = pomoIsBreak ? "none" : "";
    focBtn.style.display = pomoIsBreak ? "" : "none";
  }

  // Cập nhật biểu đồ 4 phiên + Nghỉ dài chuẩn Island 1.2.0
  const completedInCycle = pomoCompletedCount % 4;
  const activeSegIdx = pomoIsBreak && completedInCycle === 0 && pomoCompletedCount > 0 ? 5 : (completedInCycle + 1);
  const segItems = document.querySelectorAll("#pomoSegBars .pomo-seg-item");
  segItems.forEach((el, idx) => {
    const segNum = idx + 1; // 1..4, 5=long
    const fillEl = el.querySelector(".seg-fill");
    const orbEl = el.querySelector(".seg-orb");
    el.classList.remove("done", "active");
    if (segNum < activeSegIdx) {
      el.classList.add("done");
      if (fillEl) fillEl.style.width = "100%";
    } else if (segNum === activeSegIdx) {
      el.classList.add("active");
      const pct = Math.max(15, Math.min(100, Math.round(elapsedFrac * 100) || 28));
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (orbEl) orbEl.style.left = `${pct}%`;
    } else {
      if (fillEl) fillEl.style.width = "0%";
    }
  });

  const dotItems = document.querySelectorAll("#pomoSegBars .pomo-seg-dot");
  dotItems.forEach((dot, idx) => {
    dot.classList.toggle("done", idx < completedInCycle);
  });

  const lblSpans = document.querySelectorAll(".pomo-seg-labels span");
  lblSpans.forEach((sp, idx) => {
    sp.classList.toggle("active", idx + 1 === activeSegIdx);
  });

  // Dòng thống kê hôm nay (VD: 2g 10p · 4 phiên)
  const key = todayIsoKey();
  const minsToday = focusData.date === key ? (Number(focusData.minutesToday) || 0) : 0;
  const sessToday = focusData.date === key ? (Number(focusData.sessionsToday) || 0) : 0;
  const hh = Math.floor(minsToday / 60);
  const mm = minsToday % 60;
  const statsEl = document.getElementById("pomoStatsText");
  if (statsEl) {
    const timePart = hh > 0 ? `${hh}g ${String(mm).padStart(2, "0")}p` : `${mm} phút`;
    statsEl.textContent = `${timePart} · ${sessToday} phiên hôm nay`;
  }

  updatePetMood();
  if (typeof updateLiveActivityPill === "function") updateLiveActivityPill();
}

function onPomoCompleted() {
  clearInterval(pomoInterval);
  pomoInterval = null;
  pomoRunning = false;
  const finishedBreak = pomoIsBreak;
  if (!finishedBreak) {
    pomoCompletedCount++;
    const addedMin = Math.max(1, Math.round(pomoTotalSec / 60));
    const key = todayIsoKey();
    if (focusData.date !== key) {
      focusData.date = key;
      focusData.minutesToday = 0;
      focusData.sessionsToday = 0;
    }
    focusData.minutesToday = (Number(focusData.minutesToday) || 0) + addedMin;
    focusData.sessionsToday = (Number(focusData.sessionsToday) || 0) + 1;
    if (!focusData.history || typeof focusData.history !== "object") focusData.history = {};
    focusData.history[key] = {
      minutes: focusData.minutesToday,
      sessions: focusData.sessionsToday
    };
    if (typeof pushAppNotification === "function") {
      pushAppNotification(
        "🍅",
        "Hoàn thành phiên Tập trung!",
        `+${addedMin} phút · Tổng hôm nay: ${focusData.minutesToday}p (${focusData.sessionsToday} phiên)`,
        false
      );
    }

    if (settings.pomoAutoBreak !== false) {
      const useLong = settings.pomoAutoLong && pomoCompletedCount % 4 === 0;
      const { shortMin } = getActivePomoDurations();
      const breakMin = useLong ? (Number(settings.pomoLong) || 15) : shortMin;
      pomoIsBreak = true;
      pomoDefaultSec = breakMin * 60;
      pomoTotalSec = breakMin * 60;
      pomoRemSec = breakMin * 60;
      pomoRunning = true;
      pomoModeText = `Tự động nghỉ ${breakMin} phút ☕`;
      startPomoTimerLoop();
    } else {
      pomoModeText = "Đã hoàn thành phiên tập trung! 🎉";
    }
  } else {
    const { focusMin } = getActivePomoDurations();
    pomoIsBreak = false;
    pomoDefaultSec = focusMin * 60;
    pomoTotalSec = focusMin * 60;
    pomoRemSec = focusMin * 60;
    pomoModeText = "Đã hết giờ nghỉ giải lao! 🔔";
    if (typeof pushAppNotification === "function") {
      pushAppNotification("☕", "Hết giờ nghỉ giải lao!", "Sẵn sàng bắt đầu vòng tập trung tiếp theo", false);
    }
  }
  saveFocusState();
  renderPomo();

  playTone("chime");
  triggerPetExpression(
    finishedBreak ? "happy" : "starry",
    finishedBreak ? "⏰" : "🎉",
    finishedBreak ? "Hết giờ nghỉ, quay lại thôi! 🔔" : "Hoàn thành phiên tập trung! 🎉",
    3200
  );

  if (!isExpanded) {
    document.getElementById("hudIconText").textContent = "⏰";
    document.getElementById("hudTitle").textContent = finishedBreak ? "Hết giờ nghỉ!" : "Hoàn thành Tập trung!";
    document.getElementById("hudSub").textContent = finishedBreak
      ? "Sẵn sàng cho phiên tiếp theo"
      : (settings.pomoAutoBreak !== false ? "Đang tự động nghỉ giải lao ☕" : "Đã hết thời gian đếm ngược");
    document.getElementById("hudRightVal").textContent = "XONG";
    document.getElementById("hudRingArc").style.strokeDashoffset = "0";
    triggerPeek("bt", 4500);
  }
}

document.getElementById("btnPomoStart").addEventListener("click", (e) => {
  e.stopPropagation();
  ensureAudioCtx();
  if (pomoRemSec <= 0) {
    pomoRemSec = pomoTotalSec;
  }
  pomoRunning = !pomoRunning;
  playTone("tick");

  if (pomoRunning) {
    const mins = Math.round(pomoTotalSec / 60);
    pomoModeText = pomoIsBreak ? `Đang nghỉ giải lao · ${mins} phút` : `Đang tập trung · ${mins} phút`;
    triggerPetExpression(
      pomoIsBreak ? "relaxed" : "focused",
      pomoIsBreak ? "☕" : "🔥",
      pomoIsBreak ? "Nghỉ ngơi thư giãn nhé ☕" : "Tập trung cao độ! 🔥",
      2000
    );
    startPomoTimerLoop();
  } else {
    clearInterval(pomoInterval);
    pomoInterval = null;
    pomoModeText = "Đã tạm dừng đếm ngược";
  }
  saveFocusState();
  renderPomo();
});

document.getElementById("btnPomoReset").addEventListener("click", (e) => {
  e.stopPropagation();
  clearInterval(pomoInterval);
  pomoInterval = null;
  pomoRunning = false;

  pomoRemSec = pomoTotalSec;
  const mins = Math.round(pomoTotalSec / 60);
  pomoModeText = pomoIsBreak ? `Nghỉ giải lao · ${mins} phút` : `Thời gian tập trung · ${mins} phút`;
  playTone("tick");
  saveFocusState();
  renderPomo();
});

document.getElementById("btnPomoMinus").addEventListener("click", (e) => {
  e.stopPropagation();
  const step = pomoTotalSec <= 5 * 60 ? 60 : 5 * 60;
  pomoTotalSec = Math.max(60, pomoTotalSec - step);
  pomoRemSec = pomoTotalSec;
  const mins = Math.round(pomoTotalSec / 60);
  pomoModeText = pomoIsBreak ? `Nghỉ giải lao · ${mins} phút` : `Thời gian tập trung · ${mins} phút`;
  playTone("tick");
  saveFocusState();
  renderPomo();
});

document.getElementById("btnPomoPlus").addEventListener("click", (e) => {
  e.stopPropagation();
  const step = pomoTotalSec < 5 * 60 ? 60 : 5 * 60;
  pomoTotalSec = Math.min(90 * 60, pomoTotalSec + step);
  pomoRemSec = pomoTotalSec;
  const mins = Math.round(pomoTotalSec / 60);
  pomoModeText = pomoIsBreak ? `Nghỉ giải lao · ${mins} phút` : `Thời gian tập trung · ${mins} phút`;
  playTone("tick");
  saveFocusState();
  renderPomo();
});

document.getElementById("btnPomoBreak").addEventListener("click", (e) => {
  e.stopPropagation();
  clearInterval(pomoInterval);
  pomoInterval = null;
  pomoRunning = false;
  pomoIsBreak = true;
  const useLong = settings.pomoAutoLong && pomoCompletedCount > 0 && pomoCompletedCount % 4 === 0;
  const { shortMin } = getActivePomoDurations();
  const breakMin = useLong ? (Number(settings.pomoLong) || 15) : shortMin;
  pomoDefaultSec = breakMin * 60;
  pomoTotalSec = breakMin * 60;
  pomoRemSec = breakMin * 60;
  pomoModeText = `Nghỉ giải lao · ${breakMin} phút`;
  playTone("tick");
  saveFocusState();
  renderPomo();
});

document.getElementById("btnPomoFocus").addEventListener("click", (e) => {
  e.stopPropagation();
  clearInterval(pomoInterval);
  pomoInterval = null;
  pomoRunning = false;
  pomoIsBreak = false;
  const { focusMin } = getActivePomoDurations();
  pomoDefaultSec = focusMin * 60;
  pomoTotalSec = focusMin * 60;
  pomoRemSec = focusMin * 60;
  pomoModeText = `Thời gian tập trung · ${focusMin} phút`;
  playTone("tick");
  saveFocusState();
  renderPomo();
});

// ============================================================
// 7. TRANG 3: NHẮC UỐNG NƯỚC TỰ ĐỘNG & BIỂU ĐỒ THEO GIỜ MƯỢT MÀ
// ============================================================

function initWaterChartDOM() {
  const chart = document.getElementById("waterChart");
  if (!chart || chartBarEls.length === 8) return;
  chart.querySelectorAll(".wbar-col").forEach((el) => el.remove());
  chartBarEls = [];

  for (let i = 0; i < 8; i++) {
    const x = (i + 0.5) * 14 - 3.5;
    const track = document.createElement("span");
    track.className = "wbar-col";
    track.style.left = x + "px";
    track.style.height = "48.5px";
    track.style.background = "rgba(255,255,255,.07)";

    const bar = document.createElement("span");
    bar.className = "wbar-col wgrow";
    bar.style.left = x + "px";
    bar.style.bottom = "1.5px";
    bar.style.height = "0px";
    bar.style.transitionDelay = i * 35 + "ms";
    chart.append(track, bar);
    chartBarEls.push(bar);
  }
}

function renderWaterChart() {
  initWaterChartDOM();
  const curSlot = currentSlotIndex();
  for (let i = 0; i < 8; i++) {
    const v = waterData.hourly[i] || 0;
    const bar = chartBarEls[i];
    if (!bar) continue;
    const hPx = Math.min(48.5, (v / 500) * 48.5);
    bar.dataset.h = hPx.toFixed(1) + "px";
    bar.style.height = bar.dataset.h;
    bar.style.background =
      i === curSlot
        ? "linear-gradient(#5cc6ff,#1d63e0)"
        : "linear-gradient(rgba(92,198,255,.75),rgba(29,99,224,.75))";
  }
}

function currentSlotIndex() {
  const hr = new Date().getHours();
  return Math.min(7, Math.max(0, Math.floor((hr - 7) / 2)));
}

function animateWaterChart() {
  initWaterChartDOM();
  const wbar = document.getElementById("waterProgBar");
  chartBarEls.forEach((b) => {
    b.style.transition = "none";
    b.style.height = "0px";
  });
  wbar.style.transition = "none";
  wbar.style.width = "0%";
  void wbar.offsetWidth;
  chartBarEls.forEach((b) => {
    b.style.transition = "";
    b.style.height = b.dataset.h || "0px";
  });
  wbar.style.transition = "";
  const pct = Math.min(100, (waterData.intakeMl / waterData.goalMl) * 100);
  wbar.style.width = pct.toFixed(1) + "%";
}

function updateWaterStatusLine(customToast = "") {
  const pct = Math.min(100, Math.round((waterData.intakeMl / waterData.goalMl) * 100));
  const statusLine = document.getElementById("waterStatusLine");
  if (!statusLine) return;

  if (customToast) {
    statusLine.innerHTML = `<b style="color:#56c8ff">${customToast}</b>`;
    return;
  }

  if (pct >= 100) {
    statusLine.innerHTML = `Hôm nay <b style="color:#33e07a">${pct}%</b> · Đã đạt mục tiêu! 🎉`;
  } else if (waterData.reminderOn) {
    statusLine.innerHTML = `Hôm nay <b style="color:#4fc0ff">${pct}%</b> · Nhắc sau <b>${fmtTime(waterCountdownSec)}</b>`;
  } else {
    statusLine.innerHTML = `Hôm nay <b style="color:#4fc0ff">${pct}%</b> · Đã tắt hẹn giờ nhắc`;
  }
}

function computeEffectiveWaterIntervalMin() {
  const rawInt = Number(settings.waterInterval) || 0;
  if (rawInt > 0) return rawInt;
  const bottleMl = Number(settings.waterBottle) || 250;
  const goalMl = Number(settings.waterGoal) || 2000;
  const fromHr = Number(settings.waterFrom) || 8;
  const toHr = Number(settings.waterTo) || 22;
  const drinks = Math.max(1, Math.ceil(goalMl / bottleMl));
  const activeMin = Math.max(60, (toHr - fromHr) * 60);
  return Math.max(10, Math.round(activeMin / drinks));
}

function renderWaterUI(customToast = "") {
  const litres = (waterData.intakeMl / 1000).toFixed(2).replace(/\.?0+$/, "") || "0.0";
  const goalL = (waterData.goalMl / 1000).toFixed(1);
  const pct = Math.min(100, (waterData.intakeMl / waterData.goalMl) * 100);
  const bottleMl = Number(settings.waterBottle) || 250;

  document.getElementById("waterLitresText").textContent = litres.includes(".") ? litres : litres + ".0";
  document.getElementById("waterGoalText").textContent = `/ ${goalL} L`;

  const drinkTxt = document.getElementById("waterDrinkText");
  if (drinkTxt) drinkTxt.textContent = `+${bottleMl} ml`;
  const drinkBtn = document.getElementById("btnWaterDrink");
  if (drinkBtn) drinkBtn.title = `Ghi nhận vừa uống +${bottleMl}ml nước`;

  const refillBadge = document.getElementById("waterRefillBadge");
  if (refillBadge) {
    const refills = Math.floor((waterData.intakeMl || 0) / Math.max(50, bottleMl));
    refillBadge.textContent = `${refills} bình`;
    refillBadge.title = `Đã uống tương đương ${refills} bình (${bottleMl}ml/bình) hôm nay`;
  }

  const intBtn = document.getElementById("btnWaterInterval");
  if (intBtn) {
    intBtn.textContent = `⏱ ${waterData.intervalMin || 30}p`;
  }

  const wbar = document.getElementById("waterProgBar");
  wbar.style.width = pct.toFixed(1) + "%";

  document.getElementById("btnWaterReminderToggle").classList.toggle("off", !waterData.reminderOn);
  updateWaterStatusLine(customToast);
  renderWaterChart();
  updateStatusRing();
}

function saveWaterState() {
  if (!waterData.history || typeof waterData.history !== "object") {
    waterData.history = {};
  }
  waterData.history[todayIsoKey()] = waterData.intakeMl || 0;
  invoke("save_data_file", {
    filename: "water.txt",
    content: JSON.stringify(waterData, null, 2)
  }).catch(() => {});
}

setInterval(() => {
  if (!waterData.reminderOn) return;
  if (waterCountdownSec > 1) {
    waterCountdownSec--;
    if (isExpanded && mn.dataset.s === "water") {
      updateWaterStatusLine();
    }
  } else {
    const bottleMl = Number(settings.waterBottle) || 250;
    waterCountdownSec = (waterData.intervalMin || 30) * 60;
    playTone("water_alarm");
    triggerPetExpression("thirsty", "💧", `Khát quá! Uống +${bottleMl}ml nước nhé 💧`, 3400);
    updateWaterStatusLine(`💧 Đến giờ uống +${bottleMl}ml nước rồi!`);

    if (!isExpanded) {
      document.getElementById("hudIconText").textContent = "💧";
      document.getElementById("hudTitle").textContent = "Nhắc uống nước!";
      document.getElementById("hudSub").textContent = `Chu kỳ ${waterData.intervalMin || 30} phút · Hãy uống ${bottleMl}ml`;
      document.getElementById("hudRightVal").textContent = `+${bottleMl}ml`;
      document.getElementById("hudRingArc").style.strokeDashoffset = "15";
      triggerPeek("bt", 5000);
    }
  }
}, 1000);

document.getElementById("btnWaterDrink").addEventListener("click", (e) => {
  e.stopPropagation();
  ensureAudioCtx();
  const bottleMl = Number(settings.waterBottle) || 250;
  waterData.intakeMl += bottleMl;
  const slot = currentSlotIndex();
  waterData.hourly[slot] = (waterData.hourly[slot] || 0) + bottleMl;
  waterCountdownSec = (waterData.intervalMin || 30) * 60;
  playTone("water");
  if (waterData.intakeMl >= waterData.goalMl) {
    triggerPetExpression("starry", "🎉", "Đạt 100% mục tiêu nước hôm nay! 🎉", 2800);
  } else {
    triggerPetExpression("eating", "💧", `Ực ực~ +${bottleMl}ml mát lạnh! 💧`, 1800);
  }
  renderWaterUI();
  saveWaterState();
  emit("island-settings-sync", {
    settings,
    water: { intakeMl: waterData.intakeMl, goalMl: waterData.goalMl }
  }).catch(() => {});
});

document.getElementById("btnWaterGoalCycle").addEventListener("click", (e) => {
  e.stopPropagation();
  const idx = WATER_GOALS.indexOf(waterData.goalMl);
  waterData.goalMl = WATER_GOALS[(idx + 1) % WATER_GOALS.length];
  settings.waterGoal = waterData.goalMl;
  const goalL = (waterData.goalMl / 1000).toFixed(1);
  playTone("tick");
  renderWaterUI(`Đã đặt mục tiêu ngày: ${goalL} L`);
  saveWaterState();
  saveSettingsState();
});

document.getElementById("btnWaterReset").addEventListener("click", (e) => {
  e.stopPropagation();
  const btn = e.currentTarget;
  if (!waterResetArmed) {
    waterResetArmed = true;
    playTone("tick");
    if (btn) btn.style.color = "#ff6b6b";
    updateWaterStatusLine("Bấm nút Đặt lại thêm 1 lần nữa để xác nhận: Chắc chắn?");
    clearTimeout(waterResetConfirmTimer);
    waterResetConfirmTimer = setTimeout(() => {
      waterResetArmed = false;
      if (btn) btn.style.color = "";
      updateWaterStatusLine();
    }, 3000);
    return;
  }
  waterResetArmed = false;
  clearTimeout(waterResetConfirmTimer);
  if (btn) btn.style.color = "";
  waterData.intakeMl = 0;
  waterData.hourly = [0, 0, 0, 0, 0, 0, 0, 0];
  waterCountdownSec = (waterData.intervalMin || 30) * 60;
  playTone("tick");
  renderWaterUI("Đã đặt lại lượng nước hôm nay về 0.0 L");
  saveWaterState();
  emit("island-settings-sync", {
    settings,
    water: { intakeMl: waterData.intakeMl, goalMl: waterData.goalMl }
  }).catch(() => {});
});

document.getElementById("btnWaterInterval").addEventListener("click", (e) => {
  e.stopPropagation();
  const cur = waterData.intervalMin || 30;
  const idx = WATER_INTERVALS.indexOf(cur);
  waterData.intervalMin = WATER_INTERVALS[(idx + 1) % WATER_INTERVALS.length];
  settings.waterInterval = waterData.intervalMin;
  waterCountdownSec = waterData.intervalMin * 60;
  waterData.reminderOn = true;
  settings.waterRemind = true;
  playTone("tick");
  renderWaterUI(`Đã đặt chu kỳ nhắc mỗi ${waterData.intervalMin} phút`);
  saveWaterState();
  saveSettingsState();
});

document.getElementById("btnWaterReminderToggle").addEventListener("click", (e) => {
  e.stopPropagation();
  waterData.reminderOn = !waterData.reminderOn;
  settings.waterRemind = waterData.reminderOn;
  if (waterData.reminderOn) {
    waterCountdownSec = (waterData.intervalMin || 30) * 60;
  }
  playTone("tick");
  renderWaterUI();
  saveWaterState();
  saveSettingsState();
});

// ============================================================
// 8. TRANG 4: KHAY LƯU TỆP (KÉO THẢ & NÚT XÓA TỪNG TỆP)
// ============================================================
function shMix(u) {
  u = shCl(u);
  const [a, b, k] = u < 0.5 ? [PAL[0], PAL[1], u * 2] : [PAL[1], PAL[2], (u - 0.5) * 2];
  return a.map((v, i) => Math.round(v + (b[i] - v) * k));
}

function shDraw() {
  if (!sc) return;
  const W = 480, H = 140, c = sc;
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.clearRect(0, 0, W, H);
  const d = shDropT, rise = d >= 0 && d < 1.1 ? Math.sin(shSm(d / 1.1) * Math.PI) : 0;
  const fade = d >= 0 ? (d < 0.9 ? 1 : 1 - shSm((d - 0.9) / 1.1)) : 1;
  const base = (0.26 * shHov + 0.34 * rise) * fade;
  const pool = (0.42 * shHov + 0.28 * rise) * fade;
  if (base <= 0.004 && pool <= 0.004 && d < 0) return;

  if (base > 0.004) {
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, shRgba(PAL[0], base));
    g.addColorStop(0.5, shRgba(PAL[1], base));
    g.addColorStop(1, shRgba(PAL[2], base));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  const px = d >= 0 ? shDx : shCx;
  if (pool > 0.004) {
    const col = shMix(px / W), R = 170 + 60 * rise;
    const g = c.createRadialGradient(px, H + 18, 0, px, H + 18, R);
    g.addColorStop(0, shRgba(col.map((v) => Math.min(255, v + 51)), pool));
    g.addColorStop(0.55, shRgba(col, pool * 0.45));
    g.addColorStop(1, shRgba(col, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  if (d >= 0 && d < 1.4) {
    const q = 1 - Math.pow(1 - d / 1.4, 3), r = 24 + 430 * q, w = 30, a = 0.22 * (1 - q);
    const g = c.createRadialGradient(px, H - 14, Math.max(0, r - w), px, H - 14, r + w);
    g.addColorStop(0, "rgba(200,236,255,0)");
    g.addColorStop(0.5, `rgba(200,236,255,${a})`);
    g.addColorStop(1, "rgba(200,236,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  c.globalCompositeOperation = "destination-in";
  const m = c.createLinearGradient(0, H, 0, 0);
  m.addColorStop(0, "#000");
  m.addColorStop(0.42, "rgba(0,0,0,.55)");
  m.addColorStop(0.78, "rgba(0,0,0,.08)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = m;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = "source-over";
}

function shFrame(now) {
  const dt = Math.min(0.05, (now - shLast) / 1000);
  shLast = now;
  shHv += (50 * ((shHot ? 1 : 0) - shHov) - 14 * shHv) * dt;
  shHov = shCl(shHov + shHv * dt, 0, 1.04);
  shGv += (-60 * shG - 6 * shGv) * dt;
  shG += shGv * dt;
  if (shDropT >= 0) {
    shDropT += dt * SH_SPEED;
    if (shDropT >= 2) shDropT = -1;
  }
  shDraw();
  const busy = shHot || shHov > 0.002 || shDropT >= 0 || Math.abs(shG) > 0.001 || Math.abs(shGv) > 0.01;
  if (busy) {
    shRaf = requestAnimationFrame(shFrame);
  } else {
    shRaf = 0;
  }
}
function shRun() {
  if (settings.reduceEffects) {
    shStop();
    return;
  }
  if (!shRaf) { shLast = performance.now(); shRaf = requestAnimationFrame(shFrame); }
}
function shSetHot(on) { shHot = on; shRun(); }
function shDropNow() { shHot = false; shDx = shCx; shDropT = 0; shGv = 7.2; shRun(); }
function shStop() {
  if (shRaf) {
    cancelAnimationFrame(shRaf);
    shRaf = 0;
  }
  shHot = false; shHov = 0; shHv = 0; shDropT = -1; shG = 0; shGv = 0;
  if (sc) sc.clearRect(0, 0, 960, 280);
}

function getFileIconSvg(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "islandtext") {
    return '<span class="sh-thumb" style="background:linear-gradient(135deg,#38bdf8,#2563eb)">📝</span>';
  }
  if (ext === "url") {
    return '<span class="sh-thumb" style="background:linear-gradient(135deg,#10b981,#0284c7)">🔗</span>';
  }
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return '<span class="sh-thumb" style="background:radial-gradient(circle at 72% 30%, #fff3c4 0 12%, transparent 13%), linear-gradient(180deg, #56c2ff 0 55%, #f3d38f 55% 70%, #2e9bd6 70%)"></span>';
  }
  if (["mp3", "wav", "flac", "m4a", "ogg"].includes(ext)) {
    return '<span class="sh-thumb" style="background:linear-gradient(135deg,#ff5e7e,#7b4bff)">🎵</span>';
  }
  if (["mp4", "mkv", "mov", "avi", "webm"].includes(ext)) {
    return '<span class="sh-thumb" style="background:linear-gradient(135deg,#2d5bff,#19b8ff)">🎬</span>';
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return '<span class="sh-thumb" style="background:linear-gradient(135deg,#f59e0b,#b45309)">📦</span>';
  }
  return `<span class="sh-thumb"><svg viewBox="0 0 44 44" style="width:32px;height:32px"><path d="M4 11a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#e8a720"/><path d="M4 16h36v18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#ffc94d"/></svg></span>`;
}

function setShelfTab(tab) {
  shelfActiveTab = tab === "clip" ? "clip" : "files";
  if (shelfLayer) {
    shelfLayer.dataset.tab = shelfActiveTab === "clip" ? "clipboard" : "files";
    shelfLayer.classList.toggle("clip-mode", shelfActiveTab === "clip");
  }
  document.getElementById("btnShelfTabFiles")?.classList.toggle("active", shelfActiveTab === "files");
  document.getElementById("btnShelfTabClip")?.classList.toggle("active", shelfActiveTab === "clip");
  if (shelfActiveTab === "clip") {
    renderClipboardList();
  }
}

document.getElementById("btnShelfTabFiles")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  setShelfTab("files");
});

document.getElementById("btnShelfTabClip")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  setShelfTab("clip");
});

function normalizeClipboardList() {
  clipboardItems = (Array.isArray(clipboardItems) ? clipboardItems : [])
    .filter((x) => x && String(x.text || "").trim())
    .map((x) => ({
      text: String(x.text),
      time: String(x.time || ""),
      pinned: !!x.pinned
    }));
  // Mục đã ghim luôn ở trên đầu danh sách
  const pinned = clipboardItems.filter((x) => x.pinned);
  const recent = clipboardItems.filter((x) => !x.pinned);
  const maxRecent = Math.max(5, Math.min(200, Number(settings.clipboardMax) || 50));
  clipboardItems = [...pinned, ...recent.slice(0, maxRecent)];
}

function saveClipboardState() {
  if (settings.clipboardKeep === false) return;
  normalizeClipboardList();
  invoke("save_data_file", {
    filename: "clipboard.txt",
    content: JSON.stringify(clipboardItems, null, 2)
  }).catch(() => {});
}

function parseColorToken(raw) {
  const t = String(raw || "").trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t;
  const rgb = t.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    const r = Math.min(255, Number(rgb[1]));
    const g = Math.min(255, Number(rgb[2]));
    const b = Math.min(255, Number(rgb[3]));
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "";
}

let activeQrState = null;

function openQrOverlay({ mode, title, sub, qrSvg, url, totalFiles = 0 }) {
  const ov = document.getElementById("shelfQrOverlay");
  if (!ov) return;
  activeQrState = { mode, url: url || "" };
  const svgBox = document.getElementById("shelfQrSvgBox");
  const ttlEl = document.getElementById("shelfQrTitle");
  const subEl = document.getElementById("shelfQrSub");
  const progWrap = document.getElementById("shelfQrProgWrap");
  const progFill = document.getElementById("shelfQrProgFill");
  const progTxt = document.getElementById("shelfQrProgTxt");
  const copyBtn = document.getElementById("btnShelfQrCopy");
  if (svgBox) svgBox.innerHTML = qrSvg || "";
  if (ttlEl) ttlEl.textContent = title || "Mã QR";
  if (subEl) subEl.textContent = sub || "";
  if (progWrap) progWrap.style.display = mode === "send" ? "flex" : "none";
  if (progFill) progFill.style.width = "0%";
  if (progTxt && mode === "send") {
    progTxt.textContent = `Đang chờ điện thoại tải (${totalFiles} tệp)...`;
  }
  if (copyBtn) {
    copyBtn.textContent = mode === "send" ? "📋 Chép link" : "📋 Chép chữ";
  }
  ov.style.display = "flex";
}

function closeQrOverlay() {
  const ov = document.getElementById("shelfQrOverlay");
  if (ov) ov.style.display = "none";
  if (activeQrState?.mode === "send") {
    invoke("stop_lan_send").catch(() => {});
    activeSendProgress = null;
    updateLiveActivityPill();
  }
  activeQrState = null;
}

document.getElementById("btnShelfQrClose")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  closeQrOverlay();
});

document.getElementById("btnShelfQrCopy")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (activeQrState?.url) {
    navigator.clipboard?.writeText(activeQrState.url).catch(() => {});
    playTone("tick");
    showPetBubble("Đã sao chép vào Clipboard!");
  }
});

document.getElementById("btnClipColorPick")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  invoke("pick_screen_color").catch(() => {});
});

async function refreshClipboardImages() {
  try {
    const imgs = await invoke("list_clipboard_images");
    if (Array.isArray(imgs)) {
      clipboardImages = imgs;
      renderClipboardImagesShelf();
    }
  } catch (_) {}
}

function renderClipboardImagesShelf() {
  const imgBox = document.getElementById("shelfClipImages");
  if (!imgBox) return;
  if (settings.clipboard === false || !Array.isArray(clipboardImages) || clipboardImages.length === 0) {
    imgBox.style.display = "none";
    imgBox.innerHTML = "";
    return;
  }
  imgBox.style.display = "flex";
  imgBox.innerHTML = "";
  clipboardImages.forEach((img) => {
    const card = document.createElement("div");
    card.className = "sh-clip-img-card" + (img.pinned ? " pinned" : "");
    card.title = `Ảnh ${img.w}×${img.h} · Bấm để sao chép lại vào Clipboard`;
    card.innerHTML = `
      <img src="${img.thumb_b64}" alt="" />
      <span class="sh-clip-img-meta">${img.w}×${img.h}</span>
      <div class="sh-clip-img-acts">
        <button type="button" class="sh-clip-img-btn pin" title="${img.pinned ? "Bỏ ghim" : "Ghim ảnh"}">${img.pinned ? "★" : "☆"}</button>
        <button type="button" class="sh-clip-img-btn del" title="Xóa ảnh">×</button>
      </div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".sh-clip-img-btn")) return;
      e.stopPropagation();
      playTone("tick");
      invoke("copy_clipboard_image", { id: img.id }).then(() => {
        showPetBubble("📸 Đã chép ảnh vào Clipboard!");
      }).catch(() => {});
    });
    card.querySelector(".pin")?.addEventListener("click", (e) => {
      e.stopPropagation();
      playTone("tick");
      invoke("toggle_clipboard_image_pin", { id: img.id }).then(() => refreshClipboardImages()).catch(() => {});
    });
    card.querySelector(".del")?.addEventListener("click", (e) => {
      e.stopPropagation();
      playTone("tick");
      invoke("delete_clipboard_image", { id: img.id }).then(() => refreshClipboardImages()).catch(() => {});
    });
    imgBox.appendChild(card);
  });
}

function renderClipboardList() {
  normalizeClipboardList();
  renderClipboardImagesShelf();
  const countEl = document.getElementById("shelfClipCount");
  if (countEl) countEl.textContent = String(clipboardItems.length + clipboardImages.length);
  const listEl = document.getElementById("shelfClipList");
  const emptyEl = document.getElementById("shelfClipEmpty");
  const searchEl = document.getElementById("shelfClipSearch");
  if (!listEl || !emptyEl) return;

  const hasValidClip = settings.clipboard !== false && (clipboardItems.length > 0 || clipboardImages.length > 0);
  shelfLayer?.classList.toggle("has-clip", hasValidClip);
  if (searchEl) {
    searchEl.style.display = settings.clipboard !== false && clipboardItems.length > 0 ? "" : "none";
  }

  listEl.innerHTML = "";
  if (settings.clipboard === false) {
    emptyEl.style.display = "block";
    emptyEl.innerHTML = 'Đã tắt Lịch sử Clipboard.<br/>Bạn có thể bật lại trong mục <b>Cài đặt → Nhạc, Tiện ích &amp; HUD</b>.';
    return;
  }
  if (clipboardItems.length === 0) {
    emptyEl.style.display = clipboardImages.length > 0 ? "none" : "block";
    if (clipboardImages.length === 0) {
      emptyEl.innerHTML = 'Chưa có mục nào trong Clipboard.<br/>Mọi văn bản hoặc ảnh bạn sao chép (Ctrl+C) sẽ tự động lưu tại đây.';
    }
    return;
  }

  const q = clipSearchQuery.trim().toLowerCase();
  const filtered = q
    ? clipboardItems.filter((it) => String(it.text || "").toLowerCase().includes(q))
    : clipboardItems;

  if (filtered.length === 0) {
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `Không tìm thấy mục nào khớp với "<b>${escapeHtml(clipSearchQuery.trim())}</b>"`;
    return;
  }
  emptyEl.style.display = "none";

  filtered.forEach((item) => {
    const raw = String(item.text || "");
    const isUrl = /^https?:\/\/\S+$/i.test(raw.trim());
    const colorCss = parseColorToken(raw);
    const row = document.createElement("div");
    row.className = "sh-clip-row" + (item.pinned ? " pinned" : "");
    row.title = `${raw.slice(0, 300)}\n• Bấm vào dòng để sao chép lại vào Clipboard`;
    const leadHtml = colorCss
      ? `<span class="sh-clip-swatch" style="background:${escapeHtml(colorCss)}"></span>`
      : (item.pinned ? "📌 " : (isUrl ? "🔗 " : "📋 "));
    row.innerHTML = `
      <span class="sh-clip-txt">${leadHtml}${escapeHtml(raw.replace(/\s+/g, " ").trim())}</span>
      <span class="sh-clip-time">${escapeHtml(item.time || "")}</span>
      <button class="sh-clip-act sh-clip-qr" title="Tạo mã QR để quét nhanh bằng điện thoại">QR</button>
      <button class="sh-clip-act sh-clip-pin${item.pinned ? " on" : ""}" title="${item.pinned ? "Bỏ ghim mục này" : "Ghim lên đầu (không bị xóa khi dọn lịch sử)"}">${item.pinned ? "Bỏ ghim" : "Ghim"}</button>
      <button class="sh-clip-act sh-clip-save" title="Lưu mục này thành tệp ${isUrl ? ".url" : ".islandtext"} trong Khay tệp">Lưu tệp</button>
      <button class="sh-clip-act del sh-clip-del" title="Xóa mục này">×</button>
    `;

    row.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(raw).catch(() => {});
      playTone("tick");
      row.classList.add("copied");
      const meta = row.querySelector(".sh-clip-time");
      const oldMeta = meta ? meta.textContent : "";
      if (meta) meta.textContent = "✓ Đã chép";
      setTimeout(() => {
        row.classList.remove("copied");
        if (meta) meta.textContent = oldMeta;
      }, 1200);
    });

    row.querySelector(".sh-clip-qr")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      playTone("tick");
      try {
        const svg = await invoke("generate_qr_svg", { text: raw.trim() });
        openQrOverlay({
          mode: "text",
          title: colorCss ? `Mã màu ${raw.trim()}` : "Mã QR từ Clipboard",
          sub: raw.replace(/\s+/g, " ").trim().slice(0, 64),
          qrSvg: svg,
          url: raw.trim()
        });
      } catch (err) {
        showPetBubble(String(err || "Nội dung quá dài để tạo mã QR"));
      }
    });

    row.querySelector(".sh-clip-pin")?.addEventListener("click", (e) => {
      e.stopPropagation();
      item.pinned = !item.pinned;
      playTone("tick");
      normalizeClipboardList();
      renderClipboardList();
      saveClipboardState();
    });

    row.querySelector(".sh-clip-save")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const cleanTitle = raw.trim().split(/\r?\n/)[0].slice(0, 32) || "Ghi chú";
        const dropped = await invoke("create_shelf_snippet", {
          title: cleanTitle,
          content: raw,
          isUrl
        });
        if (dropped && dropped.path) {
          addShelfItem(dropped.name, dropped.path, dropped.size);
          setShelfTab("files");
        }
      } catch (_) {}
    });

    row.querySelector(".sh-clip-del")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetIdx = clipboardItems.indexOf(item);
      if (targetIdx >= 0) clipboardItems.splice(targetIdx, 1);
      playTone("tick");
      renderClipboardList();
      saveClipboardState();
    });

    listEl.appendChild(row);
  });
}

document.getElementById("shelfClipSearch")?.addEventListener("input", (e) => {
  clipSearchQuery = String(e.target.value || "");
  renderClipboardList();
});

document.getElementById("shelfClipSearch")?.addEventListener("click", (e) => {
  e.stopPropagation();
});

listen("island-clipboard", (e) => {
  if (settings.clipboard === false) return;
  const text = e.payload?.text;
  const time = e.payload?.time || "";
  if (!text || !String(text).trim()) return;
  const trimmed = String(text);
  const prevItem = clipboardItems.find((x) => x.text === trimmed);
  const wasPinned = !!(prevItem && prevItem.pinned);
  clipboardItems = clipboardItems.filter((x) => x.text !== trimmed);
  const pinnedList = clipboardItems.filter((x) => x.pinned);
  const recentList = clipboardItems.filter((x) => !x.pinned);
  const nextItem = { text: trimmed, time, pinned: wasPinned };
  if (wasPinned) {
    pinnedList.unshift(nextItem);
  } else {
    recentList.unshift(nextItem);
  }
  const maxItems = Math.max(5, Math.min(200, Number(settings.clipboardMax) || 50));
  clipboardItems = [...pinnedList, ...recentList.slice(0, maxItems)];
  renderClipboardList();
  saveClipboardState();
}).catch(() => {});

function getShelfLocalPaths() {
  return shelfItems
    .map((x) => String(x?.path || "").trim())
    .filter((p) => p && !/^https?:\/\//i.test(p));
}

function isShelfImagePath(p) {
  return /\.(png|jpe?g|bmp|gif|webp|tiff?|ico)$/i.test(String(p || ""));
}

async function startLanSendForPaths(paths) {
  if (!paths || paths.length === 0) {
    showPetBubble("Chưa có tệp trên ổ đĩa để gửi!");
    return;
  }
  try {
    const res = await invoke("start_lan_send", { paths });
    if (res && res.qr_svg) {
      openQrOverlay({
        mode: "send",
        title: `Gửi ${res.file_count} tệp (${res.total_size})`,
        sub: res.url,
        qrSvg: res.qr_svg,
        url: res.url,
        totalFiles: res.file_count
      });
    }
  } catch (err) {
    showPetBubble(String(err || "Không thể khởi tạo gửi qua Wi-Fi"));
  }
}

async function runShelfQuickAction(op) {
  const paths = getShelfLocalPaths();
  if (paths.length === 0) {
    showPetBubble("Chưa có tệp hợp lệ trong khay!");
    return;
  }
  try {
    const created = await invoke("quick_file_action", { op, paths });
    if (Array.isArray(created) && created.length > 0) {
      created.forEach((f) => addShelfItem(f.name, f.path, f.size));
      showPetBubble(`✓ Đã tạo ${created.length} tệp (${op.toUpperCase()})`);
    }
  } catch (err) {
    showPetBubble(String(err || "Không thể xử lý tệp"));
  }
}

document.getElementById("btnShelfSendPhone")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  startLanSendForPaths(getShelfLocalPaths());
});
document.getElementById("btnShelfZip")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  runShelfQuickAction("zip");
});
document.getElementById("btnShelfImgHalf")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  runShelfQuickAction("half");
});
document.getElementById("btnShelfImgJpg")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  runShelfQuickAction("jpg");
});
document.getElementById("btnShelfImgPng")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  runShelfQuickAction("png");
});

function renderShelf() {
  shelfLayer.classList.toggle("has", shelfItems.length > 0);
  const localPaths = getShelfLocalPaths();
  const hasLocal = localPaths.length > 0;
  const hasImg = localPaths.some(isShelfImagePath);
  const quickBar = document.getElementById("shelfQuickBar");
  if (quickBar) quickBar.style.display = hasLocal ? "flex" : "none";
  ["btnShelfImgHalf", "btnShelfImgJpg", "btnShelfImgPng"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.style.display = hasImg ? "inline-flex" : "none";
  });

  shelfCardsRow.innerHTML = "";
  shelfItems.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "sh-card";
    card.draggable = true;
    card.title = `${item.path || item.name}\n• Bấm trái vào thẻ: Mở tệp\n• Shift + Bấm trái: Mở thư mục chứa tệp\n• Bấm [📱] để gửi qua QR · Bấm [×] để xóa`;
    const hasFile = Boolean(item.path && !/^https?:\/\//i.test(item.path));
    card.innerHTML = `
      ${hasFile ? '<button class="sh-card-send" title="Gửi tệp này qua QR tới điện thoại">📱</button>' : ""}
      <button class="sh-card-del" title="Xóa tệp này khỏi khay">×</button>
      ${getFileIconSvg(item.name)}
      <span class="sh-name">${escapeHtml(item.name)}</span>
      <span class="sh-size">${escapeHtml(item.size || "Tệp")}</span>
    `;

    card.querySelector(".sh-card-send")?.addEventListener("click", (e) => {
      e.stopPropagation();
      playTone("tick");
      startLanSendForPaths([item.path]);
    });

    // Nút [×] xóa riêng từng tệp
    const delBtn = card.querySelector(".sh-card-del");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      shelfItems.splice(idx, 1);
      playTone("tick");
      renderShelf();
      saveShelfState();
    });

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", item.path || item.name);
    });
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      playTone("tick");
      if (item.path) {
        if (e.shiftKey) {
          invoke("reveal_path_in_explorer", { path: item.path }).catch(() => {});
        } else {
          invoke("open_path_in_explorer", { path: item.path }).catch(() => {});
        }
      } else {
        navigator.clipboard?.writeText(item.name);
      }
    });
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      shelfItems.splice(idx, 1);
      playTone("tick");
      renderShelf();
      saveShelfState();
    });
    shelfCardsRow.appendChild(card);
  });
}

function saveShelfState() {
  invoke("save_data_file", {
    filename: "shelf.txt",
    content: JSON.stringify(shelfItems, null, 2)
  }).catch(() => {});
}

function addShelfItem(name, path, size) {
  if (!name) return;
  if (path && shelfItems.some((x) => x.path === path)) {
    shelfItems = shelfItems.filter((x) => x.path !== path);
  }
  shelfItems.unshift({ name, path: path || "", size: size || "Tệp" });
  shDropNow();
  playTone("water");
  triggerPetExpression("starry", "✨", "Đã cất tệp an toàn! ✨", 2200);
  renderShelf();
  saveShelfState();
}

window.addEventListener("dragenter", (e) => {
  const hasFiles = e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes("Files");
  if (!hasFiles && mn.dataset.s !== "shelf") return;
  e.preventDefault();
  if (mn.dataset.s !== "shelf") {
    currentPage = "shelf";
    openNotch("shelf");
  }
  triggerPetExpression("surprised", "📁", "Thả tệp cho mình giữ nhé! 📁", 1800);
  shelfLayer.classList.add("hover");
  shSetHot(true);
});

window.addEventListener("dragover", (e) => {
  if (mn.dataset.s !== "shelf") return;
  e.preventDefault();
  const rect = mn.getBoundingClientRect();
  if (rect.width > 0) {
    shCx = shCl(((e.clientX - rect.left) / rect.width) * 480, 0, 480);
  }
  shelfLayer.classList.add("hover");
  shSetHot(true);
});

window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) {
    shelfLayer.classList.remove("hover");
    shSetHot(false);
  }
});

window.addEventListener("drop", async (e) => {
  if (mn.dataset.s !== "shelf") return;
  e.preventDefault();
  shelfLayer.classList.remove("hover");
  shSetHot(false);
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    setShelfTab("files");
    for (const f of e.dataTransfer.files) {
      const kb = f.size ? `${(f.size / 1024).toFixed(1)} KB` : "Tệp";
      addShelfItem(f.name, f.path || f.name, kb);
    }
  } else {
    const uri = e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text/plain");
    if (uri && uri.trim()) {
      const rawText = uri.trim();
      const firstLine = rawText.split(/\r?\n/)[0].trim();
      const isUrl = /^https?:\/\/\S+$/i.test(firstLine);
      try {
        const dropped = await invoke("create_shelf_snippet", {
          title: firstLine.slice(0, 32) || "Ghi chú",
          content: isUrl ? firstLine : rawText,
          isUrl
        });
        if (dropped && dropped.path) {
          setShelfTab("files");
          addShelfItem(dropped.name, dropped.path, dropped.size);
          return;
        }
      } catch (_) {}
      setShelfTab("files");
      addShelfItem(firstLine.slice(0, 32), "", isUrl ? "Liên kết" : "Văn bản");
    }
  }
});

document.getElementById("btnShelfClear").addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  if (shelfActiveTab === "clip") {
    const pinnedOnly = clipboardItems.filter((x) => x.pinned);
    clipboardItems = pinnedOnly;
    clipSearchQuery = "";
    const srch = document.getElementById("shelfClipSearch");
    if (srch) srch.value = "";
    renderClipboardList();
    invoke("save_data_file", { filename: "clipboard.txt", content: JSON.stringify(pinnedOnly, null, 2) }).catch(() => {});
    if (pinnedOnly.length > 0) {
      showPetBubble(`Đã dọn lịch sử (giữ ${pinnedOnly.length} mục đã ghim 📌)`);
    }
  } else {
    shelfItems = [];
    renderShelf();
    saveShelfState();
  }
});

document.getElementById("btnShelfAdd").addEventListener("click", (e) => {
  e.stopPropagation();
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.onchange = () => {
    for (const f of input.files) {
      const kb = f.size ? `${(f.size / 1024).toFixed(1)} KB` : "Tệp";
      addShelfItem(f.name, f.path || f.name, kb);
    }
  };
  input.click();
});

document.getElementById("shelfDropZone").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("btnShelfAdd").click();
});

// ============================================================
// 9. TRANG 5: CÔNG VIỆC CẦN LÀM (NHẮC TỰ NHIÊN, LINK HỌP & ĐỒNG BỘ GOOGLE)
// ============================================================
function extractMeetingUrl(text) {
  const m = String(text || "").match(
    /https?:\/\/(?:[a-z0-9-]+\.)?(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com)\/[^\s<>"')\]]+/i
  );
  return m ? m[0].replace(/[.,;:!?]+$/, "") : "";
}

function parseNaturalTodoInput(rawText, nowDate = new Date()) {
  let str = String(rawText || "").trim();
  if (!str) return { normalizedText: "", hint: "" };
  str = str.replace(/^(?:nhắc|remind|ingatkan)\s+/i, "").trim();

  const tmrMatch = str.match(/^(?:ngày\s+mai|mai|tomorrow|besok)\s+(\d{1,2})[:h.](\d{2})\s+(.+)$/i);
  if (tmrMatch) {
    const hh = String(Math.min(23, Math.max(0, parseInt(tmrMatch[1], 10)))).padStart(2, "0");
    const mm = String(Math.min(59, Math.max(0, parseInt(tmrMatch[2], 10)))).padStart(2, "0");
    const body = tmrMatch[3].trim();
    return {
      normalizedText: `Ngày mai ${hh}:${mm} ${body}`,
      hint: `📅 Ngày mai lúc ${hh}:${mm}`
    };
  }

  const relMatch = str.match(/^(\d{1,3})\s*(m|p|phút|min|mnt|h|g|giờ|hr|jam)\s+(?:-\s*)?(.+)$/i);
  if (relMatch) {
    const val = Math.max(1, Math.min(1440, parseInt(relMatch[1], 10)));
    const unit = relMatch[2].toLowerCase();
    const isHours = ["h", "g", "giờ", "hr", "jam"].includes(unit);
    const offsetMins = isHours ? val * 60 : val;
    const target = new Date(nowDate.getTime() + offsetMins * 60000);
    const hh = String(target.getHours()).padStart(2, "0");
    const mm = String(target.getMinutes()).padStart(2, "0");
    const body = relMatch[3].trim();
    return {
      normalizedText: `${hh}:${mm} ${body}`,
      hint: `⏰ Nhắc lúc ${hh}:${mm} (sau ${val}${isHours ? " giờ" : " phút"})`
    };
  }

  const absMatch = str.match(/^(\d{1,2})[:h.](\d{2})\s+(.+)$/i);
  if (absMatch) {
    const hh = String(Math.min(23, Math.max(0, parseInt(absMatch[1], 10)))).padStart(2, "0");
    const mm = String(Math.min(59, Math.max(0, parseInt(absMatch[2], 10)))).padStart(2, "0");
    return {
      normalizedText: `${hh}:${mm} ${absMatch[3].trim()}`,
      hint: `⏰ Hẹn lúc ${hh}:${mm}`
    };
  }

  return { normalizedText: str, hint: "" };
}

// Phân tích cú pháp giờ hẹn tùy chọn ở đầu công việc (VD: "14:30 Học bài 45p" hoặc "Ngày mai 08:00 ...")
function parseTodoSchedule(rawText) {
  const str = String(rawText || "").trim();
  const meetingUrl = extractMeetingUrl(str);
  const tmrMatch = str.match(/^ngày\s+mai\s+(\d{1,2})[:h](\d{2})\s+(.+)$/i);
  if (tmrMatch) {
    const hh = Math.min(23, Math.max(0, parseInt(tmrMatch[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(tmrMatch[2], 10)));
    const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    return {
      displayText: tmrMatch[3].trim() || str,
      timeBadge: `Mai ${timeStr}`,
      startMins: hh * 60 + mm,
      durMins: null,
      isTomorrow: true,
      meetingUrl
    };
  }

  const m = str.match(/^(\d{1,2})[:h](\d{2})\s+(.+)$/i);
  if (!m) {
    return { displayText: str, timeBadge: null, startMins: null, durMins: null, isTomorrow: false, meetingUrl };
  }
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  let body = m[3].trim();
  let durMins = null;
  const durMatch = body.match(/\s+(\d{1,3})\s*(?:p|phút|m|min)$/i);
  if (durMatch) {
    durMins = parseInt(durMatch[1], 10);
    body = body.slice(0, body.length - durMatch[0].length).trim();
  }
  const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const timeBadge = durMins ? `${timeStr} · ${durMins}p` : timeStr;
  return {
    displayText: body || str,
    timeBadge,
    startMins: hh * 60 + mm,
    durMins,
    isTomorrow: false,
    meetingUrl
  };
}

function savePendingDeletedGoogleIds() {
  try {
    localStorage.setItem("island_gtasks_deleted", JSON.stringify(pendingDeletedGoogleIds));
  } catch (_) {}
}

function queueGoogleTaskDelete(item) {
  if (item && item.google_id && !pendingDeletedGoogleIds.includes(item.google_id)) {
    pendingDeletedGoogleIds.push(item.google_id);
    savePendingDeletedGoogleIds();
  }
}

function updateGoogleSyncBadgeUI() {
  const btn = document.getElementById("btnTodoGoogleSync");
  if (!btn) return;
  btn.classList.toggle("connected", !!googleTasksStatus.connected);
  btn.classList.toggle("syncing", !!isGoogleTasksSyncing);

  if (isGoogleTasksSyncing) {
    btn.textContent = "🔄 Đang sync...";
    btn.title = "Đang đồng bộ 2 chiều với Google Tasks...";
    return;
  }
  if (googleTasksStatus.connected) {
    btn.textContent = "☁️ Google Tasks";
    const mailStr = googleTasksStatus.email ? ` (${googleTasksStatus.email})` : "";
    const syncStr = googleTasksStatus.last_sync ? `\nLần đồng bộ cuối: ${googleTasksStatus.last_sync}` : "";
    btn.title = `Đã liên kết Google Tasks${mailStr}${syncStr}\n• Bấm chuột trái để đồng bộ ngay\n• Bấm chuột phải để mở Cài đặt`;
  } else {
    btn.textContent = "☁️ Liên kết";
    btn.title = "Chưa liên kết Google Tasks\n• Bấm chuột trái để đăng nhập Google và đồng bộ 2 chiều\n• Bấm chuột phải để mở Cài đặt";
  }
}

async function refreshGoogleTasksStatus() {
  try {
    const st = await invoke("google_tasks_get_status");
    if (st && typeof st === "object") {
      googleTasksStatus = Object.assign({}, googleTasksStatus, st);
      updateGoogleSyncBadgeUI();
    }
    return googleTasksStatus;
  } catch (_) {
    return googleTasksStatus;
  }
}

function triggerGoogleTasksSync(delayMs = 350) {
  if (myWindowLabel !== "main" || !googleTasksStatus.connected) return;
  clearTimeout(googleSyncDebounceTimer);
  googleSyncDebounceTimer = setTimeout(() => {
    googleSyncDebounceTimer = null;
    syncGoogleTasksNow(true);
  }, delayMs);
}

async function syncGoogleTasksNow(silent = true) {
  if (myWindowLabel !== "main" || !googleTasksStatus.connected || isGoogleTasksSyncing) return null;
  isGoogleTasksSyncing = true;
  updateGoogleSyncBadgeUI();

  const localPayload = todoList.map((t) => ({
    text: String(t.text || ""),
    done: !!t.done,
    google_id: t.google_id || null,
    updated: t.updated || null,
    notes: t.notes || null,
    due: t.due || null,
    local_dirty: !!t.local_dirty
  }));
  const delSnapshot = [...pendingDeletedGoogleIds];

  try {
    const res = await invoke("google_tasks_sync", {
      localTodos: localPayload,
      deletedGoogleIds: delSnapshot
    });
    if (res && Array.isArray(res.todos)) {
      todoList = res.todos;
      if (delSnapshot.length > 0) {
        pendingDeletedGoogleIds = pendingDeletedGoogleIds.filter((id) => !delSnapshot.includes(id));
        savePendingDeletedGoogleIds();
      }
      if (res.status) {
        googleTasksStatus = Object.assign({}, googleTasksStatus, res.status);
      }
      renderTodo();
      if (!silent) {
        const msg = (res.added_from_google || res.added_to_google || res.updated_count || res.deleted_count)
          ? `☁️ Đã đồng bộ Google Tasks (+${res.added_from_google} về, +${res.added_to_google} lên)`
          : "☁️ Google Tasks đã cập nhật mới nhất!";
        showPetBubble(msg);
      }
    }
    return res;
  } catch (err) {
    if (!silent) {
      showPetBubble(`⚠️ ${err}`);
    }
    return null;
  } finally {
    isGoogleTasksSyncing = false;
    updateGoogleSyncBadgeUI();
  }
}

document.getElementById("btnTodoGoogleSync")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  playTone("tick");
  if (!googleTasksStatus.connected) {
    if (isGoogleTasksSyncing) return;
    isGoogleTasksSyncing = true;
    updateGoogleSyncBadgeUI();
    showPetBubble("🌐 Đang mở trình duyệt đăng nhập Google Tasks...");
    try {
      const st = await invoke("google_tasks_start_auth", {
        clientId: settings.googleClientId || null,
        clientSecret: settings.googleClientSecret || null
      });
      if (st) {
        googleTasksStatus = Object.assign({}, googleTasksStatus, st);
      }
      isGoogleTasksSyncing = false;
      updateGoogleSyncBadgeUI();
      if (googleTasksStatus.connected) {
        showPetBubble("✅ Đã liên kết Google Tasks! Đang đồng bộ...");
        await syncGoogleTasksNow(false);
      }
    } catch (err) {
      isGoogleTasksSyncing = false;
      updateGoogleSyncBadgeUI();
      showPetBubble(`❌ ${err}`);
    }
    return;
  }
  await syncGoogleTasksNow(false);
});

document.getElementById("btnTodoGoogleSync")?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  playTone("tick");
  invoke("open_settings_window").catch(() => {});
});

function renderTodo() {
  const doneCount = todoList.filter((t) => t.done).length;
  document.getElementById("todoRatioText").textContent = `${doneCount}/${todoList.length}`;
  const progFill = document.getElementById("todoProgFill");
  if (progFill) {
    const pct = todoList.length > 0 ? Math.round((doneCount / todoList.length) * 100) : 0;
    progFill.style.width = `${pct}%`;
  }
  const container = document.getElementById("todoListContainer");
  container.innerHTML = "";
  updateStatusRing();
  if (typeof updateLiveActivityPill === "function") updateLiveActivityPill();
  if (typeof renderTodayPage === "function") renderTodayPage();

  if (todoList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "todo-empty";
    empty.innerHTML = '<span>Chưa có việc cần làm</span><span>Bấm <b style="color:#fff">Thêm việc</b> để tạo mới</span>';
    container.appendChild(empty);
    return;
  }

  todoList.forEach((t, idx) => {
    const parsed = parseTodoSchedule(t.text);
    const row = document.createElement("div");
    row.className = "trow" + (t.done ? " done" : "");
    const gsyncBadge = t.google_id ? '<span class="t-gsync" title="Đã đồng bộ với Google Tasks">☁</span>' : "";
    const joinBtnHtml = parsed.meetingUrl ? '<button class="todo-join-btn" title="Tham gia phòng họp trực tuyến">Tham gia</button>' : "";
    const syncTip = t.google_id ? "\n☁️ Đã đồng bộ với Google Tasks" : "";
    row.title = `${t.text}\n• Bấm vào dòng để đánh dấu xong · Bấm [×] để xóa${syncTip}`;
    row.innerHTML = `
      <span class="chk"><svg viewBox="0 0 10 10"><path d="m2 5.2 2 2 4-4.4"/></svg></span>
      ${parsed.timeBadge ? `<span class="t-time">${escapeHtml(parsed.timeBadge)}</span>` : ""}
      <span class="t-txt">${escapeHtml(parsed.displayText)}</span>
      ${joinBtnHtml}
      ${gsyncBadge}
      <button class="trow-del" title="Xóa công việc này">×</button>
    `;

    row.querySelector(".todo-join-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      playTone("tick");
      if (parsed.meetingUrl) {
        invoke("open_path_in_explorer", { path: parsed.meetingUrl }).catch(() => {});
      }
    });

    const delBtn = row.querySelector(".trow-del");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const removed = todoList.splice(idx, 1)[0];
      queueGoogleTaskDelete(removed);
      playTone("tick");
      renderTodo();
      saveTodoState();
      triggerGoogleTasksSync(250);
    });

    row.addEventListener("click", (e) => {
      e.stopPropagation();
      todoList[idx].done = !todoList[idx].done;
      todoList[idx].local_dirty = true;
      if (todoList[idx].done) {
        playTone("tick");
        const allDone = todoList.length > 0 && todoList.every((item) => item.done);
        triggerPetExpression(
          allDone ? "love" : "starry",
          allDone ? "💖" : "🌟",
          allDone ? "Hoàn thành hết mọi việc rồi!! 💖" : "Xong 1 việc xuất sắc! 🌟",
          2200
        );
      }
      renderTodo();
      saveTodoState();
      triggerGoogleTasksSync(250);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const removed = todoList.splice(idx, 1)[0];
      queueGoogleTaskDelete(removed);
      playTone("tick");
      renderTodo();
      saveTodoState();
      triggerGoogleTasksSync(250);
    });
    container.appendChild(row);
  });
}

// Tự động đồng bộ Google Tasks ngầm mỗi 3 phút (khi đã liên kết)
setInterval(() => {
  if (myWindowLabel === "main" && googleTasksStatus.connected && !isGoogleTasksSyncing) {
    syncGoogleTasksNow(true);
  }
}, 180000);

// Kiểm tra lịch công việc mỗi 20 giây để báo nhắc khi đến giờ bắt đầu / kết thúc
setInterval(() => {
  if (myWindowLabel !== "main") return;
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  todoList.forEach((t) => {
    if (t.done) return;
    const parsed = parseTodoSchedule(t.text);
    if (parsed.startMins === null || parsed.isTomorrow) return;
    if (settings.todoStart !== false && curMins === parsed.startMins && t._notifiedStart !== todayKey) {
      t._notifiedStart = todayKey;
      playTone("chime");
      triggerPetExpression("surprised", "⏰", `Đến giờ: ${parsed.displayText}!`, 4000);
      document.getElementById("hudIconText").textContent = "📋";
      document.getElementById("hudTitle").textContent = parsed.displayText;
      document.getElementById("hudSub").textContent = `Bắt đầu công việc (${parsed.timeBadge})`;
      document.getElementById("hudRightVal").textContent = "Bắt đầu";
      document.getElementById("hudRingArc").style.strokeDashoffset = "0";
      if (typeof pushAppNotification === "function") {
        pushAppNotification("📋", parsed.displayText, `Bắt đầu công việc (${parsed.timeBadge})`, false);
      }
      triggerPeek("bt", 4200);
    }
    if (
      settings.todoEnd !== false &&
      parsed.durMins &&
      curMins === parsed.startMins + parsed.durMins &&
      t._notifiedEnd !== todayKey
    ) {
      t._notifiedEnd = todayKey;
      playTone("chime");
      triggerPetExpression("starry", "✅", `Hết giờ: ${parsed.displayText}!`, 4000);
      document.getElementById("hudIconText").textContent = "✅";
      document.getElementById("hudTitle").textContent = parsed.displayText;
      document.getElementById("hudSub").textContent = "Đã hết thời gian dự kiến của công việc";
      document.getElementById("hudRightVal").textContent = "Xong?";
      document.getElementById("hudRingArc").style.strokeDashoffset = "0";
      if (typeof pushAppNotification === "function") {
        pushAppNotification("✅", parsed.displayText, "Đã hết thời gian dự kiến của công việc", false);
      }
      triggerPeek("bt", 4200);
    }
  });
}, 20000);

function saveTodoState() {
  isSavingTodoFromMain = true;
  invoke("save_data_file", {
    filename: "todo.txt",
    content: JSON.stringify(todoList, null, 2)
  })
    .catch(() => {})
    .finally(() => {
      setTimeout(() => { isSavingTodoFromMain = false; }, 60);
    });
}

document.getElementById("btnTodoShowAdd").addEventListener("click", (e) => {
  e.stopPropagation();
  const box = document.getElementById("todoAddBox");
  const inp = document.getElementById("todoInput");
  const hintEl = document.getElementById("todoParseHint");
  const showing = box.style.display !== "none";
  box.style.display = showing ? "none" : "flex";
  if (!showing) {
    inp.value = "";
    if (hintEl) hintEl.style.display = "none";
    setTimeout(() => inp.focus(), 40);
  }
});

document.getElementById("todoInput")?.addEventListener("input", (e) => {
  const hintEl = document.getElementById("todoParseHint");
  if (!hintEl) return;
  const parsed = parseNaturalTodoInput(e.target.value);
  if (parsed.hint) {
    hintEl.textContent = parsed.hint;
    hintEl.style.display = "block";
  } else {
    hintEl.style.display = "none";
  }
});

function commitNewTodo() {
  const inp = document.getElementById("todoInput");
  const hintEl = document.getElementById("todoParseHint");
  const rawVal = inp.value.trim();
  const parsed = parseNaturalTodoInput(rawVal);
  const val = parsed.normalizedText || rawVal;
  if (val) {
    todoList.unshift({ text: val, done: false, local_dirty: true });
    playTone("tick");
    renderTodo();
    saveTodoState();
    triggerGoogleTasksSync(250);
  }
  if (hintEl) hintEl.style.display = "none";
  document.getElementById("todoAddBox").style.display = "none";
}

document.getElementById("btnTodoSave").addEventListener("click", (e) => {
  e.stopPropagation();
  commitNewTodo();
});

document.getElementById("btnTodoCancel").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("todoAddBox").style.display = "none";
});

document.getElementById("todoInput").addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") commitNewTodo();
  if (e.key === "Escape") document.getElementById("todoAddBox").style.display = "none";
});

document.getElementById("btnTodoClearDone").addEventListener("click", (e) => {
  e.stopPropagation();
  todoList.forEach((t) => {
    if (t.done) queueGoogleTaskDelete(t);
  });
  todoList = todoList.filter((t) => !t.done);
  playTone("tick");
  renderTodo();
  saveTodoState();
  triggerGoogleTasksSync(250);
});

// ============================================================
// 10. CÀI ĐẶT & LƯU TRỮ DỮ LIỆU (ĐỒNG BỘ TỨC THÌ 0MS)
// ============================================================

// Phân tích thời tiết thực tế (Mã WMO, Nhiệt độ, Cảm nhận, Tia UV, Độ ẩm, Ngày/Đêm, Bình minh/Hoàng hôn)
// để tự động chọn cả Chủ đề Bầu trời Thời tiết (wthTheme) & Chủ đề Dynamic Island (notchTheme)
function computeAutoWeatherMapping() {
  const code = Number(weatherData.wmoCode) || 0;
  const temp = Number.isFinite(Number(weatherData.tempC)) ? Number(weatherData.tempC) : 28;
  const feel = Number.isFinite(Number(weatherData.feelsLikeC)) ? Number(weatherData.feelsLikeC) : temp;
  const uv = Number(weatherData.uvIndex) || 0;
  const hum = Number(weatherData.humidity) || 68;
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();

  const parseHHMM = (str, fallbackMins) => {
    const m = String(str || "").match(/^(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : fallbackMins;
  };
  const srMins = parseHHMM(weatherData.sunrise, 5 * 60 + 36);
  const ssMins = parseHHMM(weatherData.sunset, 17 * 60 + 42);
  const isDay = weatherData.isDay !== undefined ? weatherData.isDay !== 0 : (curMins >= srMins && curMins <= ssMins);
  const isGoldenHour = Math.abs(curMins - srMins) <= 42 || Math.abs(curMins - ssMins) <= 48;

  // 1. Giông bão sấm sét
  if (code >= 95) {
    return { wthTheme: "thunder_storm", notchTheme: "nebula", reason: "Giông bão sấm sét" };
  }
  // 2. Tuyết rơi hoặc rét đậm
  if ((code >= 71 && code <= 77) || temp <= 8) {
    return { wthTheme: "snow_winter", notchTheme: "ocean", reason: "Trời lạnh băng giá" };
  }
  // 3. Mưa rào / Mưa phùn / Mưa lớn
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { wthTheme: "rain_neon", notchTheme: "ocean", reason: "Trời đang có mưa" };
  }
  // 4. Sương mù / Độ ẩm cao lạnh
  if (code === 45 || code === 48 || (temp <= 21 && hum >= 88)) {
    return { wthTheme: "cloudy_mist", notchTheme: "island", reason: "Sương mù mờ ảo" };
  }
  // 5. Bình minh / Hoàng hôn (Golden Hour)
  if (isGoldenHour) {
    return { wthTheme: "sunset_beach", notchTheme: "sunset", reason: "Giờ hoàng hôn / bình minh" };
  }
  // 6. Ban đêm
  if (!isDay) {
    if (code <= 2) {
      return { wthTheme: "starry_night", notchTheme: "nebula", reason: "Đêm quang đãng đầy sao" };
    }
    return { wthTheme: "aurora_sky", notchTheme: "aurora", reason: "Đêm dịu mát nhiều mây" };
  }
  // 7. Ban ngày: Nắng nóng / Tia UV cao / Trời quang nắng đẹp (VD: TP.HCM 34°C, Cảm nhận 40°C, UV 8)
  if (temp >= 30 || feel >= 33 || uv >= 6 || code <= 1) {
    return { wthTheme: "sunny_gold", notchTheme: temp >= 33 ? "sunset" : "gold", reason: `Nắng ấm ${Math.round(temp)}°C` };
  }
  // 8. Ban ngày: Trời mát mẻ mùa xuân (18°C - 24°C)
  if (temp >= 18 && temp <= 24 && code <= 2) {
    return { wthTheme: "sakura_breeze", notchTheme: "rose", reason: `Tiết trời dịu mát ${Math.round(temp)}°C` };
  }
  // 9. Ban ngày: Có mây rải rác dễ chịu (25°C - 29°C)
  if (code === 2) {
    return { wthTheme: "emerald_forest", notchTheme: "emerald", reason: "Có mây dịu mát" };
  }
  // 10. Trời nhiều mây âm u
  return { wthTheme: "cloudy_mist", notchTheme: "ocean", reason: "Trời nhiều mây" };
}

let lastShellSyncSig = "";
const prefColorMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
prefColorMedia?.addEventListener?.("change", () => {
  if (settings.colorMode === "auto") applyColorThemeTokens();
});

function applyColorThemeTokens() {
  const mode = settings.colorMode === "auto"
    ? (prefColorMedia?.matches ? "dark" : "light")
    : (settings.colorMode || "dark");
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.accent = settings.accentColor || "auto";
}

function applySettingsUI(changedKey = "") {
  applyColorThemeTokens();
  const u = getEffectiveScale();
  document.documentElement.style.setProperty("--u", String(u));
  mn.dataset.pet = settings.petType || "aura";
  mn.dataset.petGlow = settings.petGlowColor || "island";
  mn.dataset.petEyeSize = settings.petEyeSize || "normal";
  mn.dataset.petEyeColor = settings.petEyeColor || "auto";
  mn.classList.toggle("pet-minimal-face", (settings.petType || "aura") === "aura" || !!settings.petMinimalFace);
  const effTheme = settings.themePreset && settings.themePreset !== "auto" ? settings.themePreset : "island";
  mn.dataset.theme = effTheme;
  mn.classList.toggle("minimal", !!settings.minimal && !mediaState.playing && !isExpanded);
  mn.classList.toggle("no-mascot", !settings.mascot);
  mn.classList.toggle("fast-anim", !!settings.fastAnim || settings.perfMode === "ultra");
  mn.classList.toggle("reduce-fx", !!settings.reduceEffects);
  mn.classList.toggle("page-icons", !!settings.pageIcons);
  mn.classList.toggle("notch-floating", settings.notchStyle === "floating");
  mn.classList.toggle("glass-on", !!settings.glass);
  mn.dataset.visStyle = settings.visualizerStyle || "bars";
  mn.dataset.font = settings.uiFont || "default";
  const topGap = Math.max(0, Math.min(24, Number(settings.floatingTopGap) ?? 6));
  mn.style.setProperty("--floating-gap", `${topGap}px`);
  const auroraWaveEl = document.getElementById("musicAuroraWave");
  if (auroraWaveEl) {
    auroraWaveEl.classList.toggle("off", settings.musicAurora === false || !!settings.reduceEffects);
  }
  if (typeof updatePrivacyDotsUI === "function") {
    updatePrivacyDotsUI(prevCamActive, prevMicActive, "");
  }
  const tintPct = Math.max(35, Math.min(98, Number(settings.glassTint) || 78));
  mn.style.setProperty("--glass-alpha", (tintPct / 100).toFixed(2));
  invoke("set_auto_trim_memory", { enable: settings.autoTrimMemory !== false }).catch(() => {});
  invoke("set_global_hotkeys", { enable: settings.globalHotkeys !== false }).catch(() => {});
  if (settings.audioVisualizer === false || settings.reduceEffects) {
    mn.classList.remove("live-audio-peak");
    mn.style.removeProperty("--pet-beat");
  }
  if (typeof updateLiveActivityPill === "function") updateLiveActivityPill();
  if (changedKey === "perfMode") {
    scheduleMediaPoll(false);
  }

  // Ẩn/hiện tất cả các chấm trang trên Dynamic Island dựa theo Cài đặt của từng chức năng
  const activePages = getActivePages();
  ALL_PAGES.forEach((p) => {
    const dot = document.querySelector(`#pageDots i[data-page="${p}"]`);
    if (dot) dot.style.display = activePages.includes(p) ? "" : "none";
  });
  const bellBtn = document.getElementById("btnHdrNotifBell");
  if (bellBtn) bellBtn.style.display = settings.notifications === false ? "none" : "";
  const wthHdrBtn = document.getElementById("hdrWeatherBadge");
  if (wthHdrBtn) wthHdrBtn.style.display = settings.weatherHeaderBadge === false ? "none" : "";
  const clipTabBtn = document.getElementById("btnShelfTabClip");
  if (clipTabBtn) clipTabBtn.style.display = settings.clipboard === false ? "none" : "";
  if (settings.clipboard === false && shelfActiveTab === "clip") {
    setShelfTab("files");
  }

  // Nếu trang hiện tại vừa bị tắt trong Cài đặt thì chuyển về trang hợp lệ đầu tiên
  if (!activePages.includes(currentPage)) {
    currentPage = activePages[0] || "music";
    if (isExpanded && ALL_PAGES.includes(mn.dataset.s)) {
      showState(currentPage, 0);
    }
  }

  updateStatusRing();
  if (typeof renderTodayPage === "function") renderTodayPage();
  if (typeof renderWeatherPage === "function") renderWeatherPage();
  if (changedKey === "weatherCity" && typeof fetchWeatherLive === "function") {
    fetchWeatherLive(true);
  }
  if (typeof renderWidgetsPage === "function") renderWidgetsPage();
  if (typeof renderPrayerPage === "function") renderPrayerPage();
  renderClipboardList();

  // 1. Khi tai thỏ đang thu gọn, áp dụng ngay lập tức chế độ hiển thị thu gọn (Đồng hồ + Pet / Chỉ Pet / Chỉ đồng hồ / Viên thuốc / Mini-Lyrics)
  if (!settings.lyrics) {
    keepMiniLyricsOnCollapse = false;
  }
  if (typeof renderCapsuleState === "function") {
    renderCapsuleState();
  }
  if (!isExpanded && ["both", "pet", "idle", "mini-lyrics", "capsule"].includes(mn.dataset.s)) {
    const targetClosed = getClosedState();
    if (mn.dataset.s !== targetClosed) {
      showState(targetClosed, 0);
    }
  }
  if (myWindowLabel === "main") {
    invoke("set_hot_corners", {
      corners: [
        settings.hotCornerTL || "none",
        settings.hotCornerTR || "none",
        settings.hotCornerBL || "none",
        settings.hotCornerBR || "none"
      ]
    }).catch(() => {});
    invoke("set_mac_shortcuts", { enable: !!settings.macShortcuts }).catch(() => {});
    invoke("set_suppress_native_osd", { enable: !!settings.suppressNativeOsd }).catch(() => {});
    const shellSig = JSON.stringify([
      !!settings.enableDeck,
      !!settings.enableRail,
      !!settings.enableWidgets,
      !!settings.enableScene,
      !!settings.hideTaskbar,
      settings.enableIsland !== false
    ]);
    if (shellSig !== lastShellSyncSig) {
      lastShellSyncSig = shellSig;
      invoke("sync_shell_windows", {
        enableDeck: !!settings.enableDeck,
        enableRail: !!settings.enableRail,
        enableWidgets: !!settings.enableWidgets,
        enableScene: !!settings.enableScene,
        hideTaskbar: !!settings.hideTaskbar,
        enableIsland: settings.enableIsland !== false
      }).catch(() => {});
    }
  }

  // 2. Đồng bộ cài đặt Nhạc & Lời bài hát ngay lập tức
  if (settings.albumGlow === false && mn) {
    mn.classList.remove("has-album-glow");
    mn.style.removeProperty("--album-glow-rgb");
    mn.style.removeProperty("--album-glow");
  } else if (settings.albumGlow !== false && mediaState.playing && mediaState.thumb && lastRenderedThumb) {
    extractAlbumArtColor(lastRenderedThumb, (col) => {
      if (col && mn && settings.albumGlow !== false) {
        mn.style.setProperty("--album-glow-rgb", `${col.r}, ${col.g}, ${col.b}`);
        mn.style.setProperty("--album-glow", `rgba(${col.r}, ${col.g}, ${col.b}, 0.55)`);
        mn.classList.add("has-album-glow");
      }
    });
  }
  showRemainingMode = !!settings.showRemaining;
  const lyrBtn = document.getElementById("btnToggleLyrics");
  if (lyrBtn) {
    lyrBtn.style.opacity = settings.lyrics ? "1" : "0.45";
  }
  if (!settings.lyrics && mn.dataset.s === "lyrics") {
    showState("music", 0);
  } else if (settings.lyrics && changedKey === "lyrics" && isExpanded && mn.dataset.s === "music") {
    showState("lyrics", 0);
    if (parsedLyrics.length === 0 && mediaState.hasSession && mediaState.title) {
      fetchLyricsForCurrentSong(mediaState.title, mediaState.artist);
    }
  }
  updateMediaProgressUI();
  invoke("set_hide_fullscreen", { enable: !!settings.hideFullscreen }).catch(() => {});

  // 3. Đồng bộ cài đặt Uống nước (Mục tiêu, Dung tích bình, Chu kỳ nhắc, Bật/Tắt nhắc) ngay lập tức
  if (settings.waterGoal) {
    waterData.goalMl = Number(settings.waterGoal) || 2000;
  }
  waterData.reminderOn = settings.waterRemind !== false;
  const effWaterInt = computeEffectiveWaterIntervalMin();
  if (waterData.intervalMin !== effWaterInt) {
    waterData.intervalMin = effWaterInt;
    waterCountdownSec = effWaterInt * 60;
  }
  renderWaterUI();

  // 4. Đồng bộ cài đặt Pomodoro (Thời lượng Tập trung, Nghỉ ngắn, Nghỉ dài) ngay lập tức
  const { focusMin, shortMin } = getActivePomoDurations();
  const breakBtn = document.getElementById("btnPomoBreak");
  if (breakBtn) {
    breakBtn.textContent = `Nghỉ ${shortMin}p`;
    breakBtn.title = `Chuyển sang Nghỉ giải lao ${shortMin} phút`;
  }
  const focusBtn = document.getElementById("btnPomoFocus");
  if (focusBtn) {
    focusBtn.textContent = `Tập trung ${focusMin}p`;
    focusBtn.title = `Chuyển sang Tập trung ${focusMin} phút`;
  }
  if (
    !pomoRunning &&
    (pomoRemSec === pomoTotalSec || changedKey === "pomoFocus" || changedKey === "pomoShort") &&
    (pomoCategory === "custom" || pomoRemSec === pomoTotalSec)
  ) {
    const targetPomoMin = pomoIsBreak ? shortMin : focusMin;
    pomoDefaultSec = targetPomoMin * 60;
    pomoTotalSec = targetPomoMin * 60;
    pomoRemSec = targetPomoMin * 60;
    pomoModeText = pomoIsBreak
      ? `Nghỉ giải lao · ${targetPomoMin} phút`
      : `Thời gian tập trung · ${targetPomoMin} phút`;
    renderPomo();
  }

  document.querySelectorAll("#segNotchStyle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === (settings.notchStyle || "classic"));
  });
  document.querySelectorAll("#segWeatherTheme button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === (settings.weatherTheme || "auto"));
  });
  document.querySelectorAll("#segOpenMode button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === settings.openMode);
  });
  document.querySelectorAll("#segRestStyle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === settings.restStyle);
  });
  document.querySelectorAll("#segPetType button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === (settings.petType || "aura"));
  });
  document.querySelectorAll("#segPetGlow button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === (settings.petGlowColor || "island"));
  });
  document.querySelectorAll("#segPetEyeSize button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === (settings.petEyeSize || "normal"));
  });
  document.querySelectorAll("#segScale button").forEach((b) => {
    b.classList.toggle("active", String(b.dataset.val) === String(settings.scale));
  });

  const sndBtn = document.getElementById("btnToggleSounds");
  if (sndBtn) {
    sndBtn.classList.toggle("on", settings.sounds);
    sndBtn.textContent = settings.sounds ? "BẬT" : "TẮT";
  }

  const autoBtn = document.getElementById("btnToggleAutostart");
  if (autoBtn) {
    autoBtn.classList.toggle("on", settings.autostart);
    autoBtn.textContent = settings.autostart ? "BẬT" : "TẮT";
  }

  if (typeof syncAiControlsUI === "function") syncAiControlsUI();
  updatePetMood();
  syncNotchBounds();
}

function buildWeatherSyncSnapshot() {
  return {
    city: weatherData.city || "",
    fullAddress: weatherData.fullAddress || "",
    locSource: weatherData.locSource || "",
    lat: weatherData.lat,
    lon: weatherData.lon,
    tempC: weatherData.tempC,
    updatedAt: weatherData.updatedAt || 0
  };
}

function saveSettingsState() {
  isSavingSettingsFromMain = true;
  invoke("save_data_file", {
    filename: "settings.txt",
    content: JSON.stringify(settings, null, 2)
  })
    .catch(() => {})
    .finally(() => {
      setTimeout(() => { isSavingSettingsFromMain = false; }, 60);
    });
  emit("island-settings-sync", {
    settings,
    water: { intakeMl: waterData.intakeMl, goalMl: waterData.goalMl },
    weather: buildWeatherSyncSnapshot()
  }).catch(() => {});
}

document.querySelectorAll("#segNotchStyle button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.notchStyle = btn.dataset.val;
    playTone("tick");
    applySettingsUI();
    saveSettingsState();
  });
});

document.querySelectorAll("#segWeatherTheme button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.weatherTheme = btn.dataset.val || "auto";
    playTone("tick");
    applySettingsUI("weatherTheme");
    saveSettingsState();
  });
});

document.querySelectorAll("#segOpenMode button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.openMode = btn.dataset.val;
    playTone("tick");
    applySettingsUI();
    saveSettingsState();
  });
});

document.querySelectorAll("#segRestStyle button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.restStyle = btn.dataset.val;
    if (settings.restStyle === "both" && settings.petType === "aura") {
      settings.petType = settings.lastClassicPet && settings.lastClassicPet !== "aura" ? settings.lastClassicPet : "island";
      settings.petMinimalFace = false;
      settings.petGlowColor = "auto";
    }
    playTone("tick");
    applySettingsUI();
    saveSettingsState();
  });
});

document.querySelectorAll("#segPetType button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.petType = btn.dataset.val;
    if (settings.petType === "aura") {
      settings.restStyle = "pet";
      settings.petMinimalFace = true;
      settings.petGlowColor = "island";
      settings.petEyeColor = "auto";
    } else {
      settings.lastClassicPet = settings.petType;
      settings.petMinimalFace = false;
      if (!settings.petGlowColor || settings.petGlowColor === "island") {
        settings.petGlowColor = "auto";
      }
      settings.petEyeColor = "auto";
    }
    playTone("pet");
    applySettingsUI();
    saveSettingsState();
  });
});

document.querySelectorAll("#segPetGlow button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.petGlowColor = btn.dataset.val || "island";
    playTone("tick");
    applySettingsUI();
    saveSettingsState();
  });
});

document.querySelectorAll("#segPetEyeSize button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.petEyeSize = btn.dataset.val || "normal";
    playTone("tick");
    applySettingsUI();
    saveSettingsState();
  });
});

document.querySelectorAll("#segScale button").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    settings.scale = btn.dataset.val === "auto" ? "auto" : parseFloat(btn.dataset.val) || 1.15;
    playTone("tick");
    applySettingsUI();
    saveSettingsState();
  });
});

document.getElementById("btnToggleSounds")?.addEventListener("click", (e) => {
  e.stopPropagation();
  settings.sounds = !settings.sounds;
  applySettingsUI();
  saveSettingsState();
});

document.getElementById("btnToggleAutostart")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  settings.autostart = !settings.autostart;
  await invoke("set_autostart", { enable: settings.autostart }).catch(() => {});
  applySettingsUI();
  saveSettingsState();
});

document.getElementById("btnQuitIsland")?.addEventListener("click", (e) => {
  e.stopPropagation();
  invoke("exit_app");
});

// Lắng nghe sự kiện đồng bộ từ Cửa sổ Cài đặt Island (Settings window) và từ Rust backend (0ms)
listen("island-settings", (e) => {
  if (e.payload?.settings) {
    Object.assign(settings, e.payload.settings);
    applySettingsUI(e.payload?.changed || "");
  }
}).catch(() => {});

listen("island-file-changed", (e) => {
  if (isSavingSettingsFromMain) return;
  const fn = e.payload?.filename;
  const content = e.payload?.content;
  if (!content) return;
  try {
    if (fn === "settings.txt") {
      const parsed = JSON.parse(content);
      const changedLyrics = parsed.lyrics !== settings.lyrics ? "lyrics" : "";
      Object.assign(settings, parsed);
      applySettingsUI(changedLyrics);
    } else if (fn === "water.txt") {
      const parsed = JSON.parse(content);
      if (typeof parsed.intakeMl === "number") waterData.intakeMl = parsed.intakeMl;
      if (Array.isArray(parsed.hourly)) waterData.hourly = parsed.hourly;
      renderWaterUI();
    } else if (fn === "todo.txt") {
      if (isSavingTodoFromMain) return;
      const arr = JSON.parse(content);
      if (Array.isArray(arr)) {
        todoList = arr;
        renderTodo();
      }
    } else if (fn === "shelf.txt") {
      const arr = JSON.parse(content);
      if (Array.isArray(arr)) {
        shelfItems = arr;
        renderShelf();
      }
    } else if (fn === "clipboard.txt") {
      const arr = JSON.parse(content);
      if (Array.isArray(arr)) {
        clipboardItems = arr;
        renderClipboardList();
      }
    } else if (fn === "focus.txt") {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        Object.assign(focusData, parsed);
        if (typeof renderWidgetsPage === "function") renderWidgetsPage();
      }
    } else if (fn === "notifications.txt") {
      const arr = JSON.parse(content);
      if (Array.isArray(arr)) {
        notifList = arr;
        if (typeof renderTodayPage === "function") renderTodayPage();
      }
    } else if (fn === "weather.txt") {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        Object.assign(weatherData, parsed);
        if (typeof renderWeatherPage === "function") renderWeatherPage();
        if (typeof renderWidgetsPage === "function") renderWidgetsPage();
      }
    }
  } catch (_) {}
}).catch(() => {});

listen("island-action", (e) => {
  const act = e.payload?.type;
  if (act === "water_reset") {
    waterData.intakeMl = 0;
    waterData.hourly = [0, 0, 0, 0, 0, 0, 0, 0];
    waterCountdownSec = (waterData.intervalMin || 30) * 60;
    renderWaterUI("Đã đặt lại lượng nước về 0.0 L");
    saveWaterState();
  } else if (act === "weather_refresh") {
    if (typeof fetchWeatherLive === "function") fetchWeatherLive(true);
  } else if (act === "weather_gps_refresh") {
    settings.weatherCity = "Auto";
    saveSettingsState();
    if (typeof fetchWeatherLive === "function") fetchWeatherLive(true);
  } else if (act === "shelf_clear") {
    shelfItems = [];
    renderShelf();
    saveShelfState();
  } else if (act === "clipboard_clear") {
    const pinnedOnly = clipboardItems.filter((x) => x.pinned);
    clipboardItems = pinnedOnly;
    clipSearchQuery = "";
    const srch = document.getElementById("shelfClipSearch");
    if (srch) srch.value = "";
    renderClipboardList();
    invoke("save_data_file", { filename: "clipboard.txt", content: JSON.stringify(pinnedOnly, null, 2) }).catch(() => {});
  } else if (act === "ai_clear_history") {
    if (typeof clearAiChatHistory === "function") clearAiChatHistory();
  } else if (act === "notif_clear") {
    notifList = [];
    unreadNotifCount = 0;
    document.getElementById("hdrNotifDot")?.classList.remove("show");
    if (typeof renderTodayPage === "function") renderTodayPage();
    if (typeof saveNotifState === "function") saveNotifState();
  } else if (act === "google_tasks_sync") {
    if (typeof syncGoogleTasksNow === "function") syncGoogleTasksNow(false);
  } else if (act === "test_alarm") {
    startAlarmRing("pomo", e.payload?.duration || settings.alarmDuration || 10, e.payload?.style || settings.alarmStyle || "alarm");
  } else if (act === "stop_alarm") {
    stopAlarmRing();
  } else if (act === "test_mood") {
    playTone("pet");
    triggerPetExpression(
      e.payload?.mood || "happy",
      e.payload?.emote || "✨",
      e.payload?.text || "",
      2600
    );
  }
}).catch(() => {});

listen("island-request-state", () => {
  emit("island-settings-sync", {
    settings,
    water: { intakeMl: waterData.intakeMl, goalMl: waterData.goalMl },
    weather: buildWeatherSyncSnapshot()
  }).catch(() => {});
}).catch(() => {});

// ============================================================
// 10. TRANG 6: TRỢ LÝ AI COPILOT (Island AI)
// ============================================================
function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAiMarkdown(text) {
  if (!text) return "";
  let esc = escapeHtml(text);
  esc = esc.replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.4);padding:4px 6px;border-radius:6px;overflow-x:auto"><code>$1</code></pre>');
  esc = esc.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.12);padding:1px 4px;border-radius:4px">$1</code>');
  esc = esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  esc = esc.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  esc = esc.replace(/\n/g, '<br/>');
  return esc;
}

function renderAiAttachments() {
  const strip = document.getElementById("aiAttachmentStrip");
  if (!strip) return;
  strip.innerHTML = "";
  if (aiAttachments.length === 0) return;

  aiAttachments.forEach((att, idx) => {
    const chip = document.createElement("div");
    chip.className = `ai-attachment-chip ${att.type === "image" ? "is-img" : ""}`;
    if (att.type === "image") {
      const img = document.createElement("img");
      img.src = att.dataUrl;
      chip.appendChild(img);
    } else {
      const ico = document.createElement("span");
      ico.textContent = "📄";
      chip.appendChild(ico);
    }
    const nameSpan = document.createElement("span");
    nameSpan.className = "chip-name";
    nameSpan.textContent = att.name;
    nameSpan.title = `${att.name} (${att.size})`;
    chip.appendChild(nameSpan);

    const delBtn = document.createElement("span");
    delBtn.className = "chip-del";
    delBtn.textContent = "✕";
    delBtn.title = "Xóa tệp này";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      aiAttachments.splice(idx, 1);
      renderAiAttachments();
    };
    chip.appendChild(delBtn);

    strip.appendChild(chip);
  });
}

function addFileToAiAttachments(file) {
  if (!file) return;
  const isImg = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
  const sizeKb = file.size ? `${(file.size / 1024).toFixed(1)} KB` : "";

  if (isImg) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      aiAttachments.push({
        type: "image",
        name: file.name || "Ảnh",
        size: sizeKb,
        dataUrl: ev.target.result
      });
      renderAiAttachments();
      showPetBubble(`Đã nhận ảnh: ${file.name || "Ảnh"}`);
    };
    reader.readAsDataURL(file);
  } else {
    // Text / Code document
    const reader = new FileReader();
    reader.onload = (ev) => {
      aiAttachments.push({
        type: "file",
        name: file.name,
        size: sizeKb,
        textContent: ev.target.result
      });
      renderAiAttachments();
      showPetBubble(`Đã nhận tệp: ${file.name}`);
    };
    reader.readAsText(file);
  }
}

function normalizeAiModelId(raw) {
  const m = String(raw || "").trim();
  if (!m || m.startsWith("ag/gemini-3.8-flash")) return "ag/gemini-3.8-flash";
  if (m.startsWith("ds/deepseek-v4-pro")) return "ds/deepseek-v4-pro";
  return m;
}

function syncAiControlsUI() {
  const modelSel = document.getElementById("aiQuickModelSelect");
  const effModel = normalizeAiModelId(settings.aiModel);
  if (modelSel) {
    const hasOpt = Array.from(modelSel.options).some((o) => o.value === effModel);
    modelSel.value = hasOpt ? effModel : "ag/gemini-3.8-flash";
  }
  const lvl = AI_THINKING_LEVELS[settings.aiThinkingLevel] ? settings.aiThinkingLevel : "high";
  const thinkBtn = document.getElementById("aiQuickThinkingBtn");
  if (thinkBtn) {
    const info = AI_THINKING_LEVELS[lvl];
    thinkBtn.dataset.level = lvl;
    thinkBtn.textContent = info.label;
    thinkBtn.title = `Mức độ tư duy: ${info.label} (${info.desc}) • Bấm để đổi`;
  }
}

function saveAiHistoryState() {
  if (settings.aiSaveHistory === false) return;
  const trimmed = aiChatHistory.slice(-20);
  invoke("save_data_file", {
    filename: "ai_history.txt",
    content: JSON.stringify(trimmed, null, 2)
  }).catch(() => {});
}

function attachCopyButtonToBotMsg(botMsg, getRawText) {
  const copyBtn = document.createElement("button");
  copyBtn.className = "ai-copy-btn";
  copyBtn.title = "Sao chép câu trả lời";
  copyBtn.textContent = "📋";
  copyBtn.onclick = () => {
    const txt = typeof getRawText === "function" ? getRawText() : String(getRawText || "");
    navigator.clipboard.writeText(txt).then(() => {
      copyBtn.textContent = "✓";
      setTimeout(() => (copyBtn.textContent = "📋"), 1500);
    });
  };
  botMsg.appendChild(copyBtn);
}

function buildBotMessageDOM(answerText, reasoningText = "", isStreaming = false) {
  const botMsg = document.createElement("div");
  botMsg.className = "ai-msg bot" + (isStreaming ? " streaming" : "");

  const thinkBox = document.createElement("details");
  thinkBox.className = "ai-think-box";
  if (!reasoningText) thinkBox.style.display = "none";
  const summary = document.createElement("summary");
  summary.textContent = isStreaming ? "🧠 Đang suy nghĩ..." : "🧠 Quá trình suy nghĩ";
  const thinkBody = document.createElement("div");
  thinkBody.className = "ai-think-body";
  thinkBody.textContent = reasoningText || "";
  thinkBox.append(summary, thinkBody);

  const ansBody = document.createElement("div");
  ansBody.className = "ai-answer-body";
  ansBody.innerHTML = formatAiMarkdown(answerText || "");

  botMsg.append(thinkBox, ansBody);
  return { botMsg, thinkBox, summary, thinkBody, ansBody };
}

function extractInlineThinkTags(rawText) {
  const s = String(rawText || "");
  const openIdx = s.indexOf("<think>");
  if (openIdx === -1) return { think: "", answer: s };
  const closeIdx = s.indexOf("</think>", openIdx + 7);
  if (closeIdx === -1) {
    return {
      think: s.slice(openIdx + 7).trim(),
      answer: s.slice(0, openIdx).trim()
    };
  }
  const think = s.slice(openIdx + 7, closeIdx).trim();
  const answer = (s.slice(0, openIdx) + s.slice(closeIdx + 8)).trim();
  return { think, answer };
}

function renderSavedAiHistory() {
  const chatBody = document.getElementById("aiChatBody");
  if (!chatBody || !Array.isArray(aiChatHistory) || aiChatHistory.length === 0) return;
  chatBody.innerHTML = "";
  aiChatHistory.slice(-20).forEach((item) => {
    if (!item || !item.role) return;
    if (item.role === "user") {
      const u = document.createElement("div");
      u.className = "ai-msg user";
      const d = document.createElement("div");
      d.className = "ai-msg-text";
      d.textContent = item.text || "";
      u.appendChild(d);
      chatBody.appendChild(u);
    } else if (item.role === "bot") {
      const { botMsg } = buildBotMessageDOM(item.text || "", item.reasoning || "", false);
      attachCopyButtonToBotMsg(botMsg, item.text || "");
      chatBody.appendChild(botMsg);
    }
  });
  chatBody.scrollTop = chatBody.scrollHeight;
}

function clearAiChatHistory() {
  aiChatHistory = [];
  invoke("save_data_file", { filename: "ai_history.txt", content: "[]" }).catch(() => {});
  const chatBody = document.getElementById("aiChatBody");
  if (chatBody) {
    chatBody.innerHTML = `
      <div class="ai-msg bot" id="aiWelcomeMsg">
        Đã làm mới hội thoại. Hãy đặt câu hỏi, bấm 📸 chụp cửa sổ (<code>Alt+S</code>) hoặc dùng <code>/calc</code> để tính nhanh!
      </div>`;
  }
}

listen("island-ai-stream", (e) => {
  const payload = e?.payload;
  if (!payload || !aiActiveStream || payload.reqId !== aiActiveStream.reqId) return;
  const st = aiActiveStream;
  if (payload.reasoning) {
    st.reasoningText += String(payload.reasoning);
  }
  if (payload.delta) {
    st.rawAnswerText += String(payload.delta);
  }
  if (payload.done) {
    st.done = true;
  }
  if (!st.rafPending) {
    st.rafPending = true;
    requestAnimationFrame(() => {
      st.rafPending = false;
      if (!aiActiveStream || aiActiveStream.reqId !== st.reqId) return;
      const split = extractInlineThinkTags(st.rawAnswerText);
      const effThink = [st.reasoningText, split.think].filter(Boolean).join("\n");
      const effAns = split.answer;
      const done = Boolean(st.done);

      if (effThink) {
        if (st.thinkBox.style.display !== "block") st.thinkBox.style.display = "block";
        if (st.thinkBody.textContent !== effThink) st.thinkBody.textContent = effThink;
        const summary = done ? "🧠 Quá trình suy nghĩ" : "🧠 Đang suy nghĩ...";
        if (st.summary.textContent !== summary) st.summary.textContent = summary;
      }
      if (st.renderedAnswer !== effAns || st.renderedDone !== done) {
        if (effAns) {
          st.ansBody.innerHTML = formatAiMarkdown(effAns) + (done ? "" : '<span class="ai-stream-cursor"></span>');
        } else if (!done) {
          st.ansBody.innerHTML = '<span class="ai-dots"><i></i><i></i><i></i></span> Đang suy luận...';
        }
        st.renderedAnswer = effAns;
        st.renderedDone = done;
      }
      const chatBody = document.getElementById("aiChatBody");
      if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    });
  }
}).catch(() => {});

async function sendAiPrompt(customText = "") {
  const inputEl = document.getElementById("aiInputPrompt");
  let prompt = (customText || inputEl?.value || "").trim();
  const currentAttachments = [...aiAttachments];
  aiAttachments = [];
  renderAiAttachments();

  if (!prompt && currentAttachments.length === 0) return;
  if (inputEl) inputEl.value = "";

  const chatBody = document.getElementById("aiChatBody");
  if (!chatBody) return;

  const userMsg = document.createElement("div");
  userMsg.className = "ai-msg user";

  // Hiển thị ảnh đính kèm nếu có
  const imgAtts = currentAttachments.filter(a => a.type === "image");
  if (imgAtts.length > 0) {
    const imgsWrap = document.createElement("div");
    imgsWrap.className = "ai-msg-imgs";
    imgAtts.forEach(img => {
      const im = document.createElement("img");
      im.src = img.dataUrl;
      im.className = "ai-msg-thumb";
      im.title = img.name;
      imgsWrap.appendChild(im);
    });
    userMsg.appendChild(imgsWrap);
  }

  // Hiển thị tệp đính kèm nếu có
  const fileAtts = currentAttachments.filter(a => a.type === "file");
  if (fileAtts.length > 0) {
    const filesWrap = document.createElement("div");
    filesWrap.className = "ai-msg-files";
    fileAtts.forEach(f => {
      const b = document.createElement("span");
      b.className = "ai-msg-file-badge";
      b.textContent = `📄 ${f.name} (${f.size})`;
      filesWrap.appendChild(b);
    });
    userMsg.appendChild(filesWrap);
  }

  if (!prompt && currentAttachments.length > 0) {
    prompt = "Hãy phân tích nội dung hình ảnh hoặc tệp này giúp tôi.";
  }

  const promptTextDiv = document.createElement("div");
  promptTextDiv.className = "ai-msg-text";
  promptTextDiv.textContent = prompt;
  userMsg.appendChild(promptTextDiv);
  chatBody.appendChild(userMsg);

  aiChatHistory.push({
    role: "user",
    text: prompt + (imgAtts.length ? ` [📷 ${imgAtts.length} ảnh]` : "") + (fileAtts.length ? ` [📄 ${fileAtts.length} tệp]` : "")
  });

  const thinkingLvl = AI_THINKING_LEVELS[settings.aiThinkingLevel] ? settings.aiThinkingLevel : "high";
  const loadingMsg = thinkingLvl === "high"
    ? "Đang suy luận sâu..."
    : (thinkingLvl === "fast" ? "Đang trả lời nhanh..." : "Đang xử lý...");

  const domRefs = buildBotMessageDOM("", "", true);
  domRefs.ansBody.innerHTML = `<span class="ai-dots"><i></i><i></i><i></i></span> ${loadingMsg}`;
  const botMsg = domRefs.botMsg;
  chatBody.appendChild(botMsg);
  chatBody.scrollTop = chatBody.scrollHeight;

  // Lệnh tính toán nhanh Offline (nếu không có tệp đính kèm)
  if (currentAttachments.length === 0) {
    const mathMatch = prompt.match(/^(\/calc\s+)?([0-9+\-*/().\s^%]+)$/);
    if (mathMatch && mathMatch[2] && /[0-9]/.test(mathMatch[2])) {
      try {
        const cleanExpr = mathMatch[2].replace(/\^/g, "**");
        const ans = Function(`'use strict'; return (${cleanExpr})`)();
        botMsg.className = "ai-msg bot";
        botMsg.innerHTML = `🔢 <strong>Kết quả:</strong> ${ans}`;
        aiChatHistory.push({ role: "bot", text: `Kết quả: ${ans}`, reasoning: "" });
        saveAiHistoryState();
        chatBody.scrollTop = chatBody.scrollHeight;
        return;
      } catch (_) {}
    }

    if (prompt.startsWith("/count ")) {
      const raw = prompt.replace("/count ", "").trim();
      const words = raw ? raw.split(/\s+/).length : 0;
      botMsg.className = "ai-msg bot";
      botMsg.innerHTML = `📊 Ký tự: <strong>${raw.length}</strong> | Từ: <strong>${words}</strong> | Dòng: <strong>${raw.split('\n').length}</strong>`;
      aiChatHistory.push({ role: "bot", text: `Ký tự: ${raw.length} | Từ: ${words}`, reasoning: "" });
      saveAiHistoryState();
      chatBody.scrollTop = chatBody.scrollHeight;
      return;
    }
  }

  // Ghép nội dung tệp văn bản vào câu hỏi nếu có
  let fullPrompt = prompt;
  if (fileAtts.length > 0) {
    const filesContext = fileAtts.map(f => `--- [Tệp đính kèm: ${f.name} (${f.size})] ---\n${f.textContent || ""}\n--- [Hết tệp: ${f.name}] ---`).join("\n\n");
    fullPrompt = `${filesContext}\n\nYêu cầu người dùng:\n${prompt}`;
  }

  const imagesPayload = imgAtts.length > 0 ? imgAtts.map(a => a.dataUrl) : null;
  const model = normalizeAiModelId(settings.aiModel);
  const sysPrompt = settings.aiSystemPrompt || "Bạn là Island AI Assistant - một trợ lý thông minh trên Desktop Windows. Hãy trả lời ngắn gọn, chuẩn xác, súc tích bằng tiếng Việt.";
  const useStream = settings.aiStream !== false;
  const reqId = `ai_${Date.now()}_${++aiReqSeq}`;

  aiActiveStream = useStream
    ? {
        reqId,
        botMsg,
        thinkBox: domRefs.thinkBox,
        summary: domRefs.summary,
        thinkBody: domRefs.thinkBody,
        ansBody: domRefs.ansBody,
        reasoningText: "",
        rawAnswerText: "",
        renderedAnswer: null,
        renderedDone: false,
        done: false,
        rafPending: false
      }
    : null;

  try {
    const replyText = await invoke("query_ai_chat", {
      provider: "gateway",
      endpoint: "",
      apiKey: "",
      model,
      thinkingLevel: thinkingLvl,
      systemPrompt: sysPrompt,
      userPrompt: fullPrompt,
      images: imagesPayload,
      stream: useStream,
      reqId
    });

    const split = extractInlineThinkTags(replyText);
    const streamReason = aiActiveStream && aiActiveStream.reqId === reqId ? aiActiveStream.reasoningText : "";
    const finalThink = [streamReason, split.think].filter(Boolean).join("\n");
    const finalAnswer = split.answer || replyText || "";

    botMsg.className = "ai-msg bot";
    if (finalThink) {
      domRefs.thinkBox.style.display = "block";
      domRefs.summary.textContent = "🧠 Quá trình suy nghĩ";
      domRefs.thinkBody.textContent = finalThink;
    } else {
      domRefs.thinkBox.style.display = "none";
    }
    domRefs.ansBody.innerHTML = formatAiMarkdown(finalAnswer);
    attachCopyButtonToBotMsg(botMsg, finalAnswer);

    aiChatHistory.push({ role: "bot", text: finalAnswer, reasoning: finalThink });
    if (aiChatHistory.length > 20) aiChatHistory = aiChatHistory.slice(-20);
    saveAiHistoryState();
  } catch (e) {
    botMsg.className = "ai-msg bot error";
    botMsg.textContent = `❌ Lỗi: ${e}`;
  } finally {
    if (aiActiveStream && aiActiveStream.reqId === reqId) {
      aiActiveStream = null;
    }
  }
  chatBody.scrollTop = chatBody.scrollHeight;
}

function initAiAssistantUI() {
  const inputEl = document.getElementById("aiInputPrompt");
  const sendBtn = document.getElementById("aiBtnSend");
  const transBtn = document.getElementById("aiBtnTranslate");
  const sumBtn = document.getElementById("aiBtnSummarize");
  const clearBtn = document.getElementById("aiBtnClear");
  const captureBtn = document.getElementById("aiBtnCapture");
  const quickModelSel = document.getElementById("aiQuickModelSelect");
  const quickThinkBtn = document.getElementById("aiQuickThinkingBtn");
  const attachBtn = document.getElementById("aiBtnAttach");
  const fileInput = document.getElementById("aiFileInput");

  syncAiControlsUI();
  if (captureBtn) {
    captureBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const att = await invoke("capture_active_window");
        if (att && att.data) {
          aiAttachments.push({
            type: "image",
            name: att.name || "Cửa sổ hiện tại.png",
            size: att.size_str || "",
            dataUrl: att.data
          });
          renderAiAttachments();
          playTone("pet");
          showPetBubble("📸 Đã chụp cửa sổ vào AI!");
          inputEl?.focus();
        }
      } catch (err) {
        showPetBubble(`Không chụp được: ${err}`);
      }
    });
  }
  if (quickModelSel) {
    quickModelSel.addEventListener("change", () => {
      settings.aiModel = normalizeAiModelId(quickModelSel.value);
      playTone("tick");
      syncAiControlsUI();
      saveSettingsState();
      const selTxt = quickModelSel.options[quickModelSel.selectedIndex]?.text || settings.aiModel;
      showPetBubble(`AI: ${selTxt}`);
    });
  }
  if (quickThinkBtn) {
    quickThinkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const curIdx = AI_THINKING_ORDER.indexOf(settings.aiThinkingLevel || "high");
      const nextLvl = AI_THINKING_ORDER[(curIdx + 1) % AI_THINKING_ORDER.length];
      settings.aiThinkingLevel = nextLvl;
      playTone("tick");
      syncAiControlsUI();
      saveSettingsState();
      const info = AI_THINKING_LEVELS[nextLvl];
      showPetBubble(`Tư duy AI: ${info.label}`);
    });
  }

  if (attachBtn && fileInput) {
    attachBtn.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.length) {
        for (const f of fileInput.files) {
          addFileToAiAttachments(f);
        }
      }
    });
  }

  // Dán ảnh trực tiếp từ Clipboard (Ctrl + V)
  window.addEventListener("paste", (e) => {
    if (mn.dataset.s !== "ai") return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const f = item.getAsFile();
        if (f) addFileToAiAttachments(f);
      }
    }
  });

  // Kéo thả trực tiếp ảnh/tệp vào vùng AI (HTML5 Drag & Drop)
  const layerAi = document.getElementById("layerAi");
  if (layerAi) {
    layerAi.addEventListener("dragover", (e) => {
      e.preventDefault();
      layerAi.classList.add("drag-hover-ai");
    });
    layerAi.addEventListener("dragleave", (e) => {
      if (e.relatedTarget === null || !layerAi.contains(e.relatedTarget)) {
        layerAi.classList.remove("drag-hover-ai");
      }
    });
    layerAi.addEventListener("drop", (e) => {
      layerAi.classList.remove("drag-hover-ai");
      if (e.dataTransfer?.files?.length) {
        e.preventDefault();
        for (const f of e.dataTransfer.files) {
          addFileToAiAttachments(f);
        }
      }
    });
  }

  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", () => sendAiPrompt());
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAiPrompt();
      } else if (e.key === "Escape") {
        e.preventDefault();
        try { inputEl.blur(); } catch (_) {}
        collapseNotch(true);
      }
    });
  }

  if (transBtn) {
    transBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          sendAiPrompt(`Dịch đoạn văn sau sang tiếng Việt chuẩn xác và tự nhiên:\n"${text.trim()}"`);
        } else {
          showPetBubble("Clipboard đang trống!");
        }
      } catch (_) {
        showPetBubble("Không thể đọc Clipboard!");
      }
    });
  }

  if (sumBtn) {
    sumBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          sendAiPrompt(`Tóm tắt các ý chính quan trọng của đoạn văn sau trong 3-4 gạch đầu dòng:\n"${text.trim()}"`);
        } else {
          showPetBubble("Clipboard đang trống!");
        }
      } catch (_) {
        showPetBubble("Không thể đọc Clipboard!");
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearAiChatHistory();
    });
  }

  // Nút phóng to / thu gọn nhanh khung AI
  const toggleExpandBtn = document.getElementById("aiBtnToggleExpand");
  if (toggleExpandBtn) {
    toggleExpandBtn.addEventListener("click", () => {
      const curH = Number(settings.aiHeight) || 220;
      if (curH < 360) {
        settings.aiWidth = 640;
        settings.aiHeight = 440;
        showPetBubble("Khung AI: 640×440");
      } else {
        settings.aiWidth = 520;
        settings.aiHeight = 220;
        showPetBubble("Khung AI: Mặc định (520×220)");
      }
      saveSettingsState();
      syncNotchBounds("ai");
    });
  }

  // Lăn chuột siêu mượt với quán tính tự nhiên (Kinetic Momentum Smooth Scrolling)
  const chatBody = document.getElementById("aiChatBody");
  if (chatBody) {
    let targetY = chatBody.scrollTop;
    let currentY = chatBody.scrollTop;
    let isWheeling = false;
    let wheelRaf = null;

    chatBody.addEventListener("scroll", () => {
      if (!isWheeling) {
        targetY = chatBody.scrollTop;
        currentY = chatBody.scrollTop;
      }
    }, { passive: true });

    chatBody.addEventListener("wheel", (e) => {
      if (chatBody.scrollHeight <= chatBody.clientHeight) return;

      e.preventDefault();
      e.stopPropagation();

      const maxScroll = chatBody.scrollHeight - chatBody.clientHeight;
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 28;
      else if (e.deltaMode === 2) delta *= chatBody.clientHeight;

      // Gia tốc thông minh: lăn chậm thì mượt từng ly, lăn nhanh thì lướt vèo tự nhiên
      const speedBoost = Math.min(1.85, 1.0 + Math.abs(delta) / 160);
      targetY = Math.max(0, Math.min(maxScroll, targetY + delta * speedBoost));

      if (!isWheeling) {
        isWheeling = true;
        currentY = chatBody.scrollTop;
        animateWheelScroll();
      }
    }, { passive: false });

    function animateWheelScroll() {
      const maxScroll = chatBody.scrollHeight - chatBody.clientHeight;
      targetY = Math.max(0, Math.min(maxScroll, targetY));
      const diff = targetY - currentY;

      if (Math.abs(diff) < 0.4) {
        chatBody.scrollTop = targetY;
        currentY = targetY;
        isWheeling = false;
        wheelRaf = null;
        return;
      }

      currentY += diff * 0.22;
      chatBody.scrollTop = Math.round(currentY * 10) / 10;
      wheelRaf = requestAnimationFrame(animateWheelScroll);
    }
  }

  // Kéo đáy tai thỏ để thay đổi kích thước tùy ý (Drag-to-resize tối ưu 120fps)
  const grip = document.getElementById("aiResizeGrip");
  const corner = document.getElementById("aiResizeCorner");
  if (grip) {
    let isDragging = false;
    let dragMode = "height";
    let startY = 0;
    let startX = 0;
    let startW = 520;
    let startH = 220;
    let dragRaf = null;
    let lastW = 520;
    let lastH = 220;
    let lastSyncTime = 0;

    function startDrag(e, mode) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      isAiResizing = true;
      dragMode = mode;
      startY = e.clientY;
      startX = e.clientX;
      startW = Number(settings.aiWidth) || 520;
      startH = Number(settings.aiHeight) || 220;
      lastW = startW;
      lastH = startH;

      document.body.classList.add("is-resizing-ai");
      mn.classList.add("is-resizing");

      window.addEventListener("mousemove", onMouseMove, { passive: false });
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("pointermove", onMouseMove, { passive: false });
      window.addEventListener("pointerup", onMouseUp);
    }

    grip.addEventListener("mousedown", (e) => {
      if (e.target === corner || corner?.contains(e.target)) return;
      startDrag(e, "height");
    });

    if (corner) {
      corner.addEventListener("mousedown", (e) => {
        startDrag(e, "both");
      });
    }

    // Double-click để trở về kích thước mặc định chuẩn (520x220)
    grip.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      settings.aiWidth = 520;
      settings.aiHeight = 220;
      saveSettingsState();
      syncNotchBounds("ai");
      showPetBubble("Khung AI: Mặc định (520×220)");
    });

    function onMouseMove(e) {
      if (!isDragging || mn.dataset.s !== "ai") return;
      e.preventDefault();

      const u = getEffectiveScale();
      const deltaY = (e.clientY - startY) / u;
      const newH = Math.round(Math.max(160, Math.min(600, startH + deltaY)));

      let newW = startW;
      if (dragMode === "both") {
        const deltaX = (e.clientX - startX) / u;
        newW = Math.round(Math.max(460, Math.min(800, startW + deltaX * 2)));
      }

      lastW = newW;
      lastH = newH;
      settings.aiHeight = newH;
      if (dragMode === "both") settings.aiWidth = newW;

      // Cập nhật CSS bằng RAF trực tiếp trên GPU, không nghẽn luồng
      if (!dragRaf) {
        dragRaf = requestAnimationFrame(() => {
          mn.style.setProperty("--ai-w", `${lastW}px`);
          mn.style.setProperty("--ai-h", `${lastH}px`);
          mn.style.removeProperty("--w");
          mn.style.removeProperty("--h");
          dragRaf = null;

          const now = Date.now();
          if (now - lastSyncTime > 120) {
            lastSyncTime = now;
            invoke("set_notch_bounds", {
              width: lastW * u,
              height: lastH * u,
              expanded: true
            }).catch(() => {});
          }
        });
      }
    }

    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      isAiResizing = false;
      if (dragRaf) {
        cancelAnimationFrame(dragRaf);
        dragRaf = null;
      }
      document.body.classList.remove("is-resizing-ai");
      mn.classList.remove("is-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerup", onMouseUp);

      saveSettingsState();
      if (mn.dataset.s === "ai") {
        syncNotchBounds("ai");
      } else {
        syncNotchBounds(mn.dataset.s);
      }
    }
  }
}

// ============================================================
// 11. TRANG HÔM NAY & THÔNG BÁO, TRANG TIỆN ÍCH ĐÔI (8 WIDGETS), GIỜ CẦU NGUYỆN (ISLAND 1.2.0)
// ============================================================
function saveNotifState() {
  invoke("save_data_file", {
    filename: "notifications.txt",
    content: JSON.stringify(notifList.slice(0, 40), null, 2)
  }).catch(() => {});
}

function pushAppNotification(icon, title, sub = "", showPreview = true) {
  if (settings.notifications === false) return;
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  notifList.unshift({
    icon: icon || "🔔",
    title: title || "Thông báo",
    sub: sub || "",
    time: timeStr
  });
  if (notifList.length > 40) notifList = notifList.slice(0, 40);
  if (!isExpanded || mn.dataset.s !== "today") {
    unreadNotifCount++;
    document.getElementById("hdrNotifDot")?.classList.add("show");
  }
  saveNotifState();
  renderTodayPage();

  if (showPreview && settings.notificationPreview !== false && !isExpanded) {
    document.getElementById("hudIconText").textContent = icon || "🔔";
    document.getElementById("hudTitle").textContent = title || "Thông báo";
    document.getElementById("hudSub").textContent = sub || "Thông báo mới";
    document.getElementById("hudRightVal").textContent = timeStr;
    document.getElementById("hudRingArc").style.strokeDashoffset = "0";
    triggerPeek("bt", 3200);
  }
}

document.getElementById("btnTodayClearNotifs")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  notifList = [];
  unreadNotifCount = 0;
  document.getElementById("hdrNotifDot")?.classList.remove("show");
  renderTodayPage();
  saveNotifState();
});

function getWeekDates(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay(); // 0=CN..6=T7
  const startMon = settings.weekMonday !== false;
  const diff = startMon ? (day === 0 ? -6 : 1 - day) : -day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  const res = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    res.push(cur);
  }
  return res;
}

function renderTodayPage() {
  const stripEl = document.getElementById("todayWeekStrip");
  const summaryEl = document.getElementById("todayTaskSummary");
  const tasksEl = document.getElementById("todayMiniTasks");
  const badgeEl = document.getElementById("todayNotifBadge");
  const notifListEl = document.getElementById("todayNotifList");
  if (!stripEl || !tasksEl || !notifListEl) return;

  const now = new Date();
  const weekDays = getWeekDates(now);
  stripEl.innerHTML = "";
  weekDays.forEach((dt) => {
    const isToday = dt.toDateString() === now.toDateString();
    const cell = document.createElement("div");
    cell.className = "today-day-cell" + (isToday ? " is-today" : "");
    cell.innerHTML = `
      <span class="dw">${DAYS_VI[dt.getDay()]}</span>
      <span class="dn">${dt.getDate()}</span>
    `;
    stripEl.appendChild(cell);
  });

  const agendaEl = document.getElementById("todayAgendaList");
  if (agendaEl) {
    agendaEl.innerHTML = "";
    if (settings.calendarCompanion !== false && Array.isArray(calendarEvents) && calendarEvents.length > 0) {
      calendarEvents.slice(0, 2).forEach((ev) => {
        const startM = Number(ev.start_minute) || 0;
        const hh = String(Math.floor(startM / 60)).padStart(2, "0");
        const mm = String(startM % 60).padStart(2, "0");
        const timeLbl = ev.all_day ? "Cả ngày" : `${hh}:${mm}`;
        const row = document.createElement("div");
        row.className = "today-agenda-item";
        row.innerHTML = `
          <span class="today-agenda-time tabular">📅 ${escapeHtml(timeLbl)}</span>
          <span class="today-agenda-title">${escapeHtml(ev.title || "Sự kiện")}</span>
          ${ev.link ? '<button type="button" class="today-agenda-join" title="Mở liên kết cuộc họp">Tham gia</button>' : ""}
        `;
        row.querySelector(".today-agenda-join")?.addEventListener("click", (e) => {
          e.stopPropagation();
          playTone("tick");
          invoke("open_path_in_explorer", { path: ev.link }).catch(() => {});
        });
        agendaEl.appendChild(row);
      });
    }
  }

  const pending = todoList
    .map((t, idx) => ({ ...t, idx, parsed: parseTodoSchedule(t.text) }))
    .filter((t) => !t.done);
  if (settings.todoOrdered !== false) {
    pending.sort((a, b) => {
      const sa = a.parsed.startMins ?? 9999;
      const sb = b.parsed.startMins ?? 9999;
      return sa - sb;
    });
  }

  if (summaryEl) {
    const doneCount = todoList.filter((t) => t.done).length;
    summaryEl.textContent = `${doneCount}/${todoList.length} xong`;
  }

  tasksEl.innerHTML = "";
  if (pending.length === 0) {
    tasksEl.innerHTML = `<div class="today-notif-empty" style="padding:4px 0">🎉 Đã hoàn thành hết công việc hôm nay!</div>`;
  } else {
    pending.slice(0, 4).forEach((item) => {
      const row = document.createElement("div");
      row.className = "today-mini-task-item";
      row.title = "Bấm để đánh dấu hoàn thành";
      const joinHtml = item.parsed.meetingUrl
        ? '<button class="todo-join-btn" title="Tham gia phòng họp">Tham gia</button>'
        : "";
      row.innerHTML = `
        <span class="dot"></span>
        ${item.parsed.timeBadge ? `<b style="color:#58c4ff;font-size:9.5px">${escapeHtml(item.parsed.timeBadge)}</b>` : ""}
        <span class="txt">${escapeHtml(item.parsed.displayText)}</span>
        ${joinHtml}
      `;
      row.querySelector(".todo-join-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        playTone("tick");
        if (item.parsed.meetingUrl) {
          invoke("open_path_in_explorer", { path: item.parsed.meetingUrl }).catch(() => {});
        }
      });
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if (todoList[item.idx]) {
          todoList[item.idx].done = true;
          todoList[item.idx].local_dirty = true;
          playTone("tick");
          renderTodo();
          saveTodoState();
          triggerGoogleTasksSync(250);
        }
      });
      tasksEl.appendChild(row);
    });
  }

  if (badgeEl) badgeEl.textContent = String(notifList.length);
  notifListEl.innerHTML = "";
  if (settings.notifications === false) {
    notifListEl.innerHTML = `<div class="today-notif-empty">Đã tắt Trung tâm thông báo trong Cài đặt.</div>`;
    return;
  }
  if (notifList.length === 0) {
    notifListEl.innerHTML = `<div class="today-notif-empty">Không có thông báo mới.<br/>Mọi nhắc nhở sẽ hiển thị tại đây.</div>`;
    return;
  }

  notifList.forEach((n, idx) => {
    const item = document.createElement("div");
    item.className = "today-notif-item";
    item.title = "Bấm chuột phải để xóa thông báo này";
    item.innerHTML = `
      <span class="today-notif-ico">${n.icon || "🔔"}</span>
      <div class="today-notif-body">
        <div class="today-notif-title">${escapeHtml(n.title || "")}</div>
        <div class="today-notif-sub">${escapeHtml(n.sub || "")}</div>
      </div>
      <span class="today-notif-time">${escapeHtml(n.time || "")}</span>
    `;
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      notifList.splice(idx, 1);
      playTone("tick");
      renderTodayPage();
      saveNotifState();
    });
    notifListEl.appendChild(item);
  });
}

// ============================================================
// TRANG TIỆN ÍCH ĐÔI (8 LOẠI WIDGET ISLAND 1.2.0)
// ============================================================
function getMoonPhaseInfo(date = new Date()) {
  const synodic = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const diffDays = (date.getTime() - knownNewMoon) / 86400000;
  const cyclePos = ((diffDays % synodic) + synodic) % synodic;
  const frac = cyclePos / synodic;
  const illum = Math.round(((1 - Math.cos(frac * 2 * Math.PI)) / 2) * 100);
  let name = "Trăng mới";
  let emoji = "🌑";
  if (frac < 0.04 || frac > 0.96) { name = "Trăng mới (Sóc)"; emoji = "🌑"; }
  else if (frac < 0.22) { name = "Trăng lưỡi liềm đầu tháng"; emoji = "🌒"; }
  else if (frac < 0.28) { name = "Bán nguyệt đầu tháng"; emoji = "🌓"; }
  else if (frac < 0.46) { name = "Trăng khuyết đầu tháng"; emoji = "🌔"; }
  else if (frac < 0.54) { name = "Trăng tròn (Vọng)"; emoji = "🌕"; }
  else if (frac < 0.72) { name = "Trăng khuyết cuối tháng"; emoji = "🌖"; }
  else if (frac < 0.78) { name = "Bán nguyệt cuối tháng"; emoji = "🌗"; }
  else { name = "Trăng lưỡi liềm cuối tháng"; emoji = "🌘"; }
  return { name, emoji, illum, dayOfCycle: Math.max(1, Math.round(cyclePos)) };
}

function formatCityTime(cityName) {
  const cfg = WORLD_CITIES[cityName] || { tz: "Asia/Ho_Chi_Minh", label: cityName || "🇻🇳 Hà Nội (VN)" };
  try {
    const now = new Date();
    const t = new Intl.DateTimeFormat("vi-VN", {
      timeZone: cfg.tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(now);
    return { label: cfg.label, time: t };
  } catch (_) {
    const d = new Date();
    return {
      label: cfg.label,
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    };
  }
}

function buildWidgetHTML(type, side) {
  const now = new Date();
  const switchBtnHtml = `<button class="nw-switch-btn" data-side="${side}" title="Đổi tiện ích hiển thị ở khung này">⇄</button>`;

  if (type === "this_week") {
    const days = getWeekDates(now);
    const dotColors = ["blue", "", "", "green", "red", "", "orange"];
    const cells = days.map((dt, idx) => {
      const isToday = dt.toDateString() === now.toDateString();
      const dotCls = isToday ? "green" : (dotColors[idx % dotColors.length] || "");
      return `
        <div class="nw-wk-col${isToday ? " is-today" : ""}">
          <span class="nw-wk-dow">${DAYS_VI[dt.getDay()]}</span>
          <span class="nw-wk-num">${dt.getDate()}</span>
          <span class="nw-wk-dot ${dotCls}"></span>
        </div>
      `;
    }).join("");
    const pending = todoList.filter((t) => !t.done);
    const nextTask = pending.length > 0 ? parseTodoSchedule(pending[0].text) : null;
    const nextLineText = nextTask
      ? `Tiếp: ${nextTask.displayText}${nextTask.timeBadge ? `, ${nextTask.timeBadge}` : ""}`
      : "Đã hoàn thành hết việc hôm nay 🎉";
    return `
      <div class="nw-hdr"><span>THIS WEEK · TUẦN NÀY</span>${switchBtnHtml}</div>
      <div class="nw-week-grid">${cells}</div>
      <div class="nw-week-footer">
        <div class="nw-week-tasks-line">
          <span class="nw-status-dot-green"></span>
          <span>${pending.length} việc hôm nay</span>
        </div>
        <div class="nw-week-next-line">${escapeHtml(nextLineText)}</div>
      </div>
    `;
  }

  if (type === "system_monitor") {
    const cpu = Math.max(0, Math.min(100, Number(sysStats.cpuPct) || 0));
    const ram = Math.max(0, Math.min(100, Number(sysStats.ramPct) || 0));
    const down = Number(sysStats.netDownKbps) || 0;
    const up = Number(sysStats.netUpKbps) || 0;
    const fmtNet = (kbps) => kbps >= 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps} KB/s`;
    const cpuCol = cpu >= 85 ? "#ff453a" : (cpu >= 60 ? "#fbbf24" : "#00f5d4");
    const ramCol = ram >= 85 ? "#f43f5e" : "#a855f7";
    return `
      <div class="nw-hdr"><span>SYSTEM · ${sysStats.ramUsedGb}/${sysStats.ramTotalGb} GB</span>${switchBtnHtml}</div>
      <div class="nw-sys-grid">
        <div class="nw-sys-row">
          <span class="nw-sys-lbl">CPU</span>
          <div class="nw-sys-bar"><i style="width:${cpu}%;background:${cpuCol}"></i></div>
          <span class="nw-sys-val">${cpu}%</span>
        </div>
        <div class="nw-sys-row">
          <span class="nw-sys-lbl">RAM</span>
          <div class="nw-sys-bar"><i style="width:${ram}%;background:${ramCol}"></i></div>
          <span class="nw-sys-val">${ram}%</span>
        </div>
        <div class="nw-sys-net">
          <span>↓ <b style="color:#38bdf8">${fmtNet(down)}</b></span>
          <span>↑ <b style="color:#c084fc">${fmtNet(up)}</b></span>
        </div>
      </div>
    `;
  }

  if (type === "battery") {
    const pct = prevBatteryPct <= 100 ? Math.max(0, prevBatteryPct) : 100;
    const r = 18;
    const circum = 2 * Math.PI * r; // ~113.1
    const offset = circum * (1 - pct / 100);
    const ringColor = pct <= 20 && !isSystemCharging ? "#ff453a" : "#30d158";
    const stateText = isSystemCharging ? "Đang sạc" : (pct === 100 ? "Đã đầy pin" : "Đang dùng pin");
    const subText = isSystemCharging ? "Đã cắm nguồn" : (pct <= 20 ? "Hãy cắm sạc sớm" : "Pin hệ thống");
    return `
      <div class="nw-hdr"><span>BATTERY · PIN</span>${switchBtnHtml}</div>
      <div class="nw-batt-body">
        <div class="nw-batt-ring-wrap">
          <svg class="nw-batt-svg" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(48, 209, 88, 0.2)" stroke-width="4.5"/>
            <circle cx="22" cy="22" r="${r}" fill="none" stroke="${ringColor}" stroke-width="4.5" stroke-linecap="round"
              stroke-dasharray="${circum.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
          </svg>
          <span class="nw-batt-bolt">
            <svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>
          </span>
        </div>
        <div class="nw-batt-info">
          <div class="nw-batt-pct">${pct}%</div>
          <div class="nw-batt-state" style="color:${ringColor}">${stateText}</div>
          <div class="nw-batt-sub">${subText}</div>
        </div>
      </div>
    `;
  }

  if (type === "weather") {
    const wInfo = decodeWmoWeather(weatherData.wmoCode, weatherData.isDay);
    const tStr = formatTempVal(weatherData.tempC, true);
    const cityLabel = weatherData.city || (settings.weatherCity === "Auto" ? "Tự động" : (settings.weatherCity || "Hà Nội"));
    const pts = (weatherData.hourly || []).slice(0, 5).map((h) => Number(h.tempC) || 28);
    while (pts.length < 5) pts.push(weatherData.tempC || 28);
    const minT = Math.min(...pts) - 1;
    const maxT = Math.max(...pts) + 1;
    const coords = pts.map((v, i) => {
      const x = 6 + i * 16.5;
      const y = 34 - ((v - minT) / Math.max(1, maxT - minT)) * 22;
      return [x, y];
    });
    const dPath = coords.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const areaPath = `${dPath} L${coords[coords.length - 1][0].toFixed(1)},40 L${coords[0][0].toFixed(1)},40 Z`;
    return `
      <div class="nw-hdr"><span>WEATHER · ${escapeHtml(cityLabel)}</span>${switchBtnHtml}</div>
      <div class="nw-wth-body">
        <div class="nw-wth-left">
          <div class="nw-wth-temp-row">
            <span style="font-size:18px">${wInfo.icon}</span>
            <span class="nw-wth-temp">${tStr}</span>
          </div>
          <div class="nw-wth-cond">${escapeHtml(wInfo.desc)}</div>
          <div class="nw-sub-line">C:${formatTempVal(weatherData.highC, false)} T:${formatTempVal(weatherData.lowC, false)} · Ẩm <b>${weatherData.humidity}%</b></div>
        </div>
        <svg class="nw-wth-spark" viewBox="0 0 78 42">
          <defs>
            <linearGradient id="nwSparkGrad_${side}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#nwSparkGrad_${side})"/>
          <path d="${dPath}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${coords[0][0].toFixed(1)}" cy="${coords[0][1].toFixed(1)}" r="3" fill="#ffffff" stroke="#38bdf8" stroke-width="1.5"/>
        </svg>
      </div>
    `;
  }

  if (type === "water") {
    const days = [];
    let bestMl = 0;
    let bestLabel = "Hôm nay";
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = todayIsoKey(d);
      const ml = i === 0 ? (waterData.intakeMl || 0) : (waterData.history?.[k] || 0);
      if (ml >= bestMl) {
        bestMl = ml;
        bestLabel = i === 0 ? "Hôm nay" : DAYS_VI[d.getDay()];
      }
      days.push({ dow: DAYS_VI[d.getDay()], ml, isToday: i === 0 });
    }
    const goal = Math.max(500, waterData.goalMl || 2000);
    const bars = days.map((x) => {
      const h = Math.max(10, Math.min(100, Math.round((x.ml / goal) * 100)));
      return `<div class="nw-bar-col"><span style="height:${h}%;opacity:${x.isToday ? 1 : 0.55}"></span><i>${x.dow}</i></div>`;
    }).join("");
    const litres = ((waterData.intakeMl || 0) / 1000).toFixed(1);
    return `
      <div class="nw-hdr"><span>WATER · NƯỚC UỐNG</span>${switchBtnHtml}</div>
      <div class="nw-bars-7">${bars}</div>
      <div class="nw-sub-line">Hôm nay: <b>${litres}L</b> · Đỉnh: <b>${bestLabel} (${(bestMl / 1000).toFixed(1)}L)</b></div>
    `;
  }

  if (type === "focus_today") {
    const key = todayIsoKey(now);
    const mins = focusData.date === key ? (focusData.minutesToday || 0) : 0;
    const sess = focusData.date === key ? (focusData.sessionsToday || 0) : 0;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const timeStr = hh > 0 ? `${hh}g ${mm}p` : `${mm}p`;
    const curRound = (pomoCompletedCount % 4) + 1;
    const days = [];
    let maxMins = 30;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = todayIsoKey(d);
      const mVal = i === 0 ? mins : (Number(focusData.history?.[k]?.minutes) || 0);
      if (mVal > maxMins) maxMins = mVal;
      days.push({ dow: DAYS_VI[d.getDay()], mVal, isToday: i === 0 });
    }
    const bars = days.map((x) => {
      const h = x.mVal > 0 ? Math.max(14, Math.min(100, Math.round((x.mVal / maxMins) * 100))) : 8;
      const bg = x.isToday ? "#a855f7" : "rgba(129, 140, 248, 0.72)";
      return `<div class="nw-bar-col"><span style="height:${h}%;background:${bg};opacity:${x.isToday ? 1 : 0.75}"></span><i>${x.dow}</i></div>`;
    }).join("");
    return `
      <div class="nw-hdr"><span>FOCUS · ${timeStr} HÔM NAY</span>${switchBtnHtml}</div>
      <div class="nw-bars-7">${bars}</div>
      <div class="nw-sub-line"><b>${sess} phiên</b> hôm nay · Vòng <b>${curRound}/4</b></div>
    `;
  }

  if (type === "world_clock") {
    const c1 = formatCityTime(settings.widgetCity1 || "Hà Nội");
    const c2 = formatCityTime(settings.widgetCity2 || "TP.HCM");
    return `
      <div class="nw-hdr"><span>WORLD CLOCK · GIỜ VN</span>${switchBtnHtml}</div>
      <div style="display:flex;flex-direction:column;justify-content:center;gap:3px;flex:1">
        <div class="nw-city-row">
          <div class="nw-city-meta">
            <span class="nw-city-name">${escapeHtml(c1.label)}</span>
          </div>
          <span class="nw-city-time">${c1.time}</span>
        </div>
        <div class="nw-city-row">
          <div class="nw-city-meta">
            <span class="nw-city-name">${escapeHtml(c2.label)}</span>
          </div>
          <span class="nw-city-time">${c2.time}</span>
        </div>
      </div>
    `;
  }

  if (type === "moon") {
    const m = getMoonPhaseInfo(now);
    return `
      <div class="nw-hdr"><span>MOON · MẶT TRĂNG</span>${switchBtnHtml}</div>
      <div class="nw-moon-row">
        <span class="nw-moon-ico">${m.emoji}</span>
        <div>
          <div style="font-size:12px;font-weight:800;color:#fff">${m.name}</div>
          <div class="nw-sub-line">Độ sáng: <b>${m.illum}%</b> · Ngày <b>${m.dayOfCycle}</b> ÂL</div>
        </div>
      </div>
    `;
  }

  if (type === "countdown") {
    const evKey = settings.widgetEvent || "new_year";
    const ev = COUNTDOWN_EVENTS[evKey] || COUNTDOWN_EVENTS.new_year;
    let target = new Date(now.getFullYear(), ev.month - 1, ev.day, 0, 0, 0);
    if (target.getTime() < now.getTime() - 86400000) {
      target = new Date(now.getFullYear() + 1, ev.month - 1, ev.day, 0, 0, 0);
    }
    const diffDays = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000));
    const pct = Math.max(8, Math.min(100, Math.round(((365 - Math.min(365, diffDays)) / 365) * 100)));
    return `
      <div class="nw-hdr"><span>${ev.icon} ${escapeHtml(ev.name)}</span>${switchBtnHtml}</div>
      <div class="nw-big-val">${diffDays === 0 ? "Hôm nay!" : diffDays} <span class="unit">${diffDays === 0 ? "🎉" : "ngày nữa"}</span></div>
      <div style="width:100%;height:4px;border-radius:99px;background:rgba(255,255,255,0.12);overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,#19b8ff,#a855f7)"></i></div>
      <div class="nw-sub-line">Mốc: <b>${String(ev.day).padStart(2, "0")}/${String(ev.month).padStart(2, "0")}/${target.getFullYear()}</b></div>
    `;
  }

  // next_prayer
  const pr = getPrayerScheduleInfo(now);
  return `
    <div class="nw-hdr"><span>PRAYER · ${escapeHtml(settings.prayerCity || "Hà Nội")}</span>${switchBtnHtml}</div>
    <div class="nw-big-val" style="font-size:17px">${pr.next.name} · <span style="color:#38bdf8">${pr.next.timeStr}</span></div>
    <div class="nw-sub-line">Tiếp theo · Còn <b>${pr.countdownText}</b></div>
  `;
}

function renderWidgetsPage() {
  const leftEl = document.getElementById("widgetCardLeft");
  const rightEl = document.getElementById("widgetCardRight");
  if (!leftEl || !rightEl) return;

  const wLeft = WIDGET_TYPES.includes(settings.widgetLeft) ? settings.widgetLeft : "this_week";
  const wRight = WIDGET_TYPES.includes(settings.widgetRight) ? settings.widgetRight : "battery";
  leftEl.innerHTML = buildWidgetHTML(wLeft, "left");
  rightEl.innerHTML = buildWidgetHTML(wRight, "right");

  [leftEl, rightEl].forEach((card) => {
    card.querySelector(".nw-switch-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      playTone("tick");
      const side = e.currentTarget.dataset.side;
      if (side === "left") {
        const idx = WIDGET_TYPES.indexOf(wLeft);
        settings.widgetLeft = WIDGET_TYPES[(idx + 1) % WIDGET_TYPES.length];
      } else {
        const idx = WIDGET_TYPES.indexOf(wRight);
        settings.widgetRight = WIDGET_TYPES[(idx + 1) % WIDGET_TYPES.length];
      }
      renderWidgetsPage();
      saveSettingsState();
    });
  });
}

// ============================================================
// TRANG & HỆ THỐNG GIỜ CẦU NGUYỆN + BIỂU ĐỒ MẶT TRỜI (PRAYER - ISLAND 1.2.0)
// ============================================================
function fmtMinsToHHMM(totalMins) {
  const m = ((Math.round(totalMins) % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function getPrayerScheduleInfo(now = new Date()) {
  const city = settings.prayerCity || "Hà Nội";
  const base = PRAYER_CITY_OFFSETS[city] || PRAYER_CITY_OFFSETS["Hà Nội"];
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const seasonal = Math.round(Math.sin(((dayOfYear - 80) / 365) * 2 * Math.PI) * 14);

  const list = [
    { key: "subuh", name: "Subuh", arabic: "الفجر", mins: base.subuh - seasonal + (Number(settings.prayerAdjSubuh) || 0) },
    { key: "dzuhur", name: "Dzuhur", arabic: "الظهر", mins: base.dzuhur + (Number(settings.prayerAdjDzuhur) || 0) },
    { key: "ashar", name: "Ashar", arabic: "العصر", mins: base.ashar + Math.round(seasonal * 0.4) + (Number(settings.prayerAdjAshar) || 0) },
    { key: "maghrib", name: "Maghrib", arabic: "المغرب", mins: base.maghrib + seasonal + (Number(settings.prayerAdjMaghrib) || 0) },
    { key: "isya", name: "Isya", arabic: "العشاء", mins: base.isya + seasonal + (Number(settings.prayerAdjIsya) || 0) }
  ].map((p) => ({
    ...p,
    timeStr: fmtMinsToHHMM(p.mins)
  }));

  const curMins = now.getHours() * 60 + now.getMinutes();
  let nextIdx = list.findIndex((p) => p.mins > curMins);
  let diffMins = 0;
  let prevMins = 0;
  if (nextIdx === -1) {
    nextIdx = 0;
    diffMins = (1440 - curMins) + list[0].mins;
    prevMins = list[list.length - 1].mins;
  } else {
    diffMins = list[nextIdx].mins - curMins;
    prevMins = nextIdx > 0 ? list[nextIdx - 1].mins : (list[list.length - 1].mins - 1440);
  }
  const spanMins = Math.max(30, (nextIdx === 0 && curMins >= list[list.length - 1].mins)
    ? (1440 - list[list.length - 1].mins + list[0].mins)
    : (list[nextIdx].mins - prevMins));
  const segProg = Math.max(0.08, Math.min(0.96, 1 - diffMins / spanMins));

  const dh = Math.floor(diffMins / 60);
  const dm = diffMins % 60;
  const countdownText = dh > 0 ? `${dh}g ${String(dm).padStart(2, "0")}p` : `${dm} phút`;

  return {
    city,
    list,
    nextIdx,
    next: list[nextIdx],
    diffMins,
    segProg,
    countdownText
  };
}

// Tính tọa độ điểm trên đường cong Bezier bậc 2: P(t) = (1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
function quadBezierPoint(t, p0, p1, p2) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  };
}

function renderPrayerPage() {
  const rowEl = document.getElementById("prayerTimesRow");
  const arcWrap = document.getElementById("prayerArcWrap");
  const cityEl = document.getElementById("prayerCityBadge");
  const nextNameEl = document.getElementById("prayerNextName");
  const nextTimeEl = document.getElementById("prayerNextTime");
  const nextCdEl = document.getElementById("prayerNextCountdown");
  const progFillEl = document.getElementById("prayerProgFill");
  const pauseBtn = document.getElementById("btnPrayerPauseMedia");
  if (!rowEl) return;

  const now = new Date();
  const info = getPrayerScheduleInfo(now);
  if (cityEl) cityEl.textContent = info.city;
  if (nextNameEl) nextNameEl.textContent = info.next.name;
  if (nextTimeEl) nextTimeEl.textContent = info.next.timeStr;
  if (nextCdEl) nextCdEl.textContent = `còn ${info.countdownText}`;
  if (progFillEl) progFillEl.style.width = `${Math.round(info.segProg * 100)}%`;
  if (pauseBtn) {
    pauseBtn.classList.toggle("on", !!settings.prayerPauseMedia);
    pauseBtn.textContent = settings.prayerPauseMedia ? "⏸ Dừng nhạc: BẬT" : "⏸ Nhạc";
  }

  // Vẽ biểu đồ đường cong mặt trời SVG chuẩn Island 1.2.0 (Screenshot 1)
  if (arcWrap) {
    const p0 = { x: 14, y: 50 };
    const p1 = { x: 115, y: -8 };
    const p2 = { x: 216, y: 50 };
    const slotTs = [0.08, 0.34, 0.56, 0.78, 0.94];
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const firstM = info.list[0].mins;
    const lastM = info.list[info.list.length - 1].mins;
    let sunT = 0.68;
    if (nowMins <= firstM) {
      sunT = 0.08 * Math.max(0.2, nowMins / Math.max(1, firstM));
    } else if (nowMins >= lastM) {
      sunT = 0.94 + 0.05 * Math.min(1, (nowMins - lastM) / Math.max(1, 1440 - lastM));
    } else {
      for (let i = 0; i < info.list.length - 1; i++) {
        const mA = info.list[i].mins;
        const mB = info.list[i + 1].mins;
        if (nowMins >= mA && nowMins <= mB) {
          const frac = (nowMins - mA) / Math.max(1, mB - mA);
          sunT = slotTs[i] + frac * (slotTs[i + 1] - slotTs[i]);
          break;
        }
      }
    }
    const sunPt = quadBezierPoint(sunT, p0, p1, p2);
    const clipW = Math.max(14, Math.min(226, sunPt.x));

    const dotsSvg = slotTs.map((t, idx) => {
      const pt = quadBezierPoint(t, p0, p1, p2);
      const isPassedOrNext = idx <= info.nextIdx;
      const r = idx === info.nextIdx ? 2.8 : 2.1;
      const fill = idx === info.nextIdx ? "#ffffff" : (isPassedOrNext ? "#93c5fd" : "rgba(255,255,255,0.35)");
      return `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${r}" fill="${fill}"/>`;
    }).join("");

    arcWrap.innerHTML = `
      <svg class="prayer-arc-svg" viewBox="0 0 230 58">
        <defs>
          <linearGradient id="prayerBlueArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#0ea5e9"/>
            <stop offset="60%" stop-color="#3b82f6"/>
            <stop offset="100%" stop-color="#60a5fa"/>
          </linearGradient>
          <radialGradient id="prayerSunHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
            <stop offset="35%" stop-color="#fde047" stop-opacity="0.85"/>
            <stop offset="70%" stop-color="#f59e0b" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
          </radialGradient>
          <clipPath id="prayerElapsedClip">
            <rect x="0" y="-10" width="${clipW.toFixed(1)}" height="70"/>
          </clipPath>
        </defs>
        <!-- Đường chân trời ngang -->
        <line x1="6" y1="50" x2="224" y2="50" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
        <!-- Đường cong toàn phần (mờ) -->
        <path d="M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2.2" stroke-linecap="round"/>
        <!-- Đường cong phần đã đi qua (xanh phát sáng) -->
        <path d="M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}" fill="none" stroke="url(#prayerBlueArc)" stroke-width="2.6" stroke-linecap="round" clip-path="url(#prayerElapsedClip)"/>
        <!-- 5 điểm mốc cầu nguyện trên đường cong -->
        ${dotsSvg}
        <!-- Quả cầu Mặt trời phát sáng vàng-trắng -->
        <circle cx="${sunPt.x.toFixed(1)}" cy="${sunPt.y.toFixed(1)}" r="12" fill="url(#prayerSunHalo)"/>
        <circle cx="${sunPt.x.toFixed(1)}" cy="${sunPt.y.toFixed(1)}" r="4.2" fill="#ffffff"/>
      </svg>
    `;
  }

  rowEl.innerHTML = "";
  info.list.forEach((p, idx) => {
    const isNext = idx === info.nextIdx;
    const slot = document.createElement("div");
    slot.className = "prayer-slot" + (isNext ? " active" : "");
    slot.innerHTML = `
      <span class="prayer-slot-name">${p.name}</span>
      <span class="prayer-slot-time">${p.timeStr}</span>
    `;
    rowEl.appendChild(slot);
  });
}

document.getElementById("prayerCityBadge")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const cities = Object.keys(PRAYER_CITY_OFFSETS);
  const idx = cities.indexOf(settings.prayerCity || "Hà Nội");
  settings.prayerCity = cities[(idx + 1) % cities.length];
  playTone("tick");
  renderPrayerPage();
  renderWidgetsPage();
  saveSettingsState();
});

document.getElementById("btnPrayerPauseMedia")?.addEventListener("click", (e) => {
  e.stopPropagation();
  settings.prayerPauseMedia = !settings.prayerPauseMedia;
  playTone("tick");
  renderPrayerPage();
  saveSettingsState();
});

function checkPrayerSchedule(now = new Date()) {
  if (myWindowLabel !== "main" || settings.prayerReminder === false) return;
  const info = getPrayerScheduleInfo(now);
  const curMins = now.getHours() * 60 + now.getMinutes();
  const dayKey = todayIsoKey(now);

  info.list.forEach((p) => {
    if (settings.prayerEarly !== false && curMins === p.mins - 15) {
      const k = `${dayKey}-${p.key}-early`;
      if (lastPrayerNotifiedKey !== k) {
        lastPrayerNotifiedKey = k;
        if (settings.prayerSound !== false) playTone("tick");
        pushAppNotification("🕌", `Sắp đến giờ ${p.name}`, `Còn 15 phút nữa (${p.timeStr}) tại ${info.city}`, true);
      }
    }
    if (curMins === p.mins) {
      const k = `${dayKey}-${p.key}-exact`;
      if (lastPrayerNotifiedKey !== k) {
        lastPrayerNotifiedKey = k;
        if (settings.prayerSound !== false) playTone("chime");
        if (settings.prayerPauseMedia && mediaState.playing) {
          invoke("media_control", { action: "play_pause", positionSecs: null }).catch(() => {});
        }
        triggerPetExpression("starry", "🕌", `Đã đến giờ ${p.name} (${p.timeStr})`, 3500);
        pushAppNotification("🕌", `Đến giờ cầu nguyện: ${p.name}`, `${p.timeStr} · ${info.city}`, true);
      }
    }
  });
}

// ============================================================
// TRANG & HỆ THỐNG THỜI TIẾT ĐA KIỂU + ĐA BIỂU ĐỒ (ISLAND WEATHER LIVE)
// ============================================================
function decodeWmoWeather(code, isDay = 1) {
  const c = Number(code) || 0;
  const day = isDay !== 0;
  if (c === 0) return { icon: day ? "☀️" : "🌙", desc: day ? "Trời quang nắng đẹp" : "Đêm quang đãng", kind: day ? "sunny" : "night", severe: false };
  if (c === 1) return { icon: day ? "🌤️" : "🌙", desc: day ? "Ít mây, nắng ấm" : "Đêm ít mây", kind: day ? "sunny" : "night", severe: false };
  if (c === 2) return { icon: "⛅", desc: "Có mây rải rác", kind: day ? "cloudy" : "night", severe: false };
  if (c === 3) return { icon: "☁️", desc: "Trời nhiều mây", kind: "cloudy", severe: false };
  if (c === 45 || c === 48) return { icon: "🌫️", desc: "Sương mù mờ ảo", kind: "foggy", severe: false };
  if (c >= 51 && c <= 57) return { icon: "🌦️", desc: "Mưa phùn nhẹ", kind: "rainy", severe: false };
  if (c === 61 || c === 80) return { icon: "🌦️", desc: "Mưa rào rải rác", kind: "rainy", severe: false };
  if (c === 63 || c === 81) return { icon: "🌧️", desc: "Mưa vừa", kind: "rainy", severe: true };
  if (c === 65 || c === 82) return { icon: "🌧️", desc: "Mưa to nặng hạt", kind: "rainy", severe: true };
  if (c >= 71 && c <= 77) return { icon: "❄️", desc: "Tuyết rơi", kind: "rainy", severe: true };
  if (c >= 95) return { icon: "⛈️", desc: "Dông bão sấm sét", kind: "stormy", severe: true };
  return { icon: day ? "⛅" : "🌙", desc: "Thời tiết ổn định", kind: day ? "cloudy" : "night", severe: false };
}

function formatTempVal(tempC, withUnit = false) {
  const n = Number(tempC);
  const valC = Number.isFinite(n) ? n : 28;
  const isF = settings.weatherUnit === "F";
  const converted = isF ? Math.round((valC * 9) / 5 + 32) : Math.round(valC);
  return withUnit ? `${converted}°${isF ? "F" : "C"}` : `${converted}°`;
}

function saveWeatherState() {
  invoke("save_data_file", {
    filename: "weather.txt",
    content: JSON.stringify(weatherData, null, 2)
  }).catch(() => {});
}

function getBrowserGpsPosition(timeoutMs = 3800) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs + 250);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          const lat = pos?.coords?.latitude;
          const lon = pos?.coords?.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            finish({ lat, lon });
          } else {
            finish(null);
          }
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 300000 }
      );
    } catch (_) {
      clearTimeout(timer);
      finish(null);
    }
  });
}

async function resolveWeatherCoords(forceGps = false) {
  const pref = settings.weatherCity || "Auto";
  if (pref === "Auto") {
    try {
      const gps = await getBrowserGpsPosition(forceGps ? 4500 : 3500);
      const info = await invoke("detect_device_location", {
        latHint: gps ? gps.lat : null,
        lonHint: gps ? gps.lon : null
      });
      if (info && Number.isFinite(info.lat) && Number.isFinite(info.lon)) {
        return {
          cityLabel: info.city_label || "Vị trí của bạn",
          fullAddress: info.full_address || info.city_label || "",
          source: info.source || "GPS Thiết bị",
          lat: Number(info.lat),
          lon: Number(info.lon),
          isGps: true
        };
      }
    } catch (_) {}
    if (Number.isFinite(weatherData.lat) && Number.isFinite(weatherData.lon) && weatherData.updatedAt) {
      return {
        cityLabel: weatherData.city || "Vị trí hiện tại",
        fullAddress: weatherData.fullAddress || weatherData.city || "",
        source: weatherData.locSource || "Bộ nhớ đệm GPS",
        lat: Number(weatherData.lat),
        lon: Number(weatherData.lon),
        isGps: true
      };
    }
  }
  const preset = WEATHER_LOCATIONS[pref] || WEATHER_LOCATIONS["Hà Nội"];
  return {
    cityLabel: preset.auto ? "Hà Nội (Mặc định)" : preset.label,
    fullAddress: preset.auto ? "Hà Nội" : preset.label,
    source: preset.auto ? "Mặc định" : "Chọn thủ công",
    lat: preset.lat,
    lon: preset.lon,
    isGps: !!preset.auto
  };
}

async function fetchWeatherLive(force = false) {
  if (weatherFetchInFlight) return;
  const nowMs = Date.now();
  if (!force && weatherData.updatedAt && nowMs - weatherData.updatedAt < 10 * 60 * 1000) {
    renderWeatherPage();
    return;
  }
  weatherFetchInFlight = true;
  const refreshBtn = document.getElementById("btnWthRefresh");
  refreshBtn?.classList.add("spinning");

  try {
    const loc = await resolveWeatherCoords(force);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,uv_index` +
      `&hourly=temperature_2m,weather_code,is_day,precipitation_probability,uv_index` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max` +
      `&timezone=auto&forecast_days=6`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();

    const cur = json.current || {};
    const daily = json.daily || {};
    const hourly = json.hourly || {};

    weatherData.city = loc.cityLabel;
    weatherData.fullAddress = loc.fullAddress || loc.cityLabel;
    weatherData.locSource = loc.source || "";
    weatherData.lat = loc.lat;
    weatherData.lon = loc.lon;
    weatherData.tempC = typeof cur.temperature_2m === "number" ? cur.temperature_2m : weatherData.tempC;
    weatherData.feelsLikeC = typeof cur.apparent_temperature === "number" ? cur.apparent_temperature : weatherData.tempC;
    weatherData.humidity = typeof cur.relative_humidity_2m === "number" ? Math.round(cur.relative_humidity_2m) : 68;
    weatherData.windKmh = typeof cur.wind_speed_10m === "number" ? Math.round(cur.wind_speed_10m) : 10;
    weatherData.uvIndex = typeof cur.uv_index === "number" ? Math.round(cur.uv_index) : (daily.uv_index_max?.[0] ? Math.round(daily.uv_index_max[0]) : 5);
    weatherData.wmoCode = typeof cur.weather_code === "number" ? cur.weather_code : 1;
    weatherData.isDay = typeof cur.is_day === "number" ? cur.is_day : 1;

    if (Array.isArray(daily.sunrise) && daily.sunrise[0]) {
      const sr = String(daily.sunrise[0]);
      if (sr.includes("T")) weatherData.sunrise = sr.split("T")[1].slice(0, 5);
    }
    if (Array.isArray(daily.sunset) && daily.sunset[0]) {
      const ss = String(daily.sunset[0]);
      if (ss.includes("T")) weatherData.sunset = ss.split("T")[1].slice(0, 5);
    }

    if (Array.isArray(daily.temperature_2m_max) && daily.temperature_2m_max.length > 0) {
      weatherData.highC = daily.temperature_2m_max[0];
    }
    if (Array.isArray(daily.temperature_2m_min) && daily.temperature_2m_min.length > 0) {
      weatherData.lowC = daily.temperature_2m_min[0];
    }

    // Dự báo theo giờ (6 mốc cách nhau 2 giờ để biểu đồ đường cong rõ nét)
    if (Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
      const curH = new Date().getHours();
      let startIdx = hourly.time.findIndex((t) => {
        const hh = String(t).split("T")[1]?.slice(0, 2);
        return Number(hh) === curH;
      });
      if (startIdx < 0) startIdx = Math.min(curH, Math.max(0, hourly.time.length - 12));
      const hSlots = [];
      for (let i = 0; i < 6; i++) {
        const idx = Math.min(hourly.time.length - 1, startIdx + i * 2);
        const rawT = String(hourly.time[idx] || "");
        const hhPart = rawT.includes("T") ? rawT.split("T")[1].slice(0, 5) : `${(curH + i * 2) % 24}:00`;
        const wCode = hourly.weather_code?.[idx] ?? weatherData.wmoCode;
        const isD = hourly.is_day?.[idx] ?? 1;
        const decoded = decodeWmoWeather(wCode, isD);
        hSlots.push({
          label: i === 0 ? "Bây giờ" : hhPart,
          icon: decoded.icon,
          tempC: hourly.temperature_2m[idx],
          rainPct: hourly.precipitation_probability?.[idx] ?? 0,
          uv: hourly.uv_index?.[idx] ?? 0
        });
      }
      if (hSlots.length > 0) weatherData.hourly = hSlots;
    }

    // Dự báo 5 ngày tới
    if (Array.isArray(daily.time) && Array.isArray(daily.temperature_2m_max)) {
      const dSlots = [];
      for (let i = 0; i < Math.min(5, daily.time.length); i++) {
        const dt = new Date(`${daily.time[i]}T12:00:00`);
        const lbl = i === 0 ? "Hôm nay" : (i === 1 ? "Ngày mai" : `${DAYS_VI[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`);
        const wCode = daily.weather_code?.[i] ?? 1;
        const decoded = decodeWmoWeather(wCode, 1);
        dSlots.push({
          label: lbl,
          icon: decoded.icon,
          tempC: daily.temperature_2m_max[i],
          lowC: daily.temperature_2m_min?.[i] ?? (daily.temperature_2m_max[i] - 5),
          rainPct: daily.precipitation_probability_max?.[i] ?? 0
        });
      }
      if (dSlots.length > 0) weatherData.daily = dSlots;
    }

    weatherData.updatedAt = Date.now();
    saveWeatherState();
    renderWeatherPage();
    renderWidgetsPage();
    emit("island-settings-sync", {
      settings,
      water: { intakeMl: waterData.intakeMl, goalMl: waterData.goalMl },
      weather: buildWeatherSyncSnapshot()
    }).catch(() => {});

    const curInfo = decodeWmoWeather(weatherData.wmoCode, weatherData.isDay);
    const alertKey = `${todayIsoKey()}-${weatherData.city}-${weatherData.wmoCode}`;
    if (myWindowLabel === "main" && settings.weatherAlert !== false && curInfo.severe && lastWeatherAlertKey !== alertKey) {
      lastWeatherAlertKey = alertKey;
      pushAppNotification(
        curInfo.icon,
        `Thời tiết ${weatherData.city}: ${curInfo.desc}`,
        `Nhiệt độ ${formatTempVal(weatherData.tempC, true)} · Độ ẩm ${weatherData.humidity}%`,
        true
      );
    }
  } catch (_) {
    renderWeatherPage();
  } finally {
    weatherFetchInFlight = false;
    setTimeout(() => refreshBtn?.classList.remove("spinning"), 350);
  }
}

function resolveEffectiveWeatherTheme() {
  const pref = settings.weatherTheme || "auto";
  if (pref !== "auto" && WEATHER_THEME_PRESETS.some((t) => t.id === pref)) {
    return pref;
  }
  return computeAutoWeatherMapping().wthTheme;
}

function renderWeatherPage() {
  const info = decodeWmoWeather(weatherData.wmoCode, weatherData.isDay);
  const tempStr = formatTempVal(weatherData.tempC, true);
  const cityLabel = weatherData.city || (settings.weatherCity === "Auto" ? "Tự động" : (settings.weatherCity || "Hà Nội"));

  const autoMap = computeAutoWeatherMapping();
  const isAutoWth = !settings.weatherTheme || settings.weatherTheme === "auto";
  const effThemeId = isAutoWth ? autoMap.wthTheme : resolveEffectiveWeatherTheme();
  const effThemeObj = WEATHER_THEME_PRESETS.find((t) => t.id === effThemeId) || WEATHER_THEME_PRESETS[1];
  const selThemeObj = WEATHER_THEME_PRESETS.find((t) => t.id === (settings.weatherTheme || "auto")) || WEATHER_THEME_PRESETS[0];

  const layerWth = document.getElementById("layerWeather");
  if (layerWth) {
    layerWth.dataset.wthKind = info.kind || "sunny";
    layerWth.dataset.wthTheme = settings.weatherTheme || "auto";
    layerWth.dataset.wthEff = effThemeId;
  }

  const wthThemeBtn = document.getElementById("btnWthThemeCycle");
  if (wthThemeBtn) {
    wthThemeBtn.textContent = isAutoWth ? `🔄 ${effThemeObj.short}` : selThemeObj.short;
    wthThemeBtn.title = isAutoWth
      ? `Đang để Tự động theo thời tiết hiện tại (${cityLabel}: ${info.desc}, ${tempStr})\n→ Đã tự động bật chủ đề: ${effThemeObj.name}\n• Bấm chuột trái để chọn cố định 1 trong 13 chủ đề bầu trời\n• Bấm chuột phải để mở Cài đặt Thời tiết`
      : `Theme Thời tiết cố định: ${selThemeObj.name}\n• Bấm chuột trái để đổi chủ đề (hoặc quay về 🔄 Tự động)\n• Bấm chuột phải để mở Cài đặt Thời tiết`;
  }

  // Cập nhật pill thời tiết trên thanh Header Dynamic Island
  const hdrBadge = document.getElementById("hdrWeatherBadge");
  if (hdrBadge) {
    hdrBadge.style.display = settings.weatherHeaderBadge === false ? "none" : "";
    hdrBadge.textContent = `${info.icon} ${formatTempVal(weatherData.tempC, true)}`;
    hdrBadge.title = `Thời tiết ${cityLabel}: ${info.desc} (${tempStr}) · Bấm để mở chi tiết`;
  }

  const cityBadge = document.getElementById("weatherCityBadge");
  if (cityBadge) {
    const isAutoGps = (settings.weatherCity || "Auto") === "Auto";
    cityBadge.textContent = isAutoGps ? `📍 ${cityLabel}` : cityLabel;
    const coordStr = Number.isFinite(weatherData.lat) && Number.isFinite(weatherData.lon)
      ? `${weatherData.lat.toFixed(3)}, ${weatherData.lon.toFixed(3)}`
      : "";
    cityBadge.title = isAutoGps
      ? `Vị trí GPS: ${weatherData.fullAddress || cityLabel}${coordStr ? ` (${coordStr})` : ""}\n• Bấm trái để cập nhật định vị GPS mới nhất\n• Bấm phải để mở Cài đặt Thời tiết`
      : `Địa điểm đang chọn: ${cityLabel}\n• Bấm trái để đổi khu vực (có chế độ 📍 Tự động GPS)\n• Bấm phải để mở Cài đặt Thời tiết`;
  }

  const iconEl = document.getElementById("wthNowIcon");
  if (iconEl) iconEl.textContent = info.icon;
  const tempEl = document.getElementById("wthNowTemp");
  if (tempEl) tempEl.textContent = tempStr;
  const descEl = document.getElementById("wthNowDesc");
  if (descEl) descEl.textContent = info.desc;
  const hlEl = document.getElementById("wthNowHighLow");
  if (hlEl) {
    hlEl.textContent = `Cao: ${formatTempVal(weatherData.highC, false)} · Thấp: ${formatTempVal(weatherData.lowC, false)} · UV ${weatherData.uvIndex ?? 5}`;
  }
  const feelEl = document.getElementById("wthNowFeel");
  if (feelEl) feelEl.textContent = formatTempVal(weatherData.feelsLikeC, false);
  const humEl = document.getElementById("wthNowHum");
  if (humEl) humEl.textContent = `${weatherData.humidity ?? 68}%`;
  const windEl = document.getElementById("wthNowWind");
  if (windEl) windEl.textContent = `${Math.round(weatherData.windKmh ?? 10)}km/h`;

  const mode = ["hourly", "rain", "daily"].includes(settings.weatherForecastMode) ? settings.weatherForecastMode : "hourly";
  document.getElementById("btnWthTabHourly")?.classList.toggle("active", mode === "hourly");
  document.getElementById("btnWthTabRain")?.classList.toggle("active", mode === "rain");
  document.getElementById("btnWthTabDaily")?.classList.toggle("active", mode === "daily");

  const stageEl = document.getElementById("wthForecastList");
  if (!stageEl) return;

  // CHẾ ĐỘ 1: BIỂU ĐỒ ĐƯỜNG CONG NHIỆT ĐỘ THEO GIỜ (SVG Smooth Curve + Area Gradient theo Theme Thời tiết)
  if (mode === "hourly") {
    const items = (weatherData.hourly || []).slice(0, 6);
    while (items.length < 6) {
      items.push({ label: `+${items.length * 2}g`, icon: "⛅", tempC: weatherData.tempC || 28, rainPct: 10 });
    }
    const temps = items.map((s) => Number(s.tempC) || 28);
    const minT = Math.min(...temps) - 1.5;
    const maxT = Math.max(...temps) + 1.5;
    const xs = [18, 56, 95, 134, 173, 212];
    const pts = items.map((s, i) => {
      const v = Number(s.tempC) || 28;
      const y = 41 - ((v - minT) / Math.max(1, maxT - minT)) * 22;
      return { x: xs[i], y, tempText: formatTempVal(v, false), icon: s.icon || "⛅", label: i === 0 ? "Nay" : (s.label || "") };
    });

    // Đường cong mượt qua 6 điểm
    let dCurve = `M ${pts[0].x} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      dCurve += ` Q ${pts[i].x} ${pts[i].y.toFixed(1)}, ${xc.toFixed(1)} ${yc.toFixed(1)}`;
    }
    dCurve += ` T ${pts[pts.length - 1].x} ${pts[pts.length - 1].y.toFixed(1)}`;
    const dArea = `${dCurve} L ${pts[pts.length - 1].x} 49 L ${pts[0].x} 49 Z`;

    const nodesSvg = pts.map((p, i) => `
      <text x="${p.x}" y="${(p.y - 6).toFixed(1)}" fill="${i === 0 ? "#ffffff" : "rgba(255,255,255,0.82)"}" font-size="8.5" font-weight="${i === 0 ? "800" : "700"}" text-anchor="middle">${p.tempText}</text>
      <circle cx="${p.x}" cy="${p.y.toFixed(1)}" r="${i === 0 ? "3.4" : "2.4"}" fill="${i === 0 ? "#ffffff" : effThemeObj.c1}" stroke="${i === 0 ? effThemeObj.c1 : "none"}" stroke-width="1.6"/>
    `).join("");

    const lblsHtml = pts.map((p, i) => `<span class="${i === 0 ? "now" : ""}">${p.icon} ${escapeHtml(p.label)}</span>`).join("");

    stageEl.innerHTML = `
      <svg class="wth-curve-svg" viewBox="0 0 230 52">
        <defs>
          <linearGradient id="wthCurveAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${effThemeObj.c1}" stop-opacity="0.46"/>
            <stop offset="65%" stop-color="${effThemeObj.c2}" stop-opacity="0.16"/>
            <stop offset="100%" stop-color="${effThemeObj.c3}" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="wthCurveStrokeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${effThemeObj.c1}"/>
            <stop offset="55%" stop-color="${effThemeObj.c2}"/>
            <stop offset="100%" stop-color="${effThemeObj.c3}"/>
          </linearGradient>
        </defs>
        <line x1="8" y1="49" x2="222" y2="49" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
        <path d="${dArea}" fill="url(#wthCurveAreaGrad)"/>
        <path d="${dCurve}" fill="none" stroke="url(#wthCurveStrokeGrad)" stroke-width="2.4" stroke-linecap="round"/>
        ${nodesSvg}
      </svg>
      <div class="wth-curve-labels">${lblsHtml}</div>
    `;
    return;
  }

  // CHẾ ĐỘ 2: BIỂU ĐỒ LƯỢNG MƯA (% MƯA) & QUỸ ĐẠO MẶT TRỜI (SUN ARC)
  if (mode === "rain") {
    const items = (weatherData.hourly || []).slice(0, 6);
    while (items.length < 6) {
      items.push({ label: `+${items.length * 2}g`, icon: "🌦️", tempC: 28, rainPct: 20 });
    }
    const xs = [20, 56, 92, 128, 164, 200];
    const barsSvg = items.map((s, i) => {
      const pct = Math.max(0, Math.min(100, Number(s.rainPct) || 0));
      const barH = Math.max(4, Math.round((pct / 100) * 28));
      const y = 46 - barH;
      return `
        <rect x="${xs[i] - 7}" y="18" width="14" height="28" rx="4" fill="rgba(255,255,255,0.06)"/>
        <rect x="${xs[i] - 7}" y="${y}" width="14" height="${barH}" rx="4" fill="url(#wthRainBarGrad)"/>
        <text x="${xs[i]}" y="${Math.max(12, y - 3)}" fill="${effThemeObj.c1}" font-size="7.8" font-weight="700" text-anchor="middle">${pct}%</text>
      `;
    }).join("");
    const lblsHtml = items.map((s, i) => `<span class="${i === 0 ? "now" : ""}">${escapeHtml(i === 0 ? "Nay" : s.label)}</span>`).join("");

    stageEl.innerHTML = `
      <svg class="wth-curve-svg" viewBox="0 0 225 52">
        <defs>
          <linearGradient id="wthRainBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${effThemeObj.c1}"/>
            <stop offset="100%" stop-color="${effThemeObj.c2}"/>
          </linearGradient>
        </defs>
        <text x="8" y="9" fill="rgba(255,255,255,0.62)" font-size="7.8" font-weight="700">🌅 Bình minh ${escapeHtml(weatherData.sunrise || "05:36")} · 🌇 Hoàng hôn ${escapeHtml(weatherData.sunset || "17:42")}</text>
        ${barsSvg}
      </svg>
      <div class="wth-curve-labels">${lblsHtml}</div>
    `;
    return;
  }

  // CHẾ ĐỘ 3: BIỂU ĐỒ DẢI NHIỆT 5 NGÀY TỚI (ISLAND RANGE BARS)
  const dailyItems = (weatherData.daily || []).slice(0, 5);
  const allLows = dailyItems.map((d) => Number(d.lowC) || 22);
  const allHighs = dailyItems.map((d) => Number(d.tempC) || 32);
  const globalMin = Math.min(...allLows, 20);
  const globalMax = Math.max(...allHighs, 33);
  const span = Math.max(1, globalMax - globalMin);

  const rowsHtml = dailyItems.map((d, idx) => {
    const low = Number(d.lowC) ?? 24;
    const high = Number(d.tempC) ?? 31;
    const leftPct = Math.max(0, Math.min(85, ((low - globalMin) / span) * 100));
    const widthPct = Math.max(15, Math.min(100 - leftPct, ((high - low) / span) * 100));
    return `
      <div class="wth-day-row${idx === 0 ? " today" : ""}">
        <span class="wth-day-name">${escapeHtml(d.label || "")}</span>
        <span style="text-align:center">${d.icon || "⛅"}</span>
        <span class="wth-day-low">${formatTempVal(low, false)}</span>
        <div class="wth-range-track">
          <div class="wth-range-fill" style="left:${leftPct.toFixed(1)}%;width:${widthPct.toFixed(1)}%;background:linear-gradient(90deg,${effThemeObj.c1},${effThemeObj.c2},${effThemeObj.c3})"></div>
        </div>
        <span class="wth-day-high">${formatTempVal(high, false)}</span>
      </div>
    `;
  }).join("");

  stageEl.innerHTML = `<div class="wth-daily-rows">${rowsHtml}</div>`;
}

document.getElementById("weatherCityBadge")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  if ((settings.weatherCity || "Auto") === "Auto") {
    showPetBubble("📍 Đang cập nhật vị trí GPS...");
    fetchWeatherLive(true);
    return;
  }
  const keys = Object.keys(WEATHER_LOCATIONS);
  const curIdx = keys.indexOf(settings.weatherCity || "Auto");
  settings.weatherCity = keys[(curIdx + 1) % keys.length];
  saveSettingsState();
  fetchWeatherLive(true);
});

document.getElementById("weatherCityBadge")?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  playTone("tick");
  invoke("open_settings_window").catch(() => {});
});

document.getElementById("btnWthTabHourly")?.addEventListener("click", (e) => {
  e.stopPropagation();
  settings.weatherForecastMode = "hourly";
  playTone("tick");
  renderWeatherPage();
  saveSettingsState();
});

document.getElementById("btnWthTabRain")?.addEventListener("click", (e) => {
  e.stopPropagation();
  settings.weatherForecastMode = "rain";
  playTone("tick");
  renderWeatherPage();
  saveSettingsState();
});

document.getElementById("btnWthTabDaily")?.addEventListener("click", (e) => {
  e.stopPropagation();
  settings.weatherForecastMode = "daily";
  playTone("tick");
  renderWeatherPage();
  saveSettingsState();
});

document.getElementById("btnWthThemeCycle")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const idx = WEATHER_THEME_PRESETS.findIndex((t) => t.id === (settings.weatherTheme || "auto"));
  const next = WEATHER_THEME_PRESETS[(idx + 1) % WEATHER_THEME_PRESETS.length];
  settings.weatherTheme = next.id;
  playTone("tick");
  renderWeatherPage();
  saveSettingsState();
  triggerPetExpression("starry", "🌤️", `Bầu trời: ${next.short}`, 1900);
});

document.getElementById("btnWthThemeCycle")?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  playTone("tick");
  invoke("open_settings_window").catch(() => {});
});

document.getElementById("btnWthRefresh")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playTone("tick");
  fetchWeatherLive(true);
});

// Tự động làm mới thời tiết mỗi 20 phút ở nền
setInterval(() => {
  if (myWindowLabel === "main") {
    fetchWeatherLive(false);
  }
}, 20 * 60 * 1000);

listen("island-google-tasks-auth", (e) => {
  if (e?.payload) {
    const wasConn = !!googleTasksStatus.connected;
    googleTasksStatus = Object.assign({}, googleTasksStatus, e.payload);
    updateGoogleSyncBadgeUI();
    if (!wasConn && googleTasksStatus.connected && myWindowLabel === "main") {
      syncGoogleTasksNow(true);
    }
  }
}).catch(() => {});

// Tải dữ liệu đã lưu khi khởi động
(async function initIsland() {
  try {
    const rawSet = await invoke("load_data_file", { filename: "settings.txt" });
    if (rawSet) {
      const loaded = JSON.parse(rawSet);
      Object.assign(settings, loaded);
      if (!loaded.petType) {
        settings.petType = "island";
        settings.restStyle = "both";
      }
      if (!loaded._v121PageTogglesMigrated) {
        settings.prayerPage = false;
        settings.prayerReminder = false;
        settings._v121PageTogglesMigrated = true;
      }
      if (!loaded._v122VnClockMigrated) {
        settings.widgetCity1 = "Hà Nội";
        settings.widgetCity2 = "TP.HCM";
        settings._v122VnClockMigrated = true;
      }
      // Mặc định bật Tự động đổi Theme theo thời tiết hiện tại (Auto Live Weather)
      if (!loaded._v125AutoWeatherThemeMigrated) {
        settings.weatherTheme = "auto";
        settings.themePreset = "auto";
        settings._v125AutoWeatherThemeMigrated = true;
        saveSettingsState();
      }
      // Chuyển sang Pet "Mắt Tinh Linh Island" (Aura) & chế độ "Chỉ Pet" chuẩn ảnh mẫu (1 lần duy nhất, người dùng vẫn chỉnh tùy ý trong Setting)
      if (!loaded._v126AuraPetDefault) {
        settings.petType = "aura";
        settings.restStyle = "pet";
        settings.petGlowColor = "island";
        settings.petEyeSize = "normal";
        settings.petEyeColor = "auto";
        settings.petAutoSleep = false;
        settings._v126AuraPetDefault = true;
        saveSettingsState();
      }
      // Bật Tự động lấy địa chỉ GPS cho Thời tiết & tách Model + Mức độ tư duy AI (1 lần duy nhất)
      if (!loaded._v127AutoGpsAndAiMigrated) {
        settings.weatherCity = "Auto";
        if (!loaded.aiModel || String(loaded.aiModel).startsWith("ag/gemini-3.8-flash")) {
          settings.aiModel = "ag/gemini-3.8-flash";
        }
        if (!loaded.aiThinkingLevel) {
          settings.aiThinkingLevel = "high";
        }
        settings._v127AutoGpsAndAiMigrated = true;
        saveSettingsState();
      }
    } else {
      settings._v121PageTogglesMigrated = true;
      settings._v122VnClockMigrated = true;
      settings._v123ClassicNotchDefault = true;
      settings._v125AutoWeatherThemeMigrated = true;
      settings._v126AuraPetDefault = true;
      settings._v127AutoGpsAndAiMigrated = true;
    }
  } catch (_) {}

  try {
    const auto = await invoke("get_autostart_status");
    settings.autostart = !!auto;
  } catch (_) {}

  // Khôi phục hiển thị màn hình (Chỉ cửa sổ chính khởi tạo để tránh đệ quy)
  myWindowLabel = resolveMyWindowLabel();

  if (myWindowLabel === "main") {
    if (settings.monitorMode === "all") {
      invoke("set_notch_monitors", { allMonitors: true, targetX: null, targetY: null }).catch(() => {});
    } else if (settings.monitor?.x !== undefined) {
      invoke("set_notch_monitors", { allMonitors: false, targetX: settings.monitor.x, targetY: settings.monitor.y }).catch(() => {});
    }
  }

  // Xóa khay tệp khi khởi động nếu bật tuỳ chọn shelfClear
  if (settings.shelfClear) {
    shelfItems = [];
    saveShelfState();
  }

  const [rawWater, rawTodo, rawShelf, rawClip, rawAi, rawFocus, rawNotifs, rawWeather] = await Promise.all([
    invoke("load_data_file", { filename: "water.txt" }).catch(() => ""),
    invoke("load_data_file", { filename: "todo.txt" }).catch(() => ""),
    invoke("load_data_file", { filename: "shelf.txt" }).catch(() => ""),
    settings.clipboardKeep !== false ? invoke("load_data_file", { filename: "clipboard.txt" }).catch(() => "") : Promise.resolve(""),
    settings.aiSaveHistory !== false ? invoke("load_data_file", { filename: "ai_history.txt" }).catch(() => "") : Promise.resolve(""),
    invoke("load_data_file", { filename: "focus.txt" }).catch(() => ""),
    invoke("load_data_file", { filename: "notifications.txt" }).catch(() => ""),
    invoke("load_data_file", { filename: "weather.txt" }).catch(() => "")
  ]);

  try {
    if (rawWater && rawWater.trim().startsWith("{")) {
      const parsed = JSON.parse(rawWater);
      if (parsed.history && typeof parsed.history === "object") {
        waterData.history = parsed.history;
      }
      if (parsed.date === new Date().toDateString()) {
        waterData.intakeMl = Number(parsed.intakeMl) || 0;
        waterData.goalMl = WATER_GOALS.includes(Number(parsed.goalMl)) ? Number(parsed.goalMl) : (settings.waterGoal || 1500);
        waterData.reminderOn = parsed.reminderOn ?? true;
        waterData.intervalMin = WATER_INTERVALS.includes(Number(parsed.intervalMin)) ? Number(parsed.intervalMin) : 30;
        if (Array.isArray(parsed.hourly) && parsed.hourly.length === 8) {
          waterData.hourly = parsed.hourly.map((x) => Number(x) || 0);
        }
      } else {
        waterData.goalMl = WATER_GOALS.includes(Number(parsed.goalMl)) ? Number(parsed.goalMl) : (settings.waterGoal || 1500);
        waterData.reminderOn = parsed.reminderOn ?? true;
        waterData.intervalMin = WATER_INTERVALS.includes(Number(parsed.intervalMin)) ? Number(parsed.intervalMin) : 30;
      }
      waterCountdownSec = (waterData.intervalMin || 30) * 60;
    }
  } catch (_) {}

  try {
    if (rawTodo) {
      const arr = JSON.parse(rawTodo);
      if (Array.isArray(arr)) todoList = arr;
    }
  } catch (_) {}

  try {
    if (rawShelf) {
      const arr = JSON.parse(rawShelf);
      if (Array.isArray(arr)) shelfItems = arr;
    }
  } catch (_) {}

  if (settings.clipboardKeep !== false) {
    try {
      if (rawClip) {
        const arr = JSON.parse(rawClip);
        if (Array.isArray(arr)) {
          clipboardItems = arr;
          normalizeClipboardList();
        }
      }
    } catch (_) {}
  }

  if (settings.aiSaveHistory !== false) {
    try {
      if (rawAi) {
        const arr = JSON.parse(rawAi);
        if (Array.isArray(arr)) aiChatHistory = arr.slice(-20);
      }
    } catch (_) {}
  }

  try {
    if (rawFocus && rawFocus.trim().startsWith("{")) {
      const parsed = JSON.parse(rawFocus);
      if (parsed && typeof parsed === "object") {
        Object.assign(focusData, parsed);
        if (focusData.date !== todayIsoKey()) {
          focusData.date = todayIsoKey();
          focusData.minutesToday = 0;
          focusData.sessionsToday = 0;
        }
      }
    }
  } catch (_) {}

  try {
    if (rawNotifs) {
      const arr = JSON.parse(rawNotifs);
      if (Array.isArray(arr) && arr.length > 0) notifList = arr;
    }
  } catch (_) {}

  try {
    if (rawWeather && rawWeather.trim().startsWith("{")) {
      const parsed = JSON.parse(rawWeather);
      if (parsed && typeof parsed === "object") {
        Object.assign(weatherData, parsed);
      }
    }
  } catch (_) {}

  applySettingsUI();
  if (focusData.category) {
    applyPomoCategory(focusData.category, false);
  }
  if (focusData.activeSession && typeof focusData.activeSession === "object") {
    const sess = focusData.activeSession;
    if (sess.category && FOCUS_CATEGORIES[sess.category]) {
      applyPomoCategory(sess.category, false);
    }
    pomoCompletedCount = Number(sess.completedCount) || 0;
    pomoIsBreak = !!sess.isBreak;
    if (Number(sess.totalSec) >= 60) {
      pomoTotalSec = Number(sess.totalSec);
      pomoDefaultSec = pomoTotalSec;
    }
    if (sess.running && Number(sess.endEpochMs) > Date.now() + 1000) {
      pomoRemSec = Math.max(1, Math.round((Number(sess.endEpochMs) - Date.now()) / 1000));
      pomoRunning = true;
      pomoModeText = pomoIsBreak
        ? `Đang nghỉ giải lao · ${Math.round(pomoTotalSec / 60)} phút`
        : `Đang tập trung · ${Math.round(pomoTotalSec / 60)} phút`;
      startPomoTimerLoop();
    } else if (!sess.running && Number(sess.remSec) > 0 && Number(sess.remSec) < pomoTotalSec) {
      pomoRemSec = Number(sess.remSec);
      pomoRunning = false;
      pomoModeText = "Đã tạm dừng đếm ngược";
    }
  }
  renderPomo();
  renderWaterUI();
  renderShelf();
  renderClipboardList();
  renderTodo();
  renderTodayPage();
  renderWeatherPage();
  renderWidgetsPage();
  renderPrayerPage();
  initAiAssistantUI();
  renderSavedAiHistory();
  updateLiveActivityPill();
  renderCapsuleState();
  showState(getClosedState(), 0);
  fetchWeatherLive(false);
  fetchCalendarAgenda();
  refreshClipboardImages();
  if (myWindowLabel === "main") {
    setInterval(fetchCalendarAgenda, 5 * 60 * 1000);
  }
  refreshGoogleTasksStatus().then((st) => {
    updateGoogleSyncBadgeUI();
    if (myWindowLabel === "main" && st?.connected) {
      syncGoogleTasksNow(true);
    }
  });
})();
