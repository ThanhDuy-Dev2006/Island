const T = window.__TAURI__ || {};
const invoke = T.core?.invoke || (async () => null);
const listen = T.event?.listen || (async () => () => {});

const railBar = document.getElementById("railBar");
const leftPill = document.getElementById("railLeftPill");
const rightPill = document.getElementById("railRightPill");
const railDrop = document.getElementById("railDrop");

let railSettings = {
  colorMode: "dark",
  accentColor: "auto",
  enableIsland: true,
  railBehavior: "overlay",
  railShowAppMenu: true,
  railShowWifi: true,
  railShowBattery: true,
  railShowClock: true
};

let edgeVisible = false;
let mouseInside = false;
let openDropKind = "";
let fgAppMenu = null;
let rectsRaf = null;

function applyThemeAndPrefs() {
  const prefDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const mode = railSettings.colorMode === "auto" ? (prefDark ? "dark" : "light") : (railSettings.colorMode || "dark");
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.accent = railSettings.accentColor || "auto";

  railBar?.classList.toggle("full-strip", railSettings.enableIsland === false);
  const menusEl = document.getElementById("railAppMenus");
  const wifiBtn = document.getElementById("btnRailWifi");
  const battEl = document.getElementById("railBattery");
  const clkEl = document.getElementById("railClock");
  if (menusEl) menusEl.hidden = railSettings.railShowAppMenu === false;
  if (wifiBtn) wifiBtn.hidden = railSettings.railShowWifi === false;
  if (battEl) battEl.hidden = railSettings.railShowBattery === false;
  if (clkEl) clkEl.hidden = railSettings.railShowClock === false;

  updateVisibility();
}

function updateVisibility() {
  const beh = railSettings.railBehavior || "overlay";
  const show = beh !== "smart" || edgeVisible || mouseInside || !railDrop.hidden;
  railBar?.classList.toggle("auto-hidden", !show);
  scheduleSyncRects();
}

function scheduleSyncRects() {
  if (rectsRaf) return;
  rectsRaf = requestAnimationFrame(() => {
    rectsRaf = null;
    const rects = [];
    const addRect = (el) => {
      if (!el || el.hidden) return;
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) {
        rects.push([r.left, r.top, r.right, r.bottom]);
      }
    };
    if (!railBar.classList.contains("auto-hidden")) {
      if (railBar.classList.contains("full-strip")) {
        addRect(railBar);
      } else {
        addRect(leftPill);
        addRect(rightPill);
      }
    }
    addRect(railDrop);
    invoke("set_shell_interactive_rects", { label: "rail", rects, topmost: true }).catch(() => {});
  });
}

function updateClock() {
  const el = document.getElementById("railClock");
  if (!el) return;
  const d = new Date();
  el.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function refreshForegroundMenu() {
  if (railSettings.railShowAppMenu === false) return;
  const info = await invoke("get_foreground_app_menu").catch(() => null);
  if (!info) return;
  const same = fgAppMenu && fgAppMenu.hwnd === info.hwnd && fgAppMenu.app_name === info.app_name;
  fgAppMenu = info;
  if (same) return;

  const appEl = document.getElementById("railAppName");
  const menusEl = document.getElementById("railAppMenus");
  if (appEl) appEl.textContent = info.app_name || "Desktop";
  if (!menusEl) return;
  menusEl.innerHTML = "";
  (info.groups || []).forEach((grp, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rail-btn";
    btn.textContent = grp.title;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = `menu:${idx}`;
      if (openDropKind === key && !railDrop.hidden) {
        closeDrop();
        return;
      }
      openDropKind = key;
      railDrop.innerHTML = "";
      (grp.items || []).forEach((item) => {
        if (item.sep) {
          const sep = document.createElement("div");
          sep.className = "rail-drop-sep";
          railDrop.appendChild(sep);
          return;
        }
        const row = document.createElement("button");
        row.type = "button";
        row.className = "rail-drop-item";
        const lbl = document.createElement("span");
        lbl.textContent = item.label || "";
        const acc = document.createElement("span");
        acc.className = "accel";
        acc.textContent = item.accel || "";
        row.append(lbl, acc);
        row.addEventListener("click", async () => {
          closeDrop();
          await invoke("exec_app_menu_shortcut", {
            targetHwnd: info.hwnd,
            vks: item.vks || []
          }).catch(() => {});
        });
        railDrop.appendChild(row);
      });
      positionDropUnder(btn);
    });
    menusEl.appendChild(btn);
  });
  scheduleSyncRects();
}

function positionDropUnder(anchorEl, alignRight = false) {
  const r = anchorEl.getBoundingClientRect();
  railDrop.hidden = false;
  const dr = railDrop.getBoundingClientRect();
  const left = alignRight
    ? Math.max(8, Math.min(window.innerWidth - dr.width - 8, r.right - dr.width))
    : Math.max(8, Math.min(window.innerWidth - dr.width - 8, r.left));
  railDrop.style.left = `${left}px`;
  railDrop.style.top = `${Math.max(32, r.bottom + 4)}px`;
  scheduleSyncRects();
}

function closeDrop() {
  if (!railDrop.hidden) {
    railDrop.hidden = true;
    openDropKind = "";
    scheduleSyncRects();
  }
}

document.getElementById("btnRailBrand")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (openDropKind === "brand" && !railDrop.hidden) {
    closeDrop();
    return;
  }
  openDropKind = "brand";
  railDrop.innerHTML = "";
  const items = [
    { label: "Về Island", fn: () => invoke("open_settings_window") },
    { label: "Cài đặt hệ thống...", fn: () => invoke("open_settings_window") },
    { sep: true },
    { label: "Tìm kiếm nhanh", accel: "Ctrl+Space", fn: () => invoke("toggle_overlay_window", { kind: "quick_search" }) },
    { label: "Bảng điều khiển nhanh", fn: () => invoke("toggle_overlay_window", { kind: "quick_panel" }) },
    { label: "Tổng quan cửa sổ", fn: () => invoke("toggle_overlay_window", { kind: "overview" }) },
    { sep: true },
    { label: "Khóa màn hình", fn: () => invoke("run_system_action", { action: "lock" }) },
    { label: "Ngủ (Sleep)", fn: () => invoke("run_system_action", { action: "sleep" }) },
    { label: "Khởi động lại", fn: () => invoke("run_system_action", { action: "restart" }) },
    { label: "Tắt máy", fn: () => invoke("run_system_action", { action: "shutdown" }) }
  ];
  items.forEach((it) => {
    if (it.sep) {
      const s = document.createElement("div");
      s.className = "rail-drop-sep";
      railDrop.appendChild(s);
      return;
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = "rail-drop-item";
    const lbl = document.createElement("span");
    lbl.textContent = it.label;
    const acc = document.createElement("span");
    acc.className = "accel";
    acc.textContent = it.accel || "";
    row.append(lbl, acc);
    row.addEventListener("click", () => {
      closeDrop();
      it.fn?.();
    });
    railDrop.appendChild(row);
  });
  positionDropUnder(e.currentTarget);
});

document.getElementById("btnRailWifi")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (openDropKind === "wifi" && !railDrop.hidden) {
    closeDrop();
    return;
  }
  openDropKind = "wifi";
  railDrop.innerHTML = `<div class="rail-stat" style="padding:8px">Đang quét mạng Wi-Fi...</div>`;
  positionDropUnder(e.currentTarget, true);
  const res = await invoke("scan_wifi_networks", { rescan: false }).catch(() => null);
  railDrop.innerHTML = "";
  const nets = res?.networks || [];
  if (nets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rail-stat";
    empty.style.padding = "8px";
    empty.textContent = "Không có mạng Wi-Fi khả dụng.";
    railDrop.appendChild(empty);
  } else {
    nets.slice(0, 10).forEach((n) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "rail-drop-item";
      const lbl = document.createElement("span");
      lbl.textContent = `${n.connected ? "✓ " : ""}${n.ssid || "(Ẩn)"}`;
      const sig = document.createElement("span");
      sig.className = "accel";
      sig.textContent = `${n.signal}%`;
      row.append(lbl, sig);
      row.addEventListener("click", async () => {
        closeDrop();
        if (!n.connected) {
          await invoke("connect_wifi_network", { ssid: n.ssid, profile: n.profile || "" }).catch(() => {});
        }
      });
      railDrop.appendChild(row);
    });
  }
  scheduleSyncRects();
});

document.getElementById("btnRailSearch")?.addEventListener("click", () => {
  closeDrop();
  invoke("toggle_overlay_window", { kind: "quick_search" }).catch(() => {});
});
document.getElementById("btnRailPanel")?.addEventListener("click", () => {
  closeDrop();
  invoke("toggle_overlay_window", { kind: "quick_panel" }).catch(() => {});
});

[leftPill, rightPill].forEach((p) => {
  p?.addEventListener("mouseenter", () => {
    mouseInside = true;
    updateVisibility();
  });
  p?.addEventListener("mouseleave", () => {
    mouseInside = false;
    setTimeout(updateVisibility, 120);
  });
});

document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#railDrop") && !e.target.closest(".rail-btn")) {
    closeDrop();
  }
});

listen("island-rail-edge", (e) => {
  edgeVisible = !!e?.payload;
  updateVisibility();
}).catch(() => {});

listen("island-hw", (e) => {
  const hw = e?.payload;
  if (!hw) return;
  const wifiTxt = document.getElementById("railWifiTxt");
  if (wifiTxt) wifiTxt.textContent = hw.wifi_ssid || (hw.wifi_bars > 0 ? "Wi-Fi" : "Offline");
  const battEl = document.getElementById("railBattery");
  if (battEl && typeof hw.battery_pct === "number") {
    const pct = hw.battery_pct <= 100 ? hw.battery_pct : 100;
    battEl.textContent = `${hw.is_charging ? "⚡" : "🔋"} ${pct}%`;
  }
}).catch(() => {});

listen("island-settings", (e) => {
  if (e?.payload?.settings) {
    Object.assign(railSettings, e.payload.settings);
    applyThemeAndPrefs();
  }
}).catch(() => {});

new ResizeObserver(scheduleSyncRects).observe(railBar);
window.addEventListener("resize", scheduleSyncRects);

(async () => {
  try {
    const raw = await invoke("load_data_file", { filename: "settings.txt" });
    if (raw) Object.assign(railSettings, JSON.parse(raw));
  } catch (_) {}
  applyThemeAndPrefs();
  updateClock();
  refreshForegroundMenu();
  setInterval(updateClock, 10000);
  setInterval(refreshForegroundMenu, 800);
})();
