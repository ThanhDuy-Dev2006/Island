use serde::Serialize;
use std::collections::HashMap;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use windows::core::{w, BOOL, GUID, HSTRING, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, PROPERTYKEY, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToStringAlloc};
use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
    IShellItem, SHAppBarMessage, SHCreateItemFromParsingName, SHGetNameFromIDList, ABM_GETSTATE,
    ABM_GETTASKBARPOS, ABM_SETSTATE, APPBARDATA, SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_FILESYSPATH,
    SIGDN_NORMALDISPLAY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, EnumWindows, FindWindowW, FlashWindow, GetAncestor, GetClassNameW,
    GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowPlacement, GetWindowRect,
    GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, IsZoomed,
    PostMessageW, SetForegroundWindow, SetWindowPos, ShowWindow, EVENT_OBJECT_LOCATIONCHANGE,
    EVENT_OBJECT_SHOW, GA_ROOTOWNER, GWL_EXSTYLE, GW_OWNER, HWND_TOP, SWP_NOACTIVATE, SWP_NOSIZE,
    SWP_NOZORDER, SW_HIDE, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, SW_SHOW, WINDOWPLACEMENT,
    WINEVENT_OUTOFCONTEXT, WM_CLOSE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};
use winreg::enums::*;
use winreg::RegKey;

const HIDDEN_EXES: &[&str] = &[
    "conhost.exe",
    "shellexperiencehost.exe",
    "searchhost.exe",
    "textinputhost.exe",
    "startmenuexperiencehost.exe",
    "systemsettingsbroker.exe",
];

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ============================================================
// 1. WINDOW ENUMERATION & FRIENDLY NAMES
// ============================================================
#[derive(Clone, Debug, Serialize)]
pub struct OpenWindow {
    pub hwnd: isize,
    pub pid: u32,
    pub title: String,
    pub app_name: String,
    pub path: String,
    pub is_minimized: bool,
    pub is_foreground: bool,
    pub is_parked: bool,
    pub width: i32,
    pub height: i32,
}

static NAME_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
static LAST_ACTIVE_FG: Mutex<Option<(isize, String, String)>> = Mutex::new(None);

fn text_of(hwnd: HWND) -> String {
    let mut buf = [0u16; 512];
    let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn class_of(hwnd: HWND) -> String {
    let mut buf = [0u16; 128];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

pub fn exe_path_of_pid(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            h,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(h);
        ok.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

fn aumid_of_hwnd(hwnd: HWND) -> Option<String> {
    const PKEY_AUMID: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0x9F4C2855_9F79_4B39_A8D0_E1D42DE1D5F3),
        pid: 5,
    };
    unsafe {
        let store: IPropertyStore = SHGetPropertyStoreForWindow(hwnd).ok()?;
        let mut pv = store.GetValue(&PKEY_AUMID).ok()?;
        let s = PropVariantToStringAlloc(&pv).ok().and_then(|p| {
            let txt = p.to_string().ok();
            CoTaskMemFree(Some(p.0 as *const _));
            txt
        });
        let _ = PropVariantClear(&mut pv);
        s.filter(|t| !t.is_empty())
    }
}

fn read_exe_file_description(path: &str) -> String {
    unsafe {
        let wide = HSTRING::from(path);
        let size = GetFileVersionInfoSizeW(&wide, None);
        if size == 0 {
            return String::new();
        }
        let mut buf = vec![0u8; size as usize];
        if GetFileVersionInfoW(&wide, None, size, buf.as_mut_ptr() as *mut _).is_err() {
            return String::new();
        }
        let mut ptr: *mut c_void = std::ptr::null_mut();
        let mut len = 0u32;
        let lang = if VerQueryValueW(
            buf.as_ptr() as *const _,
            &HSTRING::from("\\VarFileInfo\\Translation"),
            &mut ptr,
            &mut len,
        )
        .as_bool()
            && len >= 4
        {
            let t = std::slice::from_raw_parts(ptr as *const u16, 2);
            format!("{:04x}{:04x}", t[0], t[1])
        } else {
            "040904b0".to_string()
        };
        let key = HSTRING::from(format!("\\StringFileInfo\\{lang}\\FileDescription"));
        if VerQueryValueW(buf.as_ptr() as *const _, &key, &mut ptr, &mut len).as_bool() && len > 1 {
            let s = std::slice::from_raw_parts(ptr as *const u16, len as usize);
            return PCWSTR(s.as_ptr()).to_string().unwrap_or_default().trim().to_string();
        }
        String::new()
    }
}

pub fn friendly_app_name(path: &str) -> String {
    if let Some((_, title)) = path.split_once('?') {
        return title.trim().to_string();
    }
    if let Some(hit) = lock(&NAME_CACHE).get_or_insert_with(HashMap::new).get(path) {
        return hit.clone();
    }
    let val = if path.to_lowercase().starts_with("shell:appsfolder") {
        unsafe {
            let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let s = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(path), None)
                .ok()
                .and_then(|item| item.GetDisplayName(SIGDN_NORMALDISPLAY).ok())
                .and_then(|p| {
                    let t = p.to_string().ok();
                    CoTaskMemFree(Some(p.0 as *const _));
                    t
                })
                .unwrap_or_default()
                .trim()
                .to_string();
            if com {
                CoUninitialize();
            }
            s
        }
    } else if !path.to_lowercase().starts_with("shell:") {
        let desc = read_exe_file_description(path);
        if desc.is_empty() {
            Path::new(path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        } else {
            desc
        }
    } else {
        String::new()
    };
    let clean = if val.is_empty() {
        Path::new(path.split('?').next().unwrap_or(path))
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Ứng dụng".into())
    } else {
        val
    };
    let mut cache = lock(&NAME_CACHE);
    let map = cache.get_or_insert_with(HashMap::new);
    if map.len() > 256 {
        map.clear();
    }
    map.insert(path.to_string(), clean.clone());
    clean
}

fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked = 0u32;
    unsafe {
        DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut c_void, 4).is_ok()
            && cloaked != 0
    }
}

pub fn list_open_windows(own_pid: u32) -> Vec<OpenWindow> {
    struct Ctx {
        own_pid: u32,
        fg: isize,
        out: Vec<OpenWindow>,
    }
    unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = unsafe { &mut *(lparam.0 as *mut Ctx) };
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() || is_cloaked(hwnd) {
            return BOOL(1);
        }
        let title = text_of(hwnd);
        if title.is_empty() || title == "Program Manager" {
            return BOOL(1);
        }
        let ex = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
        let app_window = ex & WS_EX_APPWINDOW.0 != 0;
        if ex & WS_EX_TOOLWINDOW.0 != 0 && !app_window {
            return BOOL(1);
        }
        if !app_window {
            if let Ok(owner) = unsafe { GetWindow(hwnd, GW_OWNER) } {
                if !owner.0.is_null() && unsafe { IsWindowVisible(owner) }.as_bool() {
                    return BOOL(1);
                }
            }
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if pid == 0 || pid == ctx.own_pid {
            return BOOL(1);
        }
        let Some(mut path) = exe_path_of_pid(pid) else { return BOOL(1) };
        let lower = path.to_lowercase();
        let file = lower.rsplit('\\').next().unwrap_or("");
        if HIDDEN_EXES.contains(&file) {
            return BOOL(1);
        }
        let class = class_of(hwnd);
        if file == "explorer.exe" && class != "CabinetWClass" && class != "ExploreWClass" {
            return BOOL(1);
        }
        if file == "applicationframehost.exe" {
            if class != "ApplicationFrameWindow" {
                return BOOL(1);
            }
            path = match aumid_of_hwnd(hwnd) {
                Some(id) => format!("shell:AppsFolder\\{id}"),
                None => format!("{path}?{title}"),
            };
        }
        let mut rect = RECT::default();
        let _ = unsafe { GetWindowRect(hwnd, &mut rect) };
        let parked = rect_is_parked(&rect);
        let app_name = friendly_app_name(&path);
        ctx.out.push(OpenWindow {
            hwnd: hwnd.0 as isize,
            pid,
            title,
            app_name,
            path,
            is_minimized: unsafe { IsIconic(hwnd) }.as_bool(),
            is_foreground: hwnd.0 as isize == ctx.fg,
            is_parked: parked,
            width: (rect.right - rect.left).max(0),
            height: (rect.bottom - rect.top).max(0),
        });
        BOOL(1)
    }

    let fg = unsafe { GetForegroundWindow() }.0 as isize;
    let mut ctx = Ctx {
        own_pid,
        fg,
        out: Vec::new(),
    };
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut ctx as *mut Ctx as isize));
    }
    if let Some(active) = ctx.out.iter().find(|w| w.hwnd == fg) {
        *lock(&LAST_ACTIVE_FG) = Some((active.hwnd, active.app_name.clone(), active.path.clone()));
    }
    ctx.out
}

// ============================================================
// 2. LIVE WINDOW THUMBNAIL SNAPSHOT + WINDOW CONTROL
// ============================================================
pub fn capture_window_thumb_b64(hwnd_val: isize, max_w: u32) -> Option<String> {
    let h = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(h)).as_bool() || !IsWindowVisible(h).as_bool() || IsIconic(h).as_bool() {
            return None;
        }
        let mut wr = RECT::default();
        GetWindowRect(h, &mut wr).ok()?;
        let (ww, wh) = (wr.right - wr.left, wr.bottom - wr.top);
        if ww < 60 || wh < 60 || ww > 7000 || wh > 7000 {
            return None;
        }
        let screen = GetDC(None);
        let dc = CreateCompatibleDC(Some(screen));
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: ww,
                biHeight: -wh,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(Some(screen), &info, DIB_RGB_COLORS, &mut bits, None, 0);
        ReleaseDC(None, screen);
        let Ok(dib) = dib else {
            let _ = DeleteDC(dc);
            return None;
        };
        if bits.is_null() {
            let _ = DeleteObject(HGDIOBJ(dib.0));
            let _ = DeleteDC(dc);
            return None;
        }
        let old = SelectObject(dc, HGDIOBJ(dib.0));
        let ok = PrintWindow(h, dc, PRINT_WINDOW_FLAGS(2)).as_bool();
        let out_img = if ok {
            let src = std::slice::from_raw_parts(bits as *const u8, (ww * wh * 4) as usize);
            let target_w = max_w.clamp(120, 480) as i32;
            let step = (ww / target_w).max(1);
            let (ow, oh) = ((ww / step).max(1), (wh / step).max(1));
            let mut down = vec![0u8; (ow * oh * 4) as usize];
            for y in 0..oh {
                let sy = y * step;
                for x in 0..ow {
                    let sx = x * step;
                    let si = ((sy * ww + sx) * 4) as usize;
                    let di = ((y * ow + x) * 4) as usize;
                    down[di] = src[si];
                    down[di + 1] = src[si + 1];
                    down[di + 2] = src[si + 2];
                    down[di + 3] = 255;
                }
            }
            let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let b64 = crate::island_search::bgra_to_png_data_url(ow as u32, oh as u32, &down);
            if com {
                CoUninitialize();
            }
            b64
        } else {
            None
        };
        SelectObject(dc, old);
        let _ = DeleteObject(HGDIOBJ(dib.0));
        let _ = DeleteDC(dc);
        out_img
    }
}

pub fn activate_window(hwnd_val: isize, toggle_minimize: bool) -> bool {
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return false;
        }
        if is_parked(hwnd_val) {
            unpark_hwnd(hwnd_val);
        }
        let fg = GetForegroundWindow();
        let is_front = fg == hwnd || GetAncestor(fg, GA_ROOTOWNER) == hwnd;
        if toggle_minimize && is_front && IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
            return true;
        }
        if !IsWindowVisible(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        let me = GetCurrentThreadId();
        let other = GetWindowThreadProcessId(fg, None);
        let attached = other != 0 && other != me && AttachThreadInput(me, other, true).as_bool();
        let _ = BringWindowToTop(hwnd);
        let ok = SetForegroundWindow(hwnd).as_bool();
        if attached {
            let _ = AttachThreadInput(me, other, false);
        }
        if !ok {
            let _ = FlashWindow(hwnd, true);
        }
        ok
    }
}

pub fn close_window(hwnd_val: isize) {
    unsafe {
        let _ = PostMessageW(Some(HWND(hwnd_val as *mut _)), WM_CLOSE, WPARAM(0), LPARAM(0));
    }
}

pub fn minimize_window(hwnd_val: isize) {
    unsafe {
        let _ = ShowWindow(HWND(hwnd_val as *mut _), SW_MINIMIZE);
    }
}

// ============================================================
// 3. FOREGROUND APP CONTEXTUAL MENUS (FOR RAIL TOP BAR)
// ============================================================
#[derive(Clone, Debug, Serialize)]
pub struct AppMenuItem {
    pub sep: bool,
    pub label: String,
    pub accel: String,
    pub vks: Vec<u16>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AppMenuGroup {
    pub title: String,
    pub items: Vec<AppMenuItem>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ForegroundAppMenu {
    pub hwnd: isize,
    pub app_name: String,
    pub path: String,
    pub groups: Vec<AppMenuGroup>,
}

const VK_C: u16 = 0x11;
const VK_S: u16 = 0x10;
const VK_A: u16 = 0x12;
const VK_W: u16 = 0x5B;
const VK_TAB: u16 = 0x09;
const VK_LEFT: u16 = 0x25;
const VK_UP: u16 = 0x26;
const VK_RIGHT: u16 = 0x27;
const VK_DOWN: u16 = 0x28;
const VK_DEL: u16 = 0x2E;
const VK_ENTER: u16 = 0x0D;
const VK_PLUS: u16 = 0xBB;
const VK_MINUS: u16 = 0xBD;
const VK_SLASH: u16 = 0xBF;
const VK_TICK: u16 = 0xC0;
const VK_SPACE: u16 = 0x20;
const VK_F2: u16 = 0x71;
const VK_F4: u16 = 0x73;
const VK_F5: u16 = 0x74;
const VK_F11: u16 = 0x7A;
const VK_F12: u16 = 0x7B;

fn m_item(label: &str, accel: &str, vks: &[u16]) -> AppMenuItem {
    AppMenuItem {
        sep: false,
        label: label.into(),
        accel: accel.into(),
        vks: vks.to_vec(),
    }
}

fn m_sep() -> AppMenuItem {
    AppMenuItem {
        sep: true,
        label: String::new(),
        accel: String::new(),
        vks: Vec::new(),
    }
}

fn m_group(title: &str, items: Vec<AppMenuItem>) -> AppMenuGroup {
    AppMenuGroup {
        title: title.into(),
        items,
    }
}

fn window_menu_group() -> AppMenuGroup {
    m_group(
        "Cửa sổ",
        vec![
            m_item("Thu nhỏ", "Win+↓", &[VK_W, VK_DOWN]),
            m_item("Phóng to", "Win+↑", &[VK_W, VK_UP]),
            m_sep(),
            m_item("Gắn nửa trái", "Win+←", &[VK_W, VK_LEFT]),
            m_item("Gắn nửa phải", "Win+→", &[VK_W, VK_RIGHT]),
            m_sep(),
            m_item("Đóng cửa sổ", "Alt+F4", &[VK_A, VK_F4]),
        ],
    )
}

pub fn app_menu_profile_for_path(path: &str) -> Vec<AppMenuGroup> {
    let exe = path
        .to_lowercase()
        .split('?')
        .next()
        .unwrap_or("")
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or("")
        .to_string();

    let edit_std = m_group(
        "Chỉnh sửa",
        vec![
            m_item("Hoàn tác", "Ctrl+Z", &[VK_C, 0x5A]),
            m_item("Làm lại", "Ctrl+Y", &[VK_C, 0x59]),
            m_sep(),
            m_item("Cắt", "Ctrl+X", &[VK_C, 0x58]),
            m_item("Sao chép", "Ctrl+C", &[VK_C, 0x43]),
            m_item("Dán", "Ctrl+V", &[VK_C, 0x56]),
            m_item("Chọn tất cả", "Ctrl+A", &[VK_C, 0x41]),
            m_sep(),
            m_item("Tìm kiếm…", "Ctrl+F", &[VK_C, 0x46]),
        ],
    );

    match exe.as_str() {
        "chrome.exe" | "msedge.exe" | "brave.exe" | "firefox.exe" | "opera.exe" | "vivaldi.exe"
        | "arc.exe" | "zen.exe" | "librewolf.exe" | "thorium.exe" | "browser.exe" => vec![
            m_group(
                "Tệp",
                vec![
                    m_item("Tab mới", "Ctrl+T", &[VK_C, 0x54]),
                    m_item("Cửa sổ mới", "Ctrl+N", &[VK_C, 0x4E]),
                    m_item("Cửa sổ ẩn danh", "Ctrl+Shift+N", &[VK_C, VK_S, 0x4E]),
                    m_item("Mở lại tab đã đóng", "Ctrl+Shift+T", &[VK_C, VK_S, 0x54]),
                    m_sep(),
                    m_item("Lưu trang…", "Ctrl+S", &[VK_C, 0x53]),
                    m_item("In…", "Ctrl+P", &[VK_C, 0x50]),
                    m_sep(),
                    m_item("Đóng tab", "Ctrl+W", &[VK_C, 0x57]),
                ],
            ),
            edit_std,
            m_group(
                "Xem",
                vec![
                    m_item("Tải lại", "Ctrl+R", &[VK_C, 0x52]),
                    m_item("Toàn màn hình", "F11", &[VK_F11]),
                    m_item("Phóng to", "Ctrl++", &[VK_C, VK_PLUS]),
                    m_item("Thu nhỏ", "Ctrl+-", &[VK_C, VK_MINUS]),
                    m_item("Cỡ gốc", "Ctrl+0", &[VK_C, 0x30]),
                    m_sep(),
                    m_item("Công cụ lập trình", "Ctrl+Shift+I", &[VK_C, VK_S, 0x49]),
                ],
            ),
            m_group(
                "Lịch sử",
                vec![
                    m_item("Quay lại", "Alt+←", &[VK_A, VK_LEFT]),
                    m_item("Đi tiếp", "Alt+→", &[VK_A, VK_RIGHT]),
                    m_sep(),
                    m_item("Lịch sử duyệt web", "Ctrl+H", &[VK_C, 0x48]),
                    m_item("Tệp đã tải", "Ctrl+J", &[VK_C, 0x4A]),
                ],
            ),
            m_group(
                "Tab",
                vec![
                    m_item("Tab tiếp theo", "Ctrl+Tab", &[VK_C, VK_TAB]),
                    m_item("Tab trước đó", "Ctrl+Shift+Tab", &[VK_C, VK_S, VK_TAB]),
                    m_sep(),
                    m_item("Đánh dấu trang này", "Ctrl+D", &[VK_C, 0x44]),
                    m_item("Trình quản lý Dấu trang", "Ctrl+Shift+O", &[VK_C, VK_S, 0x4F]),
                ],
            ),
            window_menu_group(),
        ],
        "explorer.exe" => vec![
            m_group(
                "Tệp",
                vec![
                    m_item("Cửa sổ mới", "Ctrl+N", &[VK_C, 0x4E]),
                    m_item("Tab mới", "Ctrl+T", &[VK_C, 0x54]),
                    m_item("Thư mục mới", "Ctrl+Shift+N", &[VK_C, VK_S, 0x4E]),
                    m_sep(),
                    m_item("Thuộc tính", "Alt+Enter", &[VK_A, VK_ENTER]),
                    m_item("Đóng tab", "Ctrl+W", &[VK_C, 0x57]),
                ],
            ),
            m_group(
                "Chỉnh sửa",
                vec![
                    m_item("Hoàn tác", "Ctrl+Z", &[VK_C, 0x5A]),
                    m_sep(),
                    m_item("Cắt", "Ctrl+X", &[VK_C, 0x58]),
                    m_item("Sao chép", "Ctrl+C", &[VK_C, 0x43]),
                    m_item("Dán", "Ctrl+V", &[VK_C, 0x56]),
                    m_item("Chép đường dẫn", "Ctrl+Shift+C", &[VK_C, VK_S, 0x43]),
                    m_sep(),
                    m_item("Đổi tên", "F2", &[VK_F2]),
                    m_item("Xóa", "Del", &[VK_DEL]),
                ],
            ),
            m_group(
                "Xem",
                vec![
                    m_item("Làm mới", "F5", &[VK_F5]),
                    m_sep(),
                    m_item("Biểu tượng lớn", "Ctrl+Shift+2", &[VK_C, VK_S, 0x32]),
                    m_item("Danh sách", "Ctrl+Shift+5", &[VK_C, VK_S, 0x35]),
                    m_item("Chi tiết", "Ctrl+Shift+6", &[VK_C, VK_S, 0x36]),
                ],
            ),
            m_group(
                "Đi tới",
                vec![
                    m_item("Quay lại", "Alt+←", &[VK_A, VK_LEFT]),
                    m_item("Thư mục cha", "Alt+↑", &[VK_A, VK_UP]),
                    m_item("Thanh địa chỉ", "Alt+D", &[VK_A, 0x44]),
                ],
            ),
            window_menu_group(),
        ],
        "code.exe" | "cursor.exe" | "windsurf.exe" | "code - insiders.exe" | "vscodium.exe"
        | "antigravity.exe" | "zed.exe" => vec![
            m_group(
                "Tệp",
                vec![
                    m_item("Tệp mới", "Ctrl+N", &[VK_C, 0x4E]),
                    m_item("Cửa sổ mới", "Ctrl+Shift+N", &[VK_C, VK_S, 0x4E]),
                    m_item("Mở tệp…", "Ctrl+O", &[VK_C, 0x4F]),
                    m_sep(),
                    m_item("Lưu", "Ctrl+S", &[VK_C, 0x53]),
                    m_item("Lưu thành…", "Ctrl+Shift+S", &[VK_C, VK_S, 0x53]),
                    m_item("Đóng trình sửa", "Ctrl+W", &[VK_C, 0x57]),
                ],
            ),
            m_group(
                "Chỉnh sửa",
                vec![
                    m_item("Hoàn tác", "Ctrl+Z", &[VK_C, 0x5A]),
                    m_item("Làm lại", "Ctrl+Y", &[VK_C, 0x59]),
                    m_sep(),
                    m_item("Tìm kiếm", "Ctrl+F", &[VK_C, 0x46]),
                    m_item("Tìm trong dự án", "Ctrl+Shift+F", &[VK_C, VK_S, 0x46]),
                    m_item("Bật/Tắt ghi chú", "Ctrl+/", &[VK_C, VK_SLASH]),
                ],
            ),
            m_group(
                "Xem",
                vec![
                    m_item("Bảng lệnh…", "Ctrl+Shift+P", &[VK_C, VK_S, 0x50]),
                    m_item("Mở nhanh…", "Ctrl+P", &[VK_C, 0x50]),
                    m_sep(),
                    m_item("Trình duyệt tệp", "Ctrl+Shift+E", &[VK_C, VK_S, 0x45]),
                    m_item("Thanh bên", "Ctrl+B", &[VK_C, 0x42]),
                    m_item("Terminal", "Ctrl+`", &[VK_C, VK_TICK]),
                ],
            ),
            m_group(
                "Chạy",
                vec![
                    m_item("Bắt đầu Debug", "F5", &[VK_F5]),
                    m_item("Chạy không Debug", "Ctrl+F5", &[VK_C, VK_F5]),
                ],
            ),
            window_menu_group(),
        ],
        "winword.exe" | "excel.exe" | "powerpnt.exe" | "onenote.exe" => vec![
            m_group(
                "Tệp",
                vec![
                    m_item("Tạo mới", "Ctrl+N", &[VK_C, 0x4E]),
                    m_item("Mở…", "Ctrl+O", &[VK_C, 0x4F]),
                    m_item("Lưu", "Ctrl+S", &[VK_C, 0x53]),
                    m_item("Lưu thành…", "F12", &[VK_F12]),
                    m_item("In…", "Ctrl+P", &[VK_C, 0x50]),
                ],
            ),
            edit_std,
            m_group(
                "Định dạng",
                vec![
                    m_item("In đậm", "Ctrl+B", &[VK_C, 0x42]),
                    m_item("In nghiêng", "Ctrl+I", &[VK_C, 0x49]),
                    m_item("Gạch chân", "Ctrl+U", &[VK_C, 0x55]),
                    m_sep(),
                    m_item("Căn trái", "Ctrl+L", &[VK_C, 0x4C]),
                    m_item("Căn giữa", "Ctrl+E", &[VK_C, 0x45]),
                    m_item("Căn phải", "Ctrl+R", &[VK_C, 0x52]),
                ],
            ),
            window_menu_group(),
        ],
        "spotify.exe" => vec![
            m_group(
                "Phát lại",
                vec![
                    m_item("Phát / Tạm dừng", "Space", &[VK_SPACE]),
                    m_item("Bài tiếp theo", "Ctrl+→", &[VK_C, VK_RIGHT]),
                    m_item("Bài trước đó", "Ctrl+←", &[VK_C, VK_LEFT]),
                    m_sep(),
                    m_item("Tăng âm lượng", "Ctrl+↑", &[VK_C, VK_UP]),
                    m_item("Giảm âm lượng", "Ctrl+↓", &[VK_C, VK_DOWN]),
                ],
            ),
            edit_std,
            window_menu_group(),
        ],
        _ => vec![
            m_group(
                "Tệp",
                vec![
                    m_item("Mới", "Ctrl+N", &[VK_C, 0x4E]),
                    m_item("Mở…", "Ctrl+O", &[VK_C, 0x4F]),
                    m_item("Lưu", "Ctrl+S", &[VK_C, 0x53]),
                    m_item("In…", "Ctrl+P", &[VK_C, 0x50]),
                    m_sep(),
                    m_item("Đóng", "Ctrl+W", &[VK_C, 0x57]),
                ],
            ),
            edit_std,
            m_group(
                "Xem",
                vec![
                    m_item("Toàn màn hình", "F11", &[VK_F11]),
                    m_item("Phóng to", "Ctrl++", &[VK_C, VK_PLUS]),
                    m_item("Thu nhỏ", "Ctrl+-", &[VK_C, VK_MINUS]),
                ],
            ),
            window_menu_group(),
        ],
    }
}

pub fn get_foreground_app_menu(own_pid: u32) -> ForegroundAppMenu {
    let fg = unsafe { GetForegroundWindow() };
    let mut pid = 0u32;
    if !fg.0.is_null() {
        unsafe { GetWindowThreadProcessId(fg, Some(&mut pid)) };
    }
    if pid != 0 && pid != own_pid {
        if let Some(mut path) = exe_path_of_pid(pid) {
            let file = path.rsplit('\\').next().unwrap_or("").to_lowercase();
            let title = text_of(fg);
            if file == "applicationframehost.exe" {
                if let Some(id) = aumid_of_hwnd(fg) {
                    path = format!("shell:AppsFolder\\{id}");
                } else if !title.is_empty() {
                    path = format!("{path}?{title}");
                }
            }
            if !HIDDEN_EXES.contains(&file.as_str()) {
                let app_name = friendly_app_name(&path);
                let hwnd = fg.0 as isize;
                *lock(&LAST_ACTIVE_FG) = Some((hwnd, app_name.clone(), path.clone()));
                return ForegroundAppMenu {
                    hwnd,
                    app_name,
                    path: path.clone(),
                    groups: app_menu_profile_for_path(&path),
                };
            }
        }
    }
    if let Some((hwnd, app_name, path)) = lock(&LAST_ACTIVE_FG).clone() {
        return ForegroundAppMenu {
            hwnd,
            app_name,
            groups: app_menu_profile_for_path(&path),
            path,
        };
    }
    ForegroundAppMenu {
        hwnd: 0,
        app_name: "Finder Desktop".into(),
        path: String::new(),
        groups: app_menu_profile_for_path(""),
    }
}

pub fn exec_app_menu_shortcut(target_hwnd: isize, vks: Vec<u16>) {
    if target_hwnd != 0 && unsafe { IsWindow(Some(HWND(target_hwnd as *mut _))) }.as_bool() {
        let _ = activate_window(target_hwnd, false);
        std::thread::sleep(Duration::from_millis(60));
    }
    crate::island_system::send_key_chord(&vks);
}

// ============================================================
// 4. VIRTUAL DESKTOPS (OVERVIEW)
// ============================================================
#[derive(Clone, Debug, Serialize)]
pub struct VirtualDesktopsInfo {
    pub names: Vec<String>,
    pub current: usize,
}

pub fn guid_text_le(b: &[u8]) -> String {
    format!(
        "{{{:02X}{:02X}{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}}}",
        b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}

pub fn list_virtual_desktops() -> VirtualDesktopsInfo {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let base_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops";
    let Ok(base) = hkcu.open_subkey(base_path) else {
        return VirtualDesktopsInfo {
            names: vec!["Desktop 1".into()],
            current: 0,
        };
    };
    let ids = base
        .get_raw_value("VirtualDesktopIDs")
        .map(|v| v.bytes)
        .unwrap_or_default();
    let cur = base
        .get_raw_value("CurrentVirtualDesktop")
        .map(|v| v.bytes)
        .unwrap_or_default();
    let mut names = Vec::new();
    let mut current = 0usize;
    for (i, chunk) in ids.chunks_exact(16).enumerate() {
        let g = guid_text_le(chunk);
        if cur.len() >= 16 && &cur[..16] == chunk {
            current = i;
        }
        let custom: Option<String> = hkcu
            .open_subkey(format!("{base_path}\\Desktops\\{g}"))
            .and_then(|k| k.get_value::<String, _>("Name"))
            .ok()
            .filter(|s| !s.trim().is_empty());
        names.push(custom.unwrap_or_else(|| format!("Desktop {}", i + 1)));
    }
    if names.is_empty() {
        names.push("Desktop 1".into());
    }
    VirtualDesktopsInfo { names, current }
}

pub fn virtual_desktop_action(action: &str) {
    match action {
        "prev" => crate::island_system::send_key_chord(&[0x5B, 0x11, 0x25]), // Win+Ctrl+Left
        "next" => crate::island_system::send_key_chord(&[0x5B, 0x11, 0x27]), // Win+Ctrl+Right
        "new" => crate::island_system::send_key_chord(&[0x5B, 0x11, 0x44]),  // Win+Ctrl+D
        "close" => crate::island_system::send_key_chord(&[0x5B, 0x11, 0x73]), // Win+Ctrl+F4
        s if s.starts_with("switch:") => {
            if let Ok(target) = s["switch:".len()..].parse::<usize>() {
                let info = list_virtual_desktops();
                let cur = info.current;
                if target < cur {
                    for _ in 0..(cur - target).min(8) {
                        crate::island_system::send_key_chord(&[0x5B, 0x11, 0x25]);
                        std::thread::sleep(Duration::from_millis(45));
                    }
                } else if target > cur {
                    for _ in 0..(target - cur).min(8) {
                        crate::island_system::send_key_chord(&[0x5B, 0x11, 0x27]);
                        std::thread::sleep(Duration::from_millis(45));
                    }
                }
            }
        }
        _ => {}
    }
}

// ============================================================
// 5. MAC-STYLE WINDOW SHORTCUTS
// ============================================================
pub fn cycle_same_app_windows(own_pid: u32, back: bool) {
    let fg = unsafe { GetForegroundWindow() }.0 as isize;
    let wins = list_open_windows(own_pid);
    let Some(cur_path) = wins.iter().find(|w| w.hwnd == fg).map(|w| w.path.to_lowercase()) else {
        return;
    };
    let group: Vec<isize> = wins
        .iter()
        .filter(|w| w.path.to_lowercase() == cur_path)
        .map(|w| w.hwnd)
        .collect();
    if group.len() < 2 {
        return;
    }
    let idx = group.iter().position(|h| *h == fg).unwrap_or(0);
    let next_idx = if back {
        (idx + group.len() - 1) % group.len()
    } else {
        (idx + 1) % group.len()
    };
    let _ = activate_window(group[next_idx], false);
}

pub fn hide_foreground_app(own_pid: u32) {
    let fg = unsafe { GetForegroundWindow() }.0 as isize;
    let wins = list_open_windows(own_pid);
    let Some(cur_path) = wins.iter().find(|w| w.hwnd == fg).map(|w| w.path.to_lowercase()) else {
        return;
    };
    for w in wins.iter().filter(|w| w.path.to_lowercase() == cur_path && !w.is_minimized) {
        minimize_window(w.hwnd);
    }
}

pub fn minimize_foreground_window(own_pid: u32) {
    let fg = unsafe { GetForegroundWindow() };
    if fg.0.is_null() {
        return;
    }
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(fg, Some(&mut pid)) };
    if pid != 0 && pid != own_pid {
        minimize_window(fg.0 as isize);
    }
}

pub fn quit_foreground_app(own_pid: u32) {
    let fg = unsafe { GetForegroundWindow() }.0 as isize;
    let wins = list_open_windows(own_pid);
    let Some(cur_path) = wins.iter().find(|w| w.hwnd == fg).map(|w| w.path.to_lowercase()) else {
        return;
    };
    let file = cur_path.rsplit(['\\', '/']).next().unwrap_or("");
    if matches!(
        file,
        "explorer.exe" | "dwm.exe" | "winlogon.exe" | "csrss.exe" | "searchhost.exe" | "shellexperiencehost.exe"
    ) {
        close_window(fg);
        return;
    }
    for w in wins.iter().filter(|w| w.path.to_lowercase() == cur_path) {
        close_window(w.hwnd);
    }
}

// ============================================================
// 6. SCENE (STAGE MANAGER) PARKING & CRASH RECOVERY
// ============================================================
const PARK_SLIVER: i32 = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ParkedWin {
    pub hwnd: isize,
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub maximized: bool,
}

static PARKED_LIST: Mutex<Vec<ParkedWin>> = Mutex::new(Vec::new());
static SCENE_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

fn rect_is_parked(r: &RECT) -> bool {
    r.right > 0 && r.right <= PARK_SLIVER + 2 && r.bottom > 0 && r.bottom <= PARK_SLIVER + 2 && r.left < -100 && r.top < -50
}

pub fn is_parked(hwnd_val: isize) -> bool {
    let mut r = RECT::default();
    unsafe { GetWindowRect(HWND(hwnd_val as *mut _), &mut r).is_ok() && rect_is_parked(&r) }
}

pub fn parse_parked_list(s: &str) -> Vec<ParkedWin> {
    s.lines()
        .filter_map(|l| {
            let v: Vec<i64> = l.split_whitespace().filter_map(|x| x.parse().ok()).collect();
            (v.len() == 6).then(|| ParkedWin {
                hwnd: v[0] as isize,
                left: v[1] as i32,
                top: v[2] as i32,
                right: v[3] as i32,
                bottom: v[4] as i32,
                maximized: v[5] != 0,
            })
        })
        .collect()
}

pub fn serialize_parked_list(list: &[ParkedWin]) -> String {
    let mut s = String::new();
    for p in list {
        s.push_str(&format!(
            "{} {} {} {} {} {}\n",
            p.hwnd, p.left, p.top, p.right, p.bottom, p.maximized as u8
        ));
    }
    s
}

fn save_parked_file() {
    let path = lock(&SCENE_FILE).clone();
    let Some(path) = path else { return };
    let list = lock(&PARKED_LIST);
    if list.is_empty() {
        let _ = std::fs::remove_file(path);
    } else {
        let _ = std::fs::write(path, serialize_parked_list(&list));
    }
}

pub fn recover_leftover_scene(data_dir: &Path) {
    let f = data_dir.join("parked_windows.txt");
    *lock(&SCENE_FILE) = Some(f.clone());
    if let Ok(text) = std::fs::read_to_string(&f) {
        for p in parse_parked_list(&text) {
            if is_parked(p.hwnd) {
                unpark_entry(&p);
            }
        }
        let _ = std::fs::remove_file(f);
    }
}

fn park_hwnd(hwnd_val: isize) -> Option<ParkedWin> {
    let w = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(w)).as_bool() || IsIconic(w).as_bool() {
            return None;
        }
        let mut wp = WINDOWPLACEMENT {
            length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        GetWindowPlacement(w, &mut wp).ok()?;
        let maximized = IsZoomed(w).as_bool();
        let nr = wp.rcNormalPosition;
        let mut cur = RECT::default();
        GetWindowRect(w, &mut cur).ok()?;
        if rect_is_parked(&cur) {
            return None;
        }
        let (left, top, right, bottom) = if maximized {
            (nr.left, nr.top, nr.right, nr.bottom)
        } else {
            (cur.left, cur.top, cur.right, cur.bottom)
        };
        let pw = (cur.right - cur.left).max(200);
        let ph = (cur.bottom - cur.top).max(120);
        if maximized {
            let _ = ShowWindow(w, SW_RESTORE);
        }
        let _ = SetWindowPos(
            w,
            None,
            PARK_SLIVER - pw,
            PARK_SLIVER - ph,
            pw,
            ph,
            SWP_NOACTIVATE | SWP_NOZORDER,
        );
        Some(ParkedWin {
            hwnd: hwnd_val,
            left,
            top,
            right,
            bottom,
            maximized,
        })
    }
}

fn unpark_entry(p: &ParkedWin) {
    let w = HWND(p.hwnd as *mut _);
    unsafe {
        if !IsWindow(Some(w)).as_bool() {
            return;
        }
        let _ = SetWindowPos(
            w,
            None,
            p.left,
            p.top,
            (p.right - p.left).max(200),
            (p.bottom - p.top).max(120),
            SWP_NOACTIVATE | SWP_NOZORDER,
        );
        if p.maximized {
            let _ = ShowWindow(w, SW_MAXIMIZE);
        }
    }
}

pub fn unpark_hwnd(hwnd_val: isize) {
    let entry = {
        let mut list = lock(&PARKED_LIST);
        if let Some(idx) = list.iter().position(|p| p.hwnd == hwnd_val) {
            Some(list.remove(idx))
        } else {
            None
        }
    };
    if let Some(p) = entry {
        unpark_entry(&p);
        save_parked_file();
    }
}

pub fn scene_focus_window(own_pid: u32, target_hwnd: isize, group_with_current: bool) {
    unpark_hwnd(target_hwnd);
    if !group_with_current {
        let wins = list_open_windows(own_pid);
        let mut list = lock(&PARKED_LIST);
        for w in wins {
            if w.hwnd != target_hwnd && !w.is_minimized && !w.is_parked {
                if let Some(p) = park_hwnd(w.hwnd) {
                    list.retain(|x| x.hwnd != p.hwnd);
                    list.push(p);
                }
            }
        }
        drop(list);
        save_parked_file();
    }
    let _ = activate_window(target_hwnd, false);
}

pub fn scene_tuck_all(own_pid: u32) {
    let wins = list_open_windows(own_pid);
    let mut list = lock(&PARKED_LIST);
    for w in wins {
        if !w.is_minimized && !w.is_parked {
            if let Some(p) = park_hwnd(w.hwnd) {
                list.retain(|x| x.hwnd != p.hwnd);
                list.push(p);
            }
        }
    }
    drop(list);
    save_parked_file();
}

pub fn scene_unpark_all() -> usize {
    let entries: Vec<ParkedWin> = {
        let mut list = lock(&PARKED_LIST);
        list.drain(..).collect()
    };
    let count = entries.len();
    for p in entries {
        unpark_entry(&p);
    }
    save_parked_file();
    count
}

// ============================================================
// 7. SAFE WINDOWS TASKBAR HIDE & GUARANTEED RESTORE
// ============================================================
const PRIMARY_TB_CLASS: &str = "Shell_TrayWnd";
const SECONDARY_TB_CLASS: &str = "Shell_SecondaryTrayWnd";
const TB_PARK_X: i32 = -10000;
const ABS_AUTOHIDE_FLAG: i32 = 1;
const ABS_ALWAYSONTOP_FLAG: i32 = 2;

static TASKBAR_HIDDEN: AtomicBool = AtomicBool::new(false);
static TB_SAVED_STATE: Mutex<Option<(i32, Option<(i32, i32)>, PathBuf)>> = Mutex::new(None);
static TB_HOOKS: Mutex<Vec<isize>> = Mutex::new(Vec::new());

fn primary_taskbar() -> Option<HWND> {
    unsafe { FindWindowW(w!("Shell_TrayWnd"), None).ok() }.filter(|h| !h.0.is_null())
}

fn secondary_taskbars() -> Vec<HWND> {
    unsafe extern "system" fn each(hwnd: HWND, lp: LPARAM) -> BOOL {
        let out = unsafe { &mut *(lp.0 as *mut Vec<HWND>) };
        if class_of(hwnd) == SECONDARY_TB_CLASS {
            out.push(hwnd);
        }
        BOOL(1)
    }
    let mut out = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut out as *mut Vec<HWND> as isize));
    }
    out
}

fn park_tb(h: HWND) {
    unsafe {
        let _ = ShowWindow(h, SW_HIDE);
        let _ = SetWindowPos(
            h,
            None,
            TB_PARK_X,
            TB_PARK_X,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

fn restore_tb(h: HWND, pos: Option<(i32, i32)>) {
    unsafe {
        if let Some((x, y)) = pos {
            let _ = SetWindowPos(
                h,
                Some(HWND_TOP),
                x,
                y,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
        let _ = ShowWindow(h, SW_SHOW);
    }
}

pub fn parse_tb_marker(text: &str) -> Option<(i32, Option<(i32, i32)>)> {
    let mut parts = text.split_whitespace();
    let ab = parts.next()?.parse::<i32>().ok()?;
    let pos = match (parts.next(), parts.next()) {
        (Some(x), Some(y)) => match (x.parse::<i32>(), y.parse::<i32>()) {
            (Ok(x), Ok(y)) => Some((x, y)),
            _ => None,
        },
        _ => None,
    };
    Some((ab, pos))
}

unsafe extern "system" fn tb_enforcer(
    _hook: HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if !TASKBAR_HIDDEN.load(Ordering::Relaxed) || id_object != 0 || hwnd.0.is_null() {
        return;
    }
    let c = class_of(hwnd);
    if (c == PRIMARY_TB_CLASS || c == SECONDARY_TB_CLASS) && unsafe { IsWindowVisible(hwnd) }.as_bool() {
        park_tb(hwnd);
    }
}

fn remove_tb_enforcer() {
    for h in lock(&TB_HOOKS).drain(..) {
        unsafe {
            let _ = UnhookWinEvent(HWINEVENTHOOK(h as *mut _));
        }
    }
}

fn install_tb_enforcer(p: HWND) {
    remove_tb_enforcer();
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(p, Some(&mut pid)) };
    if pid == 0 {
        return;
    }
    let mut hooks = lock(&TB_HOOKS);
    for ev in [EVENT_OBJECT_SHOW, EVENT_OBJECT_LOCATIONCHANGE] {
        let h = unsafe { SetWinEventHook(ev, ev, None, Some(tb_enforcer), pid, 0, WINEVENT_OUTOFCONTEXT) };
        if !h.is_invalid() {
            hooks.push(h.0 as isize);
        }
    }
}

pub fn recover_leftover_taskbar(data_dir: &Path) {
    let marker = data_dir.join("taskbar_marker.txt");
    if let Ok(txt) = std::fs::read_to_string(&marker) {
        let (ab, pos) = parse_tb_marker(&txt).unwrap_or((ABS_ALWAYSONTOP_FLAG, None));
        if let Some(p) = primary_taskbar() {
            let mut d = APPBARDATA {
                cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                hWnd: p,
                lParam: LPARAM(ab.max(0) as isize),
                ..Default::default()
            };
            unsafe {
                SHAppBarMessage(ABM_SETSTATE, &mut d);
            }
            restore_tb(p, pos);
        }
        for s in secondary_taskbars() {
            restore_tb(s, None);
        }
        let _ = std::fs::remove_file(marker);
    }
}

pub fn restore_taskbar() {
    TASKBAR_HIDDEN.store(false, Ordering::Relaxed);
    remove_tb_enforcer();
    let saved = lock(&TB_SAVED_STATE).take();
    if let Some((ab, pos, marker)) = saved {
        if let Some(p) = primary_taskbar() {
            let mut d = APPBARDATA {
                cbSize: std::mem::size_of::<APPBARDATA>() as u32,
                hWnd: p,
                lParam: LPARAM(ab.max(0) as isize),
                ..Default::default()
            };
            unsafe {
                SHAppBarMessage(ABM_SETSTATE, &mut d);
            }
            restore_tb(p, pos);
        }
        for s in secondary_taskbars() {
            restore_tb(s, None);
        }
        let _ = std::fs::remove_file(marker);
    }
}

pub fn set_taskbar_hidden(hide: bool, data_dir: &Path) -> Result<bool, String> {
    if !hide {
        restore_taskbar();
        return Ok(false);
    }
    if TASKBAR_HIDDEN.load(Ordering::Relaxed) {
        return Ok(true);
    }
    let Some(p) = primary_taskbar() else {
        return Err("Không tìm thấy thanh Taskbar Windows".into());
    };
    let mut ab_data = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: p,
        ..Default::default()
    };
    let old_ab = unsafe { SHAppBarMessage(ABM_GETSTATE, &mut ab_data) as i32 };
    let mut pos: Option<(i32, i32)> = None;
    let mut r = RECT::default();
    if unsafe { GetWindowRect(p, &mut r) }.is_ok() && r.left > -5000 && r.top > -5000 {
        pos = Some((r.left, r.top));
    } else if unsafe { SHAppBarMessage(ABM_GETTASKBARPOS, &mut ab_data) } != 0 {
        pos = Some((ab_data.rc.left, ab_data.rc.top));
    }

    let marker_path = data_dir.join("taskbar_marker.txt");
    let marker_body = match pos {
        Some((x, y)) => format!("{old_ab} {x} {y}\n"),
        None => format!("{old_ab}\n"),
    };
    let _ = std::fs::write(&marker_path, marker_body);
    *lock(&TB_SAVED_STATE) = Some((old_ab, pos, marker_path));

    let mut set_d = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: p,
        lParam: LPARAM(ABS_AUTOHIDE_FLAG as isize),
        ..Default::default()
    };
    unsafe {
        SHAppBarMessage(ABM_SETSTATE, &mut set_d);
    }
    park_tb(p);
    for s in secondary_taskbars() {
        park_tb(s);
    }
    TASKBAR_HIDDEN.store(true, Ordering::Relaxed);
    install_tb_enforcer(p);
    Ok(true)
}

// ============================================================
// 8. WINDOWS TASKBAR PINNED APPS READER
// ============================================================
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct TaskbarPin {
    pub name: String,
    pub path: String,
    pub target_path: String,
}

pub fn parse_taskband_favorites_chunks(bytes: &[u8]) -> Vec<Vec<u8>> {
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < bytes.len() {
        let kind = bytes[i];
        if kind == 0xFF {
            break;
        }
        if i + 5 > bytes.len() {
            break;
        }
        let sz = u32::from_le_bytes([bytes[i + 1], bytes[i + 2], bytes[i + 3], bytes[i + 4]]) as usize;
        if sz == 0 || i + 5 + sz > bytes.len() {
            break;
        }
        out.push(bytes[i + 5..i + 5 + sz].to_vec());
        i += 5 + sz;
    }
    out
}

pub fn normalize_appsfolder_path(raw: &str) -> String {
    let trimmed = raw.trim();
    const APPS_CLSID: &str = "::{4234d49b-0245-4df3-b780-3893943456e1}\\";
    let lower = trimmed.to_ascii_lowercase();
    if let Some(pos) = lower.find(APPS_CLSID) {
        let rest = &trimmed[pos + APPS_CLSID.len()..];
        if !rest.is_empty() {
            return format!("shell:AppsFolder\\{rest}");
        }
    }
    if lower.starts_with("shell:appsfolder\\") {
        return format!("shell:AppsFolder\\{}", &trimmed["shell:appsfolder\\".len()..]);
    }
    if trimmed.contains('!') && !trimmed.contains(":\\") && !lower.starts_with("shell:") {
        return format!("shell:AppsFolder\\{trimmed}");
    }
    trimmed.to_string()
}

fn extract_utf16_tokens_at(chunk: &[u8], offset: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = offset;
    while i + 1 < chunk.len() {
        let u = u16::from_le_bytes([chunk[i], chunk[i + 1]]);
        if (0x20..=0x7E).contains(&u) || (0xA0..=0x024F).contains(&u) {
            cur.push(u);
        } else {
            if cur.len() >= 4 {
                if let Ok(s) = String::from_utf16(&cur) {
                    let t = s.trim().to_string();
                    if t.len() >= 4 {
                        out.push(t);
                    }
                }
            }
            cur.clear();
        }
        i += 2;
    }
    if cur.len() >= 4 {
        if let Ok(s) = String::from_utf16(&cur) {
            let t = s.trim().to_string();
            if t.len() >= 4 {
                out.push(t);
            }
        }
    }
    out
}

fn extract_utf16_ascii_tokens(chunk: &[u8]) -> Vec<String> {
    let mut out = extract_utf16_tokens_at(chunk, 0);
    out.extend(extract_utf16_tokens_at(chunk, 1));
    out
}

fn collect_taskbar_lnks() -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    let Some(appdata) = std::env::var_os("APPDATA") else { return out };
    let dir = PathBuf::from(appdata)
        .join("Microsoft")
        .join("Internet Explorer")
        .join("Quick Launch")
        .join("User Pinned")
        .join("TaskBar");
    let Ok(rd) = std::fs::read_dir(&dir) else { return out };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.is_file() && p.extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")) {
            if let Some(fname) = p.file_name().map(|s| s.to_string_lossy().to_ascii_lowercase()) {
                out.push((fname, p));
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

fn build_pin_from_lnk(lnk_path: &Path) -> Option<TaskbarPin> {
    if !lnk_path.is_file() {
        return None;
    }
    let name = lnk_path
        .file_stem()
        .map(|s| s.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Ứng dụng".into());
    let path = lnk_path.to_string_lossy().to_string();
    let resolved = unsafe { crate::island_search::resolve_shortcut_target(&path) }.unwrap_or_default();
    let res_low = resolved.to_ascii_lowercase();
    let win_dir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
    let explorer_exe = format!("{win_dir}\\explorer.exe");
    let target_path = if name.eq_ignore_ascii_case("file explorer")
        || res_low.ends_with("\\explorer.exe")
        || res_low.contains("{52205fd8-5dfb-447d-801a-d0b52f2e83e1}")
    {
        explorer_exe
    } else if !resolved.is_empty() {
        normalize_appsfolder_path(&resolved)
    } else {
        path.clone()
    };
    Some(TaskbarPin {
        name,
        path,
        target_path,
    })
}

unsafe fn pidl_display_name(
    pidl: *const ITEMIDLIST,
    sigdn: windows::Win32::UI::Shell::SIGDN,
) -> Option<String> {
    unsafe {
        let p = SHGetNameFromIDList(pidl, sigdn).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
    }
}

fn pin_from_taskband_chunk(chunk: &[u8], taskbar_lnks: &[(String, PathBuf)]) -> Option<TaskbarPin> {
    if chunk.len() >= 2 {
        let mut pidl_buf = chunk.to_vec();
        pidl_buf.extend_from_slice(&[0u8, 0u8]);
        let pidl_ptr = pidl_buf.as_ptr() as *const ITEMIDLIST;
        let parse_opt = unsafe {
            pidl_display_name(pidl_ptr, SIGDN_DESKTOPABSOLUTEPARSING)
                .or_else(|| pidl_display_name(pidl_ptr, SIGDN_FILESYSPATH))
        };
        let disp_opt = unsafe { pidl_display_name(pidl_ptr, SIGDN_NORMALDISPLAY) };

        if let Some(raw_parse) = parse_opt {
            let p = Path::new(&raw_parse);
            if p.is_file() && raw_parse.to_ascii_lowercase().ends_with(".lnk") {
                if let Some(pin) = build_pin_from_lnk(p) {
                    return Some(pin);
                }
            }
            let norm = normalize_appsfolder_path(&raw_parse);
            if norm.to_ascii_lowercase().starts_with("shell:appsfolder\\") {
                let name = disp_opt
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| friendly_app_name(&norm));
                return Some(TaskbarPin {
                    name,
                    path: norm.clone(),
                    target_path: norm,
                });
            }
            if p.is_file() {
                let name = disp_opt
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| friendly_app_name(&raw_parse));
                return Some(TaskbarPin {
                    name,
                    path: raw_parse.clone(),
                    target_path: raw_parse,
                });
            }
        }
    }

    let tokens = extract_utf16_ascii_tokens(chunk);
    for tok in &tokens {
        let low = tok.to_ascii_lowercase();
        if low.ends_with(".lnk") {
            if let Some((_, p)) = taskbar_lnks.iter().find(|(fname, _)| *fname == low) {
                if let Some(pin) = build_pin_from_lnk(p) {
                    return Some(pin);
                }
            }
            if let Some((_, p)) = taskbar_lnks.iter().find(|(fname, _)| low.ends_with(fname)) {
                if let Some(pin) = build_pin_from_lnk(p) {
                    return Some(pin);
                }
            }
        }
    }
    for tok in &tokens {
        if tok.contains('!')
            && tok.contains('_')
            && !tok.contains('\\')
            && !tok.contains('/')
            && !tok.contains(' ')
        {
            let norm = normalize_appsfolder_path(tok);
            let name = friendly_app_name(&norm);
            return Some(TaskbarPin {
                name,
                path: norm.clone(),
                target_path: norm,
            });
        }
    }
    None
}

pub fn list_windows_taskbar_pins() -> Vec<TaskbarPin> {
    let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    let taskbar_lnks = collect_taskbar_lnks();
    let mut pins = Vec::new();

    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Taskband",
        KEY_READ,
    ) {
        if let Ok(val) = key.get_raw_value("Favorites") {
            for chunk in parse_taskband_favorites_chunks(&val.bytes) {
                if let Some(pin) = pin_from_taskband_chunk(&chunk, &taskbar_lnks) {
                    pins.push(pin);
                }
            }
        }
    }

    if pins.is_empty() {
        for (_, p) in &taskbar_lnks {
            if let Some(pin) = build_pin_from_lnk(p) {
                pins.push(pin);
            }
        }
    }

    let mut deduped = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for pin in pins {
        let key = format!(
            "{}|{}",
            pin.target_path.to_ascii_lowercase(),
            pin.path.to_ascii_lowercase()
        );
        if seen.insert(key) {
            deduped.push(pin);
        }
    }

    if deduped.is_empty() {
        let win_dir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        let explorer = format!("{win_dir}\\explorer.exe");
        deduped.push(TaskbarPin {
            name: "File Explorer".into(),
            path: explorer.clone(),
            target_path: explorer,
        });
    }

    if com {
        unsafe { CoUninitialize() };
    }
    deduped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appmenu_profiles() {
        let chrome = app_menu_profile_for_path(r"C:\Program Files\Google\Chrome\chrome.exe");
        assert!(chrome.len() >= 5);
        assert_eq!(chrome[0].title, "Tệp");
        let explorer = app_menu_profile_for_path(r"C:\Windows\explorer.exe");
        assert_eq!(explorer[3].title, "Đi tới");
        let code = app_menu_profile_for_path(r"C:\Users\x\AppData\Local\Programs\Microsoft VS Code\Code.exe");
        assert_eq!(code[3].title, "Chạy");
    }

    #[test]
    fn marker_roundtrip() {
        assert_eq!(parse_tb_marker("2 0 1032"), Some((2, Some((0, 1032)))));
        assert_eq!(parse_tb_marker("0"), Some((0, None)));
        assert_eq!(parse_tb_marker("invalid"), None);
    }

    #[test]
    fn parked_roundtrip() {
        let list = vec![
            ParkedWin {
                hwnd: 12345,
                left: 100,
                top: 80,
                right: 900,
                bottom: 700,
                maximized: false,
            },
            ParkedWin {
                hwnd: 67890,
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1040,
                maximized: true,
            },
        ];
        let s = serialize_parked_list(&list);
        assert_eq!(parse_parked_list(&s), list);
    }

    #[test]
    fn vdesk_guid_format() {
        let bytes: [u8; 16] = [
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E,
            0x0F, 0x10,
        ];
        assert_eq!(guid_text_le(&bytes), "{04030201-0605-0807-090A-0B0C0D0E0F10}");
    }

    #[test]
    fn taskband_favorites_chunk_parser() {
        let mut blob = Vec::new();
        blob.push(0);
        blob.extend_from_slice(&4u32.to_le_bytes());
        blob.extend_from_slice(&[1, 2, 3, 4]);
        blob.push(0);
        blob.extend_from_slice(&2u32.to_le_bytes());
        blob.extend_from_slice(&[9, 8]);
        blob.push(0xFF);
        blob.extend_from_slice(&[99, 99, 99]);

        let chunks = parse_taskband_favorites_chunks(&blob);
        assert_eq!(chunks, vec![vec![1, 2, 3, 4], vec![9, 8]]);

        let truncated = vec![0, 10, 0, 0, 0, 1, 2];
        assert!(parse_taskband_favorites_chunks(&truncated).is_empty());
    }

    #[test]
    fn normalize_appsfolder_paths() {
        assert_eq!(
            normalize_appsfolder_path("::{4234D49B-0245-4DF3-B780-3893943456E1}\\Microsoft.WindowsStore_8wekyb3d8bbwe!App"),
            "shell:AppsFolder\\Microsoft.WindowsStore_8wekyb3d8bbwe!App"
        );
        assert_eq!(
            normalize_appsfolder_path("Microsoft.WindowsStore_8wekyb3d8bbwe!App"),
            "shell:AppsFolder\\Microsoft.WindowsStore_8wekyb3d8bbwe!App"
        );
        assert_eq!(
            normalize_appsfolder_path("C:\\Program Files\\Brave\\brave.exe"),
            "C:\\Program Files\\Brave\\brave.exe"
        );
    }

    #[test]
    fn windows_taskbar_pins_runs_without_panic() {
        let pins = list_windows_taskbar_pins();
        eprintln!("TASKBAR_PINS ({}): {:?}", pins.len(), pins);
        assert!(!pins.is_empty());
        for p in &pins {
            assert!(!p.name.trim().is_empty());
            assert!(!p.path.trim().is_empty());
        }
    }
}
