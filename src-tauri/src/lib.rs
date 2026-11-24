use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, PhysicalPosition};
use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_opener::OpenerExt;
use winreg::enums::*;
use winreg::RegKey;

use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
use windows::Win32::Foundation::{POINT, RECT};
use windows::Win32::System::Diagnostics::Debug::Beep;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, GetKeyState, GetKeyboardLayout};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect,
    GetWindowThreadProcessId, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
};
use std::sync::atomic::{AtomicBool, Ordering};

mod island_audio;
mod island_search;
mod island_shell;
mod island_system;

const CREATE_NO_WINDOW: u32 = 0x08000000;

static SUPPRESS_NATIVE_OSD: AtomicBool = AtomicBool::new(false);
static MAC_SHORTCUTS_ENABLED: AtomicBool = AtomicBool::new(false);
static ISLAND_VISIBLE: AtomicBool = AtomicBool::new(true);
static HOT_CORNERS: Mutex<[String; 4]> = Mutex::new([String::new(), String::new(), String::new(), String::new()]);
static SHELL_RECTS: Mutex<Option<HashMap<String, Vec<[f64; 4]>>>> = Mutex::new(None);
static WIDGETS_TOPMOST: AtomicBool = AtomicBool::new(false);

/// Vùng màn hình (toạ độ vật lý) đang chứa tai thỏ
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct MonGeo {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub scale: f64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ActiveNotchInfo {
    pub label: String,
    pub geo: MonGeo,
}

static ACTIVE_NOTCHES: Mutex<Vec<ActiveNotchInfo>> = Mutex::new(Vec::new());
static ALL_MONITORS_MODE: AtomicBool = AtomicBool::new(false);
static HIDE_FULLSCREEN: AtomicBool = AtomicBool::new(true);
static AUTO_TRIM_MEMORY: AtomicBool = AtomicBool::new(true);
static HOTKEYS_ENABLED: AtomicBool = AtomicBool::new(true);
static ALARM_STOP_FLAG: AtomicBool = AtomicBool::new(false);
static ALARM_RUN_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static APP_DATA_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
static LYRICS_CACHE: Mutex<Option<HashMap<String, (u64, LyricsResponse)>>> = Mutex::new(None);
static LYRICS_CACHE_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
const DARK_ROBOT_RGBA_64: &[u8] = include_bytes!("../icons/icon_64.rgba");

fn apply_dark_robot_icon(win: &tauri::WebviewWindow) {
    if DARK_ROBOT_RGBA_64.len() == 64 * 64 * 4 {
        let img = tauri::image::Image::new(DARK_ROBOT_RGBA_64, 64, 64);
        let _ = win.set_icon(img);
    }
}

#[derive(Serialize, Clone)]
pub struct MonitorItem {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub primary: bool,
    pub current: bool,
}

#[derive(Serialize, Clone)]
pub struct MonitorsResponse {
    pub monitors: Vec<MonitorItem>,
    pub all_monitors: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct MediaInfo {
    pub has_session: bool,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub source_app: String,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub audio_peak: f32,
    pub thumbnail_b64: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct DroppedFileItem {
    pub name: String,
    pub path: String,
    pub size: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct LyricLine {
    pub time: f64,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct LyricsResponse {
    pub found: bool,
    pub source: String,
    pub lines: Vec<LyricLine>,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Eq)]
pub struct HardwareTick {
    pub cursor_inside: bool,
    pub hovered_notch: Option<String>,
    pub file_drag_hover: bool,
    pub drop_seq: u64,
    pub outside_click_seq: u64,
    pub battery_pct: u8,
    pub is_charging: bool,
    pub ac_changed_seq: u64,
    pub caps_on: bool,
    pub caps_changed_seq: u64,
    pub vol_seq: u64,
    pub vol_kind: String,
    pub volume_pct: u8,
    pub volume_muted: bool,
    pub lang_seq: u64,
    pub lang_name: String,
    pub fullscreen_hidden: bool,
    pub audio_peak: u8,
    pub cpu_pct: u8,
    pub ram_pct: u8,
    pub ram_used_gb_x10: u16,
    pub ram_total_gb_x10: u16,
    pub net_down_kbps: u32,
    pub net_up_kbps: u32,
    pub cam_active: bool,
    pub mic_active: bool,
    pub privacy_app: String,
    pub audio_bands: [u8; 5],
    pub audio_spectrum: [u8; 16],
    pub audio_output_name: String,
    pub brightness_pct: u8,
    pub brightness_soft: bool,
    pub wifi_ssid: String,
    pub wifi_bars: u8,
}

#[derive(Clone, Copy)]
pub struct NotchBounds {
    pub width: f64,
    pub height: f64,
    pub expanded: bool,
}

impl Default for NotchBounds {
    fn default() -> Self {
        Self {
            width: 202.0,
            height: 37.0,
            expanded: false,
        }
    }
}

pub enum MediaCmd {
    Action(String, Option<f64>),
}

pub struct TimelineTracker {
    pub key: String,
    pub raw_pos_ticks: i64,
    pub raw_last_updated: i64,
    pub pause_offset_secs: f64,
    pub last_playing_pos_secs: f64,
    pub recorded_at: Instant,
    pub was_playing: bool,
    pub silent_secs: f64,
}

#[derive(Clone, Default)]
pub struct CachedSongMeta {
    pub source_app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub thumbnail_b64: String,
    pub last_props_at: Option<Instant>,
    pub last_base_secs: f64,
    pub last_end_ticks: i64,
    pub last_playing: bool,
}

pub struct AppSharedState {
    pub media: Arc<Mutex<MediaInfo>>,
    pub media_updated_at: Arc<Mutex<Option<Instant>>>,
    pub hw: Arc<Mutex<HardwareTick>>,
    pub bounds: Arc<Mutex<HashMap<String, NotchBounds>>>,
    pub dropped_files: Arc<Mutex<Vec<DroppedFileItem>>>,
    pub media_tx: Mutex<Sender<MediaCmd>>,
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn format_file_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

// ============================================================
// SMART MULTI-ENGINE LYRICS FETCHER
// ============================================================
fn curl_get(url: &str, referer: Option<&str>) -> Option<String> {
    let mut cmd = std::process::Command::new("curl");
    cmd.creation_flags(CREATE_NO_WINDOW)
        .arg("-s")
        .arg("-L")
        .arg("--connect-timeout")
        .arg("3")
        .arg("--max-time")
        .arg("8")
        .arg("-H")
        .arg("Lrclib-Client: Island/1.2")
        .arg("-A")
        .arg("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Island/1.2.0");
    if let Some(r) = referer {
        cmd.arg("-e").arg(r);
    }
    cmd.arg(url);
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8(out.stdout).ok()
}

fn curl_post_form(url: &str, form_body: &str, referer: &str) -> Option<String> {
    let out = std::process::Command::new("curl")
        .creation_flags(CREATE_NO_WINDOW)
        .arg("-s")
        .arg("-L")
        .arg("--max-time")
        .arg("6")
        .arg("-X")
        .arg("POST")
        .arg("-e")
        .arg(referer)
        .arg("-A")
        .arg("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .arg("-d")
        .arg(form_body)
        .arg(url)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8(out.stdout).ok()
}

fn curl_get_with_ua(url: &str, ua: &str, timeout_secs: u32) -> Option<String> {
    let out = std::process::Command::new("curl")
        .creation_flags(CREATE_NO_WINDOW)
        .arg("-s")
        .arg("-L")
        .arg("--connect-timeout")
        .arg("3")
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("-A")
        .arg(ua)
        .arg(url)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8(out.stdout).ok()
}

#[inline(never)]
fn splitmix64_step(x: u64) -> u64 {
    let mut z = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[inline(never)]
fn zeroize_string(mut s: String) {
    unsafe {
        let bytes = s.as_bytes_mut();
        for b in bytes.iter_mut() {
            std::ptr::write_volatile(b, 0u8);
        }
    }
    std::hint::black_box(&s);
}

/// Giải mã khóa bảo mật AI Gateway từ 5 phân mảnh 64-bit bị xáo trộn hoán vị phi tuyến + dòng khóa SplitMix64 ARX
/// Không lưu chuỗi tĩnh trong .rdata, chống quét Strings / YARA / Hex dump / Constant-folding khi dịch ngược
#[inline(never)]
fn unlock_embedded_vault_key() -> String {
    let s0 = std::hint::black_box(0xC725_C2BE_9FAB_61E6_u64)
        ^ std::hint::black_box(0x625F_9BFD_5A6E_7545_u64);
    let s1 = std::hint::black_box(0xE440_0C95_29F6_0EBE_u64)
        ^ std::hint::black_box(0x645A_6CE1_546A_7545_u64);
    let s2 = std::hint::black_box(0x8BEF_427C_FD4E_41C2_u64)
        ^ std::hint::black_box(0x6456_6CE1_546A_7540_u64);
    let s3 = std::hint::black_box(0xAEDF_E293_9B14_8A2B_u64)
        ^ std::hint::black_box(0x64B6_6CE1_546A_7540_u64);
    let s4 = std::hint::black_box(0x55A0_5C50_A8D2_04D0_u64)
        ^ std::hint::black_box(0x6456_6CE6_546A_7540_u64);
    let shards = [s0, s1, s2, s3, s4];

    let rt_gate = (std::hint::black_box(CREATE_NO_WINDOW) >> 27) as u64;
    let seed = std::hint::black_box(0x7A4E_9B2D_1F8C_3E65_u64) ^ rt_gate;

    let mut out = vec![0u8; 35];
    for i in 0..35usize {
        let idx = std::hint::black_box(i);
        let pi = (idx * 19 + 7) % 35;
        let s_idx = pi / 7;
        let b_idx = pi % 7;
        let enc = ((shards[s_idx] >> (b_idx * 8)) & 0xFF) as u8;
        let ks = splitmix64_step(seed ^ (idx as u64).wrapping_mul(0x517C_C1B7_2722_0A95));
        let m0 = (ks & 0xFF) as u8;
        let m1 = ((ks >> 8) & 0xFF) as u8;
        let r = (((ks >> 16) & 7) | 1) as u32;
        let m2 = ((ks >> 24) & 0xFF) as u8;
        let dec = (enc ^ m2).rotate_right(r).wrapping_sub(m1) ^ m0;
        out[idx] = dec;
    }
    String::from_utf8(out).unwrap_or_default()
}

/// Giải mã địa chỉ máy chủ AI Gateway từ 5 phân mảnh 64-bit bị xáo trộn hoán vị phi tuyến + dòng khóa SplitMix64 ARX
#[inline(never)]
fn unlock_embedded_vault_endpoint() -> String {
    let s0 = std::hint::black_box(0x7E40_64F3_B240_15E8_u64)
        ^ std::hint::black_box(0x93A5_C17F_4E28_B6D1_u64);
    let s1 = std::hint::black_box(0x3432_1A86_3713_7903_u64)
        ^ std::hint::black_box(0x5D82_E0B4_A173_9F6C_u64);
    let s2 = std::hint::black_box(0x9283_C79F_87FB_737F_u64)
        ^ std::hint::black_box(0xC41F_7A68_29B0_D35E_u64);
    let s3 = std::hint::black_box(0x7DBE_2002_C915_9BA7_u64)
        ^ std::hint::black_box(0x38B6_0D95_E7C1_4A29_u64);
    let s4 = std::hint::black_box(0xC1D0_7A9F_56EC_C61A_u64)
        ^ std::hint::black_box(0xF170_9E43_6A5C_82BD_u64);
    let shards = [s0, s1, s2, s3, s4];

    let rt_gate = (std::hint::black_box(CREATE_NO_WINDOW) >> 27) as u64;
    let seed = std::hint::black_box(0x3C8D_5E1A_9B47_2F60_u64) ^ rt_gate;

    let mut out = vec![0u8; 30];
    for i in 0..30usize {
        let idx = std::hint::black_box(i);
        let pi = (idx * 13 + 11) % 30;
        let s_idx = pi / 7;
        let b_idx = pi % 7;
        let enc = ((shards[s_idx] >> (b_idx * 8)) & 0xFF) as u8;
        let ks = splitmix64_step(seed ^ (idx as u64).wrapping_mul(0x517C_C1B7_2722_0A95));
        let m0 = (ks & 0xFF) as u8;
        let m1 = ((ks >> 8) & 0xFF) as u8;
        let r = (((ks >> 16) & 7) | 1) as u32;
        let m2 = ((ks >> 24) & 0xFF) as u8;
        let dec = (enc ^ m2).rotate_right(r).wrapping_sub(m1) ^ m0;
        out[idx] = dec;
    }
    String::from_utf8(out).unwrap_or_default()
}

fn escape_curl_config_value(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(ch),
        }
    }
    out
}

fn curl_post_json(
    url: &str,
    json_payload: &str,
    bearer_token: Option<&str>,
    timeout_secs: u32,
) -> Result<String, String> {
    // Sử dụng chế độ `-K -` đọc cấu hình ẩn qua đường ống stdin ẩn danh để KHÔNG bao giờ lộ URL hay API Key trên dòng lệnh của tiến trình curl.exe
    let mut cmd = std::process::Command::new("curl");
    cmd.creation_flags(CREATE_NO_WINDOW)
        .arg("-s")
        .arg("-L")
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("-K")
        .arg("-");

    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Không thể khởi động curl: {}", e))?;

    let mut cfg_buf = String::with_capacity(json_payload.len() + 384);
    cfg_buf.push_str(&format!("url = \"{}\"\n", escape_curl_config_value(url)));
    cfg_buf.push_str("request = \"POST\"\n");
    cfg_buf.push_str("header = \"Content-Type: application/json\"\n");
    cfg_buf.push_str("header = \"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\"\n");
    if let Some(token) = bearer_token {
        let t = token.trim();
        if !t.is_empty() {
            cfg_buf.push_str(&format!(
                "header = \"Authorization: Bearer {}\"\n",
                escape_curl_config_value(t)
            ));
        }
    }
    cfg_buf.push_str(&format!(
        "data-raw = \"{}\"\n",
        escape_curl_config_value(json_payload)
    ));

    let write_res = if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(cfg_buf.as_bytes())
            .map_err(|e| format!("Lỗi gửi dữ liệu: {}", e))
    } else {
        Ok(())
    };
    zeroize_string(cfg_buf);
    write_res?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Lỗi chờ phản hồi: {}", e))?;

    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        if code == 7 {
            return Err(format!(
                "Không thể kết nối đến máy chủ AI ({}). Vui lòng kiểm tra lại dịch vụ AI Gateway hoặc địa chỉ Endpoint trong Cài đặt.",
                url
            ));
        } else if code == 28 {
            return Err("Quá thời gian phản hồi (Timeout sau 35 giây). Vui lòng thử lại.".to_string());
        } else {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Lỗi kết nối curl (Mã {}): {}", code, err_msg.trim()));
        }
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout_str.trim().is_empty() {
        return Err("Máy chủ AI phản hồi dữ liệu rỗng.".to_string());
    }
    Ok(stdout_str)
}

fn curl_stream_ai_chat(
    url: &str,
    json_payload: &str,
    bearer_token: Option<&str>,
    timeout_secs: u32,
    app: &tauri::AppHandle,
    req_id: &str,
) -> Result<String, String> {
    let mut cmd = std::process::Command::new("curl");
    cmd.creation_flags(CREATE_NO_WINDOW)
        .arg("-s")
        .arg("-L")
        .arg("-N")
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("-K")
        .arg("-");

    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Không thể khởi động curl stream: {}", e))?;

    let mut cfg_buf = String::with_capacity(json_payload.len() + 384);
    cfg_buf.push_str(&format!("url = \"{}\"\n", escape_curl_config_value(url)));
    cfg_buf.push_str("request = \"POST\"\n");
    cfg_buf.push_str("header = \"Content-Type: application/json\"\n");
    cfg_buf.push_str("header = \"Accept: text/event-stream\"\n");
    cfg_buf.push_str("header = \"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\"\n");
    if let Some(token) = bearer_token {
        let t = token.trim();
        if !t.is_empty() {
            cfg_buf.push_str(&format!(
                "header = \"Authorization: Bearer {}\"\n",
                escape_curl_config_value(t)
            ));
        }
    }
    cfg_buf.push_str(&format!(
        "data-raw = \"{}\"\n",
        escape_curl_config_value(json_payload)
    ));

    let write_res = if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(cfg_buf.as_bytes())
            .map_err(|e| format!("Lỗi gửi dữ liệu stream: {}", e))
    } else {
        Ok(())
    };
    zeroize_string(cfg_buf);
    write_res?;

    let mut full_content = String::new();
    let mut raw_fallback = String::new();
    let mut saw_sse = false;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line_res in reader.lines() {
            let Ok(line) = line_res else { break };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("data:") {
                saw_sse = true;
                let rest = rest.trim();
                if rest == "[DONE]" {
                    break;
                }
                if let Ok(chunk_val) = serde_json::from_str::<serde_json::Value>(rest) {
                    if let Some(err_msg) = chunk_val
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                    {
                        let _ = app.emit(
                            "island-ai-stream",
                            serde_json::json!({ "reqId": req_id, "delta": "", "reasoning": "", "done": true }),
                        );
                        let _ = child.wait();
                        return Err(format!("Lỗi từ máy chủ AI: {}", err_msg));
                    }
                    let delta_reasoning = chunk_val
                        .pointer("/choices/0/delta/reasoning_content")
                        .or_else(|| chunk_val.pointer("/choices/0/delta/reasoning"))
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    let delta_content = chunk_val
                        .pointer("/choices/0/delta/content")
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    if !delta_content.is_empty() {
                        full_content.push_str(delta_content);
                    }
                    if !delta_reasoning.is_empty() || !delta_content.is_empty() {
                        let _ = app.emit(
                            "island-ai-stream",
                            serde_json::json!({
                                "reqId": req_id,
                                "delta": delta_content,
                                "reasoning": delta_reasoning,
                                "done": false
                            }),
                        );
                    }
                }
            } else if !saw_sse && raw_fallback.len() < 65536 {
                raw_fallback.push_str(trimmed);
                raw_fallback.push('\n');
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Lỗi chờ kết thúc stream: {}", e))?;

    if saw_sse {
        let _ = app.emit(
            "island-ai-stream",
            serde_json::json!({ "reqId": req_id, "delta": "", "reasoning": "", "done": true }),
        );
        if !full_content.is_empty() {
            return Ok(full_content);
        }
        return Err("Máy chủ AI kết thúc luồng nhưng không trả về nội dung.".to_string());
    }

    if !raw_fallback.trim().is_empty() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw_fallback) {
            if let Some(err_msg) = v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
                return Err(format!("Lỗi từ máy chủ AI: {}", err_msg));
            }
            if let Some(err_str) = v.get("error").and_then(|e| e.as_str()) {
                return Err(format!("Lỗi từ máy chủ AI: {}", err_str));
            }
            if let Some(content) = v.pointer("/choices/0/message/content").and_then(|c| c.as_str()) {
                let _ = app.emit(
                    "island-ai-stream",
                    serde_json::json!({ "reqId": req_id, "delta": content, "reasoning": "", "done": true }),
                );
                return Ok(content.to_string());
            }
        }
        return Err(format!(
            "Lỗi phân tích phản hồi AI: {}",
            raw_fallback.chars().take(200).collect::<String>()
        ));
    }

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        return Err(format!("Lỗi kết nối AI Stream (Mã {})", code));
    }
    Err("Máy chủ AI phản hồi dữ liệu rỗng.".to_string())
}

fn clean_lrc_inline_tags(raw_text: &str) -> String {
    let mut s = raw_text.replace("\\n", " ").replace('\r', " ");
    // Strip inline metadata blocks like {agent:v1}
    loop {
        let Some(a) = s.find('{') else { break };
        let Some(rel_b) = s[a..].find('}') else { break };
        s.replace_range(a..=a + rel_b, " ");
    }
    // Strip enhanced LRC word-timing tags like <00:12.34> or <word:00:12:00:13>
    loop {
        let Some(a) = s.find('<') else { break };
        let Some(rel_b) = s[a..].find('>') else { break };
        s.replace_range(a..=a + rel_b, " ");
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_lrc_string(raw_lrc: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for raw_line in raw_lrc.lines() {
        let mut rest = raw_line.trim();
        if !rest.starts_with('[') {
            continue;
        }
        let mut timestamps: Vec<f64> = Vec::new();
        while rest.starts_with('[') {
            let Some(close_idx) = rest.find(']') else { break };
            let tag = &rest[1..close_idx];
            let parts: Vec<&str> = tag.split(':').collect();
            let mut parsed_ts = None;
            if parts.len() == 2 {
                if let (Ok(m), Ok(s)) = (
                    parts[0].trim().parse::<f64>(),
                    parts[1].trim().replace(':', ".").parse::<f64>(),
                ) {
                    let t = m * 60.0 + s;
                    if t >= 0.0 {
                        parsed_ts = Some(t);
                    }
                }
            }
            if let Some(t) = parsed_ts {
                timestamps.push(t);
                rest = rest[close_idx + 1..].trim_start();
            } else {
                break;
            }
        }
        if timestamps.is_empty() {
            continue;
        }
        let text = clean_lrc_inline_tags(rest);
        if text.is_empty() {
            continue;
        }
        // Skip credit metadata lines
        let low_txt = text.to_lowercase();
        if text.starts_with("作词")
            || text.starts_with("作曲")
            || text.starts_with("编曲")
            || text.starts_with("制作")
            || text.starts_with("混音")
            || low_txt.starts_with("lời:")
            || low_txt.starts_with("nhạc:")
            || low_txt.starts_with("sáng tác:")
            || low_txt.starts_with("ca sĩ:")
            || low_txt.starts_with("trình bày:")
            || low_txt.starts_with("composer:")
            || low_txt.starts_with("lyricist:")
        {
            continue;
        }
        for t in timestamps {
            lines.push(LyricLine {
                time: t,
                text: text.clone(),
            });
        }
    }
    lines.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    lines
}

fn strip_noise_words_only(input: &str) -> String {
    let mut s = input.to_string();
    // Cắt bỏ đoạn trích câu hát sau ký hiệu ♫ hoặc ♪ trên tiêu đề YouTube (VD: "Nếu Ta Ngược Lối - Đinh Tùng Huy ♫ Tự Cho Nhau...")
    for sym in ['♫', '♪', '♬', '♩'] {
        if let Some(idx) = s.find(sym) {
            if idx >= 3 {
                s.truncate(idx);
            } else {
                s = s.replace(sym, " ");
            }
        }
    }
    let noise_words = [
        "official music video",
        "official lyric video",
        "official lyrics video",
        "official visualizer",
        "official video",
        "official audio",
        "official mv",
        "music video",
        "lyrics video",
        "lyric video",
        "mix lyrics",
        "visualizer",
        "hot tiktok 2026",
        "hot tiktok 2025",
        "hot tiktok 2024",
        "hot tiktok",
        "nhạc trung hot",
        "nhạc trung",
        "bản nhạc",
        "gây bão 2026",
        "gây bão",
        "mashup remix 2in1",
        "mashup 2in1",
        "2in1",
        "dj 2026",
        "dj 2025",
        "dj 2024",
        "vietsub",
        "pinyin",
        "slowed",
        "reverb",
        "sped up",
        "tiktok",
        "douyin",
        "- topic",
        "official",
    ];
    for nw in noise_words {
        loop {
            let low = s.to_lowercase();
            let Some(pos) = low.find(nw) else { break };
            if s.is_char_boundary(pos) && s.is_char_boundary(pos + nw.len()) {
                s.replace_range(pos..pos + nw.len(), " ");
            } else {
                break;
            }
        }
    }
    // Dọn hậu tố "DJ" dính liền sau chữ Hán (VD: "就忘了吧DJ" -> "就忘了吧")
    let s_clean = s.replace("DJ ", " ").replace("DJ", " ");
    s_clean.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_brackets_and_noise(input: &str) -> String {
    let mut s = input.to_string();
    for sym in ['♫', '♪', '♬', '♩'] {
        if let Some(idx) = s.find(sym) {
            if idx >= 3 {
                s.truncate(idx);
            } else {
                s = s.replace(sym, " ");
            }
        }
    }
    // Remove [...] blocks safely
    loop {
        let Some(a) = s.find('[') else { break };
        let Some(rel_b) = s[a..].find(']') else { break };
        s.replace_range(a..=a + rel_b, " ");
    }
    // Remove (...) blocks safely
    loop {
        let Some(a) = s.find('(') else { break };
        let Some(rel_b) = s[a..].find(')') else { break };
        s.replace_range(a..=a + rel_b, " ");
    }
    // Remove quotes
    s = s.replace('"', " ").replace('“', " ").replace('”', " ");
    // Normalize en-dash / em-dash surrounded by spaces to standard " - "
    s = s.replace(" – ", " - ").replace(" — ", " - ");

    if s.contains('|') {
        let parts: Vec<String> = s
            .split('|')
            .map(strip_noise_words_only)
            .map(|p| {
                p.trim_matches(|c: char| c == '-' || c == '–' || c == '—' || c == '/' || c.is_whitespace())
                    .to_string()
            })
            .filter(|p| {
                let low = p.to_lowercase();
                p.len() >= 2
                    && low != "mv"
                    && low != "4k"
                    && low != "hd"
                    && low != "audio"
                    && low != "video"
                    && low != "lyrics"
                    && !low.starts_with("playlist")
                    && !low.starts_with("hot ")
            })
            .collect();

        if parts.len() >= 2 {
            let p0_low = parts[0].to_lowercase();
            // Nếu vế đầu đã chứa " - " hoặc là Mashup " x ", giữ nguyên vế đầu tránh nối nhầm bản dịch tiếng Việt ở vế 2
            if parts[0].contains(" - ") || p0_low.contains(" x ") {
                s = parts[0].clone();
            } else {
                s = format!("{} - {}", parts[0], parts[1]);
            }
        } else if let Some(first) = parts.first() {
            s = first.clone();
        } else {
            s = strip_noise_words_only(&s.replace('|', " "));
        }
    } else {
        s = strip_noise_words_only(&s);
    }

    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_generic_platform_or_non_song(title: &str, artist: &str) -> bool {
    let t = title.trim().to_lowercase();
    let a = artist.trim().to_lowercase();
    if t.is_empty() {
        return true;
    }
    let exact_generics = [
        "tiktok - make your day",
        "tiktok",
        "make your day",
        "youtube",
        "facebook",
        "instagram",
        "threads",
        "twitter",
        "x",
        "watch",
        "trang chủ",
        "home",
        "khám phá",
        "discover",
        "new tab",
        "tab mới",
        "chưa phát nhạc",
        "bài hát đang phát",
    ];
    if exact_generics.iter().any(|&g| t == g) {
        return true;
    }
    if t.starts_with("tiktok - make your")
        || t.starts_with("facebook - log in")
        || (t.contains("tiktok") && a.is_empty() && !t.contains('-'))
    {
        return true;
    }
    false
}

fn fold_vietnamese_char(ch: char) -> char {
    match ch {
        'à' | 'á' | 'ả' | 'ã' | 'ạ' | 'ă' | 'ằ' | 'ắ' | 'ẳ' | 'ẵ' | 'ặ' | 'â' | 'ầ' | 'ấ' | 'ẩ'
        | 'ẫ' | 'ậ' => 'a',
        'đ' | 'ð' => 'd',
        'è' | 'é' | 'ẻ' | 'ẽ' | 'ẹ' | 'ê' | 'ề' | 'ế' | 'ể' | 'ễ' | 'ệ' => 'e',
        'ì' | 'í' | 'ỉ' | 'ĩ' | 'ị' => 'i',
        'ò' | 'ó' | 'ỏ' | 'õ' | 'ọ' | 'ô' | 'ồ' | 'ố' | 'ổ' | 'ỗ' | 'ộ' | 'ơ' | 'ờ' | 'ớ' | 'ở'
        | 'ỡ' | 'ợ' => 'o',
        'ù' | 'ú' | 'ủ' | 'ũ' | 'ụ' | 'ư' | 'ừ' | 'ứ' | 'ử' | 'ữ' | 'ự' => 'u',
        'ỳ' | 'ý' | 'ỷ' | 'ỹ' | 'ỵ' => 'y',
        _ => ch,
    }
}

fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0x3040..=0x30FF | 0xAC00..=0xD7AF
    )
}

fn normalize_for_match(s: &str) -> Vec<String> {
    let mut cleaned = String::with_capacity(s.len() + 16);
    for ch in s.chars() {
        if is_cjk_char(ch) {
            cleaned.push(' ');
            cleaned.push(ch);
            cleaned.push(' ');
        } else if ch.is_alphanumeric() {
            for low in ch.to_lowercase() {
                cleaned.push(fold_vietnamese_char(low));
            }
        } else {
            cleaned.push(' ');
        }
    }
    let stop_words = [
        "official", "music", "video", "audio", "mv", "lyrics", "lyric", "vietsub", "pinyin",
        "remix", "ver", "version", "ft", "feat", "prod", "by", "the", "and", "dj", "tiktok",
        "hot", "douyin", "mashup", "2in1",
    ];
    cleaned
        .split_whitespace()
        .filter(|w| {
            let char_cnt = w.chars().count();
            let has_cjk = w.chars().any(is_cjk_char);
            (has_cjk || char_cnt >= 2) && !stop_words.contains(w)
        })
        .map(|w| w.to_string())
        .collect()
}

fn token_overlap_ratio(query_tokens: &[String], cand_tokens: &[String]) -> f64 {
    if query_tokens.is_empty() || cand_tokens.is_empty() {
        return 0.0;
    }
    let matched = query_tokens
        .iter()
        .filter(|qt| {
            cand_tokens.iter().any(|ct| {
                ct == *qt
                    || (qt.chars().count() >= 4
                        && (ct.contains(qt.as_str()) || qt.contains(ct.as_str())))
            })
        })
        .count();
    (matched as f64) / (query_tokens.len() as f64)
}

fn score_lyric_candidate(
    cand_title: &str,
    cand_artist: &str,
    cand_dur_secs: f64,
    expected_title: &str,
    expected_artist: &str,
    expected_dur_secs: f64,
    is_synced: bool,
) -> i32 {
    let q_title_tokens = normalize_for_match(expected_title);
    let c_title_tokens = normalize_for_match(cand_title);
    if q_title_tokens.is_empty() || c_title_tokens.is_empty() {
        return -1000;
    }

    let title_ratio = token_overlap_ratio(&q_title_tokens, &c_title_tokens);
    let rev_title_ratio = token_overlap_ratio(&c_title_tokens, &q_title_tokens);

    let q_art_tokens = normalize_for_match(expected_artist);
    let c_art_tokens = normalize_for_match(cand_artist);

    // Kết hợp token tên bài + nghệ sĩ của ứng viên chỉ khi expected_title thực sự chứa cả tên bài và nghệ sĩ
    let mut combined_cand_tokens = c_title_tokens.clone();
    for t in &c_art_tokens {
        if !combined_cand_tokens.contains(t) {
            combined_cand_tokens.push(t.clone());
        }
    }
    let combined_ratio = if title_ratio >= 0.45 {
        token_overlap_ratio(&q_title_tokens, &combined_cand_tokens)
    } else {
        0.0
    };

    // Cương quyết loại bỏ kết quả nếu tên bài hát không khớp từ khóa chính
    if title_ratio < 0.45 && rev_title_ratio < 0.5 && combined_ratio < 0.65 {
        return -1000;
    }

    let effective_title_ratio = title_ratio
        .max(combined_ratio * 0.90)
        .max(if c_title_tokens.len() >= 2 {
            rev_title_ratio * 0.95
        } else {
            rev_title_ratio * 0.75
        });

    let mut score =
        (effective_title_ratio * 72.0).round() as i32 + (rev_title_ratio * 30.0).round() as i32;

    // Phạt nặng ứng viên là bản Mashup ("A x B") nếu bài đang tìm KHÔNG phải bản Mashup
    let cand_low = cand_title.to_lowercase();
    let exp_low = expected_title.to_lowercase();
    let cand_is_mashup =
        cand_low.contains(" x ") || cand_low.contains(" × ") || cand_low.contains("mashup");
    let exp_is_mashup =
        exp_low.contains(" x ") || exp_low.contains(" × ") || exp_low.contains("mashup");
    if cand_is_mashup && !exp_is_mashup && rev_title_ratio < 0.85 {
        score -= 75;
    }

    if !q_art_tokens.is_empty() && !c_art_tokens.is_empty() {
        let art_ratio = token_overlap_ratio(&q_art_tokens, &c_art_tokens);
        let rev_art_ratio = token_overlap_ratio(&c_art_tokens, &q_art_tokens);
        if art_ratio >= 0.5 || rev_art_ratio >= 0.5 {
            score += 45;
        } else if art_ratio > 0.0 || rev_art_ratio > 0.0 {
            score += 20;
        } else if token_overlap_ratio(&q_title_tokens, &c_art_tokens) >= 0.4 {
            score += 22;
        }
    } else if !c_art_tokens.is_empty() && token_overlap_ratio(&q_title_tokens, &c_art_tokens) >= 0.4 {
        score += 22;
    }

    // Kiểm tra độ lệch thời lượng bài hát (Duration Matching) - ưu tiên cao cho bản khớp đúng thời lượng nhạc đang phát
    if expected_dur_secs > 25.0 && expected_dur_secs <= 420.0 && cand_dur_secs > 15.0 {
        let diff = (expected_dur_secs - cand_dur_secs).abs();
        if diff <= 2.0 {
            score += 80;
        } else if diff <= 5.0 {
            score += 62;
        } else if diff <= 12.0 {
            score += 38;
        } else if diff <= 25.0 {
            score += 15;
        } else if diff <= 45.0 {
            score -= 8;
        } else {
            score -= 22;
        }
    }

    if is_synced {
        score += 25;
    }
    score
}

fn search_netease_lyrics(
    query: &str,
    expected_title: &str,
    expected_artist: &str,
    duration_secs: f64,
) -> Option<Vec<LyricLine>> {
    if query.trim().is_empty() {
        return None;
    }
    let body = format!("s={}&type=1&limit=8", url_encode(query.trim()));
    let resp = curl_post_form(
        "https://music.163.com/api/search/get",
        &body,
        "https://music.163.com",
    )?;
    let v: serde_json::Value = serde_json::from_str(&resp).ok()?;
    let songs = v.get("result")?.get("songs")?.as_array()?;

    let mut scored_ids: Vec<(i32, i64)> = Vec::new();
    for song in songs.iter().take(8) {
        let Some(id) = song.get("id").and_then(|x| x.as_i64()) else { continue };
        let s_name = song.get("name").and_then(|x| x.as_str()).unwrap_or("");
        let s_artist = song
            .get("artists")
            .and_then(|a| a.as_array())
            .and_then(|arr| arr.first())
            .and_then(|a0| a0.get("name"))
            .and_then(|x| x.as_str())
            .unwrap_or("");
        let s_dur_secs = song
            .get("duration")
            .and_then(|d| d.as_f64())
            .map(|ms| ms / 1000.0)
            .unwrap_or(0.0);

        let sc = score_lyric_candidate(
            s_name,
            s_artist,
            s_dur_secs,
            expected_title,
            expected_artist,
            duration_secs,
            true,
        );
        if sc >= 55 {
            scored_ids.push((sc, id));
        }
    }
    scored_ids.sort_by(|a, b| b.0.cmp(&a.0));

    for (_, id) in scored_ids.into_iter().take(3) {
        let lrc_url = format!(
            "https://music.163.com/api/song/lyric?os=pc&id={}&lv=-1&kv=-1&tv=-1",
            id
        );
        if let Some(lrc_resp) = curl_get(&lrc_url, Some("https://music.163.com")) {
            if let Ok(lv) = serde_json::from_str::<serde_json::Value>(&lrc_resp) {
                if let Some(raw_lrc) = lv.get("lrc").and_then(|l| l.get("lyric")).and_then(|s| s.as_str()) {
                    let parsed = parse_lrc_string(raw_lrc);
                    if parsed.len() >= 5 {
                        return Some(parsed);
                    }
                }
            }
        }
    }
    None
}

fn fetch_lrclib_exact(track: &str, artist: &str, duration_secs: f64) -> Option<Vec<LyricLine>> {
    let t = track.trim();
    if t.is_empty() {
        return None;
    }
    let a = artist.trim();
    let url = if a.is_empty() {
        format!("https://lrclib.net/api/get?track_name={}", url_encode(t))
    } else if duration_secs > 20.0 && duration_secs < 900.0 {
        format!(
            "https://lrclib.net/api/get?track_name={}&artist_name={}&duration={}",
            url_encode(t),
            url_encode(a),
            duration_secs.round() as u32
        )
    } else {
        format!(
            "https://lrclib.net/api/get?track_name={}&artist_name={}",
            url_encode(t),
            url_encode(a)
        )
    };
    let resp = curl_get(&url, None)?;
    let val: serde_json::Value = serde_json::from_str(&resp).ok()?;

    let cand_title = val.get("trackName").and_then(|s| s.as_str()).unwrap_or(t);
    let cand_artist = val.get("artistName").and_then(|s| s.as_str()).unwrap_or(a);
    let cand_dur = val.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0);

    if score_lyric_candidate(cand_title, cand_artist, cand_dur, t, a, duration_secs, true) < 55 {
        return None;
    }

    if let Some(synced) = val.get("syncedLyrics").and_then(|s| s.as_str()) {
        let lines = parse_lrc_string(synced);
        if lines.len() >= 3 {
            return Some(lines);
        }
    }
    if let Some(plain) = val.get("plainLyrics").and_then(|s| s.as_str()) {
        let lines: Vec<LyricLine> = plain
            .lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .enumerate()
            .map(|(i, txt)| LyricLine {
                time: (i as f64) * 3.8,
                text: txt.to_string(),
            })
            .collect();
        if lines.len() >= 3 {
            return Some(lines);
        }
    }
    None
}

fn is_live_or_crowd_hype_lrc(c_title: &str, c_album: &str, lines: &[LyricLine]) -> bool {
    let low_t = c_title.to_lowercase();
    let low_alb = c_album.to_lowercase();
    if low_t.contains("live")
        || low_t.contains("sky tour")
        || low_t.contains("concert")
        || low_alb.contains("sky tour")
        || low_alb.contains("live")
    {
        return true;
    }
    let sample_text: String = lines
        .iter()
        .take(8)
        .map(|l| l.text.to_lowercase())
        .collect::<Vec<_>>()
        .join(" | ");
    let hype_markers = [
        "tay chân đâu",
        "hết rồi nào",
        "trao cho anh đê",
        "put your hands up",
        "make some noise",
        "hát lên nào",
        "sky tour",
    ];
    hype_markers.iter().any(|m| sample_text.contains(m))
}

fn search_lrclib_lyrics(
    query: &str,
    expected_title: &str,
    expected_artist: &str,
    duration_secs: f64,
) -> Option<(String, Vec<LyricLine>)> {
    if query.trim().is_empty() {
        return None;
    }

    let mut arr: Vec<serde_json::Value> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    // 1. Ưu tiên tìm chính xác theo track_name + artist_name nếu có tên ca sĩ
    let exp_t_trim = expected_title.trim();
    let exp_a_trim = expected_artist.trim();
    if !exp_t_trim.is_empty() && !exp_a_trim.is_empty() {
        let structured_url = format!(
            "https://lrclib.net/api/search?track_name={}&artist_name={}",
            url_encode(exp_t_trim),
            url_encode(exp_a_trim)
        );
        if let Some(resp) = curl_get(&structured_url, None) {
            if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&resp) {
                for it in items {
                    let id = it.get("id").and_then(|v| v.as_i64()).unwrap_or(-1);
                    if id < 0 || seen_ids.insert(id) {
                        arr.push(it);
                    }
                }
            }
        }
    }

    // 2. Tìm mở rộng theo chuỗi query q=...
    let url = format!("https://lrclib.net/api/search?q={}", url_encode(query.trim()));
    if let Some(resp) = curl_get(&url, None) {
        if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&resp) {
            for it in items {
                let id = it.get("id").and_then(|v| v.as_i64()).unwrap_or(-1);
                if id < 0 || seen_ids.insert(id) {
                    arr.push(it);
                }
            }
        }
    }

    if arr.is_empty() {
        return None;
    }

    let low_q = format!("{} {}", query, expected_title).to_lowercase();
    let wants_live = low_q.contains("live") || low_q.contains("tour") || low_q.contains("concert");

    struct SyncedCand {
        score: i32,
        c_dur: f64,
        first_t: f64,
        last_t: f64,
        line_count: usize,
        is_live: bool,
        lines: Vec<LyricLine>,
    }

    let mut synced_cands: Vec<SyncedCand> = Vec::new();
    let mut best_plain_score = 58;
    let mut best_plain_lines: Option<Vec<LyricLine>> = None;

    for item in arr.iter().take(35) {
        let c_title = item.get("trackName").and_then(|s| s.as_str()).unwrap_or("");
        let c_artist = item.get("artistName").and_then(|s| s.as_str()).unwrap_or("");
        let c_album = item.get("albumName").and_then(|s| s.as_str()).unwrap_or("");
        let c_dur = item.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0);

        if let Some(synced) = item.get("syncedLyrics").and_then(|s| s.as_str()) {
            let parsed = parse_lrc_string(synced);
            if parsed.len() >= 5 {
                let mut sc = score_lyric_candidate(
                    c_title,
                    c_artist,
                    c_dur,
                    expected_title,
                    expected_artist,
                    duration_secs,
                    true,
                );
                if sc < 50 {
                    continue;
                }
                let is_live = is_live_or_crowd_hype_lrc(c_title, c_album, &parsed);
                if is_live && !wants_live {
                    sc -= 65;
                }

                // Bỏ qua dòng producer tag trong ngoặc ở đầu bài (vd: "(Hey, Kewtiie)") khi đo mốc vào lời đầu tiên
                let first_t = parsed
                    .iter()
                    .find(|l| {
                        let tr = l.text.trim();
                        !(tr.starts_with('(') && tr.ends_with(')') && l.time < 16.0)
                    })
                    .or_else(|| parsed.first())
                    .map(|l| l.time)
                    .unwrap_or(0.0);
                let last_t = parsed.last().map(|l| l.time).unwrap_or(0.0);
                let line_count = parsed.len();

                synced_cands.push(SyncedCand {
                    score: sc,
                    c_dur,
                    first_t,
                    last_t,
                    line_count,
                    is_live,
                    lines: parsed,
                });
                continue;
            }
        }

        if let Some(plain) = item.get("plainLyrics").and_then(|s| s.as_str()) {
            let lines: Vec<LyricLine> = plain
                .lines()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .enumerate()
                .map(|(i, txt)| LyricLine {
                    time: (i as f64) * 3.8,
                    text: txt.to_string(),
                })
                .collect();
            if lines.len() >= 4 {
                let sc = score_lyric_candidate(
                    c_title,
                    c_artist,
                    c_dur,
                    expected_title,
                    expected_artist,
                    duration_secs,
                    false,
                );
                if sc > best_plain_score {
                    best_plain_score = sc;
                    best_plain_lines = Some(lines);
                }
            }
        }
    }

    if !synced_cands.is_empty() {
        // Thống kê độ dài câu và mốc kết thúc lớn nhất của các bản LRC chuẩn để loại bỏ các bản LRC bị cắt cụt (TikTok / nửa bài)
        let mut max_lines: usize = 0;
        let mut max_last_t: f64 = 0.0;
        for c in &synced_cands {
            if !c.is_live && c.score >= 55 {
                if c.line_count > max_lines {
                    max_lines = c.line_count;
                }
                if c.last_t > max_last_t && (duration_secs <= 20.0 || c.last_t <= duration_secs + 12.0) {
                    max_last_t = c.last_t;
                }
            }
        }

        // Tìm thông số bản Studio Audio chuẩn (thường ngắn hơn MV có intro diễn xuất)
        let mut studio_dur: f64 = 0.0;
        let mut studio_first_t: f64 = 0.0;
        let mut studio_last_t: f64 = 0.0;
        for c in &synced_cands {
            let is_complete = max_lines < 35 || c.line_count * 100 >= max_lines * 70;
            if !c.is_live && is_complete && c.c_dur > 90.0 {
                if studio_dur == 0.0 || c.c_dur < studio_dur {
                    studio_dur = c.c_dur;
                    studio_first_t = c.first_t;
                    studio_last_t = c.last_t;
                }
            }
        }

        let is_watching_extended_mv = duration_secs > 90.0
            && duration_secs <= 420.0
            && studio_dur > 90.0
            && duration_secs >= studio_dur + 8.0;

        for c in &mut synced_cands {
            // 1. Phạt nặng các bản LRC bị cắt cụt nửa bài (như bản 30 dòng kết thúc ở 02:27 trong khi bài có 65 dòng đến 04:04)
            if max_lines >= 40 && c.line_count * 100 < max_lines * 60 {
                c.score -= 120;
            } else if max_lines >= 25 && c.line_count * 100 < max_lines * 65 {
                c.score -= 75;
            }

            if max_last_t >= 175.0 && c.last_t + 38.0 < max_last_t {
                c.score -= 120;
            } else if duration_secs >= 180.0 && c.last_t < duration_secs * 0.52 {
                c.score -= 90;
            }

            // 2. Phạt bản LRC có câu cuối vượt quá tổng thời lượng bài đang phát
            if duration_secs > 30.0 && c.last_t > duration_secs + 5.0 {
                c.score -= 80;
            }

            // 3. Thưởng các bản LRC đầy đủ chi tiết câu hát
            if c.line_count >= 55 {
                c.score += 22;
            } else if c.line_count >= 35 {
                c.score += 10;
            }

            // 4. Khi người dùng đang xem Official MV dài hơn bản Audio (VD: HIEUTHUHAI MV 322s vs Audio 256s):
            // Ưu tiên tuyệt đối bản LRC đã được căn chuẩn theo mốc thời gian MV (first_t và last_t dịch tương ứng theo intro MV)
            if is_watching_extended_mv {
                let shifted_for_mv = c.first_t >= studio_first_t + 3.5
                    && c.last_t >= studio_last_t + 3.5
                    && c.last_t <= duration_secs + 4.0;
                if shifted_for_mv {
                    c.score += 75;
                } else if (c.c_dur - duration_secs).abs() <= 5.0
                    && (c.first_t - studio_first_t).abs() <= 1.5
                {
                    // Bản LRC khai báo duration = MV (322s) nhưng mốc thời gian bên trong vẫn là của bản Audio (chưa dịch intro MV)
                    c.score -= 40;
                }
            }
        }

        synced_cands.sort_by(|a, b| b.score.cmp(&a.score));
        if let Some(best) = synced_cands.into_iter().next() {
            if best.score >= 56 {
                return Some(("Trực tuyến".to_string(), best.lines));
            }
        }
    }

    best_plain_lines.map(|lines| ("Trực tuyến".to_string(), lines))
}

fn strip_song_feat_suffix(song_raw: &str) -> String {
    let mut s = song_raw.trim().to_string();
    let splitters = [
        " ft. ", " ft ", " FT. ", " FT ", " feat. ", " feat ", " FEAT. ", " FEAT ",
    ];
    for sp in splitters {
        if let Some((left, _)) = s.split_once(sp) {
            let trimmed = left.trim();
            if trimmed.len() >= 2 {
                s = trimmed.to_string();
                break;
            }
        }
    }
    s
}

fn extract_primary_artist(artist_raw: &str) -> String {
    let mut s = artist_raw.trim().to_string();
    let x_count = s.to_lowercase().matches(" x ").count();
    let splitters: &[&str] = if x_count <= 1 {
        &[
            " x ", " X ", " × ", " ft. ", " ft ", " FT. ", " FT ", " feat. ", " feat ", " FEAT. ",
            " FEAT ", " & ", " , ", ", ",
        ]
    } else {
        &[
            " ft. ", " ft ", " FT. ", " FT ", " feat. ", " feat ", " FEAT. ", " FEAT ",
        ]
    };
    for sp in splitters {
        if let Some((left, _)) = s.split_once(sp) {
            let trimmed = left.trim();
            if trimmed.len() >= 2 {
                s = trimmed.to_string();
                break;
            }
        }
    }
    s
}

/// Tìm lời cho 1 tên bài đơn lẻ (hỗ trợ cả tiêu đề song ngữ có dấu `/` như `"Quan Sơn Tửu / 关山酒"`)
fn find_single_song_lyrics(
    song_expr: &str,
    artist_hint: &str,
    duration_secs: f64,
) -> Option<(String, Vec<LyricLine>)> {
    let mut variants: Vec<String> = Vec::new();
    let clean_song = strip_song_feat_suffix(&strip_brackets_and_noise(song_expr));
    if !clean_song.is_empty() {
        variants.push(clean_song.clone());
    }
    // Nếu có dấu "/" (ví dụ "Quan Sơn Tửu / 关山酒"), tách từng phần và ưu tiên phần có chữ Hán / tên gốc trước
    if song_expr.contains('/') {
        let mut slash_parts: Vec<String> = song_expr
            .split('/')
            .map(|p| strip_song_feat_suffix(&strip_brackets_and_noise(p)))
            .filter(|p| p.chars().count() >= 2)
            .collect();
        slash_parts.sort_by_key(|p| if p.chars().any(is_cjk_char) { 0 } else { 1 });
        for sp in slash_parts {
            if !variants.contains(&sp) {
                variants.push(sp);
            }
        }
    }

    let clean_art = extract_primary_artist(&strip_brackets_and_noise(artist_hint));

    for v in &variants {
        if !clean_art.is_empty() {
            let q_with_art = format!("{} {}", v, clean_art);
            if let Some(res) = search_lrclib_lyrics(&q_with_art, v, &clean_art, duration_secs) {
                return Some(res);
            }
            if let Some(lines) = search_netease_lyrics(&q_with_art, v, &clean_art, duration_secs) {
                return Some(("NetEase LRC".to_string(), lines));
            }
        }
        if let Some(res) = search_lrclib_lyrics(v, v, &clean_art, duration_secs) {
            return Some(res);
        }
        if let Some(lines) = search_netease_lyrics(v, v, &clean_art, duration_secs) {
            return Some(("NetEase LRC".to_string(), lines));
        }
    }
    None
}

/// Tự động tách và ghép lời cho các bản Mashup 2in1 / 3in1 có dạng `"Bài A x Bài B"`
fn resolve_mashup_x_lyrics(
    song_expr: &str,
    artist_hint: &str,
    duration_secs: f64,
) -> Option<(String, Vec<LyricLine>)> {
    let normalized = song_expr.replace(" X ", " x ").replace(" × ", " x ");
    if !normalized.contains(" x ") {
        return None;
    }
    let parts: Vec<String> = normalized
        .split(" x ")
        .map(|p| strip_song_feat_suffix(&strip_brackets_and_noise(p)))
        .filter(|p| p.chars().count() >= 2 && !is_generic_platform_or_non_song(p, ""))
        .collect();
    if parts.len() < 2 || parts.len() > 4 {
        return None;
    }

    let mut fetched_parts: Vec<(String, Vec<LyricLine>)> = Vec::new();
    for p in &parts {
        if let Some((_src, lines)) = find_single_song_lyrics(p, artist_hint, 0.0) {
            if !lines.is_empty() {
                fetched_parts.push((p.clone(), lines));
            }
        }
    }
    if fetched_parts.is_empty() {
        return None;
    }
    if fetched_parts.len() == 1 {
        let (name, lines) = fetched_parts.into_iter().next()?;
        return Some((format!("Trực tuyến · {}", name), lines));
    }

    let mut combined: Vec<LyricLine> = Vec::new();
    let mut current_offset = 0.0_f64;
    let part_count = fetched_parts.len();

    for (idx, (name, lines)) in fetched_parts.into_iter().enumerate() {
        combined.push(LyricLine {
            time: current_offset,
            text: format!("🎵 {}", name),
        });
        let first_t = lines.first().map(|l| l.time).unwrap_or(0.0);
        let shift_in_part = if idx > 0 && first_t > 8.0 {
            first_t - 2.0
        } else {
            0.0
        };
        let mut last_line_time = current_offset;
        for l in lines {
            let adj_t = (current_offset + (l.time - shift_in_part).max(0.5)).max(current_offset);
            last_line_time = adj_t;
            combined.push(LyricLine {
                time: (adj_t * 100.0).round() / 100.0,
                text: l.text,
            });
        }
        if idx + 1 < part_count {
            let even_split = if duration_secs > 90.0 {
                (duration_secs / (part_count as f64)) * ((idx + 1) as f64)
            } else {
                0.0
            };
            current_offset = if even_split > 30.0 && even_split < last_line_time {
                even_split
            } else {
                last_line_time + 4.0
            };
        }
    }

    combined.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    Some(("Mashup Auto-Sync".to_string(), combined))
}

fn find_best_song_lyrics_with_meta(
    query: &str,
    expected_title: &str,
    expected_artist: &str,
    duration_secs: f64,
) -> Option<(String, Vec<LyricLine>)> {
    let cleaned = strip_brackets_and_noise(query);
    let q = if cleaned.len() >= 2 { &cleaned } else { query };
    let exp_t = if expected_title.trim().is_empty() {
        q
    } else {
        expected_title
    };

    // 1. Thử tìm trực tiếp theo tên bài (kèm tách "/" song ngữ nếu có)
    if let Some(res) = find_single_song_lyrics(exp_t, expected_artist, duration_secs) {
        return Some(res);
    }

    // 2. Thử tìm với toàn bộ chuỗi query
    if q != exp_t {
        if let Some(res) = search_lrclib_lyrics(q, exp_t, expected_artist, duration_secs) {
            return Some(res);
        }
        if let Some(lines) = search_netease_lyrics(q, exp_t, expected_artist, duration_secs) {
            return Some(("NetEase LRC".to_string(), lines));
        }
    }

    // 3. Nếu tên bài là Mashup "Bài A x Bài B", tự động tìm từng bài và ghép nối
    if let Some(res) = resolve_mashup_x_lyrics(exp_t, expected_artist, duration_secs) {
        return Some(res);
    }

    None
}

fn find_best_song_lyrics(query: &str) -> Option<(String, Vec<LyricLine>)> {
    find_best_song_lyrics_with_meta(query, query, "", 0.0)
}

#[allow(dead_code)]
fn parse_timestamp_prefix(line: &str) -> Option<(f64, String)> {
    let trimmed = line.trim();
    // Look for mm:ss or hh:mm:ss at start of line (or after track number like "1. 0:00 Song")
    let tokens: Vec<&str> = trimmed.split_whitespace().collect();
    for (idx, &tok) in tokens.iter().take(3).enumerate() {
        let clean_tok = tok.trim_matches(|c: char| !c.is_ascii_digit() && c != ':');
        let parts: Vec<&str> = clean_tok.split(':').collect();
        if parts.len() == 2 || parts.len() == 3 {
            if parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
                let secs = if parts.len() == 2 {
                    let m = parts[0].parse::<f64>().ok()?;
                    let s = parts[1].parse::<f64>().ok()?;
                    m * 60.0 + s
                } else {
                    let h = parts[0].parse::<f64>().ok()?;
                    let m = parts[1].parse::<f64>().ok()?;
                    let s = parts[2].parse::<f64>().ok()?;
                    h * 3600.0 + m * 60.0 + s
                };
                let rest = tokens[idx + 1..].join(" ");
                let song_name = rest
                    .trim_start_matches(|c: char| c == '-' || c == '–' || c == '—' || c == '.' || c == '|' || c.is_whitespace())
                    .trim()
                    .to_string();
                if song_name.len() >= 2 {
                    return Some((secs, song_name));
                }
            }
        }
    }
    None
}

#[allow(dead_code)]
fn unescape_youtube_json_string(raw: &str) -> String {
    let wrapped = format!("\"{}\"", raw);
    serde_json::from_str::<String>(&wrapped).unwrap_or_else(|_| {
        raw.replace("\\n", "\n")
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    })
}

#[allow(dead_code)]
fn fetch_youtube_description(title: &str, artist: &str) -> Option<String> {
    let q = format!("{} {}", title, artist);
    let search_url = format!(
        "https://www.youtube.com/results?search_query={}",
        url_encode(q.trim())
    );
    let html = curl_get(&search_url, None)?;
    let marker = "\"videoId\":\"";
    let pos = html.find(marker)?;
    let rest = &html[pos + marker.len()..];
    let end = rest.find('"')?;
    let video_id = &rest[..end];
    if video_id.len() != 11 {
        return None;
    }

    let watch_url = format!("https://www.youtube.com/watch?v={}", video_id);
    let watch_html = curl_get(&watch_url, None)?;
    let desc_marker = "\"shortDescription\":\"";
    let dpos = watch_html.find(desc_marker)?;
    let drest = &watch_html[dpos + desc_marker.len()..];

    let mut escaped = String::new();
    let mut chars = drest.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            escaped.push('\\');
            if let Some(next_ch) = chars.next() {
                escaped.push(next_ch);
            }
        } else if ch == '"' {
            break;
        } else {
            escaped.push(ch);
        }
    }
    Some(unescape_youtube_json_string(&escaped))
}

#[allow(dead_code)]
fn resolve_youtube_description_lyrics(
    title: &str,
    artist: &str,
    duration_secs: f64,
) -> Option<(String, Vec<LyricLine>)> {
    let desc = fetch_youtube_description(title, artist)?;

    // 1. Check if description has a timestamped Playlist tracklist (e.g., "0:00 Nếu biết đó là lần cuối\n3:49 Ngàn năm ánh sáng...")
    let mut chapters: Vec<(f64, String)> = Vec::new();
    for line in desc.lines() {
        if let Some((sec, name)) = parse_timestamp_prefix(line) {
            let low = name.to_lowercase();
            if !low.starts_with("version") && !low.starts_with("verson") && !low.starts_with("intro") {
                chapters.push((sec, name));
            }
        }
    }

    if chapters.len() >= 2 {
        chapters.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        let chap_slice = &chapters[..chapters.len().min(60)];
        let combined: Vec<LyricLine> = chap_slice
            .iter()
            .enumerate()
            .map(|(i, (start_sec, song_name))| LyricLine {
                time: *start_sec,
                text: format!("🎵 {:02}. {}", i + 1, song_name),
            })
            .collect();

        if !combined.is_empty() {
            return Some(("YouTube Tracklist".to_string(), combined));
        }
    }

    // 2. Check if description mentions original song title inside 《...》 (e.g. 《哪里都是你》)
    if let (Some(open_b), Some(close_b)) = (desc.find('《'), desc.find('》')) {
        if open_b < close_b {
            let orig_name = desc[open_b + '《'.len_utf8()..close_b].trim();
            if !orig_name.is_empty() {
                if let Some((_, mut lrc_lines)) = find_best_song_lyrics(orig_name) {
                    // Check if description also has Pinyin/Viet lines we can pair or if LRC is ready
                    if !lrc_lines.is_empty() {
                        lrc_lines.insert(
                            0,
                            LyricLine {
                                time: 0.0,
                                text: format!("🎵 {} ({})", strip_brackets_and_noise(title), orig_name),
                            },
                        );
                        return Some(("YouTube + NetEase LRC".to_string(), lrc_lines));
                    }
                }
            }
        }
    }

    // 3. Check if description contains "Pinyin:" or "Lời bài hát:" or a lyric block
    let mut lyric_block: Vec<String> = Vec::new();
    let mut in_lyrics = false;
    for line in desc.lines() {
        let tr = line.trim();
        let low = tr.to_lowercase();
        if low.starts_with("pinyin:")
            || low.starts_with("lời bài hát")
            || low.starts_with("lyrics")
            || low.starts_with("lyric:")
            || low.starts_with("lời:")
            || low.starts_with("lời nhạc")
            || low.starts_with("[verse")
            || low.starts_with("[chorus")
            || low.starts_with("[intro")
        {
            in_lyrics = true;
            if low.starts_with("[") {
                lyric_block.push(tr.to_string());
            }
            continue;
        }
        if in_lyrics {
            if tr.starts_with("---")
                || tr.starts_with("===")
                || tr.starts_with("___")
                || low.starts_with("vui lòng không")
                || low.starts_with("follow ")
                || low.starts_with("subscribe")
                || low.starts_with("connect with")
                || low.starts_with("#")
            {
                if lyric_block.len() >= 6 {
                    break;
                } else {
                    continue;
                }
            }
            if !tr.is_empty() && !low.starts_with("http") && !low.starts_with("link ") {
                lyric_block.push(tr.trim_end_matches(',').to_string());
            }
        }
    }

    if lyric_block.len() >= 6 {
        let total_dur = if duration_secs > 30.0 && duration_secs < 600.0 {
            duration_secs * 0.88
        } else {
            (lyric_block.len() as f64) * 3.8
        };
        let step = (total_dur / (lyric_block.len() as f64)).clamp(2.5, 5.5);
        let lines = lyric_block
            .into_iter()
            .enumerate()
            .map(|(i, text)| LyricLine {
                time: 8.0 + (i as f64) * step,
                text,
            })
            .collect();
        return Some(("YouTube Description".to_string(), lines));
    }

    None
}

#[tauri::command]
async fn fetch_lyrics_smart(
    title: String,
    artist: String,
    duration_secs: f64,
    force_refresh: Option<bool>,
) -> Result<LyricsResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if is_generic_platform_or_non_song(&title, &artist) {
            return LyricsResponse {
                found: false,
                source: String::new(),
                lines: Vec::new(),
            };
        }

        let clean_t = strip_brackets_and_noise(&title);
        let clean_a = strip_brackets_and_noise(&artist);
        if clean_t.is_empty() || is_generic_platform_or_non_song(&clean_t, &clean_a) {
            return LyricsResponse {
                found: false,
                source: String::new(),
                lines: Vec::new(),
            };
        }

        let cache_key = format!(
            "{}|{}|{}",
            clean_t.to_lowercase(),
            clean_a.to_lowercase(),
            (duration_secs / 4.0).round() as i32
        );
        if !force_refresh.unwrap_or(false) {
            if let Ok(guard) = LYRICS_CACHE.lock() {
                if let Some(map) = guard.as_ref() {
                    if let Some((_, cached)) = map.get(&cache_key) {
                        return cached.clone();
                    }
                }
            }
        }

        let cache_store = |resp: &LyricsResponse| {
            if !resp.found || resp.lines.is_empty() {
                return;
            }
            if let Ok(mut guard) = LYRICS_CACHE.lock() {
                let map = guard.get_or_insert_with(HashMap::new);
                if map.len() >= 64 && !map.contains_key(&cache_key) {
                    if let Some(oldest_key) = map
                        .iter()
                        .min_by_key(|(_, (seq, _))| *seq)
                        .map(|(k, _)| k.clone())
                    {
                        map.remove(&oldest_key);
                    }
                }
                let seq = LYRICS_CACHE_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
                map.insert(cache_key.clone(), (seq, resp.clone()));
            }
        };

        // 0. Nếu là video tổng hợp / Playlist dài (> 10 phút) hoặc tiêu đề có chữ Playlist / Tổng hợp / BXH, ưu tiên bóc tách mô tả YouTube trước
        let low_title = title.to_lowercase();
        let is_playlist_like = duration_secs > 600.0
            || low_title.contains("playlist")
            || low_title.contains("tổng hợp")
            || low_title.contains("bxh ")
            || low_title.contains("nhạc trẻ")
            || low_title.contains("nonstop")
            || low_title.contains("lofi");
        if is_playlist_like {
            if let Some((src, lines)) = resolve_youtube_description_lyrics(&title, &artist, duration_secs) {
                let resp = LyricsResponse {
                    found: true,
                    source: src,
                    lines,
                };
                cache_store(&resp);
                return resp;
            }
            // Với video mix/tổng hợp dài trên 12 phút không có tracklist mô tả, dừng ngay để không gọi curl tìm lời đơn lẻ gây tốn CPU/Disk
            if duration_secs > 720.0 {
                return LyricsResponse {
                    found: false,
                    source: String::new(),
                    lines: Vec::new(),
                };
            }
        }

        let a_prim = extract_primary_artist(&clean_a);

        // 1. Nếu tiêu đề chứa dấu " - " (có thể 2 hoặc 3 nhánh như "Quan Sơn Tửu / 关山酒 - Đẳng Thập Yêu Quân - ThinhGia Remix")
        let dash_segs: Vec<&str> = clean_t
            .split(" - ")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        if dash_segs.len() >= 2 {
            let seg0 = dash_segs[0];
            let seg1 = dash_segs[1];
            let seg0_song = strip_song_feat_suffix(seg0);
            let seg1_song = strip_song_feat_suffix(seg1);
            let seg0_prim = extract_primary_artist(seg0);
            let seg1_prim = extract_primary_artist(seg1);

            // Kiểm tra xem seg0 có trùng với tên kênh/ca sĩ không (vd: "Sơn Tùng M-TP - Hãy Trao Cho Anh")
            let seg0_tokens = normalize_for_match(seg0);
            let art_tokens = normalize_for_match(&clean_a);
            let seg0_is_artist = !art_tokens.is_empty()
                && token_overlap_ratio(&seg0_tokens, &art_tokens) >= 0.6;

            let pairs: [(&str, &str, &str); 2] = if seg0_is_artist {
                [
                    (&seg1_song, &seg0_prim, seg0),
                    (&seg0_song, &seg1_prim, seg1),
                ]
            } else {
                [
                    (&seg0_song, &seg1_prim, seg1),
                    (&seg1_song, &seg0_prim, seg0),
                ]
            };

            for (song_cand, partner_prim, partner_raw) in pairs {
                if !is_generic_platform_or_non_song(song_cand, partner_raw) {
                    let eff_art = if !partner_prim.is_empty()
                        && !is_generic_platform_or_non_song(partner_prim, "")
                    {
                        partner_prim
                    } else {
                        &a_prim
                    };
                    if let Some((src, lines)) =
                        find_best_song_lyrics_with_meta(&clean_t, song_cand, eff_art, duration_secs)
                    {
                        let resp = LyricsResponse {
                            found: true,
                            source: src,
                            lines,
                        };
                        cache_store(&resp);
                        return resp;
                    }
                }
            }
        }

        // 2. Nếu tiêu đề gốc có dấu "|" (vd: "海屿你 x 就忘了吧DJ 2026 | Biển, Đảo Và Em x Thôi Hãy Quên Đi Remix"), thử từng vế
        if title.contains('|') {
            for raw_seg in title.split('|') {
                let seg_clean = strip_brackets_and_noise(raw_seg);
                if seg_clean.chars().count() >= 2
                    && !is_generic_platform_or_non_song(&seg_clean, &clean_a)
                {
                    let seg_song = if let Some((s0, _)) = seg_clean.split_once(" - ") {
                        strip_song_feat_suffix(s0.trim())
                    } else {
                        strip_song_feat_suffix(&seg_clean)
                    };
                    if let Some((src, lines)) =
                        find_best_song_lyrics_with_meta(&seg_clean, &seg_song, &a_prim, duration_secs)
                    {
                        let resp = LyricsResponse {
                            found: true,
                            source: src,
                            lines,
                        };
                        cache_store(&resp);
                        return resp;
                    }
                }
            }
        }

        // 3. Tìm kiếm có chấm điểm theo cụm từ kết hợp "Tên bài + Nghệ sĩ"
        if !clean_t.is_empty() {
            let song_only = strip_song_feat_suffix(&clean_t);
            let combined = if !clean_a.is_empty() {
                format!("{} {}", song_only, clean_a)
            } else {
                song_only.clone()
            };
            if let Some((src, lines)) =
                find_best_song_lyrics_with_meta(&combined, &song_only, &clean_a, duration_secs)
            {
                let resp = LyricsResponse {
                    found: true,
                    source: src,
                    lines,
                };
                cache_store(&resp);
                return resp;
            }
            if let Some((src, lines)) =
                find_best_song_lyrics_with_meta(&clean_t, &song_only, &clean_a, duration_secs)
            {
                let resp = LyricsResponse {
                    found: true,
                    source: src,
                    lines,
                };
                cache_store(&resp);
                return resp;
            }
        }

        // 4. Dự phòng khớp chính xác theo tên bài + nghệ sĩ
        if !clean_t.is_empty() && !clean_a.is_empty() {
            if let Some(lines) = fetch_lrclib_exact(&clean_t, &clean_a, duration_secs) {
                let resp = LyricsResponse {
                    found: true,
                    source: "Trực tuyến".into(),
                    lines,
                };
                cache_store(&resp);
                return resp;
            }
        }

        // 5. Dự phòng: bóc tách lời từ phần mô tả YouTube nếu có
        if !is_playlist_like {
            if let Some((src, lines)) = resolve_youtube_description_lyrics(&title, &artist, duration_secs) {
                let resp = LyricsResponse {
                    found: true,
                    source: src,
                    lines,
                };
                cache_store(&resp);
                return resp;
            }
        }

        LyricsResponse {
            found: false,
            source: String::new(),
            lines: Vec::new(),
        }
    })
    .await
    .map_err(|e| e.to_string())
}

// ============================================================
// WINDOWS GSMTC & HARDWARE MONITOR
// ============================================================
fn join_async_timeout<T: windows::core::RuntimeType>(
    op: windows_future::IAsyncOperation<T>,
    timeout_ms: u64,
) -> Option<T> {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        match op.Status() {
            Ok(windows_future::AsyncStatus::Started) => {
                if Instant::now() >= deadline {
                    let _ = op.Cancel();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(6));
            }
            Ok(windows_future::AsyncStatus::Completed) => {
                return op.GetResults().ok();
            }
            _ => return None,
        }
    }
}

fn read_thumbnail_base64(thumb_ref: &IRandomAccessStreamReference) -> Option<String> {
    let stream = thumb_ref
        .OpenReadAsync()
        .ok()
        .and_then(|op| join_async_timeout(op, 350))?;
    let size = stream.Size().ok()? as u32;
    if size == 0 || size > 4 * 1024 * 1024 {
        return None;
    }
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    let loaded = reader
        .LoadAsync(size)
        .ok()
        .and_then(|op| join_async_timeout(op, 350))?;
    if loaded == 0 {
        return None;
    }
    let mut buf = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut buf).ok()?;
    let mime = if buf.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else {
        "image/jpeg"
    };
    Some(format!("data:{};base64,{}", mime, base64_encode(&buf)))
}

fn pick_best_session(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
) -> Option<GlobalSystemMediaTransportControlsSession> {
    let sessions = manager.GetSessions().ok()?;
    let count = sessions.Size().unwrap_or(0);
    if count == 0 {
        return None;
    }
    let mut fallback: Option<GlobalSystemMediaTransportControlsSession> = None;
    for i in 0..count {
        if let Ok(s) = sessions.GetAt(i) {
            if let Ok(info) = s.GetPlaybackInfo() {
                if let Ok(status) = info.PlaybackStatus() {
                    if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                        return Some(s);
                    }
                    if status != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed
                        && fallback.is_none()
                    {
                        fallback = Some(s);
                    }
                }
            }
        }
    }
    if let Ok(curr) = manager.GetCurrentSession() {
        if let Ok(info) = curr.GetPlaybackInfo() {
            if let Ok(status) = info.PlaybackStatus() {
                if status != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed {
                    return Some(curr);
                }
            }
        }
    }
    fallback
}

#[allow(dead_code)]
fn current_windows_universal_ticks() -> i64 {
    const EPOCH_DIFF_TICKS: i64 = 116_444_736_000_000_000;
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| (d.as_nanos() / 100) as i64 + EPOCH_DIFF_TICKS)
        .unwrap_or(0)
}

fn fetch_media_on_mta_thread(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
    thumb_cache: &mut Option<(String, String)>,
    meta_cache: &mut CachedSongMeta,
    tracker: &mut Option<TimelineTracker>,
    audio_peak: f32,
) -> MediaInfo {
    let session = match pick_best_session(manager) {
        Some(s) => s,
        None => {
            *meta_cache = CachedSongMeta::default();
            *tracker = None;
            return MediaInfo::default();
        }
    };

    let source_app = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();

    let status_opt = session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .ok();
    if status_opt.is_none()
        || status_opt == Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed)
    {
        *meta_cache = CachedSongMeta::default();
        *tracker = None;
        return MediaInfo::default();
    }
    let mut playing =
        status_opt == Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);

    let timeline_opt = session.GetTimelineProperties().ok();
    let (mut start_ticks, mut end_ticks, mut pos_ticks, mut last_updated) = (0i64, 0i64, 0i64, 0i64);
    if let Some(ref timeline) = timeline_opt {
        start_ticks = timeline.StartTime().map(|t| t.Duration).unwrap_or(0);
        end_ticks = timeline.EndTime().map(|t| t.Duration).unwrap_or(0);
        pos_ticks = timeline.Position().map(|t| t.Duration).unwrap_or(0);
        last_updated = timeline
            .LastUpdatedTime()
            .map(|dt| dt.UniversalTime)
            .unwrap_or(0);
    }

    let base_rel_ticks = (pos_ticks - start_ticks).max(0);
    let base_secs = base_rel_ticks as f64 / 10_000_000.0;

    let refresh_interval_ms = if playing && base_secs < 4.5 {
        900
    } else if playing {
        2200
    } else {
        3500
    };

    let need_props_refresh = meta_cache.title.is_empty()
        || meta_cache.source_app != source_app
        || meta_cache.last_playing != playing
        || meta_cache.last_end_ticks != end_ticks
        || (base_secs + 1.5 < meta_cache.last_base_secs)
        || meta_cache
            .last_props_at
            .map(|t| t.elapsed() >= Duration::from_millis(refresh_interval_ms))
            .unwrap_or(true);

    let (mut title, mut artist, mut album, mut thumbnail_b64) = (
        meta_cache.title.clone(),
        meta_cache.artist.clone(),
        meta_cache.album.clone(),
        meta_cache.thumbnail_b64.clone(),
    );

    if need_props_refresh {
        if let Some(props) = session
            .TryGetMediaPropertiesAsync()
            .ok()
            .and_then(|op| join_async_timeout(op, 350))
        {
            title = props.Title().map(|s| s.to_string()).unwrap_or_default();
            artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
            if artist.trim().is_empty() {
                artist = props
                    .AlbumArtist()
                    .map(|s| s.to_string())
                    .unwrap_or_default();
            }
            album = props
                .AlbumTitle()
                .map(|s| s.to_string())
                .unwrap_or_default();

            let cache_key = format!("{}|{}", title, artist);
            thumbnail_b64.clear();
            if !title.is_empty() {
                if let Some((ref k, ref cached_b64)) = *thumb_cache {
                    if k == &cache_key {
                        thumbnail_b64 = cached_b64.clone();
                    }
                }
                if thumbnail_b64.is_empty() {
                    if let Ok(thumb_ref) = props.Thumbnail() {
                        if let Some(b64) = read_thumbnail_base64(&thumb_ref) {
                            thumbnail_b64 = b64.clone();
                            *thumb_cache = Some((cache_key, b64));
                        }
                    }
                }
            }

            meta_cache.source_app = source_app.clone();
            meta_cache.title = title.clone();
            meta_cache.artist = artist.clone();
            meta_cache.album = album.clone();
            meta_cache.thumbnail_b64 = thumbnail_b64.clone();
            meta_cache.last_props_at = Some(Instant::now());
        } else {
            // Phiên nhạc đã đóng hoặc không phản hồi RPC trong 350ms -> xóa cache ngay để không kẹt trạng thái cũ
            *meta_cache = CachedSongMeta::default();
            *tracker = None;
            return MediaInfo::default();
        }
    }
    meta_cache.last_playing = playing;
    meta_cache.last_base_secs = base_secs;
    meta_cache.last_end_ticks = end_ticks;

    if title.trim().is_empty() {
        *meta_cache = CachedSongMeta::default();
        *tracker = None;
        return MediaInfo::default();
    }

    let song_key = format!("{}|{}", title, artist);
    let mut position_secs = 0.0;
    let mut duration_secs = 0.0;

    if timeline_opt.is_some() {
        if end_ticks > start_ticks {
            duration_secs = (end_ticks - start_ticks) as f64 / 10_000_000.0;
        }

        let now_ut = current_windows_universal_ticks();
        let ut_delta_secs = if last_updated > 0 && now_ut >= last_updated {
            ((now_ut - last_updated) as f64) / 10_000_000.0
        } else {
            -1.0
        };
        let valid_ut_delta = (0.0..=86400.0).contains(&ut_delta_secs)
            && (duration_secs <= 0.0 || base_secs + ut_delta_secs <= duration_secs + 5.0);

        let now = Instant::now();

        match tracker {
            Some(t)
                if t.key == song_key
                    && t.raw_pos_ticks == base_rel_ticks
                    && t.raw_last_updated == last_updated =>
            {
                let dt = now.duration_since(t.recorded_at).as_secs_f64();
                t.recorded_at = now;
                if playing && audio_peak < 0.0004 {
                    t.silent_secs += dt;
                } else {
                    t.silent_secs = 0.0;
                }
                // Nếu bài hát đã chạy hết thời lượng mà trình phát vẫn treo trạng thái Playing không có tiếng >= 2s -> chuyển về tạm dừng
                let est_pos = (base_secs + ut_delta_secs.max(0.0) - t.pause_offset_secs).max(0.0);
                if playing
                    && duration_secs > 0.0
                    && est_pos >= duration_secs
                    && t.silent_secs >= 2.0
                {
                    playing = false;
                }
                if !playing {
                    t.pause_offset_secs += dt;
                    position_secs = t.last_playing_pos_secs;
                } else if valid_ut_delta {
                    position_secs =
                        (base_secs + ut_delta_secs - t.pause_offset_secs).max(0.0);
                    t.last_playing_pos_secs = position_secs;
                } else {
                    t.last_playing_pos_secs += dt;
                    position_secs = t.last_playing_pos_secs;
                }
                t.was_playing = playing;
            }
            _ => {
                // Trình duyệt vừa cập nhật mốc thời gian mới (khi chuyển bài hoặc người dùng vừa tua thanh nhạc)
                let initial_pos = if playing && valid_ut_delta {
                    base_secs + ut_delta_secs
                } else {
                    base_secs
                };
                position_secs = initial_pos;
                *tracker = Some(TimelineTracker {
                    key: song_key,
                    raw_pos_ticks: base_rel_ticks,
                    raw_last_updated: last_updated,
                    pause_offset_secs: 0.0,
                    last_playing_pos_secs: initial_pos,
                    recorded_at: now,
                    was_playing: playing,
                    silent_secs: 0.0,
                });
            }
        }

        if duration_secs > 0.0 && position_secs > duration_secs {
            position_secs = duration_secs;
        }
    }

    MediaInfo {
        has_session: true,
        playing,
        title,
        artist,
        album,
        source_app,
        position_secs,
        duration_secs,
        thumbnail_b64,
        audio_peak,
    }
}

fn execute_media_cmd_on_mta(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
    action: &str,
    position_secs: Option<f64>,
) {
    if let Some(session) = pick_best_session(manager) {
        let _ = match action {
            "play_pause" => session
                .TryTogglePlayPauseAsync()
                .ok()
                .and_then(|op| join_async_timeout(op, 350)),
            "play" => session
                .TryPlayAsync()
                .ok()
                .and_then(|op| join_async_timeout(op, 350)),
            "pause" => session
                .TryPauseAsync()
                .ok()
                .and_then(|op| join_async_timeout(op, 350)),
            "next" => session
                .TrySkipNextAsync()
                .ok()
                .and_then(|op| join_async_timeout(op, 350)),
            "prev" => session
                .TrySkipPreviousAsync()
                .ok()
                .and_then(|op| join_async_timeout(op, 350)),
            "seek" => {
                let ticks = (position_secs.unwrap_or(0.0) * 10_000_000.0) as i64;
                session
                    .TryChangePlaybackPositionAsync(ticks)
                    .ok()
                    .and_then(|op| join_async_timeout(op, 350))
            }
            _ => None,
        };
    }
}

#[tauri::command]
fn get_system_media(
    state: tauri::State<'_, AppSharedState>,
    known_song_key: Option<String>,
) -> MediaInfo {
    if let Ok(m) = state.media.lock() {
        let mta_age_secs = state
            .media_updated_at
            .lock()
            .ok()
            .and_then(|g| *g)
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or(99.0);
        // Nếu luồng MTA không cập nhật quá 2.5s (do trình duyệt vừa tắt đột ngột), trả về rỗng ngay để UI thoát trạng thái phát nhạc
        if mta_age_secs > 2.5 {
            return MediaInfo::default();
        }
        let cur_key = format!("{}|{}", m.title, m.artist);
        let skip_thumb = known_song_key
            .as_deref()
            .map(|k| !k.is_empty() && k == cur_key)
            .unwrap_or(false);
        let extra_elapsed = if m.playing && (m.audio_peak >= 0.0005 || m.position_secs >= 1.8) {
            mta_age_secs.min(0.45)
        } else {
            0.0
        };
        let mut live_pos = m.position_secs + extra_elapsed;
        if m.duration_secs > 0.0 && live_pos > m.duration_secs {
            live_pos = m.duration_secs;
        }
        MediaInfo {
            has_session: m.has_session,
            playing: m.playing,
            title: m.title.clone(),
            artist: m.artist.clone(),
            album: m.album.clone(),
            source_app: m.source_app.clone(),
            position_secs: live_pos,
            duration_secs: m.duration_secs,
            thumbnail_b64: if skip_thumb {
                String::new()
            } else {
                m.thumbnail_b64.clone()
            },
            audio_peak: m.audio_peak,
        }
    } else {
        MediaInfo::default()
    }
}

#[tauri::command]
fn get_hardware_tick(state: tauri::State<'_, AppSharedState>) -> HardwareTick {
    state.hw.lock().map(|h| h.clone()).unwrap_or_default()
}

#[tauri::command]
fn take_dropped_files(state: tauri::State<'_, AppSharedState>) -> Vec<DroppedFileItem> {
    if let Ok(mut list) = state.dropped_files.lock() {
        std::mem::take(&mut *list)
    } else {
        Vec::new()
    }
}

fn sleep_interruptible(ms: u64, run_id: u64) -> bool {
    let mut rem = ms;
    while rem > 0 {
        if ALARM_STOP_FLAG.load(Ordering::Relaxed)
            || ALARM_RUN_ID.load(Ordering::Relaxed) != run_id
        {
            return false;
        }
        let step = rem.min(60);
        std::thread::sleep(Duration::from_millis(step));
        rem -= step;
    }
    !ALARM_STOP_FLAG.load(Ordering::Relaxed) && ALARM_RUN_ID.load(Ordering::Relaxed) == run_id
}

#[tauri::command]
fn stop_native_alert() {
    ALARM_STOP_FLAG.store(true, Ordering::Relaxed);
    ALARM_RUN_ID.fetch_add(1, Ordering::Relaxed);
}

#[tauri::command]
fn play_native_alert(kind: String, duration_secs: Option<u32>, style: Option<String>) {
    ALARM_STOP_FLAG.store(false, Ordering::Relaxed);
    let my_run_id = ALARM_RUN_ID.fetch_add(1, Ordering::Relaxed) + 1;
    let dur = duration_secs.unwrap_or(1).clamp(1, 120);
    let mode = style.unwrap_or_else(|| "chime".to_string());

    std::thread::spawn(move || unsafe {
        let start = Instant::now();
        let max_dur = Duration::from_secs(dur as u64);
        let loop_mode = dur > 1 || mode == "alarm" || mode == "urgent";

        loop {
            if ALARM_STOP_FLAG.load(Ordering::Relaxed)
                || ALARM_RUN_ID.load(Ordering::Relaxed) != my_run_id
            {
                break;
            }
            if mode == "urgent" {
                for _ in 0..3 {
                    if ALARM_STOP_FLAG.load(Ordering::Relaxed)
                        || ALARM_RUN_ID.load(Ordering::Relaxed) != my_run_id
                    {
                        return;
                    }
                    let _ = Beep(1568, 95);
                    if !sleep_interruptible(35, my_run_id) {
                        return;
                    }
                    let _ = Beep(1175, 95);
                    if !sleep_interruptible(55, my_run_id) {
                        return;
                    }
                }
            } else {
                match kind.as_str() {
                    "pomo" => {
                        let _ = Beep(784, 130);
                        if !sleep_interruptible(35, my_run_id) {
                            return;
                        }
                        let _ = Beep(988, 130);
                        if !sleep_interruptible(35, my_run_id) {
                            return;
                        }
                        let _ = Beep(1175, 190);
                        if !sleep_interruptible(80, my_run_id) {
                            return;
                        }
                        let _ = Beep(1568, 280);
                    }
                    "water" => {
                        let _ = Beep(659, 130);
                        if !sleep_interruptible(45, my_run_id) {
                            return;
                        }
                        let _ = Beep(880, 160);
                        if !sleep_interruptible(45, my_run_id) {
                            return;
                        }
                        let _ = Beep(1046, 220);
                    }
                    _ => {
                        let _ = Beep(880, 120);
                        if !sleep_interruptible(40, my_run_id) {
                            return;
                        }
                        let _ = Beep(1175, 180);
                    }
                }
            }

            if !loop_mode || start.elapsed() >= max_dur {
                break;
            }
            if !sleep_interruptible(if mode == "urgent" { 180 } else { 360 }, my_run_id) {
                break;
            }
            if start.elapsed() >= max_dur {
                break;
            }
        }
    });
}

#[derive(Serialize, Deserialize)]
struct AiFileAttachment {
    name: String,
    is_image: bool,
    size_str: String,
    data: String,
}

#[tauri::command]
fn read_file_for_ai(path: String) -> Result<AiFileAttachment, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("Tệp không tồn tại".to_string());
    }
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let len = meta.len();
    let size_str = if len < 1024 {
        format!("{} B", len)
    } else if len < 1024 * 1024 {
        format!("{:.1} KB", len as f64 / 1024.0)
    } else {
        format!("{:.1} MB", len as f64 / (1024.0 * 1024.0))
    };

    let is_img = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp");
    if is_img {
        if len > 15 * 1024 * 1024 {
            return Err("Ảnh quá lớn (vượt quá 15MB)".to_string());
        }
        let bytes = std::fs::read(&path).map_err(|e| format!("Không thể đọc ảnh: {}", e))?;
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            _ => "image/png",
        };
        let b64 = base64_encode(&bytes);
        Ok(AiFileAttachment {
            name,
            is_image: true,
            size_str,
            data: format!("data:{};base64,{}", mime, b64),
        })
    } else {
        if len > 5 * 1024 * 1024 {
            return Err("Tệp văn bản quá lớn (vượt quá 5MB)".to_string());
        }
        let text = std::fs::read_to_string(&path)
            .map_err(|_| "Tệp không phải định dạng văn bản UTF-8.".to_string())?;
        Ok(AiFileAttachment {
            name,
            is_image: false,
            size_str,
            data: text,
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct DeviceLocationInfo {
    lat: f64,
    lon: f64,
    city_label: String,
    full_address: String,
    source: String,
}

fn shorten_vn_city_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let lower = trimmed.to_lowercase();
    if lower.contains("hồ chí minh") || lower == "ho chi minh city" || lower == "ho chi minh" {
        return "TP.HCM".to_string();
    }
    if lower == "thành phố hà nội" || lower == "hanoi" || lower == "ha noi" {
        return "Hà Nội".to_string();
    }
    if lower == "thành phố đà nẵng" || lower == "da nang" {
        return "Đà Nẵng".to_string();
    }
    if lower == "thành phố hải phòng" || lower == "hai phong" {
        return "Hải Phòng".to_string();
    }
    if lower == "thành phố cần thơ" || lower == "can tho" {
        return "Cần Thơ".to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("Thành phố ") {
        return rest.trim().to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("Tỉnh ") {
        return rest.trim().to_string();
    }
    trimmed.to_string()
}

fn strip_vn_ward_prefix(raw: &str) -> String {
    let t = raw.trim();
    for prefix in ["Phường ", "Xã ", "Thị trấn "] {
        if let Some(rest) = t.strip_prefix(prefix) {
            return rest.trim().to_string();
        }
    }
    t.to_string()
}

fn reverse_geocode_vi(lat: f64, lon: f64) -> Option<(String, String)> {
    let url = format!(
        "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={:.5}&lon={:.5}&accept-language=vi",
        lat, lon
    );
    let raw = curl_get_with_ua(&url, "Island/1.2.0 (Windows)", 6)?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let addr = v.get("address");

    let pick_addr = |keys: &[&str]| -> String {
        if let Some(obj) = addr {
            for k in keys {
                if let Some(s) = obj.get(*k).and_then(|x| x.as_str()) {
                    let t = s.trim();
                    if !t.is_empty() {
                        return t.to_string();
                    }
                }
            }
        }
        String::new()
    };

    let road = pick_addr(&["road", "pedestrian", "neighbourhood", "quarter"]);
    let sub_area = pick_addr(&[
        "suburb",
        "city_district",
        "district",
        "county",
        "town",
        "village",
        "quarter",
        "neighbourhood",
    ]);
    let city_raw = pick_addr(&["city", "state", "province", "region"]);
    let city_short = shorten_vn_city_name(&city_raw);

    let city_label = if !sub_area.is_empty() && !city_short.is_empty() {
        let sub_clean = strip_vn_ward_prefix(&sub_area);
        if sub_clean.eq_ignore_ascii_case(&city_short) || sub_area.eq_ignore_ascii_case(&city_raw) {
            city_short.clone()
        } else {
            format!("{}, {}", sub_clean, city_short)
        }
    } else if !city_short.is_empty() {
        city_short.clone()
    } else if !sub_area.is_empty() {
        sub_area.clone()
    } else {
        "Vị trí hiện tại".to_string()
    };

    let mut addr_parts: Vec<String> = Vec::new();
    for part in [&road, &sub_area, &city_raw] {
        let p = part.trim();
        if !p.is_empty() && !addr_parts.iter().any(|existing| existing.eq_ignore_ascii_case(p)) {
            addr_parts.push(p.to_string());
        }
    }
    let full_address = if !addr_parts.is_empty() {
        addr_parts.join(", ")
    } else if let Some(disp) = v.get("display_name").and_then(|d| d.as_str()) {
        disp.split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && *s != "Việt Nam" && !s.chars().all(|c| c.is_ascii_digit()))
            .collect::<Vec<_>>()
            .join(", ")
    } else {
        city_label.clone()
    };

    Some((city_label, full_address))
}

#[tauri::command]
async fn detect_device_location(
    lat_hint: Option<f64>,
    lon_hint: Option<f64>,
) -> Result<DeviceLocationInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let valid_hint = match (lat_hint, lon_hint) {
            (Some(la), Some(lo))
                if la.is_finite()
                    && lo.is_finite()
                    && (-90.0..=90.0).contains(&la)
                    && (-180.0..=180.0).contains(&lo)
                    && (la.abs() > 0.001 || lo.abs() > 0.001) =>
            {
                Some((la, lo))
            }
            _ => None,
        };

        let (lat, lon, fallback_city, source) = if let Some((la, lo)) = valid_hint {
            (la, lo, "Vị trí GPS của bạn".to_string(), "GPS Thiết bị".to_string())
        } else {
            let mut found: Option<(f64, f64, String)> = None;
            if let Some(raw) = curl_get_with_ua("https://ipwho.is/", "Island/1.2.0 (Windows)", 5) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                    let ok = v.get("success").and_then(|s| s.as_bool()).unwrap_or(true);
                    if ok {
                        if let (Some(la), Some(lo)) = (
                            v.get("latitude").and_then(|x| x.as_f64()),
                            v.get("longitude").and_then(|x| x.as_f64()),
                        ) {
                            let c = v
                                .get("city")
                                .and_then(|x| x.as_str())
                                .or_else(|| v.get("region").and_then(|x| x.as_str()))
                                .unwrap_or("Vị trí hiện tại")
                                .to_string();
                            found = Some((la, lo, c));
                        }
                    }
                }
            }
            if found.is_none() {
                if let Some(raw) = curl_get_with_ua("https://ipapi.co/json/", "Island/1.2.0 (Windows)", 5) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                        if let (Some(la), Some(lo)) = (
                            v.get("latitude").and_then(|x| x.as_f64()),
                            v.get("longitude").and_then(|x| x.as_f64()),
                        ) {
                            let c = v
                                .get("city")
                                .and_then(|x| x.as_str())
                                .or_else(|| v.get("region").and_then(|x| x.as_str()))
                                .unwrap_or("Vị trí hiện tại")
                                .to_string();
                            found = Some((la, lo, c));
                        }
                    }
                }
            }
            match found {
                Some((la, lo, c)) => (la, lo, c, "Định vị GPS/Mạng".to_string()),
                None => return Err("Không thể tự động xác định vị trí của thiết bị".to_string()),
            }
        };

        let (city_label, full_address) = match reverse_geocode_vi(lat, lon) {
            Some((lbl, addr)) => (lbl, addr),
            None => {
                let short = shorten_vn_city_name(&fallback_city);
                let addr = if short.is_empty() {
                    fallback_city.clone()
                } else {
                    short.clone()
                };
                (addr.clone(), addr)
            }
        };

        Ok(DeviceLocationInfo {
            lat,
            lon,
            city_label,
            full_address,
            source,
        })
    })
    .await
    .map_err(|e| format!("Location task error: {}", e))?
}

#[tauri::command]
async fn query_ai_chat(
    app_handle: tauri::AppHandle,
    _provider: String,
    _endpoint: String,
    _api_key: String,
    model: String,
    thinking_level: Option<String>,
    system_prompt: String,
    user_prompt: String,
    images: Option<Vec<String>>,
    stream: Option<bool>,
    req_id: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Giải mã trực tiếp Endpoint & API Key AI Gateway từ kho khóa phân mảnh ARX trong nhân Rust
        let effective_key = unlock_embedded_vault_key();
        let mut base = unlock_embedded_vault_endpoint();
        if !base.ends_with("/v1") && !base.contains("/v1/") {
            base.push_str("/v1");
        }
        let url = format!("{}/chat/completions", base);
        zeroize_string(base);

        let level = thinking_level
            .as_deref()
            .unwrap_or("high")
            .trim()
            .to_lowercase();
        let req_model = model.trim();
        let target_model: String = if req_model.is_empty() || req_model.starts_with("ag/gemini-3.8-flash") {
            match level.as_str() {
                "fast" | "none" | "off" => "ag/gemini-3.8-flash".to_string(),
                "low" => "ag/gemini-3.8-flash-low".to_string(),
                "medium" => "ag/gemini-3.8-flash-medium".to_string(),
                _ => "ag/gemini-3.8-flash-high".to_string(),
            }
        } else if req_model.starts_with("ds/deepseek-v4-pro") {
            match level.as_str() {
                "fast" | "none" | "off" => "ds/deepseek-v4-pro-none".to_string(),
                "high" => "ds/deepseek-v4-pro-max".to_string(),
                _ => "ds/deepseek-v4-pro".to_string(),
            }
        } else if req_model == "ds/deepseek-chat" || req_model == "ds/deepseek-reasoner" {
            match level.as_str() {
                "fast" | "none" | "off" => "ds/deepseek-chat".to_string(),
                _ => "ds/deepseek-reasoner".to_string(),
            }
        } else {
            req_model.to_string()
        };

        let effective_system_prompt = match level.as_str() {
            "fast" | "none" | "off" => {
                if system_prompt.trim().is_empty() {
                    "Ưu tiên trả lời thẳng vào trọng tâm, cực kỳ ngắn gọn và nhanh chóng.".to_string()
                } else {
                    format!("{}\n\nƯu tiên trả lời thẳng vào trọng tâm, cực kỳ ngắn gọn và nhanh chóng.", system_prompt.trim())
                }
            }
            "high" => {
                if system_prompt.trim().is_empty() {
                    "Hãy suy luận cẩn thận, phân tích sâu sắc và đầy đủ các khía cạnh quan trọng trước khi đưa ra câu trả lời.".to_string()
                } else {
                    format!("{}\n\nHãy suy luận cẩn thận, phân tích sâu sắc và đầy đủ các khía cạnh quan trọng trước khi đưa ra câu trả lời.", system_prompt.trim())
                }
            }
            _ => system_prompt,
        };

        let has_images = images.as_ref().map(|imgs| !imgs.is_empty()).unwrap_or(false);
        let user_content = if has_images {
            let mut arr = vec![serde_json::json!({
                "type": "text",
                "text": user_prompt
            })];
            if let Some(imgs) = &images {
                for img_url in imgs {
                    arr.push(serde_json::json!({
                        "type": "image_url",
                        "image_url": {
                            "url": img_url
                        }
                    }));
                }
            }
            serde_json::Value::Array(arr)
        } else {
            serde_json::Value::String(user_prompt)
        };

        let want_stream = stream.unwrap_or(true) && req_id.as_deref().map(|s| !s.is_empty()).unwrap_or(false);

        let mut payload_obj = serde_json::json!({
            "model": target_model,
            "messages": [
                { "role": "system", "content": effective_system_prompt },
                { "role": "user", "content": user_content }
            ],
            "stream": want_stream,
            "temperature": 0.7
        });

        if (target_model.starts_with("ds/deepseek-v4-pro") || target_model == "ds/deepseek-v4-flash")
            && matches!(level.as_str(), "low" | "medium" | "high")
        {
            if let Some(map) = payload_obj.as_object_mut() {
                map.insert("reasoning_effort".to_string(), serde_json::Value::String(level));
            }
        }

        let token = if effective_key.is_empty() {
            None
        } else {
            Some(effective_key.as_str())
        };

        if want_stream {
            let rid = req_id.as_deref().unwrap_or("");
            let res = curl_stream_ai_chat(&url, &payload_obj.to_string(), token, 75, &app_handle, rid);
            zeroize_string(url);
            zeroize_string(effective_key);
            return res;
        }

        let raw_res = curl_post_json(&url, &payload_obj.to_string(), token, 75);
        zeroize_string(url);
        zeroize_string(effective_key);
        let raw = raw_res?;

        // Parse response: First try JSON
        let parse_res: Result<serde_json::Value, _> = serde_json::from_str(&raw);
        match parse_res {
            Ok(v) => {
                if let Some(err_msg) = v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
                    return Err(format!("Lỗi từ máy chủ AI: {}", err_msg));
                }
                if let Some(err_str) = v.get("error").and_then(|e| e.as_str()) {
                    return Err(format!("Lỗi từ máy chủ AI: {}", err_str));
                }

                if let Some(content) = v.pointer("/choices/0/message/content").and_then(|c| c.as_str()) {
                    Ok(content.to_string())
                } else if let Some(text) = v.pointer("/choices/0/text").and_then(|t| t.as_str()) {
                    Ok(text.to_string())
                } else {
                    Err(format!(
                        "Không nhận diện được nội dung phản hồi. Phản hồi máy chủ: {}",
                        raw.chars().take(200).collect::<String>()
                    ))
                }
            }
            Err(_) => {
                // Xử lý dữ liệu trả về dạng SSE streaming chunks (data: {...}) nếu máy chủ ép stream
                let mut full_content = String::new();
                for line in raw.lines() {
                    let trimmed = line.trim();
                    if let Some(rest) = trimmed.strip_prefix("data:") {
                        let rest = rest.trim();
                        if rest == "[DONE]" {
                            break;
                        }
                        if let Ok(chunk_val) = serde_json::from_str::<serde_json::Value>(rest) {
                            if let Some(delta) = chunk_val.pointer("/choices/0/delta/content").and_then(|c| c.as_str()) {
                                full_content.push_str(delta);
                            }
                        }
                    }
                }
                if !full_content.is_empty() {
                    return Ok(full_content);
                }
                Err(format!(
                    "Lỗi phân tích JSON phản hồi AI: {}",
                    raw.chars().take(200).collect::<String>()
                ))
            }
        }
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
fn media_control(
    state: tauri::State<'_, AppSharedState>,
    action: String,
    position_secs: Option<f64>,
) -> Result<bool, String> {
    if let Ok(tx) = state.media_tx.lock() {
        let _ = tx.send(MediaCmd::Action(action, position_secs));
    }
    Ok(true)
}

#[tauri::command]
fn set_notch_bounds(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppSharedState>,
    width: f64,
    height: f64,
    expanded: bool,
) -> Result<(), String> {
    let label = window.label().to_string();
    if let Ok(mut bounds_map) = state.bounds.lock() {
        bounds_map.insert(
            label,
            NotchBounds {
                width,
                height,
                expanded,
            },
        );
    }
    Ok(())
}

/// Đảm bảo cửa sổ trong suốt luôn có cờ WS_EX_TRANSPARENT khi ở trạng thái cho phép bấm xuyên qua
fn enforce_window_click_through(win: &tauri::WebviewWindow, ignore: bool) {
    let _ = win.set_ignore_cursor_events(ignore);
    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let want = if ignore {
                ex | (WS_EX_LAYERED.0 as isize) | (WS_EX_TRANSPARENT.0 as isize)
            } else {
                (ex | (WS_EX_LAYERED.0 as isize)) & !(WS_EX_TRANSPARENT.0 as isize)
            };
            if ex != want {
                let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
            }
        }
    }
}

fn resolve_app_data_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Kiểm tra quyền ghi vào thư mục cạnh .exe một lần duy nhất khi khởi động
            let test_path = dir.join(".island_write_test");
            if let Ok(f) = OpenOptions::new().write(true).create(true).open(&test_path) {
                drop(f);
                let _ = std::fs::remove_file(&test_path);
                return dir.to_path_buf();
            }
        }
    }
    // Fallback an toàn cho bản cài đặt Program Files vào %APPDATA%\Island
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("Island");
        let _ = std::fs::create_dir_all(&dir);
        return dir;
    }
    PathBuf::from(".")
}

fn app_file_path(filename: &str) -> PathBuf {
    let dir = APP_DATA_DIR.get_or_init(resolve_app_data_dir);
    dir.join(filename)
}

/// Tự động xóa bỏ API Key & Endpoint nếu còn sót dưới dạng văn bản thuần trong settings.txt
fn scrub_embedded_vault_key_from_settings(raw: &str) -> (String, bool) {
    let vault_key = unlock_embedded_vault_key();
    let vault_ep = unlock_embedded_vault_endpoint();
    let mut out = raw.to_string();
    let mut changed = false;
    if !vault_key.is_empty() && out.contains(&vault_key) {
        out = out.replace(&vault_key, "");
        changed = true;
    }
    if !vault_ep.is_empty() && out.contains(&vault_ep) {
        out = out.replace(&vault_ep, "");
        changed = true;
    }
    zeroize_string(vault_key);
    zeroize_string(vault_ep);
    (out, changed)
}

#[tauri::command]
fn save_data_file(
    app_handle: tauri::AppHandle,
    filename: String,
    content: String,
) -> Result<(), String> {
    let safe_name = match filename.as_str() {
        "water.txt"
        | "todo.txt"
        | "shelf.txt"
        | "settings.txt"
        | "clipboard.txt"
        | "focus.txt"
        | "notifications.txt"
        | "weather.txt"
        | "ai_history.txt"
        | "dock_pins.txt"
        | "cc_layout.txt"
        | "desktop_widgets.txt"
        | "quick_actions.txt" => filename,
        _ => return Err("Invalid data file name".to_string()),
    };
    let final_content = if safe_name == "settings.txt" {
        scrub_embedded_vault_key_from_settings(&content).0
    } else {
        content
    };
    let path = app_file_path(&safe_name);
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    file.write_all(final_content.as_bytes())
        .map_err(|e| e.to_string())?;

    // Phát sự kiện đồng bộ trực tiếp từ Rust tới TẤT CẢ cửa sổ (main, notch_2, settings) với độ trễ 0ms
    let _ = app_handle.emit(
        "island-file-changed",
        serde_json::json!({
            "filename": safe_name,
            "content": final_content,
        }),
    );
    Ok(())
}

#[tauri::command]
fn load_data_file(filename: String) -> Result<String, String> {
    let safe_name = match filename.as_str() {
        "water.txt"
        | "todo.txt"
        | "shelf.txt"
        | "settings.txt"
        | "clipboard.txt"
        | "focus.txt"
        | "notifications.txt"
        | "weather.txt"
        | "ai_history.txt"
        | "dock_pins.txt"
        | "cc_layout.txt"
        | "desktop_widgets.txt"
        | "quick_actions.txt" => filename,
        _ => return Err("Invalid data file name".to_string()),
    };
    let path = app_file_path(&safe_name);
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => return Ok(String::new()),
    };
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| e.to_string())?;
    if safe_name == "settings.txt" {
        let (scrubbed, changed) = scrub_embedded_vault_key_from_settings(&content);
        if changed {
            if let Ok(mut f_out) = File::create(&path) {
                let _ = f_out.write_all(scrubbed.as_bytes());
            }
        }
        return Ok(scrubbed);
    }
    Ok(content)
}

#[tauri::command]
fn log_water_drink(amount_ml: u32, note: String) -> Result<String, String> {
    let now = chrono_or_simple_time();
    let line = format!(
        "[{}] +{}ml - {}\n",
        now,
        amount_ml,
        if note.is_empty() { "Hydration" } else { &note }
    );
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(app_file_path("water.txt"))
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!("Logged {}ml", amount_ml))
}

#[tauri::command]
fn get_water_history() -> Result<Vec<String>, String> {
    let file = match File::open(app_file_path("water.txt")) {
        Ok(f) => f,
        Err(_) => return Ok(Vec::new()),
    };
    let reader = BufReader::new(file);
    let mut lines = Vec::new();
    for line in reader.lines().flatten() {
        if !line.trim().is_empty() {
            lines.push(line);
        }
    }
    lines.reverse();
    if lines.len() > 20 {
        lines.truncate(20);
    }
    Ok(lines)
}

#[tauri::command]
fn set_autostart(enable: bool) -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_path = r"Software\Microsoft\Windows\CurrentVersion\Run";
    let approved_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    let (run_key, _) = hkcu.create_subkey(run_path).map_err(|e| e.to_string())?;

    // Lấy đường dẫn exe thực tế (canonicalize để resolve symlink/junction)
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_path = exe_path.canonicalize().unwrap_or(exe_path);
    let exe_str = exe_path.to_str().ok_or("Invalid exe path")?;

    // Tự động làm mới entry khởi động Windows cho Island

    if enable {
        // Ghi registry Run entry với đường dẫn đầy đủ (có dấu ngoặc kép nếu có space)
        let value = if exe_str.contains(' ') {
            format!("\"{}\"", exe_str)
        } else {
            exe_str.to_string()
        };
        run_key.set_value("Island", &value)
            .map_err(|e| e.to_string())?;
        
        // Đặt StartupApproved = enabled (02 00 00 00 ... 12 bytes)
        // Byte đầu = 02 nghĩa là "enabled", 03 = "disabled"
        if let Ok((approved_key, _)) = hkcu.create_subkey(approved_path) {
            let enabled_data: [u8; 12] = [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            let val = winreg::RegValue {
                vtype: winreg::enums::RegType::REG_BINARY,
                bytes: enabled_data.to_vec().into(),
            };
            let _ = approved_key.set_raw_value("Island", &val);
        }
    } else {
        let _ = run_key.delete_value("Island");
        // Xóa luôn approved entry
        if let Ok(approved_key) = hkcu.open_subkey_with_flags(approved_path, winreg::enums::KEY_WRITE) {
            let _ = approved_key.delete_value("Island");
        }
    }
    Ok(enable)
}

#[tauri::command]
fn get_autostart_status() -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_path = r"Software\Microsoft\Windows\CurrentVersion\Run";
    let approved_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    
    if let Ok(run_key) = hkcu.open_subkey(run_path) {
        // Kiểm tra entry Island tồn tại
        let val: Result<String, _> = run_key.get_value("Island");
        if val.is_ok() {
            // Kiểm tra thêm StartupApproved xem có bị disabled không
            if let Ok(approved_key) = hkcu.open_subkey(approved_path) {
                if let Ok(data) = approved_key.get_raw_value("Island") {
                    // Byte đầu = 03 nghĩa là disabled bởi user trong Settings
                    if !data.bytes.is_empty() && data.bytes[0] == 0x03 {
                        return Ok(false);
                    }
                }
            }
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
fn open_path_in_explorer(path: String) -> Result<(), String> {
    if path.to_lowercase().ends_with(".islandtext") {
        std::process::Command::new("notepad.exe")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_shelf_snippet(
    title: String,
    content: String,
    is_url: bool,
) -> Result<DroppedFileItem, String> {
    let base_dir = app_file_path("shelf.txt")
        .parent()
        .map(|p| p.join("snippets"))
        .unwrap_or_else(|| PathBuf::from("snippets"));
    let _ = std::fs::create_dir_all(&base_dir);

    let safe_stem: String = title
        .chars()
        .map(|c| {
            if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\n' | '\r' | '\t') {
                '_'
            } else {
                c
            }
        })
        .take(28)
        .collect::<String>()
        .trim()
        .to_string();
    let stem = if safe_stem.is_empty() {
        "Doan_van".to_string()
    } else {
        safe_stem
    };
    let ext = if is_url { "url" } else { "islandtext" };
    let file_name = format!("{}.{}", stem, ext);
    let full_path = base_dir.join(&file_name);

    let payload = if is_url {
        format!("[InternetShortcut]\r\nURL={}\r\n", content.trim())
    } else {
        content
    };
    std::fs::write(&full_path, payload.as_bytes()).map_err(|e| e.to_string())?;
    let size_str = if is_url {
        "Liên kết .url".to_string()
    } else {
        format_file_size(payload.len() as u64)
    };
    Ok(DroppedFileItem {
        name: file_name,
        path: full_path.to_string_lossy().to_string(),
        size: size_str,
    })
}

#[tauri::command]
fn reveal_path_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    island_shell::restore_taskbar();
    island_shell::scene_unpark_all();
    island_system::restore_brightness();
    app_handle.exit(0);
}

fn chrono_or_simple_time() -> String {
    #[repr(C)]
    struct SYSTEMTIME {
        w_year: u16,
        w_month: u16,
        w_day_of_week: u16,
        w_day: u16,
        w_hour: u16,
        w_minute: u16,
        w_second: u16,
        w_milliseconds: u16,
    }
    unsafe extern "system" {
        fn GetLocalTime(lp_system_time: *mut SYSTEMTIME);
    }
    let mut st = SYSTEMTIME {
        w_year: 0,
        w_month: 0,
        w_day_of_week: 0,
        w_day: 0,
        w_hour: 0,
        w_minute: 0,
        w_second: 0,
        w_milliseconds: 0,
    };
    unsafe {
        GetLocalTime(&mut st);
    }
    format!("{:02}:{:02}:{:02}", st.w_hour, st.w_minute, st.w_second)
}

// ============================================================
// GOOGLE TASKS OAUTH 2.0 LOOPBACK & ĐỒNG BỘ 2 CHIỀU
// ============================================================
const DEFAULT_GOOGLE_CLIENT_ID: &str = match option_env!("ISLAND_GOOGLE_CLIENT_ID") {
    Some(v) => v,
    None => "",
};
const DEFAULT_GOOGLE_CLIENT_SECRET: &str = match option_env!("ISLAND_GOOGLE_CLIENT_SECRET") {
    Some(v) => v,
    None => "",
};

static GOOGLE_TASKS_AUTH_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static GOOGLE_TASKS_SYNC_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Default)]
struct GoogleTasksConfig {
    #[serde(default)]
    client_id: String,
    #[serde(default)]
    client_secret: String,
    #[serde(default)]
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    expires_at: u64,
    #[serde(default)]
    email: String,
    #[serde(default)]
    last_sync: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct GoogleTasksStatus {
    connected: bool,
    email: String,
    last_sync: String,
    has_default_creds: bool,
    client_id: String,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct TodoSyncItem {
    text: String,
    done: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    google_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    updated: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    due: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    local_dirty: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct GoogleTasksSyncResult {
    todos: Vec<TodoSyncItem>,
    status: GoogleTasksStatus,
    added_to_google: usize,
    added_from_google: usize,
    updated_count: usize,
    deleted_count: usize,
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn load_google_tasks_config() -> GoogleTasksConfig {
    let path = app_file_path("google_tasks.txt");
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<GoogleTasksConfig>(&raw).unwrap_or_default(),
        Err(_) => GoogleTasksConfig::default(),
    }
}

fn save_google_tasks_config(cfg: &GoogleTasksConfig) -> Result<(), String> {
    let path = app_file_path("google_tasks.txt");
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(path, json.as_bytes()).map_err(|e| e.to_string())
}

fn resolve_google_oauth_creds(
    cfg: &GoogleTasksConfig,
    override_id: Option<&str>,
    override_secret: Option<&str>,
) -> (String, String) {
    let cid = override_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let s = cfg.client_id.trim();
            if s.is_empty() { None } else { Some(s) }
        })
        .unwrap_or(DEFAULT_GOOGLE_CLIENT_ID)
        .to_string();

    let csec = override_secret
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let s = cfg.client_secret.trim();
            if s.is_empty() { None } else { Some(s) }
        })
        .unwrap_or(DEFAULT_GOOGLE_CLIENT_SECRET)
        .to_string();

    (cid, csec)
}

fn build_google_tasks_status(cfg: &GoogleTasksConfig) -> GoogleTasksStatus {
    let (cid, _) = resolve_google_oauth_creds(cfg, None, None);
    GoogleTasksStatus {
        connected: !cfg.refresh_token.trim().is_empty(),
        email: cfg.email.clone(),
        last_sync: cfg.last_sync.clone(),
        has_default_creds: !DEFAULT_GOOGLE_CLIENT_ID.is_empty() && !DEFAULT_GOOGLE_CLIENT_SECRET.is_empty(),
        client_id: cid,
    }
}

fn url_decode_component(s: &str) -> String {
    let mut bytes: Vec<u8> = Vec::with_capacity(s.len());
    let raw = s.as_bytes();
    let mut i = 0usize;
    while i < raw.len() {
        if raw[i] == b'+' {
            bytes.push(b' ');
            i += 1;
        } else if raw[i] == b'%' && i + 2 < raw.len() {
            if let Ok(hex) = std::str::from_utf8(&raw[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    bytes.push(val);
                    i += 3;
                    continue;
                }
            }
            bytes.push(raw[i]);
            i += 1;
        } else {
            bytes.push(raw[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn curl_post_form_secret(url: &str, form_body: &str, timeout_secs: u32) -> Result<String, String> {
    let mut cmd = std::process::Command::new("curl");
    cmd.creation_flags(CREATE_NO_WINDOW)
        .arg("-s")
        .arg("-L")
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("-K")
        .arg("-");

    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Không thể khởi động curl: {}", e))?;

    let mut cfg_buf = String::with_capacity(form_body.len() + 256);
    cfg_buf.push_str(&format!("url = \"{}\"\n", escape_curl_config_value(url)));
    cfg_buf.push_str("request = \"POST\"\n");
    cfg_buf.push_str("header = \"Content-Type: application/x-www-form-urlencoded\"\n");
    cfg_buf.push_str(&format!(
        "data-raw = \"{}\"\n",
        escape_curl_config_value(form_body)
    ));

    let write_res = if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(cfg_buf.as_bytes())
            .map_err(|e| format!("Lỗi gửi dữ liệu OAuth: {}", e))
    } else {
        Ok(())
    };
    zeroize_string(cfg_buf);
    write_res?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Lỗi chờ phản hồi OAuth: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "Lỗi kết nối Google OAuth (Mã {})",
            output.status.code().unwrap_or(-1)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn curl_http_json_bearer(
    method: &str,
    url: &str,
    json_body: Option<&str>,
    bearer_token: &str,
    timeout_secs: u32,
) -> Result<(u16, String), String> {
    let mut cmd = std::process::Command::new("curl");
    cmd.creation_flags(CREATE_NO_WINDOW)
        .arg("-s")
        .arg("-L")
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("--write-out")
        .arg("\n%{http_code}")
        .arg("-K")
        .arg("-");

    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Không thể khởi động curl: {}", e))?;

    let body_len = json_body.map(|b| b.len()).unwrap_or(0);
    let mut cfg_buf = String::with_capacity(body_len + 320);
    cfg_buf.push_str(&format!("url = \"{}\"\n", escape_curl_config_value(url)));
    cfg_buf.push_str(&format!("request = \"{}\"\n", escape_curl_config_value(method)));
    cfg_buf.push_str("header = \"Content-Type: application/json; charset=utf-8\"\n");
    cfg_buf.push_str(&format!(
        "header = \"Authorization: Bearer {}\"\n",
        escape_curl_config_value(bearer_token.trim())
    ));
    if let Some(body) = json_body {
        cfg_buf.push_str(&format!(
            "data-raw = \"{}\"\n",
            escape_curl_config_value(body)
        ));
    }

    let write_res = if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(cfg_buf.as_bytes())
            .map_err(|e| format!("Lỗi gửi request Google Tasks: {}", e))
    } else {
        Ok(())
    };
    zeroize_string(cfg_buf);
    write_res?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Lỗi chờ phản hồi Google Tasks: {}", e))?;
    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        return Err(format!("Không thể kết nối Google Tasks API (curl mã {})", code));
    }

    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    if let Some((body_part, code_part)) = raw.trim_end().rsplit_once('\n') {
        let status_code = code_part.trim().parse::<u16>().unwrap_or(0);
        Ok((status_code, body_part.to_string()))
    } else {
        let status_code = raw.trim().parse::<u16>().unwrap_or(0);
        Ok((status_code, String::new()))
    }
}

fn fetch_google_user_email(access_token: &str) -> Option<String> {
    let (status, body) = curl_http_json_bearer(
        "GET",
        "https://www.googleapis.com/oauth2/v2/userinfo",
        None,
        access_token,
        8,
    )
    .ok()?;
    if status != 200 {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(&body).ok()?;
    v.get("email")
        .and_then(|e| e.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn refresh_google_access_token(cfg: &mut GoogleTasksConfig) -> Result<String, String> {
    if cfg.refresh_token.trim().is_empty() {
        return Err("Chưa liên kết tài khoản Google Tasks".to_string());
    }
    let (cid, csec) = resolve_google_oauth_creds(cfg, None, None);
    let form = format!(
        "client_id={}&client_secret={}&refresh_token={}&grant_type=refresh_token",
        url_encode(&cid),
        url_encode(&csec),
        url_encode(cfg.refresh_token.trim())
    );
    let raw = curl_post_form_secret("https://oauth2.googleapis.com/token", &form, 12)?;
    let v: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| "Phản hồi làm mới token Google không hợp lệ".to_string())?;
    if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        let desc = v
            .get("error_description")
            .and_then(|d| d.as_str())
            .unwrap_or(err);
        if err == "invalid_grant" {
            cfg.access_token.clear();
            cfg.refresh_token.clear();
            cfg.expires_at = 0;
            let _ = save_google_tasks_config(cfg);
            return Err("Phiên đăng nhập Google đã hết hạn hoặc bị thu hồi. Vui lòng liên kết lại.".to_string());
        }
        return Err(format!("Lỗi làm mới token Google: {}", desc));
    }
    let new_token = v
        .get("access_token")
        .and_then(|t| t.as_str())
        .ok_or_else(|| "Google không trả về access_token mới".to_string())?
        .to_string();
    let expires_in = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(3600);
    cfg.access_token = new_token.clone();
    cfg.expires_at = now_unix_secs() + expires_in;
    if cfg.email.is_empty() {
        if let Some(mail) = fetch_google_user_email(&new_token) {
            cfg.email = mail;
        }
    }
    save_google_tasks_config(cfg)?;
    Ok(new_token)
}

#[tauri::command]
fn google_tasks_get_status() -> Result<GoogleTasksStatus, String> {
    let cfg = load_google_tasks_config();
    Ok(build_google_tasks_status(&cfg))
}

#[tauri::command]
async fn google_tasks_disconnect(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let mut cfg = load_google_tasks_config();
    cfg.access_token.clear();
    cfg.refresh_token.clear();
    cfg.expires_at = 0;
    cfg.email.clear();
    cfg.last_sync.clear();
    save_google_tasks_config(&cfg)?;
    let st = build_google_tasks_status(&cfg);
    let _ = app_handle.emit("island-google-tasks-auth", &st);
    Ok(true)
}

#[tauri::command]
async fn google_tasks_start_auth(
    app_handle: tauri::AppHandle,
    client_id: Option<String>,
    client_secret: Option<String>,
) -> Result<GoogleTasksStatus, String> {
    let seq = GOOGLE_TASKS_AUTH_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    let app_for_emit = app_handle.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<GoogleTasksStatus, String> {
        let mut cfg = load_google_tasks_config();
        let ov_id = client_id.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
        let ov_sec = client_secret.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
        if let Some(id_val) = ov_id {
            cfg.client_id = id_val.to_string();
        }
        if let Some(sec_val) = ov_sec {
            cfg.client_secret = sec_val.to_string();
        }
        let (eff_id, eff_sec) = resolve_google_oauth_creds(&cfg, ov_id, ov_sec);
        if eff_id.is_empty() || eff_sec.is_empty() {
            return Err("Thiếu Client ID hoặc Client Secret cho Google OAuth".to_string());
        }
        let _ = save_google_tasks_config(&cfg);

        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Không thể mở cổng Loopback OAuth: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Lỗi đọc cổng Loopback: {}", e))?
            .port();
        let _ = listener.set_nonblocking(true);

        let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
        let state_token = format!("island_{}_{}", now_unix_secs(), seq);
        let scope = "https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.email";
        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
            url_encode(&eff_id),
            url_encode(&redirect_uri),
            url_encode(scope),
            url_encode(&state_token)
        );

        app_for_emit
            .opener()
            .open_url(&auth_url, None::<&str>)
            .map_err(|e| format!("Không thể mở trình duyệt đăng nhập Google: {}", e))?;

        let deadline = Instant::now() + Duration::from_secs(180);
        let mut auth_code: Option<String> = None;

        while Instant::now() < deadline {
            if GOOGLE_TASKS_AUTH_SEQ.load(Ordering::SeqCst) != seq {
                return Err("Đã hủy phiên đăng nhập cũ do có yêu cầu mới.".to_string());
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let first_line = req.lines().next().unwrap_or("");
                    let target = first_line.split_whitespace().nth(1).unwrap_or("/");

                    if !target.starts_with("/callback") {
                        let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
                    let mut code_val: Option<String> = None;
                    let mut err_val: Option<String> = None;
                    let mut ret_state: Option<String> = None;
                    let mut ret_scope: Option<String> = None;

                    for pair in query.split('&') {
                        if let Some((k, v)) = pair.split_once('=') {
                            match k {
                                "code" => code_val = Some(url_decode_component(v)),
                                "error" => err_val = Some(url_decode_component(v)),
                                "state" => ret_state = Some(url_decode_component(v)),
                                "scope" => ret_scope = Some(url_decode_component(v)),
                                _ => {}
                            }
                        }
                    }

                    if let Some(err_str) = err_val {
                        let html = format!(
                            "<!doctype html><html lang='vi'><meta charset='utf-8'><body style='font-family:Segoe UI,sans-serif;background:#0d1117;color:#f0f6fc;display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center;padding:28px;border:1px solid #30363d;border-radius:14px;background:#161b22'><h2>❌ Liên kết bị hủy ({})</h2><p>Bạn có thể đóng tab này và quay lại Island.</p></div></body></html>",
                            err_str
                        );
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.as_bytes().len(),
                            html
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        return Err(format!("Đăng nhập Google bị từ chối: {}", err_str));
                    }

                    if ret_state.as_deref() != Some(state_token.as_str()) {
                        let html = "<!doctype html><html lang='vi'><meta charset='utf-8'><body style='font-family:Segoe UI,sans-serif;background:#0d1117;color:#f0f6fc;display:grid;place-items:center;height:100vh;margin:0'><div><h2>⚠️ State xác thực không khớp</h2></div></body></html>";
                        let resp = format!(
                            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.as_bytes().len(),
                            html
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        return Err("Mã state OAuth không hợp lệ".to_string());
                    }

                    if let Some(code_str) = code_val {
                        if ret_scope
                            .as_deref()
                            .map(|s| !s.contains("auth/tasks"))
                            .unwrap_or(false)
                        {
                            let html = "<!doctype html><html lang='vi'><meta charset='utf-8'><body style='font-family:Segoe UI,sans-serif;background:#0d1117;color:#f0f6fc;display:grid;place-items:center;height:100vh;margin:0'><div style='max-width:460px;text-align:center;padding:28px;border:1px solid #f59e0b;border-radius:14px;background:#161b22'><h2 style='color:#fbbf24;margin:0 0 10px'>⚠️ Bạn chưa tích chọn quyền Google Tasks!</h2><p style='line-height:1.5;color:#cbd5e1'>Khi đăng nhập Google, ở bước cấp quyền bạn cần <b>tích vào ô vuông Google Tasks (Create, edit, organize, and delete all your tasks)</b> trước khi bấm <b>Continue / Tiếp tục</b>.</p><p style='color:#94a3b8;font-size:13px'>Hãy đóng tab này và bấm <b>Liên kết</b> lại trong Island.</p></div></body></html>";
                            let resp = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                html.as_bytes().len(),
                                html
                            );
                            let _ = stream.write_all(resp.as_bytes());
                            let _ = stream.flush();
                            return Err("Bạn chưa tích chọn ô cấp quyền Google Tasks trên trang Google. Hãy bấm Liên kết lại và tích vào ô vuông quyền Google Tasks!".to_string());
                        }
                        let html = "<!doctype html><html lang='vi'><meta charset='utf-8'><body style='font-family:Segoe UI,sans-serif;background:#0b1020;color:#fff;display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center;padding:30px 36px;border:1px solid rgba(56,189,248,.4);border-radius:16px;background:rgba(20,28,48,.92);box-shadow:0 12px 36px rgba(0,0,0,.5)'><h2 style='margin:0 0 8px;color:#38bdf8'>✅ Liên kết Google Tasks thành công!</h2><p style='margin:0;color:rgba(255,255,255,.78)'>Bạn có thể đóng tab trình duyệt này và quay lại Island.</p></div></body></html>";
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.as_bytes().len(),
                            html
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        auth_code = Some(code_str);
                        break;
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    return Err(format!("Lỗi kết nối loopback OAuth: {}", e));
                }
            }
        }

        let code = auth_code.ok_or_else(|| "Hết thời gian chờ đăng nhập Google (180 giây).".to_string())?;
        let form = format!(
            "code={}&client_id={}&client_secret={}&redirect_uri={}&grant_type=authorization_code",
            url_encode(&code),
            url_encode(&eff_id),
            url_encode(&eff_sec),
            url_encode(&redirect_uri)
        );
        let raw_tok = curl_post_form_secret("https://oauth2.googleapis.com/token", &form, 15)?;
        let tv: serde_json::Value = serde_json::from_str(&raw_tok)
            .map_err(|_| format!("Lỗi đọc token từ Google: {}", raw_tok))?;
        if let Some(err) = tv.get("error").and_then(|e| e.as_str()) {
            let desc = tv
                .get("error_description")
                .and_then(|d| d.as_str())
                .unwrap_or(err);
            return Err(format!("Google từ chối cấp token: {}", desc));
        }
        let granted_scope = tv.get("scope").and_then(|s| s.as_str()).unwrap_or("");
        if !granted_scope.contains("auth/tasks") {
            return Err("Chưa cấp quyền Google Tasks (thiếu tích chọn ô vuông quyền Tasks). Vui lòng liên kết lại!".to_string());
        }

        let access_token = tv
            .get("access_token")
            .and_then(|t| t.as_str())
            .ok_or_else(|| "Google không trả về access_token".to_string())?
            .to_string();
        let refresh_token = tv
            .get("refresh_token")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| cfg.refresh_token.clone());
        if refresh_token.is_empty() {
            return Err("Không nhận được refresh_token từ Google. Vui lòng thử cấp quyền lại.".to_string());
        }
        let expires_in = tv.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(3600);

        cfg.access_token = access_token.clone();
        cfg.refresh_token = refresh_token;
        cfg.expires_at = now_unix_secs() + expires_in;
        if let Some(mail) = fetch_google_user_email(&access_token) {
            cfg.email = mail;
        }
        save_google_tasks_config(&cfg)?;

        let existing_todos: Vec<TodoSyncItem> = std::fs::read_to_string(app_file_path("todo.txt"))
            .ok()
            .and_then(|raw| serde_json::from_str::<Vec<TodoSyncItem>>(&raw).ok())
            .unwrap_or_default();
        if let Ok(sync_res) = run_google_tasks_sync_blocking(&app_for_emit, existing_todos, Vec::new()) {
            return Ok(sync_res.status);
        }

        let status = build_google_tasks_status(&cfg);
        let _ = app_for_emit.emit("island-google-tasks-auth", &status);
        Ok(status)
    })
    .await
    .map_err(|e| format!("Google auth task error: {}", e))?
}

#[derive(Clone)]
struct RemoteGoogleTask {
    id: String,
    title: String,
    done: bool,
    updated: Option<String>,
    notes: Option<String>,
    due: Option<String>,
    position: String,
}

fn fetch_remote_google_tasks(cfg: &mut GoogleTasksConfig) -> Result<Vec<RemoteGoogleTask>, String> {
    let mut token = if cfg.access_token.trim().is_empty() || now_unix_secs() + 60 >= cfg.expires_at {
        refresh_google_access_token(cfg)?
    } else {
        cfg.access_token.clone()
    };

    let url = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&maxResults=100";
    let (mut code, mut body) = curl_http_json_bearer("GET", url, None, &token, 12)?;
    if code == 401 {
        token = refresh_google_access_token(cfg)?;
        let retry = curl_http_json_bearer("GET", url, None, &token, 12)?;
        code = retry.0;
        body = retry.1;
    }
    if code == 403 {
        cfg.access_token.clear();
        cfg.refresh_token.clear();
        cfg.expires_at = 0;
        let _ = save_google_tasks_config(cfg);
        return Err("Chưa cấp quyền Google Tasks (bạn quên tích ô vuông quyền Tasks khi đăng nhập). Đã đặt lại — vui lòng bấm Liên kết lại và tích chọn ô cấp quyền!".to_string());
    }
    if !(200..300).contains(&code) {
        return Err(format!("Google Tasks API trả về mã {} khi tải danh sách", code));
    }

    let v: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| "Dữ liệu Google Tasks trả về không hợp lệ".to_string())?;
    let mut out = Vec::new();
    if let Some(arr) = v.get("items").and_then(|x| x.as_array()) {
        for item in arr {
            if item.get("deleted").and_then(|d| d.as_bool()).unwrap_or(false) {
                continue;
            }
            if item.get("hidden").and_then(|d| d.as_bool()).unwrap_or(false)
                && item.get("status").and_then(|s| s.as_str()) != Some("completed")
            {
                continue;
            }
            let id = match item.get("id").and_then(|s| s.as_str()) {
                Some(s) if !s.trim().is_empty() => s.trim().to_string(),
                _ => continue,
            };
            let title = item
                .get("title")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if title.is_empty() {
                continue;
            }
            let done = item.get("status").and_then(|s| s.as_str()) == Some("completed");
            let updated = item.get("updated").and_then(|s| s.as_str()).map(|s| s.to_string());
            let notes = item.get("notes").and_then(|s| s.as_str()).map(|s| s.to_string());
            let due = item.get("due").and_then(|s| s.as_str()).map(|s| s.to_string());
            let position = item
                .get("position")
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_string();
            out.push(RemoteGoogleTask {
                id,
                title,
                done,
                updated,
                notes,
                due,
                position,
            });
        }
    }
    Ok(out)
}

fn run_google_tasks_sync_blocking(
    app_for_emit: &tauri::AppHandle,
    local_todos: Vec<TodoSyncItem>,
    deleted_google_ids: Vec<String>,
) -> Result<GoogleTasksSyncResult, String> {
    let _guard = GOOGLE_TASKS_SYNC_LOCK
        .lock()
        .map_err(|_| "Sync lock error".to_string())?;
    let mut cfg = load_google_tasks_config();
        if cfg.refresh_token.trim().is_empty() {
            return Err("Chưa liên kết tài khoản Google Tasks".to_string());
        }

        if cfg.access_token.trim().is_empty() || now_unix_secs() + 60 >= cfg.expires_at {
            refresh_google_access_token(&mut cfg)?;
        }

        let mut deleted_set: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut deleted_count: usize = 0;
        for gid in deleted_google_ids {
            let clean_gid = gid.trim().to_string();
            if clean_gid.is_empty() || !deleted_set.insert(clean_gid.clone()) {
                continue;
            }
            let del_url = format!(
                "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{}",
                url_encode(&clean_gid)
            );
            if let Ok((st, _)) = curl_http_json_bearer("DELETE", &del_url, None, &cfg.access_token, 10) {
                if (200..300).contains(&st) || st == 404 || st == 410 {
                    deleted_count += 1;
                } else if st == 401 {
                    let tok = refresh_google_access_token(&mut cfg)?;
                    let _ = curl_http_json_bearer("DELETE", &del_url, None, &tok, 10);
                    deleted_count += 1;
                }
            }
        }

        let remote_list = match fetch_remote_google_tasks(&mut cfg) {
            Ok(list) => list,
            Err(err) => {
                let st = build_google_tasks_status(&cfg);
                let _ = app_for_emit.emit("island-google-tasks-auth", &st);
                return Err(err);
            }
        };
        let mut remote_map: HashMap<String, (usize, RemoteGoogleTask)> = HashMap::new();
        for (idx, rt) in remote_list.into_iter().enumerate() {
            if !deleted_set.contains(&rt.id) {
                remote_map.insert(rt.id.clone(), (idx, rt));
            }
        }

        let mut merged: Vec<TodoSyncItem> = Vec::with_capacity(local_todos.len() + remote_map.len());
        let mut added_to_google: usize = 0;
        let mut updated_count: usize = 0;

        for mut item in local_todos {
            item.text = item.text.trim().to_string();
            if item.text.is_empty() {
                continue;
            }

            if let Some(gid) = item.google_id.clone().filter(|s| !s.trim().is_empty()) {
                if deleted_set.contains(&gid) {
                    continue;
                }
                if let Some((_, rt)) = remote_map.remove(&gid) {
                    let differs = item.text != rt.title || item.done != rt.done;
                    if item.local_dirty && differs {
                        let patch_url = format!(
                            "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{}",
                            url_encode(&gid)
                        );
                        let mut body_obj = serde_json::json!({
                            "id": gid,
                            "title": item.text,
                            "status": if item.done { "completed" } else { "needsAction" }
                        });
                        if !item.done {
                            if let Some(map) = body_obj.as_object_mut() {
                                map.insert("completed".to_string(), serde_json::Value::Null);
                            }
                        }
                        if let Ok((st, resp)) = curl_http_json_bearer(
                            "PATCH",
                            &patch_url,
                            Some(&body_obj.to_string()),
                            &cfg.access_token,
                            10,
                        ) {
                            if (200..300).contains(&st) {
                                if let Ok(rv) = serde_json::from_str::<serde_json::Value>(&resp) {
                                    item.updated = rv.get("updated").and_then(|s| s.as_str()).map(|s| s.to_string()).or(rt.updated);
                                }
                                updated_count += 1;
                            }
                        }
                        item.local_dirty = false;
                    } else {
                        if differs {
                            updated_count += 1;
                        }
                        item.text = rt.title;
                        item.done = rt.done;
                        item.updated = rt.updated;
                        item.notes = rt.notes;
                        item.due = rt.due;
                        item.local_dirty = false;
                    }
                    merged.push(item);
                } else if item.local_dirty {
                    // Đã bị sửa cục bộ khi chưa kịp đồng bộ -> tạo lại trên Google Tasks
                    let post_url = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
                    let body_obj = serde_json::json!({
                        "title": item.text,
                        "status": if item.done { "completed" } else { "needsAction" }
                    });
                    if let Ok((st, resp)) = curl_http_json_bearer(
                        "POST",
                        post_url,
                        Some(&body_obj.to_string()),
                        &cfg.access_token,
                        10,
                    ) {
                        if (200..300).contains(&st) {
                            if let Ok(rv) = serde_json::from_str::<serde_json::Value>(&resp) {
                                item.google_id = rv.get("id").and_then(|s| s.as_str()).map(|s| s.to_string());
                                item.updated = rv.get("updated").and_then(|s| s.as_str()).map(|s| s.to_string());
                                item.local_dirty = false;
                                added_to_google += 1;
                            }
                        }
                    }
                    merged.push(item);
                } else {
                    // Đã bị xóa trên điện thoại / Google Tasks
                    deleted_count += 1;
                }
            } else {
                // Việc tạo mới cục bộ: kiểm tra trùng tên sẵn có trên Google trước để nối ghép gọn gàng
                let matched_gid = remote_map
                    .iter()
                    .find(|(_, (_, rt))| rt.title.eq_ignore_ascii_case(&item.text))
                    .map(|(k, _)| k.clone());

                if let Some(gid) = matched_gid {
                    if let Some((_, rt)) = remote_map.remove(&gid) {
                        item.google_id = Some(rt.id);
                        item.updated = rt.updated;
                        item.notes = rt.notes;
                        item.due = rt.due;
                        if item.done != rt.done && item.local_dirty {
                            let patch_url = format!(
                                "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{}",
                                url_encode(&gid)
                            );
                            let body_obj = serde_json::json!({
                                "id": gid,
                                "title": item.text,
                                "status": if item.done { "completed" } else { "needsAction" }
                            });
                            let _ = curl_http_json_bearer("PATCH", &patch_url, Some(&body_obj.to_string()), &cfg.access_token, 10);
                        } else {
                            item.done = rt.done;
                        }
                        item.local_dirty = false;
                    }
                    merged.push(item);
                } else {
                    let post_url = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
                    let body_obj = serde_json::json!({
                        "title": item.text,
                        "status": if item.done { "completed" } else { "needsAction" }
                    });
                    if let Ok((st, resp)) = curl_http_json_bearer(
                        "POST",
                        post_url,
                        Some(&body_obj.to_string()),
                        &cfg.access_token,
                        10,
                    ) {
                        if (200..300).contains(&st) {
                            if let Ok(rv) = serde_json::from_str::<serde_json::Value>(&resp) {
                                item.google_id = rv.get("id").and_then(|s| s.as_str()).map(|s| s.to_string());
                                item.updated = rv.get("updated").and_then(|s| s.as_str()).map(|s| s.to_string());
                                item.local_dirty = false;
                                added_to_google += 1;
                            }
                        }
                    }
                    merged.push(item);
                }
            }
        }

        // Các task mới thêm trên điện thoại / Google Calendar / Gmail
        let mut remaining: Vec<(usize, RemoteGoogleTask)> = remote_map.into_values().collect();
        remaining.sort_by(|a, b| a.1.position.cmp(&b.1.position).then_with(|| a.0.cmp(&b.0)));
        let added_from_google = remaining.len();

        let mut new_pending: Vec<TodoSyncItem> = Vec::new();
        let mut new_done: Vec<TodoSyncItem> = Vec::new();
        for (_, rt) in remaining {
            let sync_item = TodoSyncItem {
                text: rt.title,
                done: rt.done,
                google_id: Some(rt.id),
                updated: rt.updated,
                notes: rt.notes,
                due: rt.due,
                local_dirty: false,
            };
            if sync_item.done {
                new_done.push(sync_item);
            } else {
                new_pending.push(sync_item);
            }
        }

        if !new_pending.is_empty() {
            new_pending.extend(merged);
            merged = new_pending;
        }
        if !new_done.is_empty() {
            merged.extend(new_done);
        }

        let todo_json = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
        std::fs::write(app_file_path("todo.txt"), todo_json.as_bytes()).map_err(|e| e.to_string())?;
        let _ = app_for_emit.emit(
            "island-file-changed",
            serde_json::json!({
                "filename": "todo.txt",
                "content": todo_json,
            }),
        );

        cfg.last_sync = chrono_or_simple_time();
        save_google_tasks_config(&cfg)?;
        let status = build_google_tasks_status(&cfg);
        let _ = app_for_emit.emit("island-google-tasks-auth", &status);

        Ok(GoogleTasksSyncResult {
            todos: merged,
            status,
            added_to_google,
            added_from_google,
            updated_count,
            deleted_count,
        })
}

#[tauri::command]
async fn google_tasks_sync(
    app_handle: tauri::AppHandle,
    local_todos: Vec<TodoSyncItem>,
    deleted_google_ids: Vec<String>,
) -> Result<GoogleTasksSyncResult, String> {
    let app_for_emit = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<GoogleTasksSyncResult, String> {
        run_google_tasks_sync_blocking(&app_for_emit, local_todos, deleted_google_ids)
    })
    .await
    .map_err(|e| format!("Google Tasks sync error: {}", e))?
}

fn setup_notch_window_events(win: &tauri::WebviewWindow, app_handle: &tauri::AppHandle) {
    let state = app_handle.state::<AppSharedState>();
    let hw_for_drop = state.hw.clone();
    let dropped_for_event = state.dropped_files.clone();
    let label = win.label().to_string();
    let app_for_drop = app_handle.clone();

    win.on_window_event(move |event| {
        if let tauri::WindowEvent::DragDrop(drag_evt) = event {
            match drag_evt {
                tauri::DragDropEvent::Enter { .. } | tauri::DragDropEvent::Over { .. } => {
                    if let Ok(mut hw) = hw_for_drop.lock() {
                        if !hw.file_drag_hover || hw.hovered_notch.as_deref() != Some(label.as_str()) {
                            hw.file_drag_hover = true;
                            hw.cursor_inside = true;
                            hw.hovered_notch = Some(label.clone());
                            let _ = app_for_drop.emit("island-hw", &*hw);
                        }
                    }
                }
                tauri::DragDropEvent::Leave => {
                    if let Ok(mut hw) = hw_for_drop.lock() {
                        hw.file_drag_hover = false;
                        let _ = app_for_drop.emit("island-hw", &*hw);
                    }
                }
                tauri::DragDropEvent::Drop { paths, .. } => {
                    let mut added = Vec::new();
                    for p in paths {
                        let name = p
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Tệp")
                            .to_string();
                        let full_path = p.to_string_lossy().to_string();
                        let size_str = match std::fs::metadata(p) {
                            Ok(m) => {
                                if m.is_dir() {
                                    "Thư mục".to_string()
                                } else {
                                    format_file_size(m.len())
                                }
                            }
                            Err(_) => "Tệp".to_string(),
                        };
                        added.push(DroppedFileItem {
                            name,
                            path: full_path,
                            size: size_str,
                        });
                    }
                    if !added.is_empty() {
                        if let Ok(mut q) = dropped_for_event.lock() {
                            q.extend(added);
                        }
                        if let Ok(mut hw) = hw_for_drop.lock() {
                            hw.file_drag_hover = false;
                            hw.drop_seq = hw.drop_seq.wrapping_add(1);
                            let _ = app_for_drop.emit("island-hw", &*hw);
                        }
                    }
                }
                _ => {}
            }
        }
    });
}

fn ensure_secondary_notch_window(
    app_handle: &tauri::AppHandle,
    label: &str,
) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app_handle.get_webview_window(label) {
        apply_dark_robot_icon(&w);
        enforce_window_click_through(&w, true);
        let _ = w.show();
        return Ok(w);
    }

    let url = format!("index.html?label={}", label);
    let w = tauri::WebviewWindowBuilder::new(
        app_handle,
        label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title("Island")
    .inner_size(860.0, 680.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .shadow(false)
    .skip_taskbar(true)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    apply_dark_robot_icon(&w);
    enforce_window_click_through(&w, true);
    setup_notch_window_events(&w, app_handle);
    Ok(w)
}

fn apply_monitor_to_main(window: &tauri::WebviewWindow, m: &tauri::Monitor) {
    let pos = m.position();
    let size = m.size();
    let scale = m.scale_factor();
    let geo = MonGeo {
        x: pos.x as f64,
        y: pos.y as f64,
        w: size.width as f64,
        h: size.height as f64,
        scale,
    };
    if let Ok(mut g) = ACTIVE_NOTCHES.lock() {
        *g = vec![ActiveNotchInfo {
            label: "main".into(),
            geo,
        }];
    }
    let win_phys_w = 860.0 * scale;
    let x = (pos.x as f64 + (size.width as f64 - win_phys_w) / 2.0) as i32;
    let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y: pos.y }));
    apply_dark_robot_icon(window);
    enforce_window_click_through(window, true);
}

#[tauri::command]
fn center_top_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let notches = ACTIVE_NOTCHES.lock().map(|l| l.clone()).unwrap_or_default();
    for n in notches {
        if let Some(win) = app_handle.get_webview_window(&n.label) {
            let win_phys_w = 860.0 * n.geo.scale;
            let x = (n.geo.x + (n.geo.w - win_phys_w) / 2.0) as i32;
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition { x, y: n.geo.y as i32 }));
        }
    }
    Ok(())
}

#[tauri::command]
fn list_monitors(app_handle: tauri::AppHandle) -> Result<MonitorsResponse, String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Không tìm thấy cửa sổ chính")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary = window.primary_monitor().ok().flatten();
    let is_all = ALL_MONITORS_MODE.load(Ordering::Relaxed);
    let notches = ACTIVE_NOTCHES.lock().map(|l| l.clone()).unwrap_or_default();

    let mut out = Vec::new();
    for (i, m) in monitors.iter().enumerate() {
        let pos = m.position();
        let size = m.size();
        let is_primary = primary
            .as_ref()
            .map(|p| p.position().x == pos.x && p.position().y == pos.y)
            .unwrap_or(i == 0);
        let is_current = if is_all {
            true
        } else {
            notches.iter().any(|n| n.geo.x as i32 == pos.x && n.geo.y as i32 == pos.y)
        };
        out.push(MonitorItem {
            index: i,
            name: m.name().cloned().unwrap_or_else(|| format!("Màn hình {}", i + 1)),
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
            primary: is_primary,
            current: is_current,
        });
    }
    Ok(MonitorsResponse {
        monitors: out,
        all_monitors: is_all,
    })
}

#[tauri::command]
async fn set_notch_monitors(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppSharedState>,
    all_monitors: bool,
    target_x: Option<i32>,
    target_y: Option<i32>,
) -> Result<bool, String> {
    let main_win = app_handle
        .get_webview_window("main")
        .ok_or("Không tìm thấy cửa sổ chính")?;
    let monitors = main_win.available_monitors().map_err(|e| e.to_string())?;

    if all_monitors {
        ALL_MONITORS_MODE.store(true, Ordering::Relaxed);
        let mut new_notches = Vec::new();

        for (idx, m) in monitors.iter().enumerate() {
            let label = if idx == 0 {
                "main".to_string()
            } else {
                format!("notch_{}", idx + 1)
            };
            let pos = m.position();
            let size = m.size();
            let scale = m.scale_factor();
            let geo = MonGeo {
                x: pos.x as f64,
                y: pos.y as f64,
                w: size.width as f64,
                h: size.height as f64,
                scale,
            };

            let win = if idx == 0 {
                main_win.clone()
            } else {
                ensure_secondary_notch_window(&app_handle, &label)?
            };

            if let Ok(mut bmap) = state.bounds.lock() {
                bmap.entry(label.clone()).or_default();
            }

            let win_phys_w = 860.0 * scale;
            let x = (pos.x as f64 + (size.width as f64 - win_phys_w) / 2.0) as i32;
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition { x, y: pos.y }));
            enforce_window_click_through(&win, true);
            let _ = win.show();
            enforce_window_click_through(&win, true);

            new_notches.push(ActiveNotchInfo { label, geo });
        }

        if let Ok(mut g) = ACTIVE_NOTCHES.lock() {
            *g = new_notches;
        }
        return Ok(true);
    }

    // Chế độ 1 màn hình cụ thể: Ẩn và bật xuyên chuột cho các cửa sổ phụ ngay lập tức
    ALL_MONITORS_MODE.store(false, Ordering::Relaxed);
    for i in 2..=10 {
        let label = format!("notch_{}", i);
        if let Ok(mut bmap) = state.bounds.lock() {
            bmap.remove(&label);
        }
        if let Some(w) = app_handle.get_webview_window(&label) {
            enforce_window_click_through(&w, true);
            let _ = w.hide();
        }
    }
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(600));
        trim_process_tree_memory();
    });

    if let (Some(tx), Some(ty)) = (target_x, target_y) {
        if let Some(m) = monitors.iter().find(|m| m.position().x == tx && m.position().y == ty) {
            apply_monitor_to_main(&main_win, m);
            return Ok(true);
        }
    } else if let Some(m) = main_win.primary_monitor().ok().flatten().or_else(|| monitors.first().cloned()) {
        apply_monitor_to_main(&main_win, &m);
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
async fn set_notch_monitor(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppSharedState>,
    x: i32,
    y: i32,
) -> Result<bool, String> {
    set_notch_monitors(app_handle, state, false, Some(x), Some(y)).await
}

#[tauri::command]
fn set_hide_fullscreen(enable: bool) {
    HIDE_FULLSCREEN.store(enable, Ordering::Relaxed);
}

#[tauri::command]
async fn open_settings_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app_handle.get_webview_window("settings") {
        apply_dark_robot_icon(&w);
        enforce_window_click_through(&w, false);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let w = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("Cài đặt Island")
    .inner_size(860.0, 620.0)
    .min_inner_size(760.0, 520.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(false)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    apply_dark_robot_icon(&w);
    let w_for_evt = w.clone();
    w.on_window_event(move |evt| {
        match evt {
            tauri::WindowEvent::CloseRequested { .. } => {
                let _ = w_for_evt.destroy();
                std::thread::spawn(|| {
                    std::thread::sleep(Duration::from_millis(300));
                    trim_process_tree_memory();
                });
            }
            tauri::WindowEvent::Destroyed => {
                std::thread::spawn(|| {
                    std::thread::sleep(Duration::from_millis(400));
                    trim_process_tree_memory();
                });
            }
            _ => {}
        }
    });
    let _ = w.set_focus();
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(1800));
        trim_process_tree_memory();
    });
    Ok(())
}

#[tauri::command]
fn close_settings_window(app_handle: tauri::AppHandle) {
    if let Some(w) = app_handle.get_webview_window("settings") {
        let _ = w.destroy();
    }
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(300));
        trim_process_tree_memory();
    });
}

fn lang_code_from_langid(id: u16) -> String {
    match id & 0x03FF {
        0x09 => "ENG".into(),
        0x2A => "VIE".into(),
        0x11 => "JPN".into(),
        0x04 => "CHN".into(),
        0x12 => "KOR".into(),
        0x0C => "FRA".into(),
        0x07 => "DEU".into(),
        0x19 => "RUS".into(),
        0x1E => "THA".into(),
        0x0A => "ESP".into(),
        _ => format!("{:04X}", id),
    }
}

/// Kiểm tra cửa sổ đang được focus có phải ứng dụng toàn màn hình thực sự (game, F11 video) hay không
/// Loại trừ cửa sổ có WS_CAPTION / IsZoomed khi thu gọn tai thỏ
fn foreground_is_fullscreen(own_hwnds: &[isize], geo: &MonGeo) -> bool {
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return false;
        }
        if own_hwnds.contains(&(fg.0 as isize)) {
            return false;
        }
        if IsWindowVisible(fg.0) == 0 || IsIconic(fg.0) != 0 {
            return false;
        }
        // Kiểm tra GWL_STYLE (-16): nếu có WS_CAPTION (0x00C00000) thì là cửa sổ desktop bình thường (kể cả khi phóng to Maximize), KHÔNG phải fullscreen
        let style = GetWindowLongPtrW(fg, windows::Win32::UI::WindowsAndMessaging::WINDOW_LONG_PTR_INDEX(-16));
        if (style & 0x00C00000) == 0x00C00000 {
            return false;
        }
        let ex_style = GetWindowLongPtrW(fg, GWL_EXSTYLE);
        // Loại trừ cửa sổ overlay xuyên chuột / toolwindow (0x80) / noactivate (0x08000000)
        if (ex_style & ((WS_EX_TRANSPARENT.0 | 0x00000080 | 0x08000000) as isize)) != 0 {
            return false;
        }
        let mut buf = [0u16; 64];
        let n = GetClassNameW(fg, &mut buf);
        if n > 0 {
            let cls = String::from_utf16_lossy(&buf[..n as usize]);
            if matches!(
                cls.as_str(),
                "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
                    | "Windows.UI.Core.CoreWindow" | "XamlExplorerHostIslandWindow"
                    | "CEF-OSC-WIDGET" | "NVIDIA GeForce Overlay"
            ) {
                return false;
            }
        }
        let mut r = RECT::default();
        if GetWindowRect(fg, &mut r).is_err() {
            return false;
        }
        let gx = geo.x as i32;
        let gy = geo.y as i32;
        let gr = gx + geo.w as i32;
        let gb = gy + geo.h as i32;
        r.left <= gx && r.top <= gy && r.right >= gr && r.bottom >= gb
    }
}

#[repr(C)]
struct ProcessEntry32W {
    dw_size: u32,
    cnt_usage: u32,
    th32_process_id: u32,
    th32_default_heap_id: usize,
    th32_module_id: u32,
    cnt_threads: u32,
    th32_parent_process_id: u32,
    pc_pri_class_base: i32,
    dw_flags: u32,
    sz_exe_file: [u16; 260],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct ComGuid {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

const CLSID_MMDEVICE_ENUMERATOR: ComGuid = ComGuid {
    data1: 0xBCDE0395,
    data2: 0xE52F,
    data3: 0x467C,
    data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E],
};

const IID_IMMDEVICE_ENUMERATOR: ComGuid = ComGuid {
    data1: 0xA95664D2,
    data2: 0x9614,
    data3: 0x4F35,
    data4: [0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6],
};

const IID_IAUDIO_ENDPOINT_VOLUME: ComGuid = ComGuid {
    data1: 0x5CDF2C82,
    data2: 0x841E,
    data3: 0x4546,
    data4: [0x97, 0x22, 0x0C, 0xF7, 0x40, 0x78, 0x22, 0x9A],
};

const IID_IAUDIO_METER_INFORMATION: ComGuid = ComGuid {
    data1: 0xC02216F6,
    data2: 0x8C67,
    data3: 0x4B5B,
    data4: [0x9D, 0x00, 0xD0, 0x08, 0xE7, 0x3E, 0x00, 0x64],
};

const GUID_NULL_COM: ComGuid = ComGuid {
    data1: 0,
    data2: 0,
    data3: 0,
    data4: [0; 8],
};

unsafe extern "system" {
    fn GetCurrentProcess() -> *mut std::ffi::c_void;
    fn GetCurrentProcessId() -> u32;
    fn K32EmptyWorkingSet(h_process: *mut std::ffi::c_void) -> i32;
    fn CreateToolhelp32Snapshot(dw_flags: u32, th32_process_id: u32) -> *mut std::ffi::c_void;
    fn Process32FirstW(h_snapshot: *mut std::ffi::c_void, lppe: *mut ProcessEntry32W) -> i32;
    fn Process32NextW(h_snapshot: *mut std::ffi::c_void, lppe: *mut ProcessEntry32W) -> i32;
    fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32) -> *mut std::ffi::c_void;
    fn TerminateProcess(h_process: *mut std::ffi::c_void, u_exit_code: u32) -> i32;
    fn CloseHandle(h_object: *mut std::ffi::c_void) -> i32;
    fn IsWindowVisible(h_wnd: *mut std::ffi::c_void) -> i32;
    fn IsIconic(h_wnd: *mut std::ffi::c_void) -> i32;
    fn CoInitializeEx(pv_reserved: *const std::ffi::c_void, dw_co_init: u32) -> i32;
    fn CoCreateInstance(
        rclsid: *const ComGuid,
        p_unk_outer: *const std::ffi::c_void,
        dw_cls_context: u32,
        riid: *const ComGuid,
        ppv: *mut *mut std::ffi::c_void,
    ) -> i32;
    fn GetClipboardSequenceNumber() -> u32;
    fn OpenClipboard(h_wnd_new_owner: *mut std::ffi::c_void) -> i32;
    fn CloseClipboard() -> i32;
    fn GetClipboardData(u_format: u32) -> *mut std::ffi::c_void;
    fn IsClipboardFormatAvailable(format: u32) -> i32;
    fn RegisterClipboardFormatW(lpsz_format: *const u16) -> u32;
    fn GlobalLock(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn GlobalUnlock(h_mem: *mut std::ffi::c_void) -> i32;
}

/// Đọc văn bản từ Windows Clipboard an toàn (tự động bỏ qua dữ liệu nhạy cảm của trình quản lý mật khẩu)
fn read_clipboard_text_safe() -> Option<String> {
    static CLIP_SENSITIVE_FMTS: std::sync::OnceLock<(u32, u32, u32)> = std::sync::OnceLock::new();
    let &(fmt_exclude, fmt_ignore, fmt_can_include) = CLIP_SENSITIVE_FMTS.get_or_init(|| unsafe {
        let to_w = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
        let f1 = RegisterClipboardFormatW(to_w("ExcludeClipboardContentFromMonitorProcessing").as_ptr());
        let f2 = RegisterClipboardFormatW(to_w("Clipboard Viewer Ignore").as_ptr());
        let f3 = RegisterClipboardFormatW(to_w("CanIncludeInClipboardHistory").as_ptr());
        (f1, f2, f3)
    });

    const CF_UNICODETEXT: u32 = 13;
    unsafe {
        if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
            return None;
        }
        if fmt_exclude != 0 && IsClipboardFormatAvailable(fmt_exclude) != 0 {
            return None;
        }
        if fmt_ignore != 0 && IsClipboardFormatAvailable(fmt_ignore) != 0 {
            return None;
        }
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }
        if fmt_can_include != 0 && IsClipboardFormatAvailable(fmt_can_include) != 0 {
            let h_inc = GetClipboardData(fmt_can_include);
            if !h_inc.is_null() {
                let p_inc = GlobalLock(h_inc) as *const u32;
                if !p_inc.is_null() {
                    let allow = *p_inc;
                    let _ = GlobalUnlock(h_inc);
                    if allow == 0 {
                        let _ = CloseClipboard();
                        return None;
                    }
                }
            }
        }

        let mut out: Option<String> = None;
        let h_data = GetClipboardData(CF_UNICODETEXT);
        if !h_data.is_null() {
            let ptr = GlobalLock(h_data) as *const u16;
            if !ptr.is_null() {
                let mut len = 0usize;
                while len < 16384 && *ptr.add(len) != 0 {
                    len += 1;
                }
                if len > 0 {
                    let slice = std::slice::from_raw_parts(ptr, len);
                    let text = String::from_utf16_lossy(slice).trim().to_string();
                    if !text.is_empty() {
                        out = Some(text);
                    }
                }
                let _ = GlobalUnlock(h_data);
            }
        }
        let _ = CloseClipboard();
        out
    }
}

unsafe fn com_release(obj: *mut std::ffi::c_void) {
    unsafe {
        if !obj.is_null() {
            let vtbl = *(obj as *const *const usize);
            let release_fn: unsafe extern "system" fn(*mut std::ffi::c_void) -> u32 =
                std::mem::transmute(*vtbl.add(2));
            let _ = release_fn(obj);
        }
    }
}

/// Mở IAudioEndpointVolume của thiết bị loa mặc định (eRender = 0, eConsole = 0)
unsafe fn open_default_audio_interface(iid: &ComGuid) -> Option<*mut std::ffi::c_void> {
    unsafe {
        let hr_co = CoInitializeEx(std::ptr::null(), 0); // COINIT_MULTITHREADED (0x0) cho luồng nền
        if hr_co == -2147417850i32 {
            // RPC_E_CHANGED_MODE (0x80010106) - fallback sang STA nếu luồng hiện tại yêu cầu STA
            let _ = CoInitializeEx(std::ptr::null(), 2);
        }
        let mut enumerator: *mut std::ffi::c_void = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &CLSID_MMDEVICE_ENUMERATOR,
            std::ptr::null(),
            0x17, // CLSCTX_ALL
            &IID_IMMDEVICE_ENUMERATOR,
            &mut enumerator,
        );
        if hr < 0 || enumerator.is_null() {
            return None;
        }

        // IMMDeviceEnumerator::GetDefaultAudioEndpoint (vtable index 4 = offset 0x20)
        let enum_vtbl = *(enumerator as *const *const usize);
        let get_default_endpoint: unsafe extern "system" fn(
            *mut std::ffi::c_void,
            u32,
            u32,
            *mut *mut std::ffi::c_void,
        ) -> i32 = std::mem::transmute(*enum_vtbl.add(4));

        let mut device: *mut std::ffi::c_void = std::ptr::null_mut();
        let hr_dev = get_default_endpoint(enumerator, 0, 0, &mut device);
        if hr_dev < 0 || device.is_null() {
            com_release(enumerator);
            return None;
        }

        // IMMDevice::Activate (vtable index 3 = offset 0x18)
        let dev_vtbl = *(device as *const *const usize);
        let activate_fn: unsafe extern "system" fn(
            *mut std::ffi::c_void,
            *const ComGuid,
            u32,
            *const std::ffi::c_void,
            *mut *mut std::ffi::c_void,
        ) -> i32 = std::mem::transmute(*dev_vtbl.add(3));

        let mut out_iface: *mut std::ffi::c_void = std::ptr::null_mut();
        let hr_act = activate_fn(
            device,
            iid,
            0x17,
            std::ptr::null(),
            &mut out_iface,
        );

        com_release(device);
        com_release(enumerator);

        if hr_act < 0 || out_iface.is_null() {
            None
        } else {
            Some(out_iface)
        }
    }
}

unsafe fn open_default_audio_endpoint_volume() -> Option<*mut std::ffi::c_void> {
    unsafe { open_default_audio_interface(&IID_IAUDIO_ENDPOINT_VOLUME) }
}

/// Đọc biên độ âm thanh thời gian thực (0.0..=1.0) đang phát ra loa qua WASAPI IAudioMeterInformation::GetPeakValue (có cache COM pointer để giảm tải CPU)
fn read_system_audio_peak_cached(
    cached_meter: &mut *mut std::ffi::c_void,
    opened_at: &mut Option<Instant>,
) -> f32 {
    unsafe {
        let need_reopen = cached_meter.is_null()
            || opened_at
                .map(|t| t.elapsed() >= Duration::from_secs(60))
                .unwrap_or(true);
        if need_reopen {
            if !cached_meter.is_null() {
                com_release(*cached_meter);
                *cached_meter = std::ptr::null_mut();
            }
            if let Some(m) = open_default_audio_interface(&IID_IAUDIO_METER_INFORMATION) {
                *cached_meter = m;
                *opened_at = Some(Instant::now());
            } else {
                return 0.0;
            }
        }
        let meter = *cached_meter;
        if meter.is_null() {
            return 0.0;
        }
        let vtbl = *(meter as *const *const usize);
        // IAudioMeterInformation::GetPeakValue: vtable index 3
        let get_peak_fn: unsafe extern "system" fn(*mut std::ffi::c_void, *mut f32) -> i32 =
            std::mem::transmute(*vtbl.add(3));
        let mut peak: f32 = 0.0;
        if get_peak_fn(meter, &mut peak) >= 0 {
            peak.clamp(0.0, 1.0)
        } else {
            com_release(meter);
            *cached_meter = std::ptr::null_mut();
            0.0
        }
    }
}

/// Đọc chính xác % âm lượng hệ thống Windows (0..=100) và trạng thái Mute từ IAudioEndpointVolume (có cache COM pointer để giảm 95% tải COM)
fn read_system_volume_and_mute_cached(
    cached_vol: &mut *mut std::ffi::c_void,
    opened_at: &mut Option<Instant>,
) -> Option<(u8, bool)> {
    unsafe {
        let need_reopen = cached_vol.is_null()
            || opened_at
                .map(|t| t.elapsed() >= Duration::from_secs(60))
                .unwrap_or(true);
        if need_reopen {
            if !cached_vol.is_null() {
                com_release(*cached_vol);
                *cached_vol = std::ptr::null_mut();
            }
            if let Some(ep) = open_default_audio_endpoint_volume() {
                *cached_vol = ep;
                *opened_at = Some(Instant::now());
            } else {
                return None;
            }
        }
        let ep_vol = *cached_vol;
        if ep_vol.is_null() {
            return None;
        }
        let vtbl = *(ep_vol as *const *const usize);

        // GetMasterVolumeLevelScalar: vtable index 9
        let get_vol_fn: unsafe extern "system" fn(*mut std::ffi::c_void, *mut f32) -> i32 =
            std::mem::transmute(*vtbl.add(9));
        // GetMute: vtable index 15
        let get_mute_fn: unsafe extern "system" fn(*mut std::ffi::c_void, *mut i32) -> i32 =
            std::mem::transmute(*vtbl.add(15));

        let mut level: f32 = 0.0;
        let mut muted: i32 = 0;
        let ok_v = get_vol_fn(ep_vol, &mut level) >= 0;
        let ok_m = get_mute_fn(ep_vol, &mut muted) >= 0;

        if ok_v && ok_m {
            let pct = (level.clamp(0.0, 1.0) * 100.0).round() as u8;
            Some((pct, muted != 0))
        } else {
            com_release(ep_vol);
            *cached_vol = std::ptr::null_mut();
            *opened_at = None;
            None
        }
    }
}

/// Thay đổi âm lượng hệ thống Windows trực tiếp qua IAudioEndpointVolume
fn write_system_volume_and_mute(level_pct: Option<u8>, mute: Option<bool>) -> Option<(u8, bool)> {
    unsafe {
        let ep_vol = open_default_audio_endpoint_volume()?;
        let vtbl = *(ep_vol as *const *const usize);

        // SetMasterVolumeLevelScalar: vtable index 7 (offset 0x38)
        let set_vol_fn: unsafe extern "system" fn(
            *mut std::ffi::c_void,
            f32,
            *const ComGuid,
        ) -> i32 = std::mem::transmute(*vtbl.add(7));
        // SetMute: vtable index 14 (offset 0x70)
        let set_mute_fn: unsafe extern "system" fn(
            *mut std::ffi::c_void,
            i32,
            *const ComGuid,
        ) -> i32 = std::mem::transmute(*vtbl.add(14));
        let get_vol_fn: unsafe extern "system" fn(*mut std::ffi::c_void, *mut f32) -> i32 =
            std::mem::transmute(*vtbl.add(9));
        let get_mute_fn: unsafe extern "system" fn(*mut std::ffi::c_void, *mut i32) -> i32 =
            std::mem::transmute(*vtbl.add(15));

        if let Some(p) = level_pct {
            let scalar = (p.min(100) as f32) / 100.0;
            let _ = set_vol_fn(ep_vol, scalar, &GUID_NULL_COM);
            if p > 0 && mute.is_none() {
                let _ = set_mute_fn(ep_vol, 0, &GUID_NULL_COM);
            }
        }
        if let Some(m) = mute {
            let _ = set_mute_fn(ep_vol, if m { 1 } else { 0 }, &GUID_NULL_COM);
        }

        let mut level: f32 = 0.0;
        let mut muted: i32 = 0;
        let _ = get_vol_fn(ep_vol, &mut level);
        let _ = get_mute_fn(ep_vol, &mut muted);
        com_release(ep_vol);

        let pct = (level.clamp(0.0, 1.0) * 100.0).round() as u8;
        Some((pct, muted != 0))
    }
}

#[tauri::command]
fn set_system_volume(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppSharedState>,
    level_pct: Option<u8>,
    mute: Option<bool>,
) -> Result<(u8, bool), String> {
    let (pct, muted) = write_system_volume_and_mute(level_pct, mute)
        .ok_or_else(|| "Không thể truy cập âm thanh hệ thống".to_string())?;
    if let Ok(mut hw) = state.hw.lock() {
        hw.volume_pct = pct;
        hw.volume_muted = muted;
        hw.vol_seq = hw.vol_seq.wrapping_add(1);
        hw.vol_kind = if muted { "vol_mute".into() } else { "vol_set".into() };
        let _ = app_handle.emit("island-hw", &*hw);
    }
    Ok((pct, muted))
}

/// Giải phóng bộ nhớ Working Set không dùng tới của cả tiến trình Rust lẫn cây tiến trình con WebView2
fn trim_process_tree_memory() {
    unsafe {
        let _ = K32EmptyWorkingSet(GetCurrentProcess());
        let my_pid = GetCurrentProcessId();
        let snap = CreateToolhelp32Snapshot(0x00000002, 0);
        if snap.is_null() || snap as isize == -1 {
            return;
        }
        let mut entries: Vec<(u32, u32)> = Vec::with_capacity(128);
        let mut pe: ProcessEntry32W = std::mem::zeroed();
        pe.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
        if Process32FirstW(snap, &mut pe) != 0 {
            loop {
                entries.push((pe.th32_process_id, pe.th32_parent_process_id));
                if Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);

        let mut target_pids = vec![my_pid];
        let mut idx = 0;
        while idx < target_pids.len() {
            let parent = target_pids[idx];
            idx += 1;
            for &(pid, ppid) in &entries {
                if ppid == parent && !target_pids.contains(&pid) {
                    target_pids.push(pid);
                }
            }
        }

        // PROCESS_QUERY_LIMITED_INFORMATION (0x1000) | PROCESS_QUERY_INFORMATION (0x0400) | PROCESS_SET_QUOTA (0x0100)
        for &pid in target_pids.iter().skip(1) {
            let h = OpenProcess(0x1000 | 0x0400 | 0x0100, 0, pid);
            if !h.is_null() {
                let _ = K32EmptyWorkingSet(h);
                let _ = CloseHandle(h);
            }
        }
    }
}

#[tauri::command]
fn trim_system_memory() {
    trim_process_tree_memory();
}

#[tauri::command]
fn set_auto_trim_memory(enable: bool) {
    AUTO_TRIM_MEMORY.store(enable, Ordering::Relaxed);
}

#[tauri::command]
fn set_global_hotkeys(enable: bool) {
    HOTKEYS_ENABLED.store(enable, Ordering::Relaxed);
}

#[repr(C)]
struct BitmapInfoHeader {
    bi_size: u32,
    bi_width: i32,
    bi_height: i32,
    bi_planes: u16,
    bi_bit_count: u16,
    bi_compression: u32,
    bi_size_image: u32,
    bi_xpels_per_meter: i32,
    bi_ypels_per_meter: i32,
    bi_clr_used: u32,
    bi_clr_important: u32,
}

#[repr(C)]
struct BitmapInfo {
    bmi_header: BitmapInfoHeader,
    bmi_colors: [u32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct FileTimeRaw {
    dw_low_date_time: u32,
    dw_high_date_time: u32,
}

#[repr(C)]
struct MemoryStatusEx {
    dw_length: u32,
    dw_memory_load: u32,
    ull_total_phys: u64,
    ull_avail_phys: u64,
    ull_total_page_file: u64,
    ull_avail_page_file: u64,
    ull_total_virtual: u64,
    ull_avail_virtual: u64,
    ull_avail_extended_virtual: u64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct MibIfRow {
    _wsz_name: [u16; 256],
    dw_index: u32,
    dw_type: u32,
    _dw_mtu: u32,
    _dw_speed: u32,
    _dw_phys_addr_len: u32,
    _b_phys_addr: [u8; 8],
    _dw_admin_status: u32,
    dw_oper_status: u32,
    _dw_last_change: u32,
    dw_in_octets: u32,
    _dw_in_ucast_pkts: u32,
    _dw_in_nucast_pkts: u32,
    _dw_in_discards: u32,
    _dw_in_errors: u32,
    _dw_in_unknown_protos: u32,
    dw_out_octets: u32,
    _dw_out_ucast_pkts: u32,
    _dw_out_nucast_pkts: u32,
    _dw_out_discards: u32,
    _dw_out_errors: u32,
    _dw_out_qlen: u32,
    _dw_descr_len: u32,
    _b_descr: [u8; 256],
}

#[link(name = "user32")]
unsafe extern "system" {
    fn GetDC(h_wnd: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn ReleaseDC(h_wnd: *mut std::ffi::c_void, h_dc: *mut std::ffi::c_void) -> i32;
    fn GetSystemMetrics(n_index: i32) -> i32;
    fn GetWindowTextW(h_wnd: *mut std::ffi::c_void, lp_string: *mut u16, n_max_count: i32) -> i32;
}

#[link(name = "gdi32")]
unsafe extern "system" {
    fn CreateCompatibleDC(hdc: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn DeleteDC(hdc: *mut std::ffi::c_void) -> i32;
    fn CreateDIBSection(
        hdc: *mut std::ffi::c_void,
        lpbmi: *const BitmapInfo,
        usage: u32,
        ppv_bits: *mut *mut std::ffi::c_void,
        h_section: *mut std::ffi::c_void,
        offset: u32,
    ) -> *mut std::ffi::c_void;
    fn SelectObject(hdc: *mut std::ffi::c_void, h: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn DeleteObject(ho: *mut std::ffi::c_void) -> i32;
    fn SetStretchBltMode(hdc: *mut std::ffi::c_void, mode: i32) -> i32;
    fn StretchBlt(
        hdc_dest: *mut std::ffi::c_void,
        x_dest: i32,
        y_dest: i32,
        w_dest: i32,
        h_dest: i32,
        hdc_src: *mut std::ffi::c_void,
        x_src: i32,
        y_src: i32,
        w_src: i32,
        h_src: i32,
        rop: u32,
    ) -> i32;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
    fn GetSystemTimes(
        lp_idle_time: *mut FileTimeRaw,
        lp_kernel_time: *mut FileTimeRaw,
        lp_user_time: *mut FileTimeRaw,
    ) -> i32;
}

#[link(name = "iphlpapi")]
unsafe extern "system" {
    fn GetIfTable(p_if_table: *mut u8, pdw_size: *mut u32, b_order: i32) -> u32;
}

const fn make_crc32_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = i as u32;
        let mut k = 0;
        while k < 8 {
            c = if (c & 1) != 0 {
                0xEDB8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
            k += 1;
        }
        table[i] = c;
        i += 1;
    }
    table
}

const PNG_CRC_TABLE: [u32; 256] = make_crc32_table();

fn png_crc32(data: &[u8]) -> u32 {
    let mut c = 0xFFFF_FFFFu32;
    for &b in data {
        c = PNG_CRC_TABLE[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    c ^ 0xFFFF_FFFF
}

fn append_png_chunk(out: &mut Vec<u8>, tag: &[u8; 4], payload: &[u8]) {
    out.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(tag);
    out.extend_from_slice(payload);
    let crc = png_crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
}

fn encode_rgb24_to_png(width: u32, height: u32, bgr_top_down: &[u8], stride: usize) -> Vec<u8> {
    let row_len = 1 + (width as usize) * 3;
    let mut raw_scan = Vec::with_capacity(row_len * (height as usize));
    for y in 0..height as usize {
        raw_scan.push(0); // filter type None
        let src_row = &bgr_top_down[y * stride..y * stride + (width as usize) * 3];
        for px in src_row.chunks_exact(3) {
            raw_scan.push(px[2]); // R
            raw_scan.push(px[1]); // G
            raw_scan.push(px[0]); // B
        }
    }

    // Zlib uncompressed stream with stored DEFLATE blocks
    let num_blocks = (raw_scan.len() + 65534) / 65535;
    let mut zlib = Vec::with_capacity(2 + raw_scan.len() + num_blocks * 5 + 4);
    zlib.push(0x78);
    zlib.push(0x01);

    let mut s1: u32 = 1;
    let mut s2: u32 = 0;
    for &b in &raw_scan {
        s1 = (s1 + b as u32) % 65521;
        s2 = (s2 + s1) % 65521;
    }
    let adler = (s2 << 16) | s1;

    let mut offset = 0usize;
    while offset < raw_scan.len() {
        let chunk_len = (raw_scan.len() - offset).min(65535);
        let is_last = offset + chunk_len >= raw_scan.len();
        zlib.push(if is_last { 1 } else { 0 });
        let len_u16 = chunk_len as u16;
        zlib.extend_from_slice(&len_u16.to_le_bytes());
        zlib.extend_from_slice(&(!len_u16).to_le_bytes());
        zlib.extend_from_slice(&raw_scan[offset..offset + chunk_len]);
        offset += chunk_len;
    }
    zlib.extend_from_slice(&adler.to_be_bytes());

    let mut png = Vec::with_capacity(8 + 25 + 12 + zlib.len() + 12);
    png.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);
    let mut ihdr = [0u8; 13];
    ihdr[0..4].copy_from_slice(&width.to_be_bytes());
    ihdr[4..8].copy_from_slice(&height.to_be_bytes());
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    append_png_chunk(&mut png, b"IHDR", &ihdr);
    append_png_chunk(&mut png, b"IDAT", &zlib);
    append_png_chunk(&mut png, b"IEND", &[]);
    png
}

fn capture_foreground_window_png(own_hwnds: &[isize]) -> Result<AiFileAttachment, String> {
    unsafe {
        let fg = GetForegroundWindow();
        let mut src_x = 0i32;
        let mut src_y = 0i32;
        let mut src_w = GetSystemMetrics(0).max(640);
        let mut src_h = GetSystemMetrics(1).max(360);
        let mut title = "Màn hình chính.png".to_string();

        if !fg.0.is_null()
            && !own_hwnds.contains(&(fg.0 as isize))
            && IsWindowVisible(fg.0) != 0
            && IsIconic(fg.0) == 0
        {
            let mut wr = RECT::default();
            if GetWindowRect(fg, &mut wr).is_ok() {
                let w = wr.right - wr.left;
                let h = wr.bottom - wr.top;
                if w >= 80 && h >= 60 {
                    src_x = wr.left;
                    src_y = wr.top;
                    src_w = w;
                    src_h = h;
                    let mut tbuf = [0u16; 128];
                    let tlen = GetWindowTextW(fg.0, tbuf.as_mut_ptr(), 128);
                    if tlen > 0 {
                        let raw_title = String::from_utf16_lossy(&tbuf[..tlen as usize])
                            .trim()
                            .to_string();
                        if !raw_title.is_empty() {
                            let short: String = raw_title.chars().take(28).collect();
                            title = format!("{}.png", short);
                        }
                    }
                }
            }
        }

        let max_w = 960.0f64;
        let max_h = 600.0f64;
        let scale = (max_w / src_w as f64).min(max_h / src_h as f64).min(1.0);
        let dst_w = ((src_w as f64 * scale).round() as i32).max(64);
        let dst_h = ((src_h as f64 * scale).round() as i32).max(48);

        let screen_dc = GetDC(std::ptr::null_mut());
        if screen_dc.is_null() {
            return Err("Không thể lấy DC màn hình để chụp ảnh".to_string());
        }
        let mem_dc = CreateCompatibleDC(screen_dc);
        if mem_dc.is_null() {
            let _ = ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err("Không thể tạo CompatibleDC".to_string());
        }

        let bi = BitmapInfo {
            bmi_header: BitmapInfoHeader {
                bi_size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                bi_width: dst_w,
                bi_height: -dst_h, // top-down DIB
                bi_planes: 1,
                bi_bit_count: 24,
                bi_compression: 0, // BI_RGB
                bi_size_image: 0,
                bi_xpels_per_meter: 0,
                bi_ypels_per_meter: 0,
                bi_clr_used: 0,
                bi_clr_important: 0,
            },
            bmi_colors: [0; 3],
        };

        let mut bits_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
        let h_bmp = CreateDIBSection(mem_dc, &bi, 0, &mut bits_ptr, std::ptr::null_mut(), 0);
        if h_bmp.is_null() || bits_ptr.is_null() {
            if !h_bmp.is_null() {
                let _ = DeleteObject(h_bmp);
            }
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err("Không thể cấp phát bitmap chụp ảnh".to_string());
        }

        let old_obj = SelectObject(mem_dc, h_bmp);
        let _ = SetStretchBltMode(mem_dc, 4); // HALFTONE
        let ok = StretchBlt(
            mem_dc,
            0,
            0,
            dst_w,
            dst_h,
            screen_dc,
            src_x,
            src_y,
            src_w,
            src_h,
            0x00CC0020, // SRCCOPY
        );

        let stride = (((dst_w as usize) * 3 + 3) & !3) as usize;
        let png_res = if ok != 0 {
            let total_bytes = stride * (dst_h as usize);
            let pixels = std::slice::from_raw_parts(bits_ptr as *const u8, total_bytes);
            Ok(encode_rgb24_to_png(dst_w as u32, dst_h as u32, pixels, stride))
        } else {
            Err("Không thể chụp nội dung cửa sổ".to_string())
        };

        // Giải phóng triệt để 100% GDI handles ngay lập tức
        let _ = SelectObject(mem_dc, old_obj);
        let _ = DeleteObject(h_bmp);
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(std::ptr::null_mut(), screen_dc);

        let png_bytes = png_res?;
        let kb = png_bytes.len() as f64 / 1024.0;
        let size_str = if kb < 1024.0 {
            format!("{:.0} KB", kb)
        } else {
            format!("{:.1} MB", kb / 1024.0)
        };
        let b64 = base64_encode(&png_bytes);
        Ok(AiFileAttachment {
            name: title,
            is_image: true,
            size_str,
            data: format!("data:image/png;base64,{}", b64),
        })
    }
}

#[tauri::command]
fn capture_active_window(app_handle: tauri::AppHandle) -> Result<AiFileAttachment, String> {
    let mut own: Vec<isize> = Vec::new();
    for lbl in ["main", "notch_2", "notch_3", "notch_4", "settings"] {
        if let Some(w) = app_handle.get_webview_window(lbl) {
            if let Ok(h) = w.hwnd() {
                own.push(h.0 as isize);
            }
        }
    }
    capture_foreground_window_png(&own)
}

struct SystemMetricsTracker {
    prev_idle: u64,
    prev_kernel: u64,
    prev_user: u64,
    has_cpu_prev: bool,
    prev_net: HashMap<u32, (u32, u32)>,
    prev_net_at: Option<Instant>,
    net_buf: Vec<u8>,
}

impl SystemMetricsTracker {
    fn new() -> Self {
        Self {
            prev_idle: 0,
            prev_kernel: 0,
            prev_user: 0,
            has_cpu_prev: false,
            prev_net: HashMap::new(),
            prev_net_at: None,
            net_buf: vec![0u8; 32768],
        }
    }

    fn ft_to_u64(ft: FileTimeRaw) -> u64 {
        ((ft.dw_high_date_time as u64) << 32) | (ft.dw_low_date_time as u64)
    }

    fn sample(&mut self) -> (u8, u8, u16, u16, u32, u32) {
        let mut cpu_pct = 0u8;
        let mut ram_pct = 0u8;
        let mut ram_used_x10 = 0u16;
        let mut ram_total_x10 = 0u16;
        let mut net_down_kbps = 0u32;
        let mut net_up_kbps = 0u32;

        unsafe {
            // 1. RAM
            let mut mem: MemoryStatusEx = std::mem::zeroed();
            mem.dw_length = std::mem::size_of::<MemoryStatusEx>() as u32;
            if GlobalMemoryStatusEx(&mut mem) != 0 && mem.ull_total_phys > 0 {
                ram_pct = mem.dw_memory_load.min(100) as u8;
                let total_gb = mem.ull_total_phys as f64 / 1_073_741_824.0;
                let used_gb = mem.ull_total_phys.saturating_sub(mem.ull_avail_phys) as f64 / 1_073_741_824.0;
                ram_total_x10 = (total_gb * 10.0).round().clamp(0.0, 65000.0) as u16;
                ram_used_x10 = (used_gb * 10.0).round().clamp(0.0, 65000.0) as u16;
            }

            // 2. CPU
            let mut f_idle = FileTimeRaw::default();
            let mut f_kernel = FileTimeRaw::default();
            let mut f_user = FileTimeRaw::default();
            if GetSystemTimes(&mut f_idle, &mut f_kernel, &mut f_user) != 0 {
                let idle = Self::ft_to_u64(f_idle);
                let kernel = Self::ft_to_u64(f_kernel);
                let user = Self::ft_to_u64(f_user);
                if self.has_cpu_prev {
                    let d_idle = idle.saturating_sub(self.prev_idle);
                    let d_total = kernel
                        .saturating_sub(self.prev_kernel)
                        .saturating_add(user.saturating_sub(self.prev_user));
                    if d_total > 0 {
                        let busy = d_total.saturating_sub(d_idle);
                        cpu_pct = ((busy as f64 / d_total as f64) * 100.0)
                            .round()
                            .clamp(0.0, 100.0) as u8;
                    }
                }
                self.prev_idle = idle;
                self.prev_kernel = kernel;
                self.prev_user = user;
                self.has_cpu_prev = true;
            }

            // 3. Network speed (GetIfTable)
            let mut sz = self.net_buf.len() as u32;
            let mut ret = GetIfTable(self.net_buf.as_mut_ptr(), &mut sz, 0);
            if ret == 122 && (sz as usize) > self.net_buf.len() && (sz as usize) <= 512 * 1024 {
                self.net_buf.resize(sz as usize, 0);
                ret = GetIfTable(self.net_buf.as_mut_ptr(), &mut sz, 0);
            }
            if ret == 0 && self.net_buf.len() >= 4 {
                let count = u32::from_ne_bytes([
                    self.net_buf[0],
                    self.net_buf[1],
                    self.net_buf[2],
                    self.net_buf[3],
                ]) as usize;
                let row_size = std::mem::size_of::<MibIfRow>();
                let max_fit = (self.net_buf.len().saturating_sub(4)) / row_size;
                let n = count.min(max_fit);

                let now = Instant::now();
                let dt_secs = self
                    .prev_net_at
                    .map(|t| t.elapsed().as_secs_f64())
                    .unwrap_or(0.0);

                let mut d_in_bytes: u64 = 0;
                let mut d_out_bytes: u64 = 0;
                let rows_ptr = self.net_buf.as_ptr().add(4) as *const MibIfRow;
                for i in 0..n {
                    let row = &*rows_ptr.add(i);
                    // Loại trừ loopback (24) và giao diện không hoạt động (oper_status == 5 là IF_OPER_STATUS_OPERATIONAL)
                    if row.dw_type == 24 || row.dw_oper_status != 5 {
                        continue;
                    }
                    if let Some(&(p_in, p_out)) = self.prev_net.get(&row.dw_index) {
                        let di = row.dw_in_octets.wrapping_sub(p_in);
                        let do_ = row.dw_out_octets.wrapping_sub(p_out);
                        if di < 250_000_000 {
                            d_in_bytes = d_in_bytes.saturating_add(di as u64);
                        }
                        if do_ < 250_000_000 {
                            d_out_bytes = d_out_bytes.saturating_add(do_ as u64);
                        }
                    }
                    self.prev_net
                        .insert(row.dw_index, (row.dw_in_octets, row.dw_out_octets));
                }
                if dt_secs >= 0.25 {
                    net_down_kbps = ((d_in_bytes as f64 / 1024.0) / dt_secs)
                        .round()
                        .clamp(0.0, 9_999_999.0) as u32;
                    net_up_kbps = ((d_out_bytes as f64 / 1024.0) / dt_secs)
                        .round()
                        .clamp(0.0, 9_999_999.0) as u32;
                }
                self.prev_net_at = Some(now);
            }
        }

        (cpu_pct, ram_pct, ram_used_x10, ram_total_x10, net_down_kbps, net_up_kbps)
    }
}

// ============================================================
// CÁC TÍNH NĂNG MỞ RỘNG (QR, LAN SEND, QUICK OPS, COLOR PICKER, PRIVACY, DOWNLOADS, DEVICES)
// ============================================================

mod island_qr {
    #[derive(Clone, Debug, PartialEq, Eq)]
    pub struct Matrix {
        pub size: usize,
        pub version: u8,
        pub mask: u8,
        pub modules: Vec<bool>,
    }

    impl Matrix {
        pub fn get(&self, x: usize, y: usize) -> bool {
            self.modules[y * self.size + x]
        }
    }

    fn blocks(version: u8) -> (usize, &'static [(usize, usize)]) {
        match version {
            1 => (10, &[(1, 16)]),
            2 => (16, &[(1, 28)]),
            3 => (26, &[(1, 44)]),
            4 => (18, &[(2, 32)]),
            5 => (24, &[(2, 43)]),
            6 => (16, &[(4, 27)]),
            7 => (18, &[(4, 31)]),
            8 => (22, &[(2, 38), (2, 39)]),
            9 => (22, &[(3, 36), (2, 37)]),
            _ => (26, &[(4, 43), (1, 44)]),
        }
    }

    fn data_capacity(version: u8) -> usize {
        blocks(version).1.iter().map(|(n, d)| n * d).sum()
    }

    fn alignment_positions(version: u8) -> &'static [usize] {
        match version {
            1 => &[],
            2 => &[6, 18],
            3 => &[6, 22],
            4 => &[6, 26],
            5 => &[6, 30],
            6 => &[6, 34],
            7 => &[6, 22, 38],
            8 => &[6, 24, 42],
            9 => &[6, 26, 46],
            _ => &[6, 28, 50],
        }
    }

    fn gf_mul(a: u8, b: u8) -> u8 {
        let (mut a, mut b, mut r) = (a as u16, b, 0u16);
        while b != 0 {
            if b & 1 != 0 {
                r ^= a;
            }
            a <<= 1;
            if a & 0x100 != 0 {
                a ^= 0x11D;
            }
            b >>= 1;
        }
        r as u8
    }

    pub fn rs_ecc(data: &[u8], n: usize) -> Vec<u8> {
        let mut poly = vec![0u8; n];
        poly[n - 1] = 1;
        let mut root = 1u8;
        for _ in 0..n {
            for j in 0..n {
                poly[j] = gf_mul(poly[j], root);
                if j + 1 < n {
                    poly[j] ^= poly[j + 1];
                }
            }
            root = gf_mul(root, 2);
        }
        let mut rem = vec![0u8; n];
        for &b in data {
            let factor = b ^ rem[0];
            rem.remove(0);
            rem.push(0);
            for (r, g) in rem.iter_mut().zip(&poly) {
                *r ^= gf_mul(*g, factor);
            }
        }
        rem
    }

    fn format_bits(mask: u8) -> u16 {
        let data = mask as u32;
        let mut rem = data;
        for _ in 0..10 {
            rem = (rem << 1) ^ ((rem >> 9) * 0x537);
        }
        (((data << 10) | rem) ^ 0x5412) as u16
    }

    fn version_bits(version: u8) -> u32 {
        let mut rem = version as u32;
        for _ in 0..12 {
            rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
        }
        ((version as u32) << 12) | rem
    }

    struct Grid {
        size: usize,
        dark: Vec<bool>,
        func: Vec<bool>,
    }

    impl Grid {
        fn set(&mut self, x: usize, y: usize, dark: bool) {
            let i = y * self.size + x;
            self.dark[i] = dark;
            self.func[i] = true;
        }

        fn finder(&mut self, cx: i32, cy: i32) {
            for dy in -4i32..=4 {
                for dx in -4i32..=4 {
                    let (x, y) = (cx + dx, cy + dy);
                    if x < 0 || y < 0 || x >= self.size as i32 || y >= self.size as i32 {
                        continue;
                    }
                    let d = dx.abs().max(dy.abs());
                    self.set(x as usize, y as usize, d != 2 && d != 4);
                }
            }
        }

        fn alignment(&mut self, cx: usize, cy: usize) {
            for dy in -2i32..=2 {
                for dx in -2i32..=2 {
                    self.set(
                        (cx as i32 + dx) as usize,
                        (cy as i32 + dy) as usize,
                        dx.abs().max(dy.abs()) != 1,
                    );
                }
            }
        }

        fn format(&mut self, mask: u8) {
            let bits = format_bits(mask);
            let bit = |i: u32| (bits >> i) & 1 != 0;
            let s = self.size;
            for i in 0..=5 {
                self.set(8, i, bit(i as u32));
            }
            self.set(8, 7, bit(6));
            self.set(8, 8, bit(7));
            self.set(7, 8, bit(8));
            for i in 9..15 {
                self.set(14 - i, 8, bit(i as u32));
            }
            for i in 0..8 {
                self.set(s - 1 - i, 8, bit(i as u32));
            }
            for i in 8..15 {
                self.set(8, s - 15 + i, bit(i as u32));
            }
            self.set(8, s - 8, true);
        }

        fn version(&mut self, version: u8) {
            if version < 7 {
                return;
            }
            let bits = version_bits(version);
            let s = self.size;
            for i in 0..18 {
                let dark = (bits >> i) & 1 != 0;
                let (a, b) = (s - 11 + i % 3, i / 3);
                self.set(a, b, dark);
                self.set(b, a, dark);
            }
        }
    }

    fn mask_bit(mask: u8, x: usize, y: usize) -> bool {
        match mask {
            0 => (x + y) % 2 == 0,
            1 => y % 2 == 0,
            2 => x % 3 == 0,
            3 => (x + y) % 3 == 0,
            4 => (x / 3 + y / 2) % 2 == 0,
            5 => x * y % 2 + x * y % 3 == 0,
            6 => (x * y % 2 + x * y % 3) % 2 == 0,
            _ => ((x + y) % 2 + x * y % 3) % 2 == 0,
        }
    }

    fn penalty(size: usize, m: &[bool]) -> u32 {
        let at = |x: usize, y: usize| m[y * size + x];
        let mut score = 0u32;
        for horizontal in [true, false] {
            for a in 0..size {
                let line: Vec<bool> = (0..size)
                    .map(|b| if horizontal { at(b, a) } else { at(a, b) })
                    .collect();
                let mut run = 1;
                for i in 1..=size {
                    if i < size && line[i] == line[i - 1] {
                        run += 1;
                    } else {
                        if run >= 5 {
                            score += 3 + (run - 5) as u32;
                        }
                        run = 1;
                    }
                }
                let pat = [true, false, true, true, true, false, true];
                for i in 0..size.saturating_sub(6) {
                    if (0..7).all(|k| line[i + k] == pat[k]) {
                        let light = |from: i32, to: i32| {
                            (from..to).all(|k| k < 0 || k >= size as i32 || !line[k as usize])
                        };
                        if light(i as i32 - 4, i as i32) || light(i as i32 + 7, i as i32 + 11) {
                            score += 40;
                        }
                    }
                }
            }
        }
        for y in 0..size - 1 {
            for x in 0..size - 1 {
                let c = at(x, y);
                if c == at(x + 1, y) && c == at(x, y + 1) && c == at(x + 1, y + 1) {
                    score += 3;
                }
            }
        }
        let dark = m.iter().filter(|d| **d).count() as i64;
        let total = (size * size) as i64;
        let k = ((dark * 20 - total * 10).abs() + total - 1) / total - 1;
        score + (k.max(0) as u32) * 10
    }

    pub fn encode(text: &str) -> Option<Matrix> {
        let bytes = text.as_bytes();
        let version = (1u8..=10).find(|v| {
            let count_bits = if *v < 10 { 8 } else { 16 };
            4 + count_bits + bytes.len() * 8 <= data_capacity(*v) * 8
        })?;
        let cap = data_capacity(version);
        let mut bits: Vec<bool> = Vec::with_capacity(cap * 8);
        let push = |v: u32, n: usize, bits: &mut Vec<bool>| {
            for i in (0..n).rev() {
                bits.push((v >> i) & 1 != 0);
            }
        };
        push(0b0100, 4, &mut bits);
        push(bytes.len() as u32, if version < 10 { 8 } else { 16 }, &mut bits);
        for b in bytes {
            push(*b as u32, 8, &mut bits);
        }
        let room = cap * 8 - bits.len();
        push(0, room.min(4), &mut bits);
        while bits.len() % 8 != 0 {
            bits.push(false);
        }
        let mut data: Vec<u8> = bits
            .chunks(8)
            .map(|c| c.iter().fold(0u8, |a, b| (a << 1) | *b as u8))
            .collect();
        let mut pad = [0xECu8, 0x11].into_iter().cycle();
        while data.len() < cap {
            data.push(pad.next().unwrap());
        }
        let (ec_n, layout) = blocks(version);
        let mut dblocks: Vec<&[u8]> = Vec::new();
        let mut off = 0;
        for (n, len) in layout {
            for _ in 0..*n {
                dblocks.push(&data[off..off + len]);
                off += len;
            }
        }
        let eblocks: Vec<Vec<u8>> = dblocks.iter().map(|b| rs_ecc(b, ec_n)).collect();
        let mut stream = Vec::new();
        let max_d = dblocks.iter().map(|b| b.len()).max().unwrap_or(0);
        for i in 0..max_d {
            for b in &dblocks {
                if i < b.len() {
                    stream.push(b[i]);
                }
            }
        }
        for i in 0..ec_n {
            for b in &eblocks {
                stream.push(b[i]);
            }
        }

        let size = 17 + 4 * version as usize;
        let mut g = Grid {
            size,
            dark: vec![false; size * size],
            func: vec![false; size * size],
        };
        for i in 0..size {
            g.set(6, i, i % 2 == 0);
            g.set(i, 6, i % 2 == 0);
        }
        g.finder(3, 3);
        g.finder(size as i32 - 4, 3);
        g.finder(3, size as i32 - 4);
        let al = alignment_positions(version);
        for (i, &ay) in al.iter().enumerate() {
            for (j, &ax) in al.iter().enumerate() {
                let last = al.len() - 1;
                if (i == 0 && j == 0) || (i == 0 && j == last) || (i == last && j == 0) {
                    continue;
                }
                g.alignment(ax, ay);
            }
        }
        g.format(0);
        g.version(version);

        let mut idx = 0usize;
        let mut right = size as i32 - 1;
        while right >= 1 {
            if right == 6 {
                right = 5;
            }
            for vert in 0..size {
                for j in 0..2 {
                    let x = (right - j) as usize;
                    let upward = (right + 1) & 2 == 0;
                    let y = if upward { size - 1 - vert } else { vert };
                    if !g.func[y * size + x] && idx < stream.len() * 8 {
                        g.dark[y * size + x] = (stream[idx >> 3] >> (7 - (idx & 7))) & 1 != 0;
                        idx += 1;
                    }
                }
            }
            right -= 2;
        }

        let mut best: Option<(u32, u8, Vec<bool>)> = None;
        for mask in 0..8u8 {
            let mut t = Grid {
                size,
                dark: g.dark.clone(),
                func: g.func.clone(),
            };
            for y in 0..size {
                for x in 0..size {
                    if !t.func[y * size + x] && mask_bit(mask, x, y) {
                        t.dark[y * size + x] ^= true;
                    }
                }
            }
            t.format(mask);
            let p = penalty(size, &t.dark);
            if best.as_ref().is_none_or(|(bp, _, _)| p < *bp) {
                best = Some((p, mask, t.dark));
            }
        }
        let (_, mask, modules) = best?;
        Some(Matrix {
            size,
            version,
            mask,
            modules,
        })
    }

    pub fn encode_svg(text: &str) -> Result<String, String> {
        if text.as_bytes().len() > 213 {
            return Err("Nội dung quá dài cho mã QR (tối đa 213 byte UTF-8).".to_string());
        }
        let m = encode(text).ok_or_else(|| "Nội dung quá dài cho mã QR.".to_string())?;
        let quiet = 2usize;
        let full = m.size + quiet * 2;
        let mut path = String::with_capacity(m.size * m.size * 6);
        for y in 0..m.size {
            let mut x = 0usize;
            while x < m.size {
                if m.get(x, y) {
                    let start = x;
                    while x < m.size && m.get(x, y) {
                        x += 1;
                    }
                    let run = x - start;
                    path.push_str(&format!("M{},{}h{}v1h-{}z", start + quiet, y + quiet, run, run));
                } else {
                    x += 1;
                }
            }
        }
        Ok(format!(
            "<svg viewBox=\"0 0 {full} {full}\" xmlns=\"http://www.w3.org/2000/svg\" shape-rendering=\"crispEdges\"><rect width=\"{full}\" height=\"{full}\" fill=\"#ffffff\"/><path fill=\"#000000\" d=\"{path}\"/></svg>"
        ))
    }
}

#[tauri::command]
fn generate_qr_svg(text: String) -> Result<String, String> {
    island_qr::encode_svg(&text)
}

mod island_send {
    use super::format_file_size;
    use serde::Serialize;
    use std::fs::File;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
    use tauri::Emitter;

    const MAX_HEAD: u64 = 8 * 1024;
    const MAX_CONN: usize = 32;

    #[derive(Clone, Serialize)]
    pub struct LanSendStartResponse {
        pub url: String,
        pub qr_svg: String,
        pub file_count: usize,
        pub total_size: String,
    }

    #[derive(Clone, Serialize)]
    pub struct LanSendProgressEvent {
        pub sent: u64,
        pub total: u64,
        pub files_done: usize,
        pub total_files: usize,
        pub active: bool,
    }

    struct ActiveSendSession {
        stop: Arc<AtomicBool>,
        addr: SocketAddr,
    }

    static ACTIVE_SEND: Mutex<Option<ActiveSendSession>> = Mutex::new(None);

    pub fn is_private(ip: [u8; 4]) -> bool {
        ip[0] == 10
            || (ip[0] == 172 && (16..=31).contains(&ip[1]))
            || (ip[0] == 192 && ip[1] == 168)
    }

    pub fn escape_html(s: &str) -> String {
        let mut o = String::with_capacity(s.len());
        for c in s.chars() {
            match c {
                '&' => o.push_str("&amp;"),
                '<' => o.push_str("&lt;"),
                '>' => o.push_str("&gt;"),
                '"' => o.push_str("&quot;"),
                '\'' => o.push_str("&#39;"),
                _ => o.push(c),
            }
        }
        o
    }

    pub fn pct(s: &str) -> String {
        s.bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                    (b as char).to_string()
                }
                _ => format!("%{b:02X}"),
            })
            .collect()
    }

    pub fn ascii_name(s: &str) -> String {
        let n: String = s
            .chars()
            .map(|c| {
                if (c.is_ascii_graphic() && c != '"' && c != '\\') || c == ' ' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        if n.trim().is_empty() {
            "file".into()
        } else {
            n
        }
    }

    pub fn build_page(tok: &str, files: &[(String, u64)]) -> String {
        let mut rows = String::new();
        for (i, (name, size)) in files.iter().enumerate() {
            rows.push_str(&format!(
                "<a class=\"f\" href=\"/{tok}/f/{i}\" download><span class=\"n\">{}</span><span class=\"s\">{}</span><span class=\"b\">Tải về</span></a>\n",
                escape_html(name),
                format_file_size(*size)
            ));
        }
        format!(
            "<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<title>Gửi từ Island</title><style>\
body{{margin:0;font:16px -apple-system,system-ui,Segoe UI,Roboto,sans-serif;background:#0d0d12;color:#f2f2f5}}\
main{{max-width:560px;margin:0 auto;padding:28px 18px}}h1{{font-size:21px;margin:0 0 6px}}p{{color:#9a9aa8;margin:0 0 22px;font-size:14px}}\
.f{{display:flex;align-items:center;gap:12px;padding:14px 16px;margin:0 0 10px;border-radius:18px;background:#1b1c24;border:1px solid rgba(255,255,255,.08);color:inherit;text-decoration:none}}\
.n{{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}}.s{{color:#9a9aa8;font-size:13px}}\
.b{{background:#0a84ff;color:#fff;border-radius:999px;padding:7px 14px;font-weight:600;font-size:13.5px}}\
</style></head><body><main><h1>Gửi từ Island</h1><p>Chạm vào tệp bên dưới để lưu về điện thoại của bạn.</p>\n{rows}</main></body></html>"
        )
    }

    fn lan_ip() -> Option<Ipv4Addr> {
        let s = UdpSocket::bind("0.0.0.0:0").ok()?;
        s.connect("8.8.8.8:80").ok()?;
        match s.local_addr().ok()? {
            SocketAddr::V4(a) if is_private(a.ip().octets()) => Some(*a.ip()),
            _ => None,
        }
    }

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn SystemFunction036(random_buffer: *mut u8, random_buffer_length: u32) -> u8;
    }

    fn random_token() -> String {
        let mut b = [0u8; 10];
        let ok = unsafe { SystemFunction036(b.as_mut_ptr(), b.len() as u32) } != 0;
        if !ok {
            let t = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(1);
            let pid = std::process::id() as u128;
            let mixed = t ^ (pid.wrapping_mul(0x9E37_79B9_7F4A_7C15));
            for (i, slot) in b.iter_mut().enumerate() {
                *slot = ((mixed >> ((i * 7) % 64)) & 0xFF) as u8;
            }
        }
        b.iter().map(|v| format!("{v:02x}")).collect()
    }

    struct Shared {
        app: tauri::AppHandle,
        files: Vec<(String, String, u64)>,
        reached: Mutex<Vec<u64>>,
        active: Mutex<usize>,
        last: Mutex<Instant>,
    }

    impl Shared {
        fn report(&self, force: bool) {
            if let Ok(mut last) = self.last.lock() {
                if !force && last.elapsed() < Duration::from_millis(200) {
                    return;
                }
                *last = Instant::now();
            }
            let reached = self.reached.lock().unwrap_or_else(|e| e.into_inner());
            let total: u64 = self.files.iter().map(|f| f.2).sum();
            let active = *self.active.lock().unwrap_or_else(|e| e.into_inner()) > 0;
            let evt = LanSendProgressEvent {
                sent: reached.iter().sum(),
                total,
                files_done: reached
                    .iter()
                    .zip(&self.files)
                    .filter(|(r, f)| **r >= f.2)
                    .count(),
                total_files: self.files.len(),
                active,
            };
            let _ = self.app.emit("island-send-progress", &evt);
        }
    }

    struct Slot(Arc<AtomicUsize>);
    impl Slot {
        fn take(live: &Arc<AtomicUsize>) -> Slot {
            live.fetch_add(1, Ordering::Relaxed);
            Slot(live.clone())
        }
    }
    impl Drop for Slot {
        fn drop(&mut self) {
            self.0.fetch_sub(1, Ordering::Relaxed);
        }
    }

    struct Deadline(TcpStream, Instant);
    impl Read for Deadline {
        fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> {
            let left = self.1.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(std::io::ErrorKind::TimedOut.into());
            }
            self.0.set_read_timeout(Some(left))?;
            self.0.read(b)
        }
    }

    fn respond(s: &mut TcpStream, status: &str, ctype: &str, body: &[u8]) {
        let head = format!(
            "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = s.write_all(head.as_bytes());
        let _ = s.write_all(body);
    }

    fn serve(mut s: TcpStream, tok: &str, sh: &Shared) {
        let _ = s.set_write_timeout(Some(Duration::from_secs(30)));
        let Ok(clone) = s.try_clone() else { return };
        let mut r = BufReader::new(
            Deadline(clone, Instant::now() + Duration::from_secs(10)).take(MAX_HEAD),
        );
        let mut line = String::new();
        if r.read_line(&mut line).is_err() {
            return;
        }
        let mut done = false;
        loop {
            let mut h = Vec::new();
            match r.read_until(b'\n', &mut h) {
                Ok(0) | Err(_) => break,
                Ok(_) if h == b"\r\n" || h == b"\n" => {
                    done = true;
                    break;
                }
                _ => {}
            }
        }
        if !done {
            respond(&mut s, "431 Request Header Fields Too Large", "text/plain", b"");
            return;
        }
        let mut parts = line.split_whitespace();
        let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
        if method != "GET" {
            respond(&mut s, "405 Method Not Allowed", "text/plain", b"");
            return;
        }
        let base = format!("/{tok}/");
        if path == format!("/{tok}") || path == base {
            let list: Vec<(String, u64)> =
                sh.files.iter().map(|f| (f.1.clone(), f.2)).collect();
            respond(
                &mut s,
                "200 OK",
                "text/html; charset=utf-8",
                build_page(tok, &list).as_bytes(),
            );
            return;
        }
        let Some(i) = path
            .strip_prefix(&format!("{base}f/"))
            .and_then(|n| n.parse::<usize>().ok())
            .filter(|i| *i < sh.files.len())
        else {
            respond(&mut s, "404 Not Found", "text/plain", b"");
            return;
        };
        let (fpath, name, size) = &sh.files[i];
        let Ok(mut f) = File::open(fpath) else {
            respond(&mut s, "404 Not Found", "text/plain", b"");
            return;
        };
        let head = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {size}\r\nCache-Control: no-store\r\nContent-Disposition: attachment; filename=\"{}\"; filename*=UTF-8''{}\r\nConnection: close\r\n\r\n",
            ascii_name(name),
            pct(name)
        );
        if s.write_all(head.as_bytes()).is_err() {
            return;
        }
        {
            let mut active = sh.active.lock().unwrap_or_else(|e| e.into_inner());
            *active += 1;
        }
        sh.report(true);
        let mut buf = [0u8; 64 * 1024];
        let mut sent = 0u64;
        while let Ok(n) = f.read(&mut buf) {
            if n == 0 || s.write_all(&buf[..n]).is_err() {
                break;
            }
            sent += n as u64;
            if let Ok(mut r_vec) = sh.reached.lock() {
                r_vec[i] = r_vec[i].max(sent);
            }
            sh.report(false);
        }
        {
            let mut active = sh.active.lock().unwrap_or_else(|e| e.into_inner());
            *active = active.saturating_sub(1);
        }
        sh.report(true);
    }

    pub fn stop_current() {
        if let Ok(mut g) = ACTIVE_SEND.lock() {
            if let Some(sess) = g.take() {
                sess.stop.store(true, Ordering::Relaxed);
                let _ = TcpStream::connect_timeout(&sess.addr, Duration::from_millis(250));
            }
        }
    }

    pub fn start(
        app: tauri::AppHandle,
        paths: Vec<String>,
    ) -> Result<LanSendStartResponse, String> {
        stop_current();
        let files: Vec<(String, String, u64)> = paths
            .iter()
            .filter_map(|p| {
                let md = std::fs::metadata(p).ok().filter(|m| m.is_file())?;
                let name = Path::new(p).file_name()?.to_string_lossy().to_string();
                Some((p.clone(), name, md.len()))
            })
            .collect();
        if files.is_empty() {
            return Err("Không có tệp hợp lệ trên ổ đĩa để gửi (chưa hỗ trợ thư mục).".into());
        }
        let ip = lan_ip().ok_or("Chưa kết nối mạng Wi-Fi / LAN nội bộ.")?;
        let listener = TcpListener::bind((ip, 0)).map_err(|e| e.to_string())?;
        let addr = listener.local_addr().map_err(|e| e.to_string())?;
        let tok = random_token();
        let ip_oct = ip.octets();
        let url = format!(
            "http://{}.{}.{}.{}:{}/{}/",
            ip_oct[0], ip_oct[1], ip_oct[2], ip_oct[3], addr.port(), tok
        );
        let qr_svg = super::island_qr::encode_svg(&url)?;
        let total_bytes: u64 = files.iter().map(|f| f.2).sum();
        let file_count = files.len();

        let stop = Arc::new(AtomicBool::new(false));
        let stop2 = stop.clone();
        if let Ok(mut g) = ACTIVE_SEND.lock() {
            *g = Some(ActiveSendSession {
                stop: stop.clone(),
                addr,
            });
        }

        let sh = Arc::new(Shared {
            app,
            files,
            reached: Mutex::new(vec![0; file_count]),
            active: Mutex::new(0),
            last: Mutex::new(Instant::now()),
        });
        let live = Arc::new(AtomicUsize::new(0));
        std::thread::spawn(move || {
            for conn in listener.incoming() {
                if stop2.load(Ordering::Relaxed) {
                    break;
                }
                let Ok(c) = conn else { continue };
                let ok = matches!(
                    c.peer_addr(),
                    Ok(SocketAddr::V4(a)) if is_private(a.ip().octets()) || a.ip().is_loopback()
                );
                if !ok || live.load(Ordering::Relaxed) >= MAX_CONN {
                    continue;
                }
                let slot = Slot::take(&live);
                let (sh, tok) = (sh.clone(), tok.clone());
                let _ = std::thread::Builder::new().spawn(move || {
                    let _slot = slot;
                    serve(c, &tok, &sh);
                });
            }
        });

        Ok(LanSendStartResponse {
            url,
            qr_svg,
            file_count,
            total_size: format_file_size(total_bytes),
        })
    }
}

#[tauri::command]
fn start_lan_send(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<island_send::LanSendStartResponse, String> {
    island_send::start(app_handle, paths)
}

#[tauri::command]
fn stop_lan_send() -> Result<(), String> {
    island_send::stop_current();
    Ok(())
}

mod island_quick {
    use super::{format_file_size, DroppedFileItem, CREATE_NO_WINDOW};
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use windows::core::{GUID, HSTRING};
    use windows::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_ContainerFormatBmp, GUID_ContainerFormatJpeg,
        GUID_ContainerFormatPng, GUID_ContainerFormatTiff, GUID_WICPixelFormat24bppBGR,
        GUID_WICPixelFormat32bppBGRA, IWICBitmapFrameEncode, IWICImagingFactory,
        WICBitmapDitherTypeNone, WICBitmapEncoderNoCache, WICBitmapInterpolationModeFant,
        WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
    };
    use windows::Win32::System::Com::StructuredStorage::IPropertyBag2;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Op {
        Half,
        Jpg,
        Png,
        Zip,
    }

    impl Op {
        pub fn parse(s: &str) -> Option<Self> {
            match s.trim().to_ascii_lowercase().as_str() {
                "half" => Some(Op::Half),
                "jpg" | "jpeg" => Some(Op::Jpg),
                "png" => Some(Op::Png),
                "zip" => Some(Op::Zip),
                _ => None,
            }
        }
    }

    const IMAGE_EXT: [&str; 9] = [
        "png", "jpg", "jpeg", "bmp", "gif", "webp", "tif", "tiff", "ico",
    ];

    fn ext_of(p: &Path) -> String {
        p.extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default()
    }

    pub fn is_image(p: &str) -> bool {
        IMAGE_EXT.contains(&ext_of(Path::new(p)).as_str())
    }

    pub fn unique(base: PathBuf, exists: &dyn Fn(&Path) -> bool) -> PathBuf {
        if !exists(&base) {
            return base;
        }
        let dir = base.parent().map(Path::to_path_buf).unwrap_or_default();
        let stem = base
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let ext = base
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        for n in 2..1000 {
            let c = dir.join(format!("{stem} ({n}){ext}"));
            if !exists(&c) {
                return c;
            }
        }
        dir.join(format!("{stem} (mới){ext}"))
    }

    pub fn output_for(src: &str, op: Op, small: &str, exists: &dyn Fn(&Path) -> bool) -> PathBuf {
        let p = Path::new(src);
        let dir = p.parent().map(Path::to_path_buf).unwrap_or_default();
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let ext = ext_of(p);
        let keep = match ext.as_str() {
            "jpg" | "jpeg" | "png" | "bmp" | "tif" | "tiff" => ext,
            _ => "png".to_string(),
        };
        let base = match op {
            Op::Half => dir.join(format!("{stem} ({small}).{keep}")),
            Op::Jpg => dir.join(format!("{stem}.jpg")),
            Op::Png => dir.join(format!("{stem}.png")),
            Op::Zip => dir.join(format!("{stem}.zip")),
        };
        unique(base, exists)
    }

    pub fn zip_target(
        paths: &[String],
        archive: &str,
        exists: &dyn Fn(&Path) -> bool,
    ) -> Option<PathBuf> {
        let first = Path::new(paths.first()?);
        if paths.len() == 1 {
            return Some(output_for(&paths[0], Op::Zip, "", exists));
        }
        let dir = first.parent()?.to_path_buf();
        Some(unique(dir.join(format!("{archive}.zip")), exists))
    }

    fn container(dst: &Path) -> GUID {
        match dst
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .as_deref()
        {
            Some("jpg") | Some("jpeg") => GUID_ContainerFormatJpeg,
            Some("bmp") => GUID_ContainerFormatBmp,
            Some("tif") | Some("tiff") => GUID_ContainerFormatTiff,
            _ => GUID_ContainerFormatPng,
        }
    }

    fn read_scaled(
        factory: &IWICImagingFactory,
        src: &str,
        scale: f32,
    ) -> Option<(u32, u32, Vec<u8>)> {
        unsafe {
            let decoder = factory
                .CreateDecoderFromFilename(
                    &HSTRING::from(src),
                    None,
                    GENERIC_READ,
                    WICDecodeMetadataCacheOnDemand,
                )
                .ok()?;
            let frame = decoder.GetFrame(0).ok()?;
            let (mut w, mut h) = (0u32, 0u32);
            frame.GetSize(&mut w, &mut h).ok()?;
            if w == 0 || h == 0 {
                return None;
            }
            let sw = ((w as f32 * scale).round() as u32).max(1);
            let sh = ((h as f32 * scale).round() as u32).max(1);
            let scaler = factory.CreateBitmapScaler().ok()?;
            scaler
                .Initialize(&frame, sw, sh, WICBitmapInterpolationModeFant)
                .ok()?;
            let conv = factory.CreateFormatConverter().ok()?;
            conv.Initialize(
                &scaler,
                &GUID_WICPixelFormat32bppBGRA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )
            .ok()?;
            let mut buf = vec![0u8; (sw * sh * 4) as usize];
            conv.CopyPixels(std::ptr::null(), sw * 4, &mut buf).ok()?;
            Some((sw, sh, buf))
        }
    }

    fn on_white(bgra: &[u8], w: u32, h: u32) -> Vec<u8> {
        let stride = (w * 3).div_ceil(4) * 4;
        let mut out = vec![0u8; (stride * h) as usize];
        for y in 0..h {
            for x in 0..w {
                let s = ((y * w + x) * 4) as usize;
                let d = (y * stride + x * 3) as usize;
                let a = bgra[s + 3] as u32;
                for c in 0..3 {
                    out[d + c] = ((bgra[s + c] as u32 * a + 255 * (255 - a)) / 255) as u8;
                }
            }
        }
        out
    }

    fn write_image(
        factory: &IWICImagingFactory,
        dst: &Path,
        w: u32,
        h: u32,
        bgra: &[u8],
    ) -> Result<(), String> {
        let fmt = container(dst);
        let jpeg = fmt == GUID_ContainerFormatJpeg;
        unsafe {
            let bitmap = if jpeg {
                let px = on_white(bgra, w, h);
                factory.CreateBitmapFromMemory(
                    w,
                    h,
                    &GUID_WICPixelFormat24bppBGR,
                    (w * 3).div_ceil(4) * 4,
                    &px,
                )
            } else {
                factory.CreateBitmapFromMemory(
                    w,
                    h,
                    &GUID_WICPixelFormat32bppBGRA,
                    w * 4,
                    bgra,
                )
            }
            .map_err(|e| e.to_string())?;
            let stream = factory.CreateStream().map_err(|e| e.to_string())?;
            stream
                .InitializeFromFilename(&HSTRING::from(dst.as_os_str()), GENERIC_WRITE.0)
                .map_err(|e| e.to_string())?;
            let encoder = factory
                .CreateEncoder(&fmt, std::ptr::null())
                .map_err(|e| e.to_string())?;
            encoder
                .Initialize(&stream, WICBitmapEncoderNoCache)
                .map_err(|e| e.to_string())?;
            let mut frame: Option<IWICBitmapFrameEncode> = None;
            let mut props: Option<IPropertyBag2> = None;
            encoder
                .CreateNewFrame(&mut frame, &mut props)
                .map_err(|e| e.to_string())?;
            let frame = frame.ok_or_else(|| "Không tạo được frame ảnh".to_string())?;
            frame.Initialize(props.as_ref()).map_err(|e| e.to_string())?;
            frame.SetSize(w, h).map_err(|e| e.to_string())?;
            let mut pf = if jpeg {
                GUID_WICPixelFormat24bppBGR
            } else {
                GUID_WICPixelFormat32bppBGRA
            };
            frame.SetPixelFormat(&mut pf).map_err(|e| e.to_string())?;
            frame
                .WriteSource(&bitmap, std::ptr::null())
                .map_err(|e| e.to_string())?;
            frame.Commit().map_err(|e| e.to_string())?;
            encoder.Commit().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    fn convert_file(src: &str, dst: &Path, scale: f32) -> Result<(), String> {
        unsafe {
            let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let r = (|| {
                let factory: IWICImagingFactory =
                    CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)
                        .map_err(|e| e.to_string())?;
                let (w, h, px) = read_scaled(&factory, src, scale)
                    .ok_or_else(|| "Không đọc được tệp ảnh".to_string())?;
                write_image(&factory, dst, w, h, &px)
            })();
            if r.is_err() {
                let _ = std::fs::remove_file(dst);
            }
            if com {
                CoUninitialize();
            }
            r
        }
    }

    fn tar_exe() -> Option<PathBuf> {
        let root = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("C:\\Windows"));
        let p = root.join("System32").join("tar.exe");
        p.exists().then_some(p)
    }

    fn zip_files(paths: &[String], dst: &Path) -> Result<(), String> {
        let tar = tar_exe().ok_or_else(|| "Không tìm thấy tar.exe hệ thống".to_string())?;
        let mut cmd = std::process::Command::new(tar);
        cmd.arg("-a").arg("-c").arg("-f").arg(dst);
        for p in paths {
            let path = Path::new(p);
            let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
                continue;
            };
            cmd.arg("-C").arg(dir).arg(name);
        }
        let out = cmd
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() && dst.exists() {
            Ok(())
        } else {
            let _ = std::fs::remove_file(dst);
            let msg = String::from_utf8_lossy(&out.stderr)
                .trim()
                .chars()
                .take(200)
                .collect::<String>();
            Err(if msg.is_empty() {
                "Nén ZIP thất bại".to_string()
            } else {
                msg
            })
        }
    }

    pub fn run_action(op_str: &str, paths: &[String]) -> Result<Vec<DroppedFileItem>, String> {
        let op = Op::parse(op_str).ok_or_else(|| "Thao tác không hợp lệ".to_string())?;
        let valid_paths: Vec<String> = paths
            .iter()
            .filter(|p| Path::new(p).exists())
            .cloned()
            .collect();
        if valid_paths.is_empty() {
            return Err("Không tìm thấy tệp hợp lệ trên ổ đĩa.".into());
        }
        let exists = |p: &Path| p.exists();
        let mut out_paths: Vec<PathBuf> = Vec::new();
        match op {
            Op::Zip => {
                let dst = zip_target(&valid_paths, "Archive", &exists)
                    .ok_or_else(|| "Không tạo được đường dẫn ZIP".to_string())?;
                zip_files(&valid_paths, &dst)?;
                out_paths.push(dst);
            }
            _ => {
                let mut last_err = String::new();
                for p in valid_paths.iter().filter(|p| is_image(p)) {
                    let dst = output_for(p, op, "nhỏ", &exists);
                    let scale = if op == Op::Half { 0.5 } else { 1.0 };
                    match convert_file(p, &dst, scale) {
                        Ok(()) => out_paths.push(dst),
                        Err(e) => last_err = e,
                    }
                }
                if out_paths.is_empty() {
                    return Err(if last_err.is_empty() {
                        "Không có tệp ảnh hợp lệ trong khay để xử lý.".into()
                    } else {
                        last_err
                    });
                }
            }
        }
        Ok(out_paths
            .into_iter()
            .map(|p| {
                let name = p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let sz = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                DroppedFileItem {
                    name,
                    path: p.to_string_lossy().to_string(),
                    size: format_file_size(sz),
                }
            })
            .collect())
    }
}

#[tauri::command]
async fn quick_file_action(
    op: String,
    paths: Vec<String>,
) -> Result<Vec<DroppedFileItem>, String> {
    tauri::async_runtime::spawn_blocking(move || island_quick::run_action(&op, &paths))
        .await
        .map_err(|e| format!("Lỗi tác vụ: {e}"))?
}

mod island_colorpick {
    use serde::Serialize;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use tauri::Emitter;
    use windows::core::w;
    use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::KeyboardAndMouse::{SetFocus, VK_ESCAPE};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetCursorPos,
        GetMessageW, GetSystemMetrics, LoadCursorW, PostQuitMessage, RegisterClassW, SetCursor,
        SetForegroundWindow, SetLayeredWindowAttributes, SetTimer, ShowWindow, TranslateMessage,
        IDC_CROSS, LWA_ALPHA, MSG, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN, SW_HIDE, SW_SHOW, WM_DESTROY, WM_KEYDOWN, WM_LBUTTONDOWN,
        WM_RBUTTONDOWN, WM_SETCURSOR, WM_TIMER, WNDCLASSW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
        WS_EX_TOPMOST, WS_POPUP,
    };

    static ACTIVE: AtomicBool = AtomicBool::new(false);
    static PICKED: AtomicU32 = AtomicU32::new(u32::MAX);
    const T_TIMEOUT: usize = 1;

    #[derive(Clone, Serialize)]
    struct ColorPickedEvent {
        hex: String,
        r: u8,
        g: u8,
        b: u8,
    }

    pub fn format_hex(rgb: [u8; 3]) -> String {
        format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2])
    }

    fn sample(pt: POINT) -> Option<[u8; 3]> {
        unsafe {
            let dc = GetDC(None);
            if dc.is_invalid() {
                return None;
            }
            let c: COLORREF = GetPixel(dc, pt.x, pt.y);
            ReleaseDC(None, dc);
            (c.0 != 0xFFFF_FFFF)
                .then(|| [(c.0 & 0xFF) as u8, ((c.0 >> 8) & 0xFF) as u8, ((c.0 >> 16) & 0xFF) as u8])
        }
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wp: WPARAM,
        lp: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_SETCURSOR => {
                if let Ok(c) = unsafe { LoadCursorW(None, IDC_CROSS) } {
                    unsafe {
                        SetCursor(Some(c));
                    }
                }
                LRESULT(1)
            }
            WM_LBUTTONDOWN => {
                let mut pt = POINT::default();
                unsafe {
                    let _ = GetCursorPos(&mut pt);
                    let _ = ShowWindow(hwnd, SW_HIDE);
                }
                std::thread::sleep(std::time::Duration::from_millis(55));
                if let Some(rgb) = sample(pt) {
                    PICKED.store(
                        ((rgb[0] as u32) << 16) | ((rgb[1] as u32) << 8) | rgb[2] as u32,
                        Ordering::Relaxed,
                    );
                }
                unsafe {
                    let _ = DestroyWindow(hwnd);
                }
                LRESULT(0)
            }
            WM_RBUTTONDOWN => {
                unsafe {
                    let _ = DestroyWindow(hwnd);
                }
                LRESULT(0)
            }
            WM_KEYDOWN if wp.0 as u16 == VK_ESCAPE.0 => {
                unsafe {
                    let _ = DestroyWindow(hwnd);
                }
                LRESULT(0)
            }
            WM_TIMER if wp.0 == T_TIMEOUT => {
                unsafe {
                    let _ = DestroyWindow(hwnd);
                }
                LRESULT(0)
            }
            WM_DESTROY => {
                unsafe {
                    PostQuitMessage(0);
                }
                LRESULT(0)
            }
            _ => unsafe { DefWindowProcW(hwnd, msg, wp, lp) },
        }
    }

    pub fn start(app_handle: tauri::AppHandle) -> bool {
        if ACTIVE.swap(true, Ordering::AcqRel) {
            return false;
        }
        PICKED.store(u32::MAX, Ordering::Relaxed);
        std::thread::spawn(move || {
            unsafe {
                let _ = (|| -> windows::core::Result<()> {
                    let hi = GetModuleHandleW(None)?.into();
                    let class = w!("IslandColorPickOverlay");
                    RegisterClassW(&WNDCLASSW {
                        lpfnWndProc: Some(wnd_proc),
                        hInstance: hi,
                        lpszClassName: class,
                        ..Default::default()
                    });
                    let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
                    let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
                    let cw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                    let ch = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                    let hwnd = CreateWindowExW(
                        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED,
                        class,
                        w!("island-colorpick"),
                        WS_POPUP,
                        x,
                        y,
                        cw,
                        ch,
                        None,
                        None,
                        Some(hi),
                        None,
                    )?;
                    SetLayeredWindowAttributes(hwnd, COLORREF(0), 1, LWA_ALPHA)?;
                    let _ = ShowWindow(hwnd, SW_SHOW);
                    let _ = SetForegroundWindow(hwnd);
                    let _ = SetFocus(Some(hwnd));
                    SetTimer(Some(hwnd), T_TIMEOUT, 20_000, None);
                    let mut msg = MSG::default();
                    while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                    Ok(())
                })();
            }
            let v = PICKED.load(Ordering::Relaxed);
            ACTIVE.store(false, Ordering::Release);
            if v != u32::MAX {
                let rgb = [(v >> 16) as u8, (v >> 8) as u8, v as u8];
                let _ = app_handle.emit(
                    "island-color-picked",
                    ColorPickedEvent {
                        hex: format_hex(rgb),
                        r: rgb[0],
                        g: rgb[1],
                        b: rgb[2],
                    },
                );
            }
        });
        true
    }
}

#[tauri::command]
fn pick_screen_color(app_handle: tauri::AppHandle) -> Result<bool, String> {
    Ok(island_colorpick::start(app_handle))
}

mod island_privacy {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const BASE: &str =
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore";

    pub fn display_name(key: &str, packaged: bool) -> String {
        if packaged {
            let family = key.split('_').next().unwrap_or(key);
            return family.rsplit('.').next().unwrap_or(family).to_string();
        }
        let file = key.rsplit(['#', '\\', '/']).next().unwrap_or(key);
        file.rsplit_once('.')
            .map(|(s, _)| s)
            .unwrap_or(file)
            .to_string()
    }

    fn key_in_use(k: &RegKey) -> bool {
        let start: u64 = k.get_value("LastUsedTimeStart").unwrap_or(0);
        if start == 0 {
            return false;
        }
        let stop: Result<u64, _> = k.get_value("LastUsedTimeStop");
        matches!(stop, Ok(0))
    }

    pub fn poll_active() -> (bool, bool, String) {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut cam_active = false;
        let mut mic_active = false;
        let mut apps: Vec<String> = Vec::new();

        for (cap, is_cam) in [("webcam", true), ("microphone", false)] {
            let path = format!("{BASE}\\{cap}");
            let Ok(root) = hkcu.open_subkey(&path) else {
                continue;
            };
            for sub_name in root.enum_keys().flatten() {
                if sub_name == "NonPackaged" {
                    let Ok(np) = root.open_subkey("NonPackaged") else {
                        continue;
                    };
                    for app_key_name in np.enum_keys().flatten() {
                        if let Ok(sub) = np.open_subkey(&app_key_name) {
                            if key_in_use(&sub) {
                                if is_cam {
                                    cam_active = true;
                                } else {
                                    mic_active = true;
                                }
                                let nm = display_name(&app_key_name, false);
                                if !nm.is_empty() && !apps.iter().any(|x| x.eq_ignore_ascii_case(&nm))
                                {
                                    apps.push(nm);
                                }
                            }
                        }
                    }
                } else if let Ok(sub) = root.open_subkey(&sub_name) {
                    if key_in_use(&sub) {
                        if is_cam {
                            cam_active = true;
                        } else {
                            mic_active = true;
                        }
                        let nm = display_name(&sub_name, true);
                        if !nm.is_empty() && !apps.iter().any(|x| x.eq_ignore_ascii_case(&nm)) {
                            apps.push(nm);
                        }
                    }
                }
            }
        }
        (cam_active, mic_active, apps.join(", "))
    }
}

mod island_dlwatch {
    use super::format_file_size;
    use serde::Serialize;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const PARTIAL: [&str; 4] = [".crdownload", ".part", ".partial", ".download"];
    const STALL: Duration = Duration::from_secs(12);
    const STEAM_RUNNING: u64 = 256 | 1024 | 1_048_576;
    const STEAM_PAUSED: u64 = 512;

    #[derive(Clone, Debug, Serialize, PartialEq)]
    pub struct DownloadEventPayload {
        pub active: bool,
        pub source: String,
        pub name: String,
        pub percent: Option<f32>,
        pub size_str: String,
        pub finished: bool,
        pub path: String,
    }

    pub fn vdf_value<'a>(text: &'a str, key: &'a str) -> Option<&'a str> {
        vdf_values(text, key).next()
    }

    pub fn vdf_values<'a>(text: &'a str, key: &'a str) -> impl Iterator<Item = &'a str> + 'a {
        text.lines().filter_map(move |line| {
            let mut parts = line.split('"').skip(1).step_by(2);
            let k = parts.next()?;
            if !k.eq_ignore_ascii_case(key) {
                return None;
            }
            parts.next()
        })
    }

    pub fn steam_libraries(vdf: &str) -> Vec<String> {
        vdf_values(vdf, "path")
            .map(|p| p.replace("\\\\", "\\"))
            .collect()
    }

    pub fn steam_progress(acf: &str) -> Option<(String, u64, u64)> {
        let flags: u64 = vdf_value(acf, "StateFlags")?.parse().ok()?;
        if flags & STEAM_RUNNING == 0 || flags & STEAM_PAUSED != 0 {
            return None;
        }
        let total: u64 = vdf_value(acf, "BytesToDownload")?.parse().ok()?;
        let done: u64 = vdf_value(acf, "BytesDownloaded")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        if total == 0 || done >= total {
            return None;
        }
        Some((
            vdf_value(acf, "name").unwrap_or("Steam").to_string(),
            done,
            total,
        ))
    }

    fn steam_manifests() -> Vec<PathBuf> {
        let root_opt = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Software\\Valve\\Steam")
            .ok()
            .and_then(|k| k.get_value::<String, _>("SteamPath").ok())
            .map(|p| p.replace('/', "\\"))
            .or_else(|| {
                let def = "C:\\Program Files (x86)\\Steam";
                Path::new(def).is_dir().then(|| def.to_string())
            });
        let Some(root) = root_opt else {
            return Vec::new();
        };
        let mut libs = vec![root.clone()];
        if let Ok(vdf) =
            std::fs::read_to_string(Path::new(&root).join("steamapps").join("libraryfolders.vdf"))
        {
            for l in steam_libraries(&vdf) {
                if !libs.iter().any(|x| x.eq_ignore_ascii_case(&l)) {
                    libs.push(l);
                }
            }
        }
        let mut manifests = Vec::new();
        for l in libs {
            if let Ok(rd) = std::fs::read_dir(Path::new(&l).join("steamapps")) {
                for e in rd.flatten() {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    if n.starts_with("appmanifest_") && n.ends_with(".acf") {
                        manifests.push(e.path());
                    }
                }
            }
        }
        manifests
    }

    fn downloads_dir() -> Option<PathBuf> {
        let p = PathBuf::from(std::env::var_os("USERPROFILE")?).join("Downloads");
        p.is_dir().then_some(p)
    }

    fn partial_suffix(name: &str) -> Option<&'static str> {
        let l = name.to_lowercase();
        PARTIAL.iter().copied().find(|s| l.ends_with(s))
    }

    struct PartState {
        size: u64,
        changed: Instant,
    }

    mod store {
        use std::ffi::c_void;
        use windows::core::{GUID, HRESULT, HSTRING, IUnknown, Interface};
        use windows::Win32::System::WinRT::RoActivateInstance;

        const IID_MANAGER: GUID = GUID::from_u128(0x9353e170_8441_4b45_bd72_7c2fa925beee);

        pub struct Item {
            pub key: String,
            pub state: i32,
            pub percent: f64,
            pub bytes: u64,
        }

        unsafe fn slot<F: Copy>(p: *mut c_void, i: usize) -> F {
            let vt = unsafe { *(p as *const *const *const c_void) };
            unsafe { std::mem::transmute_copy(&*vt.add(i)) }
        }

        type GetPtr = unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT;
        type GetAt = unsafe extern "system" fn(*mut c_void, u32, *mut *mut c_void) -> HRESULT;
        type GetU32 = unsafe extern "system" fn(*mut c_void, *mut u32) -> HRESULT;
        type GetI32 = unsafe extern "system" fn(*mut c_void, *mut i32) -> HRESULT;
        type GetU64 = unsafe extern "system" fn(*mut c_void, *mut u64) -> HRESULT;
        type GetF64 = unsafe extern "system" fn(*mut c_void, *mut f64) -> HRESULT;
        type GetStr = unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT;

        fn own(p: *mut c_void) -> Option<IUnknown> {
            (!p.is_null()).then(|| unsafe { IUnknown::from_raw(p) })
        }

        pub struct Manager(IUnknown);

        impl Manager {
            pub fn new() -> Option<Self> {
                let insp = unsafe {
                    RoActivateInstance(&HSTRING::from(
                        "Windows.ApplicationModel.Store.Preview.InstallControl.AppInstallManager",
                    ))
                }
                .ok()?;
                let mut p: *mut c_void = std::ptr::null_mut();
                unsafe { insp.query(&IID_MANAGER, &mut p) }.ok().ok()?;
                own(p).map(Self)
            }

            pub fn items(&self) -> Vec<Item> {
                let mut out = Vec::new();
                unsafe {
                    let m = self.0.as_raw();
                    let mut v: *mut c_void = std::ptr::null_mut();
                    if slot::<GetPtr>(m, 6)(m, &mut v).is_err() {
                        return out;
                    }
                    let Some(view) = own(v) else { return out };
                    let vp = view.as_raw();
                    let mut n = 0u32;
                    if slot::<GetU32>(vp, 7)(vp, &mut n).is_err() {
                        return out;
                    }
                    for i in 0..n.min(32) {
                        let mut ip: *mut c_void = std::ptr::null_mut();
                        if slot::<GetAt>(vp, 6)(vp, i, &mut ip).is_err() {
                            continue;
                        }
                        let Some(item) = own(ip) else { continue };
                        let it = item.as_raw();
                        let mut hs: *mut c_void = std::ptr::null_mut();
                        let key = if slot::<GetStr>(it, 6)(it, &mut hs).is_ok() && !hs.is_null() {
                            let h: HSTRING = std::mem::transmute(hs);
                            h.to_string()
                        } else {
                            format!("Microsoft Store #{i}")
                        };
                        let mut sp: *mut c_void = std::ptr::null_mut();
                        if slot::<GetPtr>(it, 10)(it, &mut sp).is_err() {
                            continue;
                        }
                        let Some(status) = own(sp) else { continue };
                        let s = status.as_raw();
                        let (mut state, mut bytes, mut pct) = (0i32, 0u64, 0f64);
                        let _ = slot::<GetI32>(s, 6)(s, &mut state);
                        let _ = slot::<GetU64>(s, 8)(s, &mut bytes);
                        let _ = slot::<GetF64>(s, 9)(s, &mut pct);
                        out.push(Item {
                            key,
                            state,
                            percent: pct,
                            bytes,
                        });
                    }
                }
                out
            }
        }

        pub fn is_active(state: i32) -> bool {
            (0..=5).contains(&state)
        }
        pub const COMPLETED: i32 = 6;
    }

    pub fn spawn(app: tauri::AppHandle) {
        std::thread::spawn(move || {
            let _com = unsafe {
                windows::Win32::System::Com::CoInitializeEx(
                    None,
                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                )
                .is_ok()
            };
            let store_mgr = store::Manager::new();
            let mut manifests: Vec<PathBuf> = Vec::new();
            let mut steam_checked: Option<Instant> = None;
            let mut parts: HashMap<PathBuf, PartState> = HashMap::new();
            let mut prev_active: HashMap<String, DownloadEventPayload> = HashMap::new();
            let mut last_emitted: Option<DownloadEventPayload> = None;

            loop {
                std::thread::sleep(Duration::from_millis(1800));

                if steam_checked.is_none_or(|t| t.elapsed() > Duration::from_secs(60)) {
                    manifests = steam_manifests();
                    steam_checked = Some(Instant::now());
                }

                let mut active: Vec<(String, DownloadEventPayload, u64)> = Vec::new();
                let mut finished: Option<DownloadEventPayload> = None;

                if let Some(mgr) = &store_mgr {
                    for it in mgr.items() {
                        let k = format!("store:{}", it.key);
                        if store::is_active(it.state) {
                            let pct = (it.percent.clamp(0.0, 100.0)) as f32;
                            let payload = DownloadEventPayload {
                                active: true,
                                source: "store".to_string(),
                                name: it.key.clone(),
                                percent: Some((pct * 10.0).round() / 10.0),
                                size_str: format_file_size(it.bytes),
                                finished: false,
                                path: "ms-windows-store:".to_string(),
                            };
                            active.push((k, payload, it.bytes));
                        } else if it.state == store::COMPLETED {
                            if let Some(prev) = prev_active.get(&k) {
                                finished = Some(DownloadEventPayload {
                                    active: false,
                                    percent: Some(100.0),
                                    finished: true,
                                    ..prev.clone()
                                });
                            }
                        }
                    }
                }

                for m in &manifests {
                    let Ok(acf) = std::fs::read_to_string(m) else {
                        continue;
                    };
                    if let Some((name, done, total)) = steam_progress(&acf) {
                        let pct = ((done as f64 / total as f64) * 100.0)
                            .clamp(0.0, 100.0) as f32;
                        let payload = DownloadEventPayload {
                            active: true,
                            source: "steam".to_string(),
                            name,
                            percent: Some((pct * 10.0).round() / 10.0),
                            size_str: format_file_size(done),
                            finished: false,
                            path: m.to_string_lossy().to_string(),
                        };
                        active.push((format!("steam:{}", m.display()), payload, done));
                    }
                }

                let mut seen: Vec<PathBuf> = Vec::new();
                if let Some(dir) = downloads_dir() {
                    if let Ok(rd) = std::fs::read_dir(&dir) {
                        for e in rd.flatten().take(4000) {
                            let name = e.file_name().to_string_lossy().to_string();
                            let Some(suffix) = partial_suffix(&name) else {
                                continue;
                            };
                            let path = e.path();
                            let Ok(md) = std::fs::metadata(&path) else {
                                continue;
                            };
                            let size = md.len();
                            let part = parts.entry(path.clone()).or_insert(PartState {
                                size,
                                changed: Instant::now(),
                            });
                            if part.size != size {
                                part.size = size;
                                part.changed = Instant::now();
                            }
                            seen.push(path.clone());
                            if part.changed.elapsed() < STALL {
                                let shown = name[..name.len() - suffix.len()].to_string();
                                let payload = DownloadEventPayload {
                                    active: true,
                                    source: "browser".to_string(),
                                    name: shown,
                                    percent: None,
                                    size_str: format_file_size(size),
                                    finished: false,
                                    path: path.to_string_lossy().to_string(),
                                };
                                active.push((format!("file:{}", path.display()), payload, size));
                            }
                        }
                    }
                }

                let gone: Vec<PathBuf> =
                    parts.keys().filter(|p| !seen.contains(p)).cloned().collect();
                for p in gone {
                    let part = parts.remove(&p);
                    let key = format!("file:{}", p.display());
                    let s = p.to_string_lossy().to_string();
                    let final_path = partial_suffix(&s)
                        .map(|suf| PathBuf::from(&s[..s.len() - suf.len()]));
                    if let (Some(fp), Some(part)) = (final_path, part) {
                        if fp.exists() && prev_active.contains_key(&key) {
                            let sz = std::fs::metadata(&fp).map(|m| m.len()).unwrap_or(part.size);
                            finished = Some(DownloadEventPayload {
                                active: false,
                                source: "browser".to_string(),
                                name: fp
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default(),
                                percent: Some(100.0),
                                size_str: format_file_size(sz),
                                finished: true,
                                path: fp.to_string_lossy().to_string(),
                            });
                        }
                    }
                }

                for (k, d) in &prev_active {
                    if !k.starts_with("steam:") || active.iter().any(|(ak, _, _)| ak == k) {
                        continue;
                    }
                    let path = k.trim_start_matches("steam:");
                    let completed = std::fs::read_to_string(path).ok().is_some_and(|acf| {
                        vdf_value(&acf, "StateFlags")
                            .and_then(|f| f.parse::<u64>().ok())
                            .is_some_and(|f| f & 4 != 0)
                    });
                    if completed {
                        finished = Some(DownloadEventPayload {
                            active: false,
                            percent: Some(100.0),
                            finished: true,
                            ..d.clone()
                        });
                    }
                }

                prev_active = active
                    .iter()
                    .map(|(k, p, _)| (k.clone(), p.clone()))
                    .collect();

                if let Some(fin) = finished {
                    let _ = app.emit("island-download", &fin);
                    last_emitted = Some(DownloadEventPayload {
                        finished: false,
                        ..fin
                    });
                    continue;
                }

                let primary = active
                    .iter()
                    .max_by(|a, b| {
                        a.1.percent
                            .is_some()
                            .cmp(&b.1.percent.is_some())
                            .then(a.2.cmp(&b.2))
                    })
                    .map(|(_, p, _)| p.clone())
                    .unwrap_or_else(|| DownloadEventPayload {
                        active: false,
                        source: String::new(),
                        name: String::new(),
                        percent: None,
                        size_str: String::new(),
                        finished: false,
                        path: String::new(),
                    });

                let should_emit = match &last_emitted {
                    None => primary.active,
                    Some(prev) => prev != &primary,
                };
                if should_emit {
                    let _ = app.emit("island-download", &primary);
                    last_emitted = Some(primary);
                }
            }
            #[allow(unreachable_code)]
            if _com {
                unsafe { windows::Win32::System::Com::CoUninitialize() };
            }
        });
    }
}

mod island_devices {
    use serde::Serialize;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use tauri::Emitter;
    use windows::core::{IInspectable, HSTRING};
    use windows::Devices::Bluetooth::{
        BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice,
    };
    use windows::Devices::Enumeration::{
        DeviceInformation, DeviceInformationUpdate, DeviceWatcher,
    };
    use windows::Foundation::TypedEventHandler;

    #[derive(Clone, Serialize)]
    struct DeviceEventPayload {
        name: String,
        connected: bool,
        kind: String,
    }

    pub struct Watchers {
        _list: Vec<DeviceWatcher>,
    }

    fn watch(
        selector: HSTRING,
        kind: &'static str,
        app: tauri::AppHandle,
    ) -> Option<DeviceWatcher> {
        let w = DeviceInformation::CreateWatcherAqsFilter(&selector).ok()?;
        let names: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let ready = Arc::new(AtomicBool::new(false));
        {
            let (names, ready, app) = (names.clone(), ready.clone(), app.clone());
            w.Added(&TypedEventHandler::<DeviceWatcher, DeviceInformation>::new(
                move |_, info| {
                    if let Some(info) = info.as_ref() {
                        let id = info.Id().map(|h| h.to_string()).unwrap_or_default();
                        let name = info.Name().map(|h| h.to_string()).unwrap_or_default();
                        let trimmed = name.trim().to_string();
                        if trimmed.is_empty() {
                            return Ok(());
                        }
                        let fresh = names
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .insert(id, trimmed.clone())
                            .is_none();
                        if fresh && ready.load(Ordering::Relaxed) {
                            let _ = app.emit(
                                "island-device-event",
                                DeviceEventPayload {
                                    name: trimmed,
                                    connected: true,
                                    kind: kind.to_string(),
                                },
                            );
                        }
                    }
                    Ok(())
                },
            ))
            .ok()?;
        }
        {
            let (names, ready, app) = (names.clone(), ready.clone(), app.clone());
            w.Removed(
                &TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(move |_, upd| {
                    if let Some(u) = upd.as_ref() {
                        let id = u.Id().map(|h| h.to_string()).unwrap_or_default();
                        let gone = names.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
                        if let (Some(name), true) = (gone, ready.load(Ordering::Relaxed)) {
                            let _ = app.emit(
                                "island-device-event",
                                DeviceEventPayload {
                                    name,
                                    connected: false,
                                    kind: kind.to_string(),
                                },
                            );
                        }
                    }
                    Ok(())
                }),
            )
            .ok()?;
        }
        {
            let ready = ready.clone();
            w.EnumerationCompleted(&TypedEventHandler::<DeviceWatcher, IInspectable>::new(
                move |_, _| {
                    ready.store(true, Ordering::Relaxed);
                    Ok(())
                },
            ))
            .ok()?;
        }
        w.Start().ok()?;
        Some(w)
    }

    pub fn spawn(app: tauri::AppHandle) {
        let mut list = Vec::new();
        if let Ok(sel) =
            BluetoothDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected)
        {
            if let Some(w) = watch(sel, "bluetooth", app.clone()) {
                list.push(w);
            }
        }
        if let Ok(sel) = BluetoothLEDevice::GetDeviceSelectorFromConnectionStatus(
            BluetoothConnectionStatus::Connected,
        ) {
            if let Some(w) = watch(sel, "bluetooth", app.clone()) {
                list.push(w);
            }
        }
        let usb_aqs = HSTRING::from(
            "System.Devices.InterfaceClassGuid:=\"{A5DCBF10-6530-11D2-901F-00C04FB951ED}\" AND System.Devices.InterfaceEnabled:=System.StructuredQueryType.Boolean#True",
        );
        if let Some(w) = watch(usb_aqs, "usb", app) {
            list.push(w);
        }
        if !list.is_empty() {
            Box::leak(Box::new(Watchers { _list: list }));
        }
    }
}

/// Dọn sạch các tiến trình island.exe cũ (và cây tiến trình con WebView2 của chúng)
/// để tránh trường hợp một tiến trình nền giữ khoá thư mục User Data của WebView2 khiến mở app không lên.
fn kill_previous_island_instances() {
    unsafe {
        let my_pid = GetCurrentProcessId();
        let snap = CreateToolhelp32Snapshot(0x00000002, 0);
        if snap.is_null() || snap as isize == -1 {
            return;
        }
        let mut all_procs: Vec<(u32, u32, String)> = Vec::with_capacity(128);
        let mut pe: ProcessEntry32W = std::mem::zeroed();
        pe.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
        if Process32FirstW(snap, &mut pe) != 0 {
            loop {
                let len = pe
                    .sz_exe_file
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(pe.sz_exe_file.len());
                let name = String::from_utf16_lossy(&pe.sz_exe_file[..len]).to_ascii_lowercase();
                all_procs.push((pe.th32_process_id, pe.th32_parent_process_id, name));
                if Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);

        let mut kill_pids: Vec<u32> = Vec::new();
        for &(pid, _ppid, ref name) in &all_procs {
            if pid != my_pid
                && name == "island.exe"
            {
                kill_pids.push(pid);
            }
        }
        if kill_pids.is_empty() {
            return;
        }
        let mut idx = 0;
        while idx < kill_pids.len() {
            let parent = kill_pids[idx];
            idx += 1;
            for &(pid, ppid, _) in &all_procs {
                if ppid == parent && pid != my_pid && !kill_pids.contains(&pid) {
                    kill_pids.push(pid);
                }
            }
        }
        // PROCESS_TERMINATE = 0x0001
        for &pid in kill_pids.iter().rev() {
            let h = OpenProcess(0x0001, 0, pid);
            if !h.is_null() {
                let _ = TerminateProcess(h, 0);
                let _ = CloseHandle(h);
            }
        }
        std::thread::sleep(Duration::from_millis(120));
    }
}

fn data_base_dir() -> PathBuf {
    app_file_path("settings.txt")
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn find_monitor_at_cursor(app: &tauri::AppHandle) -> Option<tauri::Monitor> {
    let main_win = app.get_webview_window("main")?;
    let monitors = main_win.available_monitors().ok()?;
    let mut pt = POINT::default();
    if unsafe { GetCursorPos(&mut pt) }.is_ok() {
        for m in &monitors {
            let p = m.position();
            let s = m.size();
            if pt.x >= p.x
                && pt.x < p.x + s.width as i32
                && pt.y >= p.y
                && pt.y < p.y + s.height as i32
            {
                return Some(m.clone());
            }
        }
    }
    main_win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.into_iter().next())
}

fn monitor_work_bottom_inset(m: &tauri::Monitor) -> f64 {
    unsafe {
        let mut r = RECT::default();
        if let Ok(tb) = windows::Win32::UI::WindowsAndMessaging::FindWindowW(
            windows::core::w!("Shell_TrayWnd"),
            None,
        ) {
            if !tb.0.is_null()
                && windows::Win32::UI::WindowsAndMessaging::IsWindowVisible(tb).as_bool()
                && GetWindowRect(tb, &mut r).is_ok()
            {
                let p = m.position();
                let s = m.size();
                if r.top >= p.y && r.bottom <= p.y + s.height as i32 + 4 && r.right > r.left {
                    return (r.bottom - r.top).max(0) as f64;
                }
            }
        }
    }
    0.0
}

fn position_shell_window(win: &tauri::WebviewWindow, label: &str, m: &tauri::Monitor) {
    let pos = m.position();
    let size = m.size();
    let scale = m.scale_factor();
    match label {
        "rail" => {
            let h_phys = (460.0 * scale) as i32;
            let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: h_phys as u32,
            }));
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition {
                x: pos.x,
                y: pos.y,
            }));
        }
        "dock" => {
            let inset = monitor_work_bottom_inset(m);
            let h_phys = (230.0 * scale) as i32;
            let y = pos.y + size.height as i32 - inset as i32 - h_phys;
            let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: h_phys as u32,
            }));
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition { x: pos.x, y }));
        }
        "desktop_widgets" => {
            let inset = monitor_work_bottom_inset(m) as u32;
            let top_pad = (34.0 * scale) as i32;
            let h = size.height.saturating_sub(inset + top_pad as u32);
            let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: h.max(240),
            }));
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition {
                x: pos.x,
                y: pos.y + top_pad,
            }));
        }
        "scene_strip" => {
            let w_phys = (250.0 * scale) as u32;
            let h_phys = ((size.height as f64) * 0.72) as u32;
            let y = pos.y + ((size.height.saturating_sub(h_phys)) / 2) as i32;
            let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: w_phys,
                height: h_phys.max(300),
            }));
            let _ = win.set_position(tauri::Position::Physical(PhysicalPosition { x: pos.x, y }));
        }
        _ => {}
    }
}

fn ensure_shell_window(app: &tauri::AppHandle, label: &str, url: &str, m: &tauri::Monitor) {
    if let Some(w) = app.get_webview_window(label) {
        apply_dark_robot_icon(&w);
        position_shell_window(&w, label, m);
        enforce_window_click_through(&w, true);
        let _ = w.show();
        return;
    }
    let always_top = label != "desktop_widgets";
    let builder = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App(url.into()))
        .title(format!("Island {label}"))
        .inner_size(800.0, 220.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(always_top)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(false);
    if let Ok(w) = builder.build() {
        apply_dark_robot_icon(&w);
        position_shell_window(&w, label, m);
        enforce_window_click_through(&w, true);
        if label == "desktop_widgets" {
            unsafe {
                if let Ok(hwnd) = w.hwnd() {
                    let _ = windows::Win32::UI::WindowsAndMessaging::SetWindowPos(
                        hwnd,
                        Some(windows::Win32::UI::WindowsAndMessaging::HWND_BOTTOM),
                        0,
                        0,
                        0,
                        0,
                        windows::Win32::UI::WindowsAndMessaging::SWP_NOMOVE
                            | windows::Win32::UI::WindowsAndMessaging::SWP_NOSIZE
                            | windows::Win32::UI::WindowsAndMessaging::SWP_NOACTIVATE,
                    );
                }
            }
        }
    }
}

fn destroy_shell_window(app: &tauri::AppHandle, label: &str) {
    if let Ok(mut g) = SHELL_RECTS.lock() {
        if let Some(map) = g.as_mut() {
            map.remove(label);
        }
    }
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.destroy();
    }
}

static OVERLAY_LAST_SHOWN_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static OVERLAY_FULL_VIEW: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

fn overlay_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

async fn toggle_overlay_internal(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    let (label, url) = match kind.as_str() {
        "quick_panel" => ("quick_panel", "overlay.html?view=quick_panel"),
        "quick_search" => ("quick_search", "overlay.html?view=quick_search"),
        "app_grid" => ("overlay_full", "overlay.html?view=app_grid"),
        "overview" => ("overlay_full", "overlay.html?view=overview"),
        _ => return Err("Overlay view không hợp lệ".into()),
    };

    let m = find_monitor_at_cursor(&app).ok_or("Không tìm thấy màn hình")?;
    let pos = m.position();
    let size = m.size();
    let scale = m.scale_factor();

    if let Some(w) = app.get_webview_window(label) {
        let is_vis = w.is_visible().unwrap_or(false);
        if is_vis {
            if label != "overlay_full" {
                let _ = w.hide();
                return Ok(());
            }
            let same_view = OVERLAY_FULL_VIEW
                .lock()
                .map(|g| *g == kind)
                .unwrap_or(false);
            if same_view {
                let _ = w.hide();
                return Ok(());
            }
        }
        OVERLAY_LAST_SHOWN_MS.store(overlay_now_ms(), Ordering::Relaxed);
        if label == "overlay_full" {
            if let Ok(mut g) = OVERLAY_FULL_VIEW.lock() {
                *g = kind.clone();
            }
        }
        position_overlay_window(&w, label, &pos, &size, scale);
        apply_dark_robot_icon(&w);
        enforce_window_click_through(&w, false);
        let _ = w.show();
        let _ = w.set_focus();
        if let Ok(hwnd) = w.hwnd() {
            island_shell::activate_window(hwnd.0 as isize, false);
        }
        let _ = app.emit("island-overlay-open", serde_json::json!({ "view": kind }));
        return Ok(());
    }

    OVERLAY_LAST_SHOWN_MS.store(overlay_now_ms(), Ordering::Relaxed);
    if label == "overlay_full" {
        if let Ok(mut g) = OVERLAY_FULL_VIEW.lock() {
            *g = kind.clone();
        }
    }

    let w = tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
        .title(format!("Island {kind}"))
        .inner_size(680.0, 540.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;

    apply_dark_robot_icon(&w);
    position_overlay_window(&w, label, &pos, &size, scale);
    enforce_window_click_through(&w, false);
    let w_evt = w.clone();
    let hide_on_blur = label == "quick_search" || label == "quick_panel";
    w.on_window_event(move |evt| match evt {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = w_evt.hide();
        }
        tauri::WindowEvent::Focused(false) if hide_on_blur => {
            if overlay_now_ms().saturating_sub(OVERLAY_LAST_SHOWN_MS.load(Ordering::Relaxed)) > 320 {
                let _ = w_evt.hide();
            }
        }
        _ => {}
    });
    let _ = w.show();
    let _ = w.set_focus();
    if let Ok(hwnd) = w.hwnd() {
        island_shell::activate_window(hwnd.0 as isize, false);
    }
    let _ = app.emit("island-overlay-open", serde_json::json!({ "view": kind }));
    Ok(())
}

fn position_overlay_window(
    w: &tauri::WebviewWindow,
    label: &str,
    pos: &tauri::PhysicalPosition<i32>,
    size: &tauri::PhysicalSize<u32>,
    scale: f64,
) {
    match label {
        "quick_panel" => {
            let ww = (396.0 * scale) as u32;
            let hh = (600.0 * scale) as u32;
            let x = pos.x + size.width as i32 - ww as i32 - (12.0 * scale) as i32;
            let y = pos.y + (38.0 * scale) as i32;
            let _ = w.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: ww, height: hh }));
            let _ = w.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
        }
        "quick_search" => {
            let ww = (680.0 * scale) as u32;
            let hh = (540.0 * scale) as u32;
            let x = pos.x + ((size.width as i32 - ww as i32) / 2);
            let y = pos.y + (110.0 * scale) as i32;
            let _ = w.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: ww, height: hh }));
            let _ = w.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
        }
        "overlay_full" => {
            let _ = w.set_size(tauri::Size::Physical(*size));
            let _ = w.set_position(tauri::Position::Physical(*pos));
        }
        _ => {}
    }
}

fn trigger_hot_action(app: &tauri::AppHandle, action: &str) {
    match action {
        "" | "none" => {}
        "quick_search" => {
            let h = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = toggle_overlay_internal(h, "quick_search".into()).await;
            });
        }
        "quick_panel" => {
            let h = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = toggle_overlay_internal(h, "quick_panel".into()).await;
            });
        }
        "app_grid" => {
            let h = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = toggle_overlay_internal(h, "app_grid".into()).await;
            });
        }
        "overview" => {
            let h = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = toggle_overlay_internal(h, "overview".into()).await;
            });
        }
        "desktop" => {
            let _ = island_system::run_system_action("show_desktop");
        }
        "notifications" => {
            let _ = island_system::run_system_action("notifications");
        }
        "lock" => {
            let _ = island_system::run_system_action("lock");
        }
        "screenshot" => {
            let _ = island_system::run_system_action("screenshot");
        }
        "toggle_island" => {
            let vis = !ISLAND_VISIBLE.load(Ordering::Relaxed);
            ISLAND_VISIBLE.store(vis, Ordering::Relaxed);
            let notches = ACTIVE_NOTCHES.lock().map(|l| l.clone()).unwrap_or_default();
            for n in notches {
                if let Some(w) = app.get_webview_window(&n.label) {
                    if vis {
                        let _ = w.show();
                        enforce_window_click_through(&w, true);
                    } else {
                        enforce_window_click_through(&w, true);
                        let _ = w.hide();
                    }
                }
            }
        }
        _ => {}
    }
}

#[tauri::command]
async fn get_radio_states() -> island_system::RadioSnapshot {
    tauri::async_runtime::spawn_blocking(island_system::get_radio_states)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn set_radio_state(kind: String, on: bool) -> Result<island_system::RadioSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || island_system::set_radio_state(&kind, on))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_wifi_networks(rescan: Option<bool>) -> island_system::WifiScanResult {
    let trigger = rescan.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || island_system::scan_wifi_networks(trigger))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn connect_wifi_network(ssid: String, profile: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || island_system::connect_wifi_network(&ssid, profile))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_bluetooth_devices() -> Vec<island_system::BtDevice> {
    tauri::async_runtime::spawn_blocking(island_system::list_bluetooth_devices)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn toggle_bluetooth_audio(addr: String, connect: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || island_system::toggle_bluetooth_audio(&addr, connect))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_display_brightness() -> island_system::BrightnessState {
    tauri::async_runtime::spawn_blocking(island_system::get_display_brightness)
        .await
        .unwrap_or(island_system::BrightnessState {
            level: 100,
            mode: "software".into(),
            soft: false,
        })
}

#[tauri::command]
async fn set_display_brightness(
    app: tauri::AppHandle,
    level: u8,
) -> Result<island_system::BrightnessState, String> {
    let st = tauri::async_runtime::spawn_blocking(move || island_system::set_display_brightness(level))
        .await
        .map_err(|e| e.to_string())??;
    let _ = app.emit(
        "island-brightness",
        serde_json::json!({ "level": st.level, "mode": st.mode, "soft": st.soft }),
    );
    Ok(st)
}

#[tauri::command]
async fn list_audio_outputs() -> Vec<island_audio::AudioOutputDevice> {
    tauri::async_runtime::spawn_blocking(island_audio::list_audio_outputs)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn set_default_audio_output(device_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || island_audio::set_default_audio_output(&device_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_windows_dark_mode() -> bool {
    island_system::get_windows_dark_mode()
}

#[tauri::command]
fn set_windows_dark_mode(dark: bool) -> Result<bool, String> {
    island_system::set_windows_dark_mode(dark)
}

#[tauri::command]
async fn get_calendar_agenda(
    year: i32,
    month: u32,
    day: u32,
) -> island_system::CalendarAgendaResult {
    tauri::async_runtime::spawn_blocking(move || island_system::get_calendar_agenda(year, month, day))
        .await
        .unwrap_or_default()
}

#[tauri::command]
fn get_recycle_bin_status() -> island_system::RecycleStatus {
    island_system::get_recycle_bin_status()
}

#[tauri::command]
fn empty_recycle_bin() -> Result<(), String> {
    island_system::empty_recycle_bin()
}

#[tauri::command]
fn run_system_action(action: String) -> Result<(), String> {
    island_system::run_system_action(&action)
}

#[tauri::command]
async fn check_app_update(repo: Option<String>) -> island_system::UpdateCheckResult {
    tauri::async_runtime::spawn_blocking(move || {
        island_system::check_app_update(repo, env!("CARGO_PKG_VERSION"))
    })
    .await
    .unwrap_or(island_system::UpdateCheckResult {
        current: env!("CARGO_PKG_VERSION").into(),
        latest: env!("CARGO_PKG_VERSION").into(),
        has_update: false,
        page_url: String::new(),
        notes: String::new(),
        error: Some("Lỗi kiểm tra cập nhật".into()),
    })
}

#[tauri::command]
async fn list_installed_apps(force: Option<bool>) -> Vec<island_search::InstalledApp> {
    let f = force.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || island_search::list_installed_apps(f))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn get_shell_icon(path: String, size: Option<i32>, thumb: Option<bool>) -> Option<String> {
    let px = size.unwrap_or(48);
    let th = thumb.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || island_search::get_shell_icon_data_url(&path, px, th))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
async fn search_local_files(
    query: String,
    filter: Option<String>,
    limit: Option<usize>,
) -> Vec<island_search::FileHit> {
    let lim = limit.unwrap_or(20);
    tauri::async_runtime::spawn_blocking(move || island_search::search_local_files(&query, filter, lim))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn get_recent_files(limit: Option<usize>) -> Vec<island_search::FileHit> {
    let lim = limit.unwrap_or(14);
    tauri::async_runtime::spawn_blocking(move || island_search::get_recent_files(lim))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn get_downloads_latest(limit: Option<usize>) -> Vec<island_search::FileHit> {
    let lim = limit.unwrap_or(16);
    tauri::async_runtime::spawn_blocking(move || island_search::get_downloads_latest(lim))
        .await
        .unwrap_or_default()
}

#[tauri::command]
fn launch_shell_target(path: String) -> Result<(), String> {
    island_search::launch_shell_target(&path)
}

#[tauri::command]
fn open_item_properties(path: String) -> Result<(), String> {
    island_search::open_item_properties(&path)
}

#[tauri::command]
fn list_clipboard_images() -> Vec<island_search::ClipboardImageItem> {
    island_search::list_clipboard_images()
}

#[tauri::command]
fn copy_clipboard_image(id: String) -> Result<(), String> {
    island_search::copy_clipboard_image(&id)
}

#[tauri::command]
fn toggle_clipboard_image_pin(id: String) -> Result<bool, String> {
    island_search::toggle_clipboard_image_pin(&id)
}

#[tauri::command]
fn delete_clipboard_image(id: String) {
    island_search::delete_clipboard_image(&id)
}

#[tauri::command]
async fn list_open_windows() -> Vec<island_shell::OpenWindow> {
    let pid = std::process::id();
    tauri::async_runtime::spawn_blocking(move || island_shell::list_open_windows(pid))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn list_windows_taskbar_pins() -> Vec<island_shell::TaskbarPin> {
    tauri::async_runtime::spawn_blocking(island_shell::list_windows_taskbar_pins)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn capture_window_thumb(hwnd: isize, max_w: Option<u32>) -> Option<String> {
    let mw = max_w.unwrap_or(320);
    tauri::async_runtime::spawn_blocking(move || island_shell::capture_window_thumb_b64(hwnd, mw))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
fn activate_window(hwnd: isize, toggle_minimize: Option<bool>) -> bool {
    island_shell::activate_window(hwnd, toggle_minimize.unwrap_or(false))
}

#[tauri::command]
fn close_window(hwnd: isize) {
    island_shell::close_window(hwnd);
}

#[tauri::command]
fn minimize_window(hwnd: isize) {
    island_shell::minimize_window(hwnd);
}

#[tauri::command]
async fn get_foreground_app_menu() -> island_shell::ForegroundAppMenu {
    let pid = std::process::id();
    tauri::async_runtime::spawn_blocking(move || island_shell::get_foreground_app_menu(pid))
        .await
        .unwrap_or(island_shell::ForegroundAppMenu {
            hwnd: 0,
            app_name: "Desktop".into(),
            path: String::new(),
            groups: island_shell::app_menu_profile_for_path(""),
        })
}

#[tauri::command]
fn exec_app_menu_shortcut(target_hwnd: isize, vks: Vec<u16>) {
    std::thread::spawn(move || {
        island_shell::exec_app_menu_shortcut(target_hwnd, vks);
    });
}

#[tauri::command]
fn list_virtual_desktops() -> island_shell::VirtualDesktopsInfo {
    island_shell::list_virtual_desktops()
}

#[tauri::command]
fn virtual_desktop_action(action: String) {
    island_shell::virtual_desktop_action(&action);
}

#[tauri::command]
fn scene_focus_window(hwnd: isize, group: Option<bool>) {
    island_shell::scene_focus_window(std::process::id(), hwnd, group.unwrap_or(false));
}

#[tauri::command]
fn scene_tuck_all() {
    island_shell::scene_tuck_all(std::process::id());
}

#[tauri::command]
fn scene_unpark_all() -> usize {
    island_shell::scene_unpark_all()
}

static TASKBAR_DESIRED_HIDDEN: AtomicBool = AtomicBool::new(false);
static SCENE_WAS_ACTIVE: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Default)]
struct SlowTelemetry {
    cpu_pct: u8,
    ram_pct: u8,
    ram_used_gb_x10: u16,
    ram_total_gb_x10: u16,
    net_down_kbps: u32,
    net_up_kbps: u32,
    output_name: String,
    bright_pct: u8,
    bright_soft: bool,
    wifi_ssid: String,
    wifi_bars: u8,
    cam_active: bool,
    mic_active: bool,
    privacy_app: String,
}

#[tauri::command]
async fn set_taskbar_hidden(app: tauri::AppHandle, hidden: bool) -> Result<bool, String> {
    TASKBAR_DESIRED_HIDDEN.store(hidden, Ordering::Relaxed);
    let base = data_base_dir();
    let res = tauri::async_runtime::spawn_blocking(move || island_shell::set_taskbar_hidden(hidden, &base))
        .await
        .map_err(|e| e.to_string())??;
    if let Some(dock_w) = app.get_webview_window("dock") {
        if let Some(m) = dock_w.current_monitor().ok().flatten() {
            position_shell_window(&dock_w, "dock", &m);
        }
    }
    Ok(res)
}

#[tauri::command]
fn set_island_visible(app: tauri::AppHandle, visible: bool) {
    ISLAND_VISIBLE.store(visible, Ordering::Relaxed);
    let notches = ACTIVE_NOTCHES.lock().map(|l| l.clone()).unwrap_or_default();
    for n in notches {
        if let Some(w) = app.get_webview_window(&n.label) {
            if visible {
                let _ = w.show();
                enforce_window_click_through(&w, true);
            } else {
                enforce_window_click_through(&w, true);
                let _ = w.hide();
            }
        }
    }
}

#[tauri::command]
async fn toggle_overlay_window(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    toggle_overlay_internal(app, kind).await
}

#[tauri::command]
fn close_overlay_window(app: tauri::AppHandle, label: String) {
    if label.is_empty() || label == "all" {
        for lbl in ["quick_search", "quick_panel", "overlay_full"] {
            if let Some(w) = app.get_webview_window(lbl) {
                let _ = w.hide();
            }
        }
        return;
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.hide();
    }
}

#[tauri::command]
async fn sync_shell_windows(
    app: tauri::AppHandle,
    enable_deck: bool,
    enable_rail: bool,
    enable_widgets: bool,
    enable_scene: bool,
    hide_taskbar: bool,
    enable_island: Option<bool>,
) -> Result<(), String> {
    let prev_tb = TASKBAR_DESIRED_HIDDEN.swap(hide_taskbar, Ordering::Relaxed);
    if hide_taskbar || prev_tb {
        let base = data_base_dir();
        let _ = tauri::async_runtime::spawn_blocking(move || island_shell::set_taskbar_hidden(hide_taskbar, &base)).await;
    }
    let prev_scene = SCENE_WAS_ACTIVE.swap(enable_scene, Ordering::Relaxed);
    if !enable_scene && prev_scene {
        let _ = tauri::async_runtime::spawn_blocking(island_shell::scene_unpark_all).await;
    }
    if let Some(vis) = enable_island {
        if vis != ISLAND_VISIBLE.load(Ordering::Relaxed) {
            set_island_visible(app.clone(), vis);
        }
    }
    let m_opt = app
        .get_webview_window("main")
        .and_then(|w| w.primary_monitor().ok().flatten().or_else(|| w.current_monitor().ok().flatten()));
    let Some(m) = m_opt else { return Ok(()) };

    if enable_rail {
        ensure_shell_window(&app, "rail", "rail.html", &m);
    } else {
        destroy_shell_window(&app, "rail");
    }
    if enable_deck {
        ensure_shell_window(&app, "dock", "dock.html", &m);
    } else {
        destroy_shell_window(&app, "dock");
    }
    if enable_widgets {
        ensure_shell_window(&app, "desktop_widgets", "widgets.html?view=widgets", &m);
    } else {
        destroy_shell_window(&app, "desktop_widgets");
    }
    if enable_scene {
        ensure_shell_window(&app, "scene_strip", "widgets.html?view=scene", &m);
    } else {
        destroy_shell_window(&app, "scene_strip");
    }
    Ok(())
}

#[tauri::command]
fn set_shell_interactive_rects(
    app: tauri::AppHandle,
    label: String,
    rects: Vec<[f64; 4]>,
    topmost: Option<bool>,
) {
    if label == "desktop_widgets" {
        if let Some(tm) = topmost {
            let prev = WIDGETS_TOPMOST.swap(tm, Ordering::Relaxed);
            if prev != tm {
                if let Some(w) = app.get_webview_window("desktop_widgets") {
                    let _ = w.set_always_on_top(tm);
                    if !tm {
                        unsafe {
                            if let Ok(hwnd) = w.hwnd() {
                                let _ = windows::Win32::UI::WindowsAndMessaging::SetWindowPos(
                                    hwnd,
                                    Some(windows::Win32::UI::WindowsAndMessaging::HWND_BOTTOM),
                                    0,
                                    0,
                                    0,
                                    0,
                                    windows::Win32::UI::WindowsAndMessaging::SWP_NOMOVE
                                        | windows::Win32::UI::WindowsAndMessaging::SWP_NOSIZE
                                        | windows::Win32::UI::WindowsAndMessaging::SWP_NOACTIVATE,
                                );
                            }
                        }
                    }
                }
            }
        }
    }
    if let Ok(mut g) = SHELL_RECTS.lock() {
        g.get_or_insert_with(HashMap::new).insert(label, rects);
    }
}

#[tauri::command]
fn set_hot_corners(corners: [String; 4]) {
    if let Ok(mut g) = HOT_CORNERS.lock() {
        *g = corners;
    }
}

#[tauri::command]
fn set_mac_shortcuts(enable: bool) {
    MAC_SHORTCUTS_ENABLED.store(enable, Ordering::Relaxed);
}

#[tauri::command]
fn set_suppress_native_osd(enable: bool) {
    SUPPRESS_NATIVE_OSD.store(enable, Ordering::Relaxed);
}

fn setup_system_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    let title_item = MenuItem::with_id(handle, "title", "🤖 Island v1.2.0", false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(handle)?;
    let search_item = MenuItem::with_id(handle, "quick_search", "🔍 Quick Search (Ctrl+Space)", true, None::<&str>)?;
    let panel_item = MenuItem::with_id(handle, "quick_panel", "🎚️ Quick Panel (Ctrl+Alt+C)", true, None::<&str>)?;
    let widgets_item = MenuItem::with_id(handle, "open_widgets", "🧱 Thư viện Desktop Widgets...", true, None::<&str>)?;
    let sep_mid = PredefinedMenuItem::separator(handle)?;
    let settings_item = MenuItem::with_id(handle, "settings", "⚙️ Mở Cài đặt chi tiết...", true, None::<&str>)?;
    let center_item = MenuItem::with_id(handle, "center", "🔄 Đưa tai thỏ về giữa màn hình", true, None::<&str>)?;
    let toggle_item = MenuItem::with_id(handle, "toggle", "👁️ Ẩn / Hiện tai thỏ", true, None::<&str>)?;
    let recover_item = MenuItem::with_id(handle, "recover", "🛟 Khôi phục Taskbar & Cửa sổ", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(handle)?;
    let quit_item = MenuItem::with_id(handle, "quit", "❌ Thoát Island", true, None::<&str>)?;

    let menu = MenuBuilder::new(handle)
        .items(&[
            &title_item,
            &sep1,
            &search_item,
            &panel_item,
            &widgets_item,
            &sep_mid,
            &settings_item,
            &center_item,
            &toggle_item,
            &recover_item,
            &sep2,
            &quit_item,
        ])
        .build()?;

    let icon = if DARK_ROBOT_RGBA_64.len() == 64 * 64 * 4 {
        tauri::image::Image::new(DARK_ROBOT_RGBA_64, 64, 64)
    } else {
        handle.default_window_icon().cloned().ok_or("No default window icon")?
    };

    let _tray = TrayIconBuilder::with_id("island-tray")
        .tooltip("Island — Bấm trái: Cài đặt · Bấm phải: Menu nhanh")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "quick_search" => {
                    let h = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = toggle_overlay_internal(h, "quick_search".into()).await;
                    });
                }
                "quick_panel" => {
                    let h = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = toggle_overlay_internal(h, "quick_panel".into()).await;
                    });
                }
                "open_widgets" => {
                    let h = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if h.get_webview_window("desktop_widgets").is_none() {
                            if let Some(m) = find_monitor_at_cursor(&h) {
                                ensure_shell_window(&h, "desktop_widgets", "widgets.html?view=widgets", &m);
                            }
                        }
                        let _ = h.emit("island-open-widget-gallery", true);
                    });
                }
                "settings" => {
                    let h = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = open_settings_window(h).await;
                    });
                }
                "center" => {
                    let _ = center_top_window(app.clone());
                }
                "toggle" => {
                    let vis = !ISLAND_VISIBLE.load(Ordering::Relaxed);
                    set_island_visible(app.clone(), vis);
                }
                "recover" => {
                    island_shell::restore_taskbar();
                    island_shell::scene_unpark_all();
                    island_system::restore_brightness();
                }
                "quit" => {
                    island_shell::restore_taskbar();
                    island_shell::scene_unpark_all();
                    island_system::restore_brightness();
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let h = tray.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_settings_window(h).await;
                });
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    kill_previous_island_instances();

    // Tối ưu hoá cờ khởi chạy WebView2 để giảm tối đa RAM & CPU nền của Chromium mà vẫn mượt mà 100%
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            concat!(
                "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate,OptimizationHints,MediaRouter,SpareRendererForSitePerProcess,BackForwardCache ",
                "--disable-background-networking ",
                "--disable-component-update ",
                "--disable-sync ",
                "--disable-extensions ",
                "--disable-default-apps ",
                "--no-pings ",
                "--disk-cache-size=20971520 ",
                "--media-cache-size=20971520"
            ),
        );
    }

    let (init_vol_pct, init_vol_muted) = (50u8, false);
    let media_arc = Arc::new(Mutex::new(MediaInfo::default()));
    let media_updated_arc = Arc::new(Mutex::new(None::<Instant>));
    let hw_arc = Arc::new(Mutex::new(HardwareTick {
        battery_pct: 100,
        volume_pct: init_vol_pct,
        volume_muted: init_vol_muted,
        ..Default::default()
    }));
    let bounds_arc = Arc::new(Mutex::new(HashMap::<String, NotchBounds>::new()));
    let dropped_arc = Arc::new(Mutex::new(Vec::<DroppedFileItem>::new()));
    let (media_tx, media_rx) = mpsc::channel::<MediaCmd>();

    // 1. Spawn dedicated MTA thread for Windows Media Control (GSMTC) + WASAPI Real-Time Audio Peak
    let media_for_worker = media_arc.clone();
    let media_updated_for_worker = media_updated_arc.clone();
    std::thread::spawn(move || {
        let mut manager_opt: Option<GlobalSystemMediaTransportControlsSessionManager> = None;
        let mut thumb_cache: Option<(String, String)> = None;
        let mut meta_cache = CachedSongMeta::default();
        let mut tracker: Option<TimelineTracker> = None;
        let mut is_currently_playing = false;
        let mut cached_meter: *mut std::ffi::c_void = std::ptr::null_mut();
        let mut meter_opened_at: Option<Instant> = None;

        loop {
            if manager_opt.is_none() {
                manager_opt = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                    .ok()
                    .and_then(|op| join_async_timeout(op, 1200));
            }

            let wait_ms = if is_currently_playing { 240 } else { 900 };
            if let Ok(cmd) = media_rx.recv_timeout(Duration::from_millis(wait_ms)) {
                if let Some(ref mgr) = manager_opt {
                    match cmd {
                        MediaCmd::Action(act, pos) => {
                            execute_media_cmd_on_mta(mgr, &act, pos);
                            if act == "seek" {
                                if let (Some(t), Some(p)) = (&mut tracker, pos) {
                                    let target_p = p.max(0.0);
                                    let now_ut = current_windows_universal_ticks();
                                    let cur_ut_delta = if t.raw_last_updated > 0 && now_ut >= t.raw_last_updated {
                                        ((now_ut - t.raw_last_updated) as f64) / 10_000_000.0
                                    } else {
                                        0.0
                                    };
                                    let cur_base = (t.raw_pos_ticks as f64) / 10_000_000.0;
                                    t.pause_offset_secs = (cur_base + cur_ut_delta) - target_p;
                                    t.last_playing_pos_secs = target_p;
                                    t.recorded_at = Instant::now();
                                }
                            } else if act == "next" || act == "prev" {
                                tracker = None;
                                meta_cache.title.clear();
                            }
                            std::thread::sleep(Duration::from_millis(160));
                        }
                    }
                    let peak = read_system_audio_peak_cached(&mut cached_meter, &mut meter_opened_at);
                    let info = fetch_media_on_mta_thread(
                        mgr,
                        &mut thumb_cache,
                        &mut meta_cache,
                        &mut tracker,
                        peak,
                    );
                    is_currently_playing = info.playing;
                    if let Ok(mut u) = media_updated_for_worker.lock() {
                        *u = Some(Instant::now());
                    }
                    if let Ok(mut g) = media_for_worker.lock() {
                        *g = info;
                    }
                }
                continue;
            }

            if let Some(ref mgr) = manager_opt {
                let peak = if is_currently_playing {
                    read_system_audio_peak_cached(&mut cached_meter, &mut meter_opened_at)
                } else {
                    0.0
                };
                let info = fetch_media_on_mta_thread(
                    mgr,
                    &mut thumb_cache,
                    &mut meta_cache,
                    &mut tracker,
                    peak,
                );
                is_currently_playing = info.playing;
                if let Ok(mut u) = media_updated_for_worker.lock() {
                    *u = Some(Instant::now());
                }
                if let Ok(mut g) = media_for_worker.lock() {
                    *g = info;
                }
            }
        }
    });

    let bounds_for_cursor = bounds_arc.clone();
    let hw_for_cursor = hw_arc.clone();
    let _hw_for_drop = hw_arc.clone();
    let _dropped_for_event = dropped_arc.clone();
    let _bounds_for_drop = bounds_arc.clone();

    let shared_state = AppSharedState {
        media: media_arc,
        media_updated_at: media_updated_arc,
        hw: hw_arc,
        bounds: bounds_arc,
        dropped_files: dropped_arc,
        media_tx: Mutex::new(media_tx),
    };

    let app = tauri::Builder::default()
        .manage(shared_state)
        .setup(move |app| {
            let base_dir = data_base_dir();
            island_shell::recover_leftover_taskbar(&base_dir);
            island_shell::recover_leftover_scene(&base_dir);
            island_search::init_clip_store(base_dir);
            island_audio::start_loopback();

            let _ = setup_system_tray(app);
            if let Some(window) = app.get_webview_window("main") {
                apply_dark_robot_icon(&window);
                let start_mon = window
                    .primary_monitor()
                    .ok()
                    .flatten()
                    .or_else(|| window.current_monitor().ok().flatten());
                if let Some(monitor) = start_mon {
                    apply_monitor_to_main(&window, &monitor);
                }
                enforce_window_click_through(&window, true);
                let own_hwnd: isize = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
                let app_for_thread = app.handle().clone();

                setup_notch_window_events(&window, app.handle());
                island_dlwatch::spawn(app.handle().clone());
                island_devices::spawn(app.handle().clone());

                // Gọt bộ nhớ khởi động sau khi WebView2 tải xong (3.5 giây)
                std::thread::spawn(|| {
                    std::thread::sleep(Duration::from_millis(3500));
                    trim_process_tree_memory();
                });

                // 1B. Dedicated slow-telemetry & clipboard thread (COM/WinRT/WLAN/Registry/WIC isolated from 16ms mouse loop)
                let slow_tel_arc = Arc::new(Mutex::new(SlowTelemetry {
                    bright_pct: 100,
                    ..Default::default()
                }));
                {
                    let app_tel = app.handle().clone();
                    let slow_tel_bg = slow_tel_arc.clone();
                    std::thread::Builder::new()
                        .name("island-telemetry".into())
                        .spawn(move || {
                            let com_tel = unsafe {
                                windows::Win32::System::Com::CoInitializeEx(
                                    None,
                                    windows::Win32::System::Com::COINIT_MULTITHREADED,
                                )
                                .is_ok()
                            };
                            let mut sys_metrics = SystemMetricsTracker::new();
                            let mut prev_clip_seq: u32 = unsafe { GetClipboardSequenceNumber() };
                            let mut last_clip_text = String::new();
                            let mut last_clip_img_id = String::new();
                            let mut step: u64 = 0;

                            let mut cur_sys = sys_metrics.sample();
                            let mut cur_out = island_audio::current_output_name();
                            let mut cur_bright = island_system::latest_brightness_cached();
                            let mut cur_priv = island_privacy::poll_active();
                            let mut cur_wifi = island_system::current_wifi_link();

                            loop {
                                if step > 0 {
                                    std::thread::sleep(Duration::from_millis(250));
                                }
                                let cur_seq = unsafe { GetClipboardSequenceNumber() };
                                if cur_seq != 0 && cur_seq != prev_clip_seq {
                                    prev_clip_seq = cur_seq;
                                    if let Some(cap) = island_search::read_clipboard_item() {
                                        match cap {
                                            island_search::ClipboardCapture::Text(clip_txt) => {
                                                if clip_txt != last_clip_text {
                                                    last_clip_text = clip_txt.clone();
                                                    let _ = app_tel.emit(
                                                        "island-clipboard",
                                                        serde_json::json!({
                                                            "text": clip_txt,
                                                            "time": chrono_or_simple_time(),
                                                        }),
                                                    );
                                                }
                                            }
                                            island_search::ClipboardCapture::Image(img) => {
                                                if img.id != last_clip_img_id {
                                                    last_clip_img_id = img.id.clone();
                                                    let _ = app_tel.emit("island-clipboard-image", &img);
                                                }
                                            }
                                        }
                                    }
                                }
                                if step > 0 && step % 6 == 0 {
                                    cur_sys = sys_metrics.sample();
                                    cur_out = island_audio::current_output_name();
                                    cur_bright = island_system::latest_brightness_cached();
                                    cur_priv = island_privacy::poll_active();
                                }
                                if step > 0 && step % 16 == 0 {
                                    cur_wifi = island_system::current_wifi_link();
                                }
                                if let Ok(mut g) = slow_tel_bg.lock() {
                                    g.cpu_pct = cur_sys.0;
                                    g.ram_pct = cur_sys.1;
                                    g.ram_used_gb_x10 = cur_sys.2;
                                    g.ram_total_gb_x10 = cur_sys.3;
                                    g.net_down_kbps = cur_sys.4;
                                    g.net_up_kbps = cur_sys.5;
                                    g.output_name = cur_out.clone();
                                    g.bright_pct = cur_bright.0;
                                    g.bright_soft = cur_bright.1;
                                    g.wifi_ssid = cur_wifi.0.clone();
                                    g.wifi_bars = cur_wifi.1;
                                    g.cam_active = cur_priv.0;
                                    g.mic_active = cur_priv.1;
                                    g.privacy_app = cur_priv.2.clone();
                                }
                                step = step.wrapping_add(1);
                            }
                            #[allow(unreachable_code)]
                            if com_tel {
                                unsafe { windows::Win32::System::Com::CoUninitialize() };
                            }
                        })
                        .ok();
                }

                // 2. Adaptive Event-Driven Win32 cursor, hotkeys, hot-corners, shell & hardware monitor thread
                let _win_clone = window.clone();
                let slow_tel_for_cursor = slow_tel_arc.clone();
                std::thread::spawn(move || {
                    let mut current_unignored_label: Option<String> = None;
                    let mut was_inside = false;
                    let mut expand_grace_until = Instant::now();
                    let mut _expand_grace_label: Option<String> = None;
                    let mut was_mouse_down = false;
                    let mut prev_ac: Option<u8> = None;
                    let mut prev_caps: Option<bool> = None;
                    let mut prev_lang: Option<u16> = None;
                    let mut prev_vol: (u8, bool) = (init_vol_pct, init_vol_muted);
                    let mut fs_hidden = false;
                    let mut tick: u64 = 0;
                    let mut last_emitted_hw = HardwareTick {
                        battery_pct: 100,
                        volume_pct: init_vol_pct,
                        volume_muted: init_vol_muted,
                        brightness_pct: 100,
                        ..Default::default()
                    };
                    let mut cursor_near_top = false;
                    let mut cached_ep_vol: *mut std::ffi::c_void = std::ptr::null_mut();
                    let mut ep_vol_opened_at: Option<Instant> = None;
                    let mut cached_meter: *mut std::ffi::c_void = std::ptr::null_mut();
                    let mut meter_opened_at: Option<Instant> = None;
                    let mut silent_audio_ticks: u32 = 30;
                    let mut cur_audio_peak: u8 = 0;
                    let mut cur_audio_bands = [0u8; 5];
                    let mut cur_audio_spec = [0u8; 16];
                    let mut prev_hk_open = false;
                    let mut prev_hk_cap = false;
                    let mut prev_hk_color = false;
                    let mut prev_hk_todo = false;
                    let mut prev_hk_qs = false;
                    let mut prev_hk_grid = false;
                    let mut prev_hk_over = false;
                    let mut prev_hk_qp = false;
                    let mut prev_mac_next = false;
                    let mut prev_mac_prev = false;
                    let mut prev_mac_hide = false;
                    let mut prev_mac_min = false;
                    let mut prev_mac_quit = false;
                    let mut corner_active: Option<usize> = None;
                    let mut corner_entered_at = Instant::now();
                    let mut corner_fired = false;
                    let mut cached_tel = SlowTelemetry {
                        bright_pct: 100,
                        ..Default::default()
                    };
                    let mut cached_win_rects: HashMap<String, (f64, f64, f64)> = HashMap::new();
                    let mut last_notches_sig: Vec<(String, i32, i32)> = Vec::new();
                    let mut last_shell_trans: HashMap<String, bool> = HashMap::new();
                    let mut last_dock_edge = false;
                    let mut last_rail_edge = false;

                    loop {
                        let sleep_ms = if cursor_near_top || was_inside { 16 } else { 36 };
                        std::thread::sleep(Duration::from_millis(sleep_ms));
                        tick = tick.wrapping_add(1);

                        if tick % 6000 == 0
                            && !was_inside
                            && !cursor_near_top
                            && AUTO_TRIM_MEMORY.load(Ordering::Relaxed)
                        {
                            trim_process_tree_memory();
                        }

                        let active_notches = ACTIVE_NOTCHES.lock().map(|l| l.clone()).unwrap_or_default();
                        let notches_sig: Vec<(String, i32, i32)> = active_notches
                            .iter()
                            .map(|n| (n.label.clone(), n.geo.x as i32, n.geo.y as i32))
                            .collect();
                        if notches_sig != last_notches_sig {
                            cached_win_rects.clear();
                            last_notches_sig = notches_sig;
                        }
                        let primary_geo = active_notches.first().map(|n| n.geo).unwrap_or(MonGeo {
                            x: 0.0, y: 0.0, w: 1920.0, h: 1080.0, scale: 1.0,
                        });

                        // Ẩn tai thỏ / Dock / Rail khi có ứng dụng toàn màn hình (game, video, trình chiếu)
                        if tick % 25 == 0 {
                            let mut own: Vec<isize> = vec![own_hwnd];
                            for n in &active_notches {
                                if let Some(w) = app_for_thread.get_webview_window(&n.label) {
                                    if let Ok(h) = w.hwnd() {
                                        own.push(h.0 as isize);
                                    }
                                }
                            }
                            for lbl in ["settings", "quick_panel", "quick_search", "overlay_full", "dock", "rail", "desktop_widgets", "scene_strip"] {
                                if let Some(sw) = app_for_thread.get_webview_window(lbl) {
                                    if let Ok(h) = sw.hwnd() {
                                        own.push(h.0 as isize);
                                    }
                                }
                            }
                            let want_hide = HIDE_FULLSCREEN.load(Ordering::Relaxed)
                                && foreground_is_fullscreen(&own, &primary_geo);
                            if want_hide != fs_hidden {
                                fs_hidden = want_hide;
                                let island_vis = ISLAND_VISIBLE.load(Ordering::Relaxed);
                                for n in &active_notches {
                                    if let Some(w) = app_for_thread.get_webview_window(&n.label) {
                                        if want_hide || !island_vis {
                                            enforce_window_click_through(&w, true);
                                            let _ = w.hide();
                                        } else {
                                            let _ = w.show();
                                            enforce_window_click_through(&w, true);
                                        }
                                    }
                                }
                                for slbl in ["dock", "rail", "scene_strip"] {
                                    if let Some(sw) = app_for_thread.get_webview_window(slbl) {
                                        if want_hide {
                                            let _ = sw.hide();
                                        } else {
                                            let _ = sw.show();
                                        }
                                    }
                                }
                                if !want_hide {
                                    current_unignored_label = None;
                                }
                                if let Ok(mut hw) = hw_for_cursor.lock() {
                                    hw.fullscreen_hidden = want_hide;
                                    if *hw != last_emitted_hw {
                                        last_emitted_hw = hw.clone();
                                        let _ = app_for_thread.emit("island-hw", &last_emitted_hw);
                                    }
                                }
                            }
                        }

                        // Phím tắt toàn cục
                        if HOTKEYS_ENABLED.load(Ordering::Relaxed) {
                            let alt_down = (unsafe { GetAsyncKeyState(0x12) } & (0x8000u16 as i16)) != 0;
                            let ctrl_down = (unsafe { GetAsyncKeyState(0x11) } & (0x8000u16 as i16)) != 0;
                            let win_down = ((unsafe { GetAsyncKeyState(0x5B) } | unsafe { GetAsyncKeyState(0x5C) }) & (0x8000u16 as i16)) != 0;
                            let (
                                hk_open, hk_cap, hk_color, hk_todo, hk_qs, hk_grid, hk_over, hk_qp,
                                m_next, m_prev, m_hide, m_min, m_quit,
                            ) = if (alt_down || ctrl_down) && !win_down {
                                let shift_down = (unsafe { GetAsyncKeyState(0x10) } & (0x8000u16 as i16)) != 0;
                                let space_down = (unsafe { GetAsyncKeyState(0x20) } & (0x8000u16 as i16)) != 0;
                                let up_down = (unsafe { GetAsyncKeyState(0x26) } & (0x8000u16 as i16)) != 0;
                                let tick_down = (unsafe { GetAsyncKeyState(0xC0) } & (0x8000u16 as i16)) != 0;
                                let key_a = (unsafe { GetAsyncKeyState(0x41) } & (0x8000u16 as i16)) != 0;
                                let key_c = (unsafe { GetAsyncKeyState(0x43) } & (0x8000u16 as i16)) != 0;
                                let key_h = (unsafe { GetAsyncKeyState(0x48) } & (0x8000u16 as i16)) != 0;
                                let key_m = (unsafe { GetAsyncKeyState(0x4D) } & (0x8000u16 as i16)) != 0;
                                let key_n = (unsafe { GetAsyncKeyState(0x4E) } & (0x8000u16 as i16)) != 0;
                                let key_q = (unsafe { GetAsyncKeyState(0x51) } & (0x8000u16 as i16)) != 0;
                                let key_s = (unsafe { GetAsyncKeyState(0x53) } & (0x8000u16 as i16)) != 0;

                                let open = (alt_down && space_down && !ctrl_down && !shift_down)
                                    || (ctrl_down && shift_down && key_a && !alt_down);
                                let cap = alt_down && key_s && !ctrl_down && !shift_down;
                                let color = alt_down && key_c && !ctrl_down && !shift_down;
                                let todo = ctrl_down && alt_down && key_n && !shift_down;
                                let qs = ctrl_down && space_down && !alt_down && !shift_down;
                                let grid = ctrl_down && shift_down && space_down && !alt_down;
                                let over = ctrl_down && up_down && !alt_down && !shift_down;
                                let qp = ctrl_down && alt_down && key_c && !shift_down;
                                let mac_on = MAC_SHORTCUTS_ENABLED.load(Ordering::Relaxed);
                                let mn = mac_on && alt_down && tick_down && !ctrl_down && !shift_down;
                                let mp = mac_on && alt_down && shift_down && tick_down && !ctrl_down;
                                let mh = mac_on && ctrl_down && alt_down && key_h && !shift_down;
                                let mm = mac_on && ctrl_down && alt_down && key_m && !shift_down;
                                let mq = mac_on && ctrl_down && alt_down && key_q && !shift_down;
                                (open, cap, color, todo, qs, grid, over, qp, mn, mp, mh, mm, mq)
                            } else {
                                (false, false, false, false, false, false, false, false, false, false, false, false, false)
                            };

                            if hk_open && !prev_hk_open {
                                if let Some(w) = app_for_thread.get_webview_window("main") {
                                    let _ = w.show();
                                    enforce_window_click_through(&w, false);
                                    let _ = w.set_focus();
                                }
                                let _ = app_for_thread.emit(
                                    "island-hotkey",
                                    serde_json::json!({ "action": "open_ai" }),
                                );
                            }
                            if hk_cap && !prev_hk_cap {
                                let mut own_cap: Vec<isize> = vec![own_hwnd];
                                for n in &active_notches {
                                    if let Some(w) = app_for_thread.get_webview_window(&n.label) {
                                        if let Ok(h) = w.hwnd() {
                                            own_cap.push(h.0 as isize);
                                        }
                                    }
                                }
                                if let Ok(att) = capture_foreground_window_png(&own_cap) {
                                    if let Some(w) = app_for_thread.get_webview_window("main") {
                                        let _ = w.show();
                                        enforce_window_click_through(&w, false);
                                        let _ = w.set_focus();
                                    }
                                    let _ = app_for_thread.emit(
                                        "island-hotkey",
                                        serde_json::json!({
                                            "action": "capture_to_ai",
                                            "attachment": att
                                        }),
                                    );
                                }
                            }
                            if hk_color && !prev_hk_color {
                                island_colorpick::start(app_for_thread.clone());
                            }
                            if hk_todo && !prev_hk_todo {
                                if let Some(w) = app_for_thread.get_webview_window("main") {
                                    let _ = w.show();
                                    enforce_window_click_through(&w, false);
                                    let _ = w.set_focus();
                                }
                                let _ = app_for_thread.emit(
                                    "island-hotkey",
                                    serde_json::json!({ "action": "quick_todo" }),
                                );
                            }
                            if hk_qs && !prev_hk_qs {
                                trigger_hot_action(&app_for_thread, "quick_search");
                            }
                            if hk_grid && !prev_hk_grid {
                                trigger_hot_action(&app_for_thread, "app_grid");
                            }
                            if hk_over && !prev_hk_over {
                                trigger_hot_action(&app_for_thread, "overview");
                            }
                            if hk_qp && !prev_hk_qp {
                                trigger_hot_action(&app_for_thread, "quick_panel");
                            }
                            let own_pid = std::process::id();
                            if m_next && !prev_mac_next {
                                island_shell::cycle_same_app_windows(own_pid, false);
                            }
                            if m_prev && !prev_mac_prev {
                                island_shell::cycle_same_app_windows(own_pid, true);
                            }
                            if m_hide && !prev_mac_hide {
                                island_shell::hide_foreground_app(own_pid);
                            }
                            if m_min && !prev_mac_min {
                                island_shell::minimize_foreground_window(own_pid);
                            }
                            if m_quit && !prev_mac_quit {
                                island_shell::quit_foreground_app(own_pid);
                            }
                            prev_hk_open = hk_open;
                            prev_hk_cap = hk_cap;
                            prev_hk_color = hk_color;
                            prev_hk_todo = hk_todo;
                            prev_hk_qs = hk_qs;
                            prev_hk_grid = hk_grid;
                            prev_hk_over = hk_over;
                            prev_hk_qp = hk_qp;
                            prev_mac_next = m_next;
                            prev_mac_prev = m_prev;
                            prev_mac_hide = m_hide;
                            prev_mac_min = m_min;
                            prev_mac_quit = m_quit;
                        } else {
                            prev_hk_open = false;
                            prev_hk_cap = false;
                            prev_hk_color = false;
                            prev_hk_todo = false;
                            prev_hk_qs = false;
                            prev_hk_grid = false;
                            prev_hk_over = false;
                            prev_hk_qp = false;
                            prev_mac_next = false;
                            prev_mac_prev = false;
                            prev_mac_hide = false;
                            prev_mac_min = false;
                            prev_mac_quit = false;
                        }

                        if fs_hidden {
                            continue;
                        }

                        // Ngôn ngữ nhập liệu (thuần GetForegroundWindow nhẹ)
                        let mut lang_update: Option<String> = None;
                        if tick % 12 == 0 {
                            unsafe {
                                let fg = GetForegroundWindow();
                                if !fg.0.is_null() {
                                    let tid = GetWindowThreadProcessId(fg, None);
                                    let hkl = GetKeyboardLayout(tid);
                                    let lid = (hkl.0 as usize & 0xFFFF) as u16;
                                    if lid != 0 {
                                        if let Some(p) = prev_lang {
                                            if p != lid {
                                                lang_update = Some(lang_code_from_langid(lid));
                                            }
                                        }
                                        prev_lang = Some(lid);
                                    }
                                }
                            }
                        }

                        let mut pt = POINT::default();
                        if unsafe { GetCursorPos(&mut pt) }.is_err() {
                            continue;
                        }

                        let lmb_raw = unsafe { GetAsyncKeyState(0x01) };
                        let rmb_raw = unsafe { GetAsyncKeyState(0x02) };
                        let lmb_held = lmb_raw < 0;
                        let rmb_held = rmb_raw < 0;
                        let mouse_down = lmb_held || rmb_held;
                        let mouse_pressed =
                            mouse_down || (lmb_raw & 1) != 0 || (rmb_raw & 1) != 0;

                        // Góc màn hình (Hot Corners - vùng 4px ở 4 góc màn hình chính, giữ 250ms)
                        let px = pt.x as f64;
                        let py = pt.y as f64;
                        let hit_corner = if px <= primary_geo.x + 4.0 && py <= primary_geo.y + 4.0 {
                            Some(0usize) // Top-Left
                        } else if px >= primary_geo.x + primary_geo.w - 4.0 && py <= primary_geo.y + 4.0 {
                            Some(1usize) // Top-Right
                        } else if px <= primary_geo.x + 4.0 && py >= primary_geo.y + primary_geo.h - 4.0 {
                            Some(2usize) // Bottom-Left
                        } else if px >= primary_geo.x + primary_geo.w - 4.0 && py >= primary_geo.y + primary_geo.h - 4.0 {
                            Some(3usize) // Bottom-Right
                        } else {
                            None
                        };
                        match hit_corner {
                            Some(idx) if !mouse_down => {
                                if corner_active != Some(idx) {
                                    corner_active = Some(idx);
                                    corner_entered_at = Instant::now();
                                    corner_fired = false;
                                } else if !corner_fired && corner_entered_at.elapsed() >= Duration::from_millis(250) {
                                    corner_fired = true;
                                    let act = HOT_CORNERS.lock().map(|c| c[idx].clone()).unwrap_or_default();
                                    trigger_hot_action(&app_for_thread, &act);
                                }
                            }
                            _ => {
                                corner_active = None;
                                corner_fired = false;
                            }
                        }

                        // Rà sát vùng tương tác cho các cửa sổ Shell phụ (chỉ chạy khi thực sự có cửa sổ Shell)
                        if let Ok(smap) = SHELL_RECTS.lock().map(|g| g.clone().unwrap_or_default()) {
                            if !smap.is_empty() {
                                for slbl in ["dock", "rail", "desktop_widgets", "scene_strip"] {
                                    if let Some(sw) = app_for_thread.get_webview_window(slbl) {
                                        let mut inside_shell = false;
                                        if let (Some(rects), Ok(hwnd)) = (smap.get(slbl), sw.hwnd()) {
                                            let mut wr = RECT::default();
                                            if unsafe { GetWindowRect(hwnd, &mut wr) }.is_ok() {
                                                let sc = sw.scale_factor().unwrap_or(1.0);
                                                for r in rects {
                                                    let l = wr.left as f64 + r[0] * sc;
                                                    let t = wr.top as f64 + r[1] * sc;
                                                    let rr = wr.left as f64 + r[2] * sc;
                                                    let b = wr.top as f64 + r[3] * sc;
                                                    if px >= l && px <= rr && py >= t && py <= b {
                                                        inside_shell = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                        let want_ignore = !inside_shell;
                                        let changed = last_shell_trans.get(slbl).copied() != Some(want_ignore);
                                        if changed || tick % 12 == 0 {
                                            enforce_window_click_through(&sw, want_ignore);
                                            last_shell_trans.insert(slbl.to_string(), want_ignore);
                                        }
                                    }
                                }
                            }
                        }

                        // Edge reveal events cho Smart Dock (đáy màn hình) & Smart Rail (mép trên)
                        let near_bottom = py >= primary_geo.y + primary_geo.h - 4.0
                            && px >= primary_geo.x
                            && px <= primary_geo.x + primary_geo.w;
                        if near_bottom != last_dock_edge {
                            last_dock_edge = near_bottom;
                            let _ = app_for_thread.emit("island-dock-edge", near_bottom);
                        }
                        let near_top_edge = py <= primary_geo.y + 3.0
                            && px >= primary_geo.x
                            && px <= primary_geo.x + primary_geo.w;
                        if near_top_edge != last_rail_edge {
                            last_rail_edge = near_top_edge;
                            let _ = app_for_thread.emit("island-rail-edge", near_top_edge);
                        }

                        let bounds_map = bounds_for_cursor
                            .lock()
                            .map(|b| b.clone())
                            .unwrap_or_default();

                        let any_expanded = bounds_map.values().any(|b| b.expanded);

                        let mut active_window_inside: Option<String> = None;
                        let mut near_any_top = false;
                        for notch in &active_notches {
                            let b = bounds_map.get(&notch.label).copied().unwrap_or_default();

                            let eff_w = if b.expanded {
                                b.width.max(480.0)
                            } else {
                                b.width.clamp(120.0, 360.0)
                            };
                            let eff_h = if b.expanded {
                                b.height.max(140.0)
                            } else {
                                b.height.clamp(24.0, 48.0)
                            };

                            let notch_pad_w = 8.0;
                            let notch_pad_h = if b.expanded { 8.0 } else { 6.0 };

                            let need_rect_refresh =
                                tick % 30 == 1 || !cached_win_rects.contains_key(&notch.label);
                            let (center_x, top_y, actual_scale) = if need_rect_refresh {
                                let mut cx = notch.geo.x + notch.geo.w / 2.0;
                                let mut ty = notch.geo.y;
                                let mut sc = notch.geo.scale;
                                if let Some(w) = app_for_thread.get_webview_window(&notch.label) {
                                    if let Ok(hwnd) = w.hwnd() {
                                        let mut wr = RECT::default();
                                        if unsafe { GetWindowRect(hwnd, &mut wr) }.is_ok()
                                            && wr.right > wr.left
                                        {
                                            cx = (wr.left + wr.right) as f64 / 2.0;
                                            ty = wr.top as f64;
                                            sc = (((wr.right - wr.left) as f64) / 860.0).max(0.5);
                                        }
                                    }
                                }
                                cached_win_rects.insert(notch.label.clone(), (cx, ty, sc));
                                (cx, ty, sc)
                            } else {
                                *cached_win_rects.get(&notch.label).unwrap_or(&(
                                    notch.geo.x + notch.geo.w / 2.0,
                                    notch.geo.y,
                                    notch.geo.scale,
                                ))
                            };

                            let check_top_h = if b.expanded { (eff_h + 40.0).max(260.0) } else { 260.0 };
                            if py <= top_y + check_top_h * actual_scale {
                                near_any_top = true;
                            }

                            let notch_phys_w = (eff_w + notch_pad_w) * actual_scale;
                            let notch_phys_h = (eff_h + notch_pad_h) * actual_scale;
                            let left_x = center_x - notch_phys_w / 2.0;
                            let right_x = center_x + notch_phys_w / 2.0;

                            if px >= left_x
                                && px <= right_x
                                && py >= top_y - 4.0
                                && py <= top_y + notch_phys_h
                            {
                                active_window_inside = Some(notch.label.clone());
                                break;
                            }
                        }

                        if active_window_inside.is_none() && lmb_held && was_mouse_down && current_unignored_label.is_some() {
                            active_window_inside = current_unignored_label.clone();
                        }

                        cursor_near_top = near_any_top || any_expanded;

                        let inside = active_window_inside.is_some();

                        if inside && !was_inside {
                            expand_grace_until = Instant::now() + Duration::from_millis(450);
                            _expand_grace_label = active_window_inside.clone();
                        } else if !inside && !any_expanded {
                            expand_grace_until = Instant::now();
                            _expand_grace_label = None;
                        }
                        was_inside = inside;

                        let transition_changed = active_window_inside != current_unignored_label;
                        let recheck_click_through = transition_changed || tick % 8 == 0;
                        for notch_item in &active_notches {
                            if !recheck_click_through {
                                break;
                            }
                            let lbl = notch_item.label.as_str();
                            if let Some(w) = app_for_thread.get_webview_window(lbl) {
                                let should_ignore = active_window_inside.as_deref() != Some(lbl);
                                let mut need_apply = transition_changed;
                                if !need_apply {
                                    if let Ok(hwnd) = w.hwnd() {
                                        let ex = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
                                        let is_trans = (ex & (WS_EX_TRANSPARENT.0 as isize)) != 0;
                                        if is_trans != should_ignore {
                                            need_apply = true;
                                        }
                                    }
                                }
                                if need_apply {
                                    enforce_window_click_through(&w, should_ignore);
                                }
                            }
                        }
                        current_unignored_label = active_window_inside.clone();

                        let clicked_outside = ((mouse_down && !was_mouse_down)
                            || (!mouse_down && mouse_pressed))
                            && !inside
                            && any_expanded
                            && Instant::now() >= expand_grace_until;
                        was_mouse_down = mouse_down;

                        let caps_on = (unsafe { GetKeyState(0x14) } & 0x0001) != 0;
                        let mut caps_toggled = false;
                        if let Some(prev) = prev_caps {
                            if caps_on != prev {
                                caps_toggled = true;
                            }
                        }
                        prev_caps = Some(caps_on);

                        let mut vol_evt: Option<&str> = None;
                        if unsafe { GetAsyncKeyState(0xAF) } < 0 {
                            vol_evt = Some("vol_up");
                        } else if unsafe { GetAsyncKeyState(0xAE) } < 0 {
                            vol_evt = Some("vol_down");
                        } else if unsafe { GetAsyncKeyState(0xAD) } < 0 {
                            vol_evt = Some("vol_mute");
                        }

                        if vol_evt.is_some() && SUPPRESS_NATIVE_OSD.load(Ordering::Relaxed) {
                            island_audio::hide_native_volume_osd();
                        }

                        let mut sys_vol_update: Option<(u8, bool)> = None;
                        if tick == 1 || vol_evt.is_some() || tick % 8 == 0 {
                            if let Some((vpct, vmuted)) =
                                read_system_volume_and_mute_cached(&mut cached_ep_vol, &mut ep_vol_opened_at)
                            {
                                if tick == 1 {
                                    prev_vol = (vpct, vmuted);
                                } else if (vpct, vmuted) != prev_vol {
                                    if vol_evt.is_none() {
                                        if vmuted != prev_vol.1 && vmuted {
                                            vol_evt = Some("vol_mute");
                                        } else if vpct > prev_vol.0 {
                                            vol_evt = Some("vol_up");
                                        } else {
                                            vol_evt = Some("vol_down");
                                        }
                                    }
                                    prev_vol = (vpct, vmuted);
                                }
                                sys_vol_update = Some((vpct, vmuted));
                            }
                        }

                        let mut pwr_update: Option<(u8, bool, bool)> = None;
                        if tick % 80 == 0 {
                            let mut pwr = SYSTEM_POWER_STATUS::default();
                            if unsafe { GetSystemPowerStatus(&mut pwr) }.is_ok() {
                                let ac = pwr.ACLineStatus;
                                let pct = if pwr.BatteryLifePercent <= 100 {
                                    pwr.BatteryLifePercent
                                } else {
                                    100
                                };
                                let changed_ac = prev_ac.is_some() && prev_ac != Some(ac);
                                prev_ac = Some(ac);
                                pwr_update = Some((pct, ac == 1, changed_ac));
                            }
                        }

                        // Biên độ & Phổ FFT 16 dải thời gian thực
                        let audio_poll_due = if silent_audio_ticks < 25 {
                            tick % 2 == 0
                        } else {
                            tick % 16 == 0
                        };
                        if audio_poll_due {
                            let peak = read_system_audio_peak_cached(&mut cached_meter, &mut meter_opened_at);
                            let raw_u8 = (peak * 100.0).round().clamp(0.0, 100.0) as u8;
                            if raw_u8 <= 1 {
                                silent_audio_ticks = silent_audio_ticks.saturating_add(1);
                                cur_audio_peak = 0;
                                cur_audio_bands = [0; 5];
                                cur_audio_spec = [0; 16];
                            } else {
                                silent_audio_ticks = 0;
                                cur_audio_peak = (raw_u8 / 2) * 2;
                                cur_audio_bands = island_audio::latest_bands();
                                cur_audio_spec = island_audio::latest_spectrum();
                            }
                        }

                        // Đọc ảnh chụp telemetry chậm non-blocking (đã được cập nhật ở thread island-telemetry)
                        if tick == 1 || tick % 10 == 0 {
                            if let Ok(tel) = slow_tel_for_cursor.try_lock() {
                                cached_tel = tel.clone();
                            }
                        }

                        if let Ok(mut hw) = hw_for_cursor.lock() {
                            hw.cursor_inside = inside;
                            hw.hovered_notch = active_window_inside.clone();
                            if !inside {
                                hw.file_drag_hover = false;
                                hw.hovered_notch = None;
                            }
                            if clicked_outside {
                                hw.outside_click_seq = hw.outside_click_seq.wrapping_add(1);
                            }
                            hw.caps_on = caps_on;
                            if caps_toggled {
                                hw.caps_changed_seq = hw.caps_changed_seq.wrapping_add(1);
                            }
                            if let Some((vpct, vmuted)) = sys_vol_update {
                                hw.volume_pct = vpct;
                                hw.volume_muted = vmuted;
                            }
                            if let Some(vk) = vol_evt {
                                hw.vol_seq = hw.vol_seq.wrapping_add(1);
                                hw.vol_kind = vk.to_string();
                            }
                            if let Some(ln) = lang_update.take() {
                                hw.lang_seq = hw.lang_seq.wrapping_add(1);
                                hw.lang_name = ln;
                            }
                            if let Some((pct, charging, changed_ac)) = pwr_update {
                                hw.battery_pct = pct;
                                hw.is_charging = charging;
                                if changed_ac {
                                    hw.ac_changed_seq = hw.ac_changed_seq.wrapping_add(1);
                                }
                            }
                            hw.audio_peak = cur_audio_peak;
                            hw.audio_bands = cur_audio_bands;
                            hw.audio_spectrum = cur_audio_spec;
                            hw.audio_output_name = cached_tel.output_name.clone();
                            hw.brightness_pct = cached_tel.bright_pct;
                            hw.brightness_soft = cached_tel.bright_soft;
                            hw.wifi_ssid = cached_tel.wifi_ssid.clone();
                            hw.wifi_bars = cached_tel.wifi_bars;
                            hw.cpu_pct = cached_tel.cpu_pct;
                            hw.ram_pct = cached_tel.ram_pct;
                            hw.ram_used_gb_x10 = cached_tel.ram_used_gb_x10;
                            hw.ram_total_gb_x10 = cached_tel.ram_total_gb_x10;
                            hw.net_down_kbps = cached_tel.net_down_kbps;
                            hw.net_up_kbps = cached_tel.net_up_kbps;
                            hw.cam_active = cached_tel.cam_active;
                            hw.mic_active = cached_tel.mic_active;
                            hw.privacy_app = cached_tel.privacy_app.clone();
                            if *hw != last_emitted_hw {
                                last_emitted_hw = hw.clone();
                                let _ = app_for_thread.emit("island-hw", &last_emitted_hw);
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_media,
            get_hardware_tick,
            take_dropped_files,
            play_native_alert,
            stop_native_alert,
            set_system_volume,
            fetch_lyrics_smart,
            media_control,
            set_notch_bounds,
            save_data_file,
            load_data_file,
            log_water_drink,
            get_water_history,
            set_autostart,
            get_autostart_status,
            open_path_in_explorer,
            create_shelf_snippet,
            reveal_path_in_explorer,
            exit_app,
            center_top_window,
            list_monitors,
            set_notch_monitor,
            set_notch_monitors,
            set_hide_fullscreen,
            open_settings_window,
            close_settings_window,
            detect_device_location,
            query_ai_chat,
            read_file_for_ai,
            trim_system_memory,
            set_auto_trim_memory,
            set_global_hotkeys,
            capture_active_window,
            google_tasks_get_status,
            google_tasks_start_auth,
            google_tasks_disconnect,
            google_tasks_sync,
            generate_qr_svg,
            start_lan_send,
            stop_lan_send,
            quick_file_action,
            pick_screen_color,
            get_radio_states,
            set_radio_state,
            scan_wifi_networks,
            connect_wifi_network,
            list_bluetooth_devices,
            toggle_bluetooth_audio,
            get_display_brightness,
            set_display_brightness,
            list_audio_outputs,
            set_default_audio_output,
            get_windows_dark_mode,
            set_windows_dark_mode,
            get_calendar_agenda,
            get_recycle_bin_status,
            empty_recycle_bin,
            run_system_action,
            check_app_update,
            list_installed_apps,
            get_shell_icon,
            search_local_files,
            get_recent_files,
            get_downloads_latest,
            launch_shell_target,
            open_item_properties,
            list_clipboard_images,
            copy_clipboard_image,
            toggle_clipboard_image_pin,
            delete_clipboard_image,
            list_open_windows,
            list_windows_taskbar_pins,
            capture_window_thumb,
            activate_window,
            close_window,
            minimize_window,
            get_foreground_app_menu,
            exec_app_menu_shortcut,
            list_virtual_desktops,
            virtual_desktop_action,
            scene_focus_window,
            scene_tuck_all,
            scene_unpark_all,
            set_taskbar_hidden,
            set_island_visible,
            toggle_overlay_window,
            close_overlay_window,
            sync_shell_windows,
            set_shell_interactive_rects,
            set_hot_corners,
            set_mac_shortcuts,
            set_suppress_native_osd
        ])
        .build(tauri::generate_context!())
        .expect("error while building island application");

    app.run(|_, event| {
        if let tauri::RunEvent::Exit = event {
            island_shell::restore_taskbar();
            island_shell::scene_unpark_all();
            island_system::restore_brightness();
        }
    });
}

#[cfg(test)]
mod island_tests {
    use super::*;
    use std::path::{Path, PathBuf};

    #[test]
    fn qr_encodes_v1_v4_and_rejects_oversize() {
        let short_svg = island_qr::encode_svg("ISLAND").unwrap();
        assert!(short_svg.starts_with("<svg viewBox=\"0 0 25 25\""));
        assert!(short_svg.contains("<path fill=\"#000000\" d=\"M"));

        let m = island_qr::encode("http://192.168.1.23:54321/0123456789abcdef0123/").unwrap();
        assert_eq!(m.version, 4);
        assert_eq!(m.size, 33);

        let too_long = "x".repeat(250);
        assert!(island_qr::encode_svg(&too_long).is_err());
    }

    #[test]
    fn lan_send_helpers_sanitize_and_detect_private_ips() {
        assert!(island_send::is_private([192, 168, 1, 10]));
        assert!(island_send::is_private([10, 0, 0, 5]));
        assert!(island_send::is_private([172, 16, 0, 1]));
        assert!(!island_send::is_private([8, 8, 8, 8]));
        assert_eq!(island_send::escape_html("<a&\"'>"), "&lt;a&amp;&quot;&#39;&gt;");
        assert_eq!(island_send::pct("ảnh đẹp.png"), "%E1%BA%A3nh%20%C4%91%E1%BA%B9p.png");

        let html = island_send::build_page("tok123", &[("bao<cao>.pdf".into(), 2048)]);
        assert!(html.contains("/tok123/f/0"));
        assert!(html.contains("bao&lt;cao&gt;.pdf"));
    }

    #[test]
    fn quick_actions_compute_unique_outputs() {
        assert!(island_quick::is_image("C:\\Temp\\Photo.JPG"));
        assert!(island_quick::is_image("icon.webp"));
        assert!(!island_quick::is_image("notes.pdf"));

        let none = |_: &Path| false;
        assert_eq!(
            island_quick::output_for("C:\\Pic\\a.png", island_quick::Op::Half, "nhỏ", &none),
            PathBuf::from("C:\\Pic\\a (nhỏ).png")
        );
        assert_eq!(
            island_quick::output_for("C:\\Pic\\a.png", island_quick::Op::Jpg, "nhỏ", &none),
            PathBuf::from("C:\\Pic\\a.jpg")
        );
        let taken = |p: &Path| {
            p.to_string_lossy().ends_with("a.png") || p.to_string_lossy().ends_with("a (2).png")
        };
        assert_eq!(
            island_quick::output_for("C:\\Pic\\a.jpg", island_quick::Op::Png, "nhỏ", &taken),
            PathBuf::from("C:\\Pic\\a (3).png")
        );
        assert_eq!(
            island_quick::zip_target(
                &["C:\\Doc\\1.txt".into(), "C:\\Doc\\2.txt".into()],
                "Archive",
                &none
            ),
            Some(PathBuf::from("C:\\Doc\\Archive.zip"))
        );
    }

    #[test]
    fn privacy_parses_uwp_and_non_packaged_names() {
        assert_eq!(
            island_privacy::display_name("Microsoft.WindowsCamera_8wekyb3d8bbwe", true),
            "WindowsCamera"
        );
        assert_eq!(
            island_privacy::display_name("C:#Program Files#Zoom#bin#Zoom.exe", false),
            "Zoom"
        );
    }

    #[test]
    fn dlwatch_parses_steam_vdf_and_acf() {
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Steam\"\n\t}\n}";
        assert_eq!(island_dlwatch::steam_libraries(vdf), vec!["C:\\Steam"]);

        let active_acf = "\"AppState\"\n{\n\t\"name\"\t\"Hades II\"\n\t\"StateFlags\"\t\"1026\"\n\t\"BytesDownloaded\"\t\"500\"\n\t\"BytesToDownload\"\t\"1000\"\n}";
        assert_eq!(
            island_dlwatch::steam_progress(active_acf),
            Some(("Hades II".into(), 500, 1000))
        );

        let paused_acf = "\"AppState\"\n{\n\t\"name\"\t\"Hades II\"\n\t\"StateFlags\"\t\"1536\"\n\t\"BytesDownloaded\"\t\"500\"\n\t\"BytesToDownload\"\t\"1000\"\n}";
        assert_eq!(island_dlwatch::steam_progress(paused_acf), None);
    }
}
