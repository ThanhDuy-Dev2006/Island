const T = window.__TAURI__ || {};
const invoke = T.core?.invoke || (async () => null);
const listen = T.event?.listen || (async () => () => {});

const dockBar = document.getElementById("dockBar");
const pinnedWrap = document.getElementById("dockPinnedWrap");
const runningWrap = document.getElementById("dockRunningWrap");
const recentsWrap = document.getElementById("dockRecentsWrap");
const previewPop = document.getElementById("dockPreviewPop");
const downloadsPop = document.getElementById("dockDownloadsPop");
const ctxMenu = document.getElementById("dockCtxMenu");

let dockSettings = {
  colorMode: "dark",
  accentColor: "auto",
  deckBehavior: "overlay",
  deckSize: 48,
  deckMagnify: true,
  deckShowRecents: true,
  deckShowDownloads: true,
  deckShowTrash: true
};

let pinnedApps = []; // [{ name, path, target_path }]
let pinsCustomized = false;
let recentClosed = []; // [{ name, path }]
let openWindows = [];
let prevOpenMap = new Map();
let iconCache = new Map();
let smartEdgeVisible = false;
let isMouseInsideBar = false;
let hoverTimer = null;
let dragPinIdx = -1;
let rectsRaf = null;
let previewWin = null;

function applyThemeAndSizing() {
  const prefDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const mode = dockSettings.colorMode === "auto" ? (prefDark ? "dark" : "light") : (dockSettings.colorMode || "dark");
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.accent = dockSettings.accentColor || "auto";
  const sz = Math.max(36, Math.min(72, Number(dockSettings.deckSize) || 48));
  document.documentElement.style.setProperty("--dock-icon", `${sz}px`);

  const dlBtn = document.getElementById("btnDockDownloads");
  const trBtn = document.getElementById("btnDockTrash");
  const tailSep = document.getElementById("dockTailSep");
  if (dlBtn) dlBtn.hidden = dockSettings.deckShowDownloads === false;
  if (trBtn) trBtn.hidden = dockSettings.deckShowTrash === false;
  if (tailSep) tailSep.hidden = dlBtn?.hidden && trBtn?.hidden;

  updateDockVisibility();
}

function updateDockVisibility() {
  const behavior = dockSettings.deckBehavior || "overlay";
  const shouldShow = behavior !== "smart" || smartEdgeVisible || isMouseInsideBar || !downloadsPop.hidden || !ctxMenu.hidden;
  dockBar?.classList.toggle("auto-hidden", !shouldShow);
  scheduleSyncRects();
}

function scheduleSyncRects() {
  if (rectsRaf) return;
  rectsRaf = requestAnimationFrame(() => {
    rectsRaf = null;
    const rects = [];
    const addRect = (el) => {
      if (!el || el.hidden || el.classList.contains("auto-hidden")) return;
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) {
        rects.push([r.left - 4, r.top - 16, r.right + 4, r.bottom + 8]);
      }
    };
    addRect(dockBar);
    addRect(previewPop);
    addRect(downloadsPop);
    addRect(ctxMenu);
    invoke("set_shell_interactive_rects", { label: "dock", rects, topmost: true }).catch(() => {});
  });
}

async function getIcon(path) {
  if (!path) return null;
  const k = path.toLowerCase();
  if (iconCache.has(k)) return iconCache.get(k);
  const b64 = await invoke("get_shell_icon", { path, size: 48, thumb: false }).catch(() => null);
  iconCache.set(k, b64 || null);
  return b64 || null;
}

async function loadWindowsTaskbarPins() {
  const winPins = await invoke("list_windows_taskbar_pins").catch(() => []);
  if (Array.isArray(winPins) && winPins.length > 0) {
    return winPins
      .map((p) => ({
        name: p.name || "Ứng dụng",
        path: p.path || p.target_path || "",
        target_path: p.target_path || p.path || ""
      }))
      .filter((p) => p.path);
  }
  return [];
}

async function syncFromWindowsTaskbar() {
  const winPins = await loadWindowsTaskbarPins();
  if (winPins.length > 0) {
    pinnedApps = winPins;
    pinsCustomized = false;
    await savePins(false);
    renderDock();
  }
}

async function loadPins() {
  try {
    const raw = await invoke("load_data_file", { filename: "dock_pins.txt" });
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        !Array.isArray(parsed) &&
        parsed.version === 2 &&
        parsed.userCustomized === true &&
        Array.isArray(parsed.pins) &&
        parsed.pins.length > 0
      ) {
        pinnedApps = parsed.pins;
        pinsCustomized = true;
        return;
      }
    }
  } catch (_) {}

  const winPins = await loadWindowsTaskbarPins();
  if (winPins.length > 0) {
    pinnedApps = winPins;
    pinsCustomized = false;
    savePins(false);
    return;
  }

  const apps = await invoke("list_installed_apps", { force: false }).catch(() => []);
  if (Array.isArray(apps) && apps.length > 0) {
    pinnedApps = apps.slice(0, 6).map((a) => ({ name: a.name, path: a.path, target_path: a.path }));
    pinsCustomized = false;
    savePins(false);
  }
}

async function savePins(customized = pinsCustomized) {
  pinsCustomized = !!customized;
  await invoke("save_data_file", {
    filename: "dock_pins.txt",
    content: JSON.stringify({ version: 2, userCustomized: pinsCustomized, pins: pinnedApps }, null, 2)
  }).catch(() => {});
}

function normPath(p) {
  return String(p || "").toLowerCase().trim();
}

function exeBaseName(p) {
  const np = normPath(p);
  if (!np || np.startsWith("shell:")) return "";
  const clean = np.split("?")[0];
  const base = clean.split(/[\\/]/).pop() || "";
  return base.endsWith(".exe") ? base : "";
}

function windowMatchesPin(w, pin) {
  const wp = normPath(w?.path);
  if (!wp) return false;
  const pp = normPath(pin?.path);
  const tp = normPath(pin?.target_path);
  if ((tp && wp === tp) || (pp && wp === pp)) return true;
  if (pp.startsWith("shell:appsfolder\\") && wp === pp) return true;
  const wExe = exeBaseName(wp);
  if (!wExe) return false;
  return wExe === exeBaseName(tp) || wExe === exeBaseName(pp);
}

function findWinsForPin(pin) {
  return openWindows.filter((w) => windowMatchesPin(w, pin));
}

function buildDockButton({ name, path, targetPath, win, wins, isPinned, pinIndex, isRecent }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dock-item" + ((win || (wins && wins.length > 0)) ? " running" : "");
  btn.dataset.tip = name || win?.app_name || "Ứng dụng";
  const box = document.createElement("span");
  box.className = "dock-ico-box";
  box.textContent = (name || win?.app_name || "A").slice(0, 1).toUpperCase();
  btn.appendChild(box);

  const iconSrc = path || targetPath;
  if (iconSrc) {
    getIcon(iconSrc).then((b64) => {
      if (b64) box.innerHTML = `<img src="${b64}" alt="" />`;
    });
  }

  if (wins && wins.length > 1) {
    const badge = document.createElement("span");
    badge.className = "dock-badge";
    badge.textContent = String(wins.length);
    btn.appendChild(badge);
  }

  if (isPinned) {
    btn.draggable = true;
    btn.addEventListener("dragstart", () => {
      dragPinIdx = pinIndex;
      btn.classList.add("dragging");
    });
    btn.addEventListener("dragend", () => {
      dragPinIdx = -1;
      btn.classList.remove("dragging");
    });
    btn.addEventListener("dragover", (e) => e.preventDefault());
    btn.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragPinIdx >= 0 && dragPinIdx !== pinIndex) {
        const [moved] = pinnedApps.splice(dragPinIdx, 1);
        pinnedApps.splice(pinIndex, 0, moved);
        savePins(true);
        renderDock();
      }
    });
  }

  btn.addEventListener("click", async () => {
    hideCtxMenu();
    hideDownloadsPop();
    const targetWin = win || (wins && wins[0]);
    if (targetWin) {
      await invoke("activate_window", { hwnd: targetWin.hwnd, toggleMinimize: true }).catch(() => {});
      setTimeout(refreshWindows, 140);
    } else if (path) {
      await invoke("launch_shell_target", { path }).catch(() => {});
      setTimeout(refreshWindows, 500);
    }
  });

  btn.addEventListener("mouseenter", () => {
    const targetWin = win || (wins && wins[0]);
    clearTimeout(hoverTimer);
    if (!targetWin) {
      previewPop.hidden = true;
      scheduleSyncRects();
      return;
    }
    hoverTimer = setTimeout(() => showWindowPreview(btn, targetWin), 260);
  });

  btn.addEventListener("mouseleave", () => {
    clearTimeout(hoverTimer);
  });

  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const targetWin = win || (wins && wins[0]);
    const items = [];
    if (targetWin) {
      items.push({
        label: "Chuyển đến cửa sổ",
        onClick: () => invoke("activate_window", { hwnd: targetWin.hwnd, toggleMinimize: false })
      });
      if (path) {
        items.push({
          label: "Mở cửa sổ mới",
          onClick: () => invoke("launch_shell_target", { path })
        });
      }
      items.push({
        label: "Thu nhỏ",
        onClick: () => invoke("minimize_window", { hwnd: targetWin.hwnd })
      });
      items.push({
        label: "Đóng cửa sổ",
        danger: true,
        onClick: () => invoke("close_window", { hwnd: targetWin.hwnd }).then(() => setTimeout(refreshWindows, 160))
      });
    } else if (path) {
      items.push({
        label: "Mở ứng dụng",
        onClick: () => invoke("launch_shell_target", { path })
      });
    }
    if (isPinned) {
      items.push({
        label: "Bỏ ghim khỏi Deck",
        onClick: () => {
          pinnedApps.splice(pinIndex, 1);
          savePins(true);
          renderDock();
        }
      });
    } else if (path && !isRecent) {
      items.push({
        label: "Ghim vào Deck",
        onClick: () => {
          pinnedApps.push({ name: name || win?.app_name || "App", path, target_path: path });
          savePins(true);
          renderDock();
        }
      });
    }
    items.push({
      label: "🔄 Đồng bộ ghim từ Taskbar Windows",
      onClick: () => syncFromWindowsTaskbar()
    });
    if (path) {
      items.push({
        label: "Thuộc tính (Properties)",
        onClick: () => invoke("open_item_properties", { path })
      });
    }
    showCtxMenu(e.clientX, e.clientY, items);
  });

  return btn;
}

async function showWindowPreview(anchorEl, w) {
  previewWin = w;
  const r = anchorEl.getBoundingClientRect();
  previewPop.style.left = `${Math.max(12, Math.min(window.innerWidth - 260, r.left + r.width / 2 - 124))}px`;
  previewPop.style.transform = "none";
  document.getElementById("dpTitle").textContent = w.title || w.app_name || "Cửa sổ";
  const thumbBox = document.getElementById("dpThumb");
  thumbBox.textContent = "Đang chụp...";
  previewPop.hidden = false;
  scheduleSyncRects();
  const b64 = await invoke("capture_window_thumb", { hwnd: w.hwnd, maxW: 260 }).catch(() => null);
  if (b64 && previewWin?.hwnd === w.hwnd) {
    thumbBox.innerHTML = `<img src="${b64}" alt="" />`;
  } else if (previewWin?.hwnd === w.hwnd) {
    thumbBox.textContent = w.app_name || w.title || "Cửa sổ";
  }
}

document.getElementById("dpThumb")?.addEventListener("click", async () => {
  if (!previewWin) return;
  await invoke("activate_window", { hwnd: previewWin.hwnd, toggleMinimize: false }).catch(() => {});
  previewPop.hidden = true;
  scheduleSyncRects();
});
document.getElementById("btnDpMin")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (!previewWin) return;
  await invoke("minimize_window", { hwnd: previewWin.hwnd }).catch(() => {});
  previewPop.hidden = true;
  setTimeout(refreshWindows, 140);
});
document.getElementById("btnDpClose")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (!previewWin) return;
  await invoke("close_window", { hwnd: previewWin.hwnd }).catch(() => {});
  previewPop.hidden = true;
  setTimeout(refreshWindows, 160);
});

function showCtxMenu(x, y, items) {
  if (!items || items.length === 0) return;
  ctxMenu.innerHTML = "";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ctx-btn" + (it.danger ? " danger" : "");
    b.textContent = it.label;
    b.addEventListener("click", async () => {
      hideCtxMenu();
      await it.onClick?.();
    });
    ctxMenu.appendChild(b);
  });
  ctxMenu.hidden = false;
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x))}px`;
  ctxMenu.style.top = `${Math.max(8, y - r.height - 10)}px`;
  scheduleSyncRects();
}

function hideCtxMenu() {
  if (!ctxMenu.hidden) {
    ctxMenu.hidden = true;
    scheduleSyncRects();
  }
}

function hideDownloadsPop() {
  if (!downloadsPop.hidden) {
    downloadsPop.hidden = true;
    scheduleSyncRects();
  }
}

function renderDock() {
  pinnedWrap.innerHTML = "";
  const matchedHwnds = new Set();

  pinnedApps.forEach((p, idx) => {
    const wins = findWinsForPin(p);
    wins.forEach((w) => matchedHwnds.add(w.hwnd));
    pinnedWrap.appendChild(buildDockButton({
      name: p.name,
      path: p.path,
      targetPath: p.target_path || p.path,
      wins,
      isPinned: true,
      pinIndex: idx
    }));
  });

  runningWrap.innerHTML = "";
  const grouped = new Map();
  openWindows.forEach((w) => {
    if (matchedHwnds.has(w.hwnd)) return;
    const k = normPath(w.path) || w.app_name;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(w);
  });
  grouped.forEach((wins) => {
    const first = wins[0];
    runningWrap.appendChild(buildDockButton({
      name: first.app_name,
      path: first.path,
      wins,
      isPinned: false
    }));
  });

  recentsWrap.innerHTML = "";
  if (dockSettings.deckShowRecents !== false && recentClosed.length > 0) {
    recentClosed.slice(0, 3).forEach((rc) => {
      const fakeWin = { path: rc.path, app_name: rc.name };
      if (pinnedApps.some((p) => windowMatchesPin(fakeWin, p)) || grouped.has(normPath(rc.path))) return;
      recentsWrap.appendChild(buildDockButton({
        name: `${rc.name} (Gần đây)`,
        path: rc.path,
        isRecent: true
      }));
    });
  }
  scheduleSyncRects();
}

async function refreshWindows() {
  const wins = await invoke("list_open_windows").catch(() => []);
  if (!Array.isArray(wins)) return;
  const nextMap = new Map();
  wins.forEach((w) => {
    if (w.path) nextMap.set(normPath(w.path), w.app_name || "App");
  });
  prevOpenMap.forEach((appName, p) => {
    if (!nextMap.has(p) && !pinnedApps.some((x) => windowMatchesPin({ path: p, app_name: appName }, x))) {
      recentClosed = [{ name: appName, path: p }, ...recentClosed.filter((x) => normPath(x.path) !== p)].slice(0, 5);
    }
  });
  prevOpenMap = nextMap;
  openWindows = wins;
  renderDock();
}

async function refreshTrashStatus() {
  const st = await invoke("get_recycle_bin_status").catch(() => null);
  const ico = document.getElementById("dockTrashIco");
  const badge = document.getElementById("dockTrashBadge");
  if (!st || !ico) return;
  ico.textContent = st.is_full ? "🚮" : "🗑️";
  if (badge) {
    badge.hidden = !st.count;
    badge.textContent = String(st.count || 0);
  }
}

document.getElementById("btnDockGrid")?.addEventListener("click", () => {
  hideCtxMenu();
  hideDownloadsPop();
  invoke("toggle_overlay_window", { kind: "app_grid" }).catch(() => {});
});

document.getElementById("btnDockGrid")?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  showCtxMenu(e.clientX, e.clientY, [
    { label: "Mở Lưới ứng dụng (App Grid)", onClick: () => invoke("toggle_overlay_window", { kind: "app_grid" }) },
    { label: "🔄 Đồng bộ ghim từ Taskbar Windows", onClick: () => syncFromWindowsTaskbar() }
  ]);
});

dockBar?.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".dock-item")) return;
  e.preventDefault();
  e.stopPropagation();
  showCtxMenu(e.clientX, e.clientY, [
    { label: "🔄 Đồng bộ ghim từ Taskbar Windows", onClick: () => syncFromWindowsTaskbar() }
  ]);
});

document.getElementById("btnDockDownloads")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  hideCtxMenu();
  if (!downloadsPop.hidden) {
    hideDownloadsPop();
    return;
  }
  const items = await invoke("get_downloads_latest", { limit: 12 }).catch(() => []);
  const listEl = document.getElementById("ddlList");
  listEl.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    listEl.innerHTML = `<div style="padding:12px;text-align:center;font-size:11.5px;color:var(--fg-muted)">Thư mục Downloads trống.</div>`;
  } else {
    items.forEach((f) => {
      const row = document.createElement("div");
      row.className = "ddl-row";
      const ic = document.createElement("span");
      ic.textContent = f.is_dir ? "📁" : "📄";
      const nm = document.createElement("span");
      nm.className = "ddl-row-name";
      nm.textContent = f.name || "";
      row.append(ic, nm);
      row.addEventListener("click", () => {
        invoke("launch_shell_target", { path: f.path }).catch(() => {});
        hideDownloadsPop();
      });
      listEl.appendChild(row);
    });
  }
  const br = e.currentTarget.getBoundingClientRect();
  downloadsPop.style.left = `${Math.max(12, Math.min(window.innerWidth - 284, br.right - 274))}px`;
  downloadsPop.style.right = "auto";
  downloadsPop.hidden = false;
  scheduleSyncRects();
});

document.getElementById("btnDdlFolder")?.addEventListener("click", () => {
  invoke("run_system_action", { action: "open_downloads" }).catch(() => {});
  hideDownloadsPop();
});

document.getElementById("btnDockTrash")?.addEventListener("click", () => {
  invoke("run_system_action", { action: "open_recycle_bin" }).catch(() => {});
});

document.getElementById("btnDockTrash")?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  showCtxMenu(e.clientX, e.clientY, [
    { label: "Mở Thùng rác", onClick: () => invoke("run_system_action", { action: "open_recycle_bin" }) },
    { label: "Dọn sạch Thùng rác", danger: true, onClick: async () => { await invoke("empty_recycle_bin").catch(() => {}); setTimeout(refreshTrashStatus, 400); } }
  ]);
});

// Hiệu ứng phóng đại biểu tượng theo khoảng cách con trỏ chuột
dockBar?.addEventListener("mousemove", (e) => {
  if (dockSettings.deckMagnify === false) return;
  const items = dockBar.querySelectorAll(".dock-item");
  items.forEach((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const dist = Math.abs(e.clientX - cx);
    const scale = dist < 110 ? 1 + 0.36 * Math.cos((dist / 110) * (Math.PI / 2)) : 1;
    el.style.setProperty("--mag", scale.toFixed(3));
  });
});

dockBar?.addEventListener("mouseenter", () => {
  isMouseInsideBar = true;
  updateDockVisibility();
});

dockBar?.addEventListener("mouseleave", () => {
  isMouseInsideBar = false;
  dockBar.querySelectorAll(".dock-item").forEach((el) => el.style.setProperty("--mag", "1"));
  setTimeout(() => {
    if (!previewPop.matches(":hover")) {
      previewPop.hidden = true;
      scheduleSyncRects();
    }
    updateDockVisibility();
  }, 180);
});

previewPop?.addEventListener("mouseleave", () => {
  previewPop.hidden = true;
  scheduleSyncRects();
});

document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#dockCtxMenu")) hideCtxMenu();
  if (!e.target.closest("#dockDownloadsPop") && !e.target.closest("#btnDockDownloads")) hideDownloadsPop();
});

listen("island-dock-edge", (e) => {
  smartEdgeVisible = !!e?.payload;
  updateDockVisibility();
}).catch(() => {});

listen("island-settings", (e) => {
  if (e?.payload?.settings) {
    Object.assign(dockSettings, e.payload.settings);
    applyThemeAndSizing();
    renderDock();
  }
}).catch(() => {});

new ResizeObserver(scheduleSyncRects).observe(dockBar);
window.addEventListener("resize", scheduleSyncRects);

(async () => {
  try {
    const raw = await invoke("load_data_file", { filename: "settings.txt" });
    if (raw) Object.assign(dockSettings, JSON.parse(raw));
  } catch (_) {}
  applyThemeAndSizing();
  await loadPins();
  await refreshWindows();
  await refreshTrashStatus();
  setInterval(refreshWindows, 1500);
  setInterval(refreshTrashStatus, 6000);
})();
