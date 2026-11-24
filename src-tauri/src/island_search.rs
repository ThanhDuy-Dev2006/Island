use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::Foundation::{SIZE, S_FALSE, S_OK};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_ContainerFormatPng, GUID_WICPixelFormat32bppBGRA,
    IWICImagingFactory, WICBitmapEncoderNoCache,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, COINIT_MULTITHREADED,
    STATFLAG_NONAME, STATSTG, STGM_READ, STREAM_SEEK_SET,
};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, IShellItemImageFactory,
    IShellLinkW, SHCreateItemFromParsingName, SHCreateMemStream, SHGetKnownFolderItem,
    SHGetNameFromIDList, ShellExecuteExW, ShellExecuteW, ShellLink, KF_FLAG_DEFAULT,
    SEE_MASK_INVOKEIDLIST, SHELLEXECUTEINFOW, SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_NORMALDISPLAY,
    SIGDN_PARENTRELATIVEPARSING, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY, SIIGBF_RESIZETOFIT,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

// ============================================================
// 1. FUZZY SEARCH SCORING & MATH EVALUATOR
// ============================================================
pub fn fuzzy_score(query: &str, name: &str) -> Option<u32> {
    let q: Vec<char> = query.trim().to_lowercase().chars().collect();
    if q.is_empty() {
        return None;
    }
    let n_low = name.to_lowercase();
    let n: Vec<char> = n_low.chars().collect();
    let qs: String = q.iter().collect();
    if n_low == qs {
        return Some(1000);
    }
    if n_low.starts_with(&qs) {
        return Some(900u32.saturating_sub((n.len() as u32).min(100)));
    }
    let words: Vec<&str> = n_low
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    if let Some(i) = words.iter().position(|w| w.starts_with(&qs)) {
        return Some(800u32.saturating_sub((i as u32 * 20).min(100)));
    }
    let initials: String = words.iter().filter_map(|w| w.chars().next()).collect();
    if initials.starts_with(&qs) {
        return Some(700);
    }
    if let Some(pos) = n_low.find(&qs) {
        return Some(600u32.saturating_sub((pos as u32).min(100)));
    }
    let mut qi = 0;
    let mut gaps = 0u32;
    let mut last: Option<usize> = None;
    for (i, c) in n.iter().enumerate() {
        if qi < q.len() && *c == q[qi] {
            if let Some(l) = last {
                gaps += (i - l - 1) as u32;
            }
            last = Some(i);
            qi += 1;
        }
    }
    (qi == q.len()).then(|| 400u32.saturating_sub(gaps.min(300)))
}

pub fn eval_math(expr: &str) -> Option<f64> {
    let s: Vec<char> = expr
        .chars()
        .filter(|c| !c.is_whitespace())
        .map(|c| match c {
            ',' => '.',
            '\u{00D7}' | 'x' | 'X' => '*',
            '\u{00F7}' => '/',
            c => c,
        })
        .collect();
    if s.is_empty() || !s.iter().any(|c| "+-*/^".contains(*c)) || !s.iter().any(|c| c.is_ascii_digit()) {
        return None;
    }
    if !s.iter().all(|c| c.is_ascii_digit() || "+-*/^().".contains(*c)) {
        return None;
    }
    let mut p = Parser { s: &s, i: 0 };
    let v = p.expr()?;
    (p.i == s.len() && v.is_finite()).then_some(v)
}

struct Parser<'a> {
    s: &'a [char],
    i: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<char> {
        self.s.get(self.i).copied()
    }
    fn expr(&mut self) -> Option<f64> {
        let mut v = self.term()?;
        while let Some(c) = self.peek() {
            if c == '+' || c == '-' {
                self.i += 1;
                let r = self.term()?;
                v = if c == '+' { v + r } else { v - r };
            } else {
                break;
            }
        }
        Some(v)
    }
    fn term(&mut self) -> Option<f64> {
        let mut v = self.power()?;
        while let Some(c) = self.peek() {
            if c == '*' || c == '/' {
                self.i += 1;
                let r = self.power()?;
                v = if c == '*' { v * r } else { v / r };
            } else {
                break;
            }
        }
        Some(v)
    }
    fn power(&mut self) -> Option<f64> {
        let b = self.unary()?;
        if self.peek() == Some('^') {
            self.i += 1;
            let e = self.power()?;
            return Some(b.powf(e));
        }
        Some(b)
    }
    fn unary(&mut self) -> Option<f64> {
        match self.peek()? {
            '-' => {
                self.i += 1;
                Some(-self.unary()?)
            }
            '+' => {
                self.i += 1;
                self.unary()
            }
            _ => self.atom(),
        }
    }
    fn atom(&mut self) -> Option<f64> {
        if self.peek()? == '(' {
            self.i += 1;
            let v = self.expr()?;
            if self.peek()? != ')' {
                return None;
            }
            self.i += 1;
            return Some(v);
        }
        let start = self.i;
        while matches!(self.peek(), Some(c) if c.is_ascii_digit() || c == '.') {
            self.i += 1;
        }
        if start == self.i {
            return None;
        }
        self.s[start..self.i].iter().collect::<String>().parse().ok()
    }
}

pub fn format_number(v: f64) -> String {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        return format!("{}", v as i64);
    }
    let s = format!("{:.10}", v);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

// ============================================================
// 2. WIC PNG ENCODER + SHELL ICON EXTRACTION CACHE
// ============================================================
pub fn bgra_to_png_data_url(w: u32, h: u32, bgra: &[u8]) -> Option<String> {
    if w == 0 || h == 0 || bgra.len() < (w * h * 4) as usize {
        return None;
    }
    unsafe {
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).ok()?;
        let bmp = factory
            .CreateBitmapFromMemory(w, h, &GUID_WICPixelFormat32bppBGRA, w * 4, bgra)
            .ok()?;
        let stream = SHCreateMemStream(None)?;
        let enc = factory
            .CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())
            .ok()?;
        enc.Initialize(&stream, WICBitmapEncoderNoCache).ok()?;
        let mut frame = None;
        enc.CreateNewFrame(&mut frame, std::ptr::null_mut()).ok()?;
        let frame = frame?;
        frame.Initialize(None).ok()?;
        frame.WriteSource(&bmp, std::ptr::null()).ok()?;
        frame.Commit().ok()?;
        enc.Commit().ok()?;
        let mut stat = STATSTG::default();
        stream.Stat(&mut stat, STATFLAG_NONAME).ok()?;
        let len = (stat.cbSize as usize).min(4 * 1024 * 1024);
        if len == 0 {
            return None;
        }
        stream.Seek(0, STREAM_SEEK_SET, None).ok()?;
        let mut bytes = vec![0u8; len];
        let mut read = 0u32;
        let hr = stream.Read(bytes.as_mut_ptr() as *mut _, len as u32, Some(&mut read));
        if hr != S_OK && hr != S_FALSE {
            return None;
        }
        bytes.truncate(read as usize);
        Some(format!("data:image/png;base64,{}", crate::base64_encode(&bytes)))
    }
}

static ICON_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn fit_bgra(w: u32, h: u32, bgra: Vec<u8>, px: u32) -> (u32, u32, Vec<u8>) {
    if w <= px && h <= px {
        return (w, h, bgra);
    }
    let k = (px as f32 / w.max(h) as f32).min(1.0);
    let (ow, oh) = (((w as f32 * k).round() as u32).max(1), ((h as f32 * k).round() as u32).max(1));
    let (sx, sy) = (w as f32 / ow as f32, h as f32 / oh as f32);
    let mut out = vec![0u8; (ow * oh * 4) as usize];
    for y in 0..oh {
        let (y0, y1) = (y as f32 * sy, (y + 1) as f32 * sy);
        for x in 0..ow {
            let (x0, x1) = (x as f32 * sx, (x + 1) as f32 * sx);
            let mut acc = [0f32; 4];
            let mut wsum = 0f32;
            let mut yy = y0.floor() as u32;
            while (yy as f32) < y1 && yy < h {
                let wy = ((yy + 1) as f32).min(y1) - (yy as f32).max(y0);
                let mut xx = x0.floor() as u32;
                while (xx as f32) < x1 && xx < w {
                    let wx = ((xx + 1) as f32).min(x1) - (xx as f32).max(x0);
                    let weight = wx * wy;
                    let i = ((yy * w + xx) * 4) as usize;
                    for c in 0..4 {
                        acc[c] += bgra[i + c] as f32 * weight;
                    }
                    wsum += weight;
                    xx += 1;
                }
                yy += 1;
            }
            let o = ((y * ow + x) * 4) as usize;
            for c in 0..4 {
                out[o + c] = (acc[c] / wsum.max(1e-6)).round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    (ow, oh, out)
}

pub fn get_shell_icon_data_url(path: &str, px: i32, thumb: bool) -> Option<String> {
    let clean = path.split('?').next().unwrap_or(path).trim();
    if clean.is_empty() {
        return None;
    }
    let key = format!("{}|{}|{}", clean.to_lowercase(), px, thumb);
    if let Ok(mut g) = ICON_CACHE.lock() {
        if let Some(hit) = g.get_or_insert_with(HashMap::new).get(&key) {
            return (!hit.is_empty()).then(|| hit.clone());
        }
    }

    let url = unsafe {
        let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let res = (|| -> Option<String> {
            let factory: IShellItemImageFactory =
                SHCreateItemFromParsingName(&HSTRING::from(clean), None).ok()?;
            let req = (px * 2).clamp(48, 256);
            let flags = if thumb {
                SIIGBF_RESIZETOFIT | SIIGBF_BIGGERSIZEOK
            } else {
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK
            };
            let hbmp = factory
                .GetImage(SIZE { cx: req, cy: req }, flags)
                .or_else(|_| factory.GetImage(SIZE { cx: req, cy: req }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK))
                .ok()?;
            let mut bm = BITMAP::default();
            let got = GetObjectW(
                HGDIOBJ(hbmp.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bm as *mut _ as *mut _),
            );
            if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
                let _ = DeleteObject(HGDIOBJ(hbmp.0));
                return None;
            }
            let (w, h) = (bm.bmWidth as u32, bm.bmHeight as u32);
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w as i32,
                    biHeight: -(h as i32),
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut buf = vec![0u8; (w * h * 4) as usize];
            let dc = GetDC(None);
            let lines = GetDIBits(
                dc,
                hbmp,
                0,
                h,
                Some(buf.as_mut_ptr() as *mut _),
                &mut info,
                DIB_RGB_COLORS,
            );
            ReleaseDC(None, dc);
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
            if lines == 0 {
                return None;
            }
            if buf.chunks_exact(4).all(|p| p[3] == 0) {
                for p in buf.chunks_exact_mut(4) {
                    p[3] = 255;
                }
            }
            let (fw, fh, fbgra) = fit_bgra(w, h, buf, px.clamp(16, 128) as u32);
            bgra_to_png_data_url(fw, fh, &fbgra)
        })();
        if com {
            CoUninitialize();
        }
        res
    };

    if let Ok(mut g) = ICON_CACHE.lock() {
        let map = g.get_or_insert_with(HashMap::new);
        if map.len() > 300 {
            map.clear();
        }
        map.insert(key, url.clone().unwrap_or_default());
    }
    url
}

// ============================================================
// 3. INSTALLED WINDOWS APPS INDEXER (FOLDERID_AppsFolder)
// ============================================================
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
    pub category: String,
}

static APPS_CACHE: Mutex<Option<Vec<InstalledApp>>> = Mutex::new(None);

fn app_category(name: &str, path: &str) -> &'static str {
    let l = format!("{} {}", name.to_lowercase(), path.to_lowercase());
    if ["chrome", "edge", "firefox", "brave", "opera", "arc", "vivaldi", "cốc cốc", "browser"]
        .iter()
        .any(|k| l.contains(k))
    {
        "browser"
    } else if [
        "code", "studio", "terminal", "powershell", "cmd", "git", "rust", "python", "cursor",
        "windsurf", "intellij", "docker", "notepad++",
    ]
    .iter()
    .any(|k| l.contains(k))
    {
        "dev"
    } else if ["word", "excel", "powerpoint", "onenote", "outlook", "notion", "obsidian", "pdf", "office"]
        .iter()
        .any(|k| l.contains(k))
    {
        "office"
    } else if ["spotify", "music", "vlc", "video", "photo", "paint", "clipchamp", "obs", "steam", "xbox"]
        .iter()
        .any(|k| l.contains(k))
    {
        "media"
    } else if ["settings", "control", "explorer", "task manager", "calculator", "store", "defender", "microsoft.windows"]
        .iter()
        .any(|k| l.contains(k))
    {
        "system"
    } else {
        "other"
    }
}

pub fn list_installed_apps(force_refresh: bool) -> Vec<InstalledApp> {
    if !force_refresh {
        if let Ok(g) = APPS_CACHE.lock() {
            if let Some(list) = g.as_ref() {
                return list.clone();
            }
        }
    }
    let mut out = Vec::new();
    unsafe {
        let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        if let Ok(folder) = SHGetKnownFolderItem::<IShellItem>(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None) {
            if let Ok(en) = folder.BindToHandler::<_, IEnumShellItems>(None, &BHID_EnumItems) {
                loop {
                    let mut batch: [Option<IShellItem>; 16] = Default::default();
                    let mut got = 0u32;
                    if en.Next(&mut batch, Some(&mut got)).is_err() || got == 0 {
                        break;
                    }
                    for item in batch.iter().take(got as usize).flatten() {
                        let name = item.GetDisplayName(SIGDN_NORMALDISPLAY).ok().and_then(|p| {
                            let s = p.to_string().ok();
                            CoTaskMemFree(Some(p.0 as *const _));
                            s
                        });
                        let rel = item.GetDisplayName(SIGDN_PARENTRELATIVEPARSING).ok().and_then(|p| {
                            let s = p.to_string().ok();
                            CoTaskMemFree(Some(p.0 as *const _));
                            s
                        });
                        if let (Some(name), Some(rel)) = (name, rel) {
                            let clean = name.trim().to_string();
                            if !clean.is_empty() {
                                let path = format!("shell:AppsFolder\\{rel}");
                                let category = app_category(&clean, &path).to_string();
                                out.push(InstalledApp {
                                    name: clean,
                                    path,
                                    category,
                                });
                            }
                        }
                    }
                }
            }
        }
        if com {
            CoUninitialize();
        }
    }
    out.sort_by_key(|a| a.name.to_lowercase());
    out.dedup_by(|a, b| a.path == b.path);
    if let Ok(mut g) = APPS_CACHE.lock() {
        *g = Some(out.clone());
    }
    out
}

// ============================================================
// 4. LOCAL FILE SEARCH, RECENT FILES & DOWNLOADS STACK
// ============================================================
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct FileHit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub ext: String,
    pub dir_label: String,
}

fn search_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(home) = std::env::var_os("USERPROFILE").map(PathBuf::from) {
        for d in ["Desktop", "Documents", "Downloads", "Pictures", "Videos", "Music"] {
            let p = home.join(d);
            if p.is_dir() {
                v.push(p);
            }
        }
    }
    if let Some(od) = std::env::var_os("OneDrive").map(PathBuf::from) {
        if od.is_dir() && !v.iter().any(|p| p.starts_with(&od)) {
            v.push(od);
        }
    }
    v
}

fn skip_dir_name(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "node_modules" | "target" | "AppData" | "$RECYCLE.BIN" | "System Volume Information"
        )
}

fn matches_file_filter(filter: &str, is_dir: bool, ext: &str) -> bool {
    match filter {
        "folder" => is_dir,
        "image" => !is_dir && matches!(ext, "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "svg" | "ico"),
        "doc" => !is_dir && matches!(ext, "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "csv"),
        "code" => !is_dir && matches!(ext, "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "html" | "css" | "json" | "toml" | "yaml" | "c" | "cpp" | "java" | "go"),
        _ => true,
    }
}

pub fn search_in_roots(
    roots: &[PathBuf],
    query: &str,
    filter: &str,
    budget: Duration,
    limit: usize,
    max_depth: usize,
) -> Vec<FileHit> {
    let words: Vec<String> = query.split_whitespace().map(|w| w.to_lowercase()).collect();
    if words.is_empty() {
        return Vec::new();
    }
    let start = Instant::now();
    let mut found = Vec::new();
    let mut visited = 0usize;
    let mut queue: VecDeque<(PathBuf, usize)> = roots.iter().map(|r| (r.clone(), 0)).collect();
    while let Some((dir, depth)) = queue.pop_front() {
        if start.elapsed() > budget || visited > 55_000 || found.len() >= limit * 6 {
            break;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            visited += 1;
            let name = e.file_name().to_string_lossy().to_string();
            let Ok(ft) = e.file_type() else { continue };
            let is_dir = ft.is_dir();
            let ext = Path::new(&name)
                .extension()
                .map(|x| x.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            let lower = name.to_lowercase();
            if words.iter().all(|w| lower.contains(w.as_str()))
                && matches_file_filter(filter, is_dir, &ext)
            {
                let p = e.path();
                let dir_label = p
                    .parent()
                    .and_then(|pr| pr.file_name())
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                found.push(FileHit {
                    name: name.clone(),
                    path: p.to_string_lossy().to_string(),
                    is_dir,
                    ext,
                    dir_label,
                });
            }
            if is_dir && depth < max_depth && !skip_dir_name(&name) {
                queue.push_back((e.path(), depth + 1));
            }
        }
    }
    let q0 = words[0].clone();
    found.sort_by_key(|h| {
        let n = h.name.to_lowercase();
        (!n.starts_with(&q0), !h.is_dir, n.len())
    });
    found.truncate(limit);
    found
}

pub fn search_local_files(query: &str, filter: Option<String>, limit: usize) -> Vec<FileHit> {
    search_in_roots(
        &search_roots(),
        query,
        filter.as_deref().unwrap_or("all"),
        Duration::from_millis(450),
        limit.clamp(1, 50),
        5,
    )
}

pub(crate) unsafe fn resolve_shortcut_target(path: &str) -> Option<String> {
    if !path.to_ascii_lowercase().ends_with(".lnk") {
        return Some(path.to_string());
    }
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = windows::core::Interface::cast(&link).ok()?;
        file.Load(&HSTRING::from(path), STGM_READ).ok()?;
        let mut buf = [0u16; 520];
        if link.GetPath(&mut buf, std::ptr::null_mut(), 0).is_ok() {
            let n = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
            let target = String::from_utf16_lossy(&buf[..n]);
            if !target.is_empty() {
                return Some(target);
            }
        }
        let pidl = link.GetIDList().ok()?;
        let name = SHGetNameFromIDList(pidl, SIGDN_DESKTOPABSOLUTEPARSING).ok()?;
        let parsed = name.to_string().ok();
        CoTaskMemFree(Some(name.0 as *const _));
        CoTaskMemFree(Some(pidl as *const _));
        parsed
    }
}

pub fn get_recent_files(limit: usize) -> Vec<FileHit> {
    let Some(appdata) = std::env::var_os("APPDATA") else { return Vec::new() };
    let dir = PathBuf::from(appdata).join("Microsoft").join("Windows").join("Recent");
    let Ok(rd) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut links: Vec<(SystemTime, PathBuf)> = rd
        .flatten()
        .take(1500)
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    links.sort_by(|a, b| b.0.cmp(&a.0));

    let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    let mut out = Vec::new();
    for (_, l) in links {
        if out.len() >= limit.clamp(1, 30) {
            break;
        }
        let Some(target) = (unsafe { resolve_shortcut_target(&l.to_string_lossy()) }) else { continue };
        let p = PathBuf::from(&target);
        if !p.is_file() || out.iter().any(|h: &FileHit| h.path.eq_ignore_ascii_case(&target)) {
            continue;
        }
        let name = p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let ext = p.extension().map(|s| s.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        let dir_label = p.parent().and_then(|pr| pr.file_name()).map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        out.push(FileHit { name, path: target, is_dir: false, ext, dir_label });
    }
    if com {
        unsafe { CoUninitialize() };
    }
    out
}

pub fn get_downloads_latest(limit: usize) -> Vec<FileHit> {
    let Some(home) = std::env::var_os("USERPROFILE").map(PathBuf::from) else { return Vec::new() };
    let dir = home.join("Downloads");
    let Ok(rd) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut v: Vec<(SystemTime, FileHit)> = Vec::new();
    for e in rd.flatten().take(2000) {
        let name = e.file_name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        if name.starts_with('.')
            || lower == "desktop.ini"
            || [".crdownload", ".part", ".tmp", ".download", ".partial"]
                .iter()
                .any(|ext| lower.ends_with(ext))
        {
            continue;
        }
        let Ok(md) = e.metadata() else { continue };
        let t = md.modified().unwrap_or(UNIX_EPOCH);
        let p = e.path();
        let ext = p.extension().map(|s| s.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        v.push((
            t,
            FileHit {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: md.is_dir(),
                ext,
                dir_label: "Downloads".into(),
            },
        ));
    }
    v.sort_by(|a, b| b.0.cmp(&a.0));
    v.into_iter().take(limit.clamp(1, 30)).map(|(_, h)| h).collect()
}

// ============================================================
// 5. CLIPBOARD IMAGES & PRIVACY-SAFE CLIPBOARD READER
// ============================================================
#[derive(Clone, Debug, Serialize)]
pub struct ClipboardImageItem {
    pub id: String,
    pub w: u32,
    pub h: u32,
    pub pinned: bool,
    pub thumb_b64: String,
    pub at: u64,
}

#[derive(Clone, Debug)]
pub enum ClipboardCapture {
    Text(String),
    Image(ClipboardImageItem),
}

const CF_UNICODETEXT_ID: u32 = 13;
const CF_DIB_ID: u32 = 8;
const MAX_CLIP_IMAGES: usize = 8;
const MAX_PINNED_IMAGES: usize = 20;

static CLIP_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
static CLIP_IMAGES: Mutex<Vec<(u64, Vec<u8>, ClipboardImageItem)>> = Mutex::new(Vec::new());
static PINNED_IDS: Mutex<Vec<u64>> = Mutex::new(Vec::new());

pub fn init_clip_store(data_dir: PathBuf) {
    if let Ok(mut d) = CLIP_DIR.lock() {
        *d = Some(data_dir.clone());
    }
    let pins_path = data_dir.join("clip_pins.txt");
    if let Ok(text) = std::fs::read_to_string(&pins_path) {
        let mut pins = PINNED_IDS.lock().unwrap_or_else(|e| e.into_inner());
        let mut imgs = CLIP_IMAGES.lock().unwrap_or_else(|e| e.into_inner());
        for line in text.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() == 4 && parts[0] == "I" {
                if let (Ok(id), Ok(w), Ok(h)) = (
                    parts[1].parse::<u64>(),
                    parts[2].parse::<u32>(),
                    parts[3].parse::<u32>(),
                ) {
                    let dib_path = data_dir.join("clip").join(format!("{id}.dib"));
                    if let Ok(dib) = std::fs::read(&dib_path) {
                        if let Some((dw, dh, bgra)) = dib_to_bgra(&dib) {
                            let (tw, th, thumb) = thumbnail_bgra(&bgra, dw, dh, 180);
                            if let Some(thumb_b64) = bgra_to_png_data_url(tw, th, &thumb) {
                                pins.push(id);
                                imgs.push((
                                    id,
                                    dib,
                                    ClipboardImageItem {
                                        id: id.to_string(),
                                        w,
                                        h,
                                        pinned: true,
                                        thumb_b64,
                                        at: now_secs(),
                                    },
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn fingerprint_bytes(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let step = (bytes.len() / 4096).max(1);
    for b in bytes.iter().step_by(step) {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h ^ bytes.len() as u64
}

pub fn dib_to_bgra(dib: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    let u32_at = |i: usize| -> Option<u32> { Some(u32::from_le_bytes(dib.get(i..i + 4)?.try_into().ok()?)) };
    let i32_at = |i: usize| -> Option<i32> { Some(i32::from_le_bytes(dib.get(i..i + 4)?.try_into().ok()?)) };
    let u16_at = |i: usize| -> Option<u16> { Some(u16::from_le_bytes(dib.get(i..i + 2)?.try_into().ok()?)) };

    let header = u32_at(0)? as usize;
    let w = i32_at(4)?;
    let h = i32_at(8)?;
    let bits = u16_at(14)?;
    let compression = u32_at(16)?;
    if header < 40 || w <= 0 || h == 0 || !(bits == 24 || bits == 32) || !(compression == 0 || compression == 3) {
        return None;
    }
    let (w, top_down, h) = (w as u32, h < 0, h.unsigned_abs());
    if w > 8192 || h > 8192 {
        return None;
    }
    let colors = u32_at(32).unwrap_or(0) as usize;
    let masks = if compression == 3 && header == 40 { 12 } else { 0 };
    let offset = header + masks + colors * 4;
    let bpp = bits as usize / 8;
    let stride = (w as usize * bpp).div_ceil(4) * 4;
    let need = offset.checked_add(stride.checked_mul(h as usize)?)?;
    if dib.len() < need {
        return None;
    }
    let mut out = vec![0u8; w as usize * h as usize * 4];
    let mut any_alpha = false;
    for y in 0..h as usize {
        let src_row = if top_down { y } else { h as usize - 1 - y };
        let src = &dib[offset + src_row * stride..];
        for x in 0..w as usize {
            let s = &src[x * bpp..x * bpp + bpp];
            let o = (y * w as usize + x) * 4;
            out[o] = s[0];
            out[o + 1] = s[1];
            out[o + 2] = s[2];
            out[o + 3] = if bpp == 4 { s[3] } else { 255 };
            any_alpha |= bpp == 4 && s[3] != 0;
        }
    }
    if !any_alpha {
        for px in out.chunks_exact_mut(4) {
            px[3] = 255;
        }
    }
    Some((w, h, out))
}

pub fn thumbnail_bgra(bgra: &[u8], w: u32, h: u32, max_side: u32) -> (u32, u32, Vec<u8>) {
    let k = (max_side as f32 / w.max(h) as f32).min(1.0);
    let (tw, th) = (((w as f32 * k).round() as u32).max(1), ((h as f32 * k).round() as u32).max(1));
    let mut out = vec![0u8; (tw * th * 4) as usize];
    for ty in 0..th {
        let (y0, y1) = (ty * h / th, ((ty + 1) * h / th).max(ty * h / th + 1).min(h));
        for tx in 0..tw {
            let (x0, x1) = (tx * w / tw, ((tx + 1) * w / tw).max(tx * w / tw + 1).min(w));
            let mut acc = [0u32; 4];
            let mut n = 0u32;
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * w + x) * 4) as usize;
                    for c in 0..4 {
                        acc[c] += bgra[i + c] as u32;
                    }
                    n += 1;
                }
            }
            let o = ((ty * tw + tx) * 4) as usize;
            for c in 0..4 {
                out[o + c] = (acc[c] / n.max(1)) as u8;
            }
        }
    }
    (tw, th, out)
}

fn save_clip_pins_file() {
    let dir = CLIP_DIR.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let Some(dir) = dir else { return };
    let pins = PINNED_IDS.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let imgs = CLIP_IMAGES.lock().unwrap_or_else(|e| e.into_inner());
    let mut txt = String::new();
    for id in pins.iter().take(MAX_PINNED_IMAGES) {
        if let Some((_, _, item)) = imgs.iter().find(|(i, _, _)| i == id) {
            txt.push_str(&format!("I\t{id}\t{}\t{}\n", item.w, item.h));
        }
    }
    let _ = std::fs::write(dir.join("clip_pins.txt"), txt);
}

pub fn read_clipboard_item() -> Option<ClipboardCapture> {
    enum RawClip {
        Text(String),
        Dib(Vec<u8>),
    }

    let raw_item: Option<RawClip> = unsafe {
        let mut cap: Option<RawClip> = None;
        for _ in 0..3 {
            if OpenClipboard(None).is_ok() {
                cap = (|| {
                    let fmt_excl = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
                    if fmt_excl != 0 && IsClipboardFormatAvailable(fmt_excl).is_ok() {
                        return None;
                    }
                    let fmt_can = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
                    if fmt_can != 0 && IsClipboardFormatAvailable(fmt_can).is_ok() {
                        if let Ok(h) = GetClipboardData(fmt_can) {
                            let g = windows::Win32::Foundation::HGLOBAL(h.0);
                            let p = GlobalLock(g) as *const u8;
                            if !p.is_null() {
                                let sz = GlobalSize(g);
                                let blocked = sz < 4 || std::slice::from_raw_parts(p, 4) == [0, 0, 0, 0];
                                let _ = GlobalUnlock(g);
                                if blocked {
                                    return None;
                                }
                            }
                        }
                    }

                    if IsClipboardFormatAvailable(CF_UNICODETEXT_ID).is_ok() {
                        let h = GetClipboardData(CF_UNICODETEXT_ID).ok()?;
                        let g = windows::Win32::Foundation::HGLOBAL(h.0);
                        let p = GlobalLock(g) as *const u16;
                        if !p.is_null() {
                            let mut n = 0usize;
                            while *p.add(n) != 0 && n < 200_000 {
                                n += 1;
                            }
                            let s = String::from_utf16_lossy(std::slice::from_raw_parts(p, n));
                            let _ = GlobalUnlock(g);
                            let clean = s.trim_end_matches(['\r', '\n', '\0']).to_string();
                            if !clean.trim().is_empty() {
                                return Some(RawClip::Text(clean.chars().take(4000).collect()));
                            }
                        }
                    }

                    if IsClipboardFormatAvailable(CF_DIB_ID).is_ok() {
                        let h = GetClipboardData(CF_DIB_ID).ok()?;
                        let g = windows::Win32::Foundation::HGLOBAL(h.0);
                        let n = GlobalSize(g);
                        if n > 40 && n <= 48 * 1024 * 1024 {
                            let p = GlobalLock(g) as *const u8;
                            if !p.is_null() {
                                let dib = std::slice::from_raw_parts(p, n).to_vec();
                                let _ = GlobalUnlock(g);
                                return Some(RawClip::Dib(dib));
                            }
                        }
                    }
                    None
                })();
                let _ = CloseClipboard();
                break;
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        cap
    };

    match raw_item? {
        RawClip::Text(t) => Some(ClipboardCapture::Text(t)),
        RawClip::Dib(dib) => {
            let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
            let out = (|| {
                let id = fingerprint_bytes(&dib);
                let (dw, dh, bgra) = dib_to_bgra(&dib)?;
                let (tw, th, thumb) = thumbnail_bgra(&bgra, dw, dh, 180);
                let thumb_b64 = bgra_to_png_data_url(tw, th, &thumb)?;
                let pins = PINNED_IDS.lock().unwrap_or_else(|e| e.into_inner()).clone();
                let pinned = pins.contains(&id);
                let item = ClipboardImageItem {
                    id: id.to_string(),
                    w: dw,
                    h: dh,
                    pinned,
                    thumb_b64,
                    at: now_secs(),
                };
                {
                    let mut imgs = CLIP_IMAGES.lock().unwrap_or_else(|e| e.into_inner());
                    imgs.retain(|(i, _, _)| *i != id);
                    imgs.insert(0, (id, dib, item.clone()));
                    let mut unpinned = 0usize;
                    imgs.retain(|(i, _, _)| {
                        if pins.contains(i) {
                            true
                        } else {
                            unpinned += 1;
                            unpinned <= MAX_CLIP_IMAGES
                        }
                    });
                }
                Some(ClipboardCapture::Image(item))
            })();
            if com {
                unsafe { CoUninitialize() };
            }
            out
        }
    }
}

pub fn list_clipboard_images() -> Vec<ClipboardImageItem> {
    let pins = PINNED_IDS.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let imgs = CLIP_IMAGES.lock().unwrap_or_else(|e| e.into_inner());
    let mut out: Vec<ClipboardImageItem> = imgs
        .iter()
        .map(|(id, _, item)| {
            let mut copy = item.clone();
            copy.pinned = pins.contains(id);
            copy
        })
        .collect();
    out.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.at.cmp(&a.at)));
    out
}

pub fn copy_clipboard_image(id_str: &str) -> Result<(), String> {
    let id = id_str.trim().parse::<u64>().map_err(|_| "ID ảnh không hợp lệ".to_string())?;
    let dib = CLIP_IMAGES
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .find(|(i, _, _)| *i == id)
        .map(|(_, d, _)| d.clone())
        .or_else(|| {
            let dir = CLIP_DIR.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
            std::fs::read(dir.join("clip").join(format!("{id}.dib"))).ok()
        })
        .ok_or("Không tìm thấy dữ liệu ảnh trong bộ nhớ tạm")?;

    unsafe {
        for _ in 0..6 {
            if OpenClipboard(None).is_ok() {
                let ok = (|| {
                    let _ = EmptyClipboard();
                    let h = GlobalAlloc(GMEM_MOVEABLE, dib.len()).ok()?;
                    let p = GlobalLock(h) as *mut u8;
                    if p.is_null() {
                        return None;
                    }
                    std::ptr::copy_nonoverlapping(dib.as_ptr(), p, dib.len());
                    let _ = GlobalUnlock(h);
                    SetClipboardData(CF_DIB_ID, Some(windows::Win32::Foundation::HANDLE(h.0))).ok()?;
                    Some(())
                })()
                .is_some();
                let _ = CloseClipboard();
                return if ok { Ok(()) } else { Err("Không thể ghi ảnh vào Clipboard".into()) };
            }
            std::thread::sleep(Duration::from_millis(12));
        }
    }
    Err("Clipboard đang bận".into())
}

pub fn toggle_clipboard_image_pin(id_str: &str) -> Result<bool, String> {
    let id = id_str.trim().parse::<u64>().map_err(|_| "ID ảnh không hợp lệ".to_string())?;
    let dir = CLIP_DIR.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let mut pins = PINNED_IDS.lock().unwrap_or_else(|e| e.into_inner());
    let now_pinned = if pins.contains(&id) {
        pins.retain(|x| *x != id);
        if let Some(d) = &dir {
            let _ = std::fs::remove_file(d.join("clip").join(format!("{id}.dib")));
        }
        false
    } else {
        let dib = CLIP_IMAGES
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .find(|(i, _, _)| *i == id)
            .map(|(_, b, _)| b.clone())
            .ok_or("Không tìm thấy ảnh để ghim")?;
        if let Some(d) = &dir {
            let clip_folder = d.join("clip");
            let _ = std::fs::create_dir_all(&clip_folder);
            std::fs::write(clip_folder.join(format!("{id}.dib")), &dib).map_err(|e| e.to_string())?;
        }
        pins.insert(0, id);
        pins.truncate(MAX_PINNED_IMAGES);
        true
    };
    drop(pins);
    if let Ok(mut imgs) = CLIP_IMAGES.lock() {
        for (i, _, item) in imgs.iter_mut() {
            if *i == id {
                item.pinned = now_pinned;
            }
        }
    }
    save_clip_pins_file();
    Ok(now_pinned)
}

pub fn delete_clipboard_image(id_str: &str) {
    let Ok(id) = id_str.trim().parse::<u64>() else { return };
    if let Ok(mut pins) = PINNED_IDS.lock() {
        pins.retain(|x| *x != id);
    }
    if let Ok(mut imgs) = CLIP_IMAGES.lock() {
        imgs.retain(|(i, _, _)| *i != id);
    }
    if let Some(d) = CLIP_DIR.lock().unwrap_or_else(|e| e.into_inner()).clone() {
        let _ = std::fs::remove_file(d.join("clip").join(format!("{id}.dib")));
    }
    save_clip_pins_file();
}

// ============================================================
// 6. LAUNCH & SHELL PROPERTIES
// ============================================================
pub fn launch_shell_target(path: &str) -> Result<(), String> {
    let clean = path.split('?').next().unwrap_or(path).trim().to_string();
    if clean.is_empty() {
        return Err("Đường dẫn trống".into());
    }
    let _ = std::thread::Builder::new()
        .name("island-open".into())
        .spawn(move || unsafe {
            let com = CoInitializeEx(
                None,
                COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE,
            )
            .is_ok();
            let _ = ShellExecuteW(None, w!("open"), &HSTRING::from(clean.as_str()), None, None, SW_SHOWNORMAL);
            if com {
                CoUninitialize();
            }
        });
    Ok(())
}

pub fn open_item_properties(path: &str) -> Result<(), String> {
    let clean = path.split('?').next().unwrap_or(path).trim().to_string();
    if clean.is_empty() {
        return Err("Đường dẫn trống".into());
    }
    let _ = std::thread::Builder::new()
        .name("island-props".into())
        .spawn(move || unsafe {
            let com = CoInitializeEx(
                None,
                COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE,
            )
            .is_ok();
            let file = HSTRING::from(clean.as_str());
            let mut info = SHELLEXECUTEINFOW {
                cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
                fMask: SEE_MASK_INVOKEIDLIST,
                lpVerb: w!("properties"),
                lpFile: PCWSTR(file.as_ptr()),
                nShow: SW_SHOWNORMAL.0,
                ..Default::default()
            };
            let _ = ShellExecuteExW(&mut info);
            if com {
                CoUninitialize();
            }
        });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fuzzy_and_math_eval() {
        assert!(fuzzy_score("chrome", "Google Chrome").is_some());
        assert_eq!(fuzzy_score("vsc", "Visual Studio Code"), Some(700));
        assert_eq!(eval_math("2+3*4"), Some(14.0));
        assert_eq!(eval_math("(2+3)*4"), Some(20.0));
        assert_eq!(eval_math("1,5x4"), Some(6.0));
        assert_eq!(eval_math("hello"), None);
        assert_eq!(format_number(2.5), "2.5");
        assert_eq!(format_number(14.0), "14");
    }

    #[test]
    fn dib_decode_and_thumb() {
        let mut b = Vec::new();
        b.extend_from_slice(&40u32.to_le_bytes());
        b.extend_from_slice(&2i32.to_le_bytes());
        b.extend_from_slice(&(-1i32).to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&32u16.to_le_bytes());
        b.extend_from_slice(&[0u8; 24]);
        b.extend_from_slice(&[10, 20, 30, 0, 40, 50, 60, 0]);
        let (w, h, px) = dib_to_bgra(&b).unwrap();
        assert_eq!((w, h), (2, 1));
        assert_eq!(px, vec![10, 20, 30, 255, 40, 50, 60, 255]);
        let (tw, th, out) = thumbnail_bgra(&px, 2, 1, 1);
        assert_eq!((tw, th), (1, 1));
        assert_eq!(out.len(), 4);
    }

    #[test]
    fn file_search_filtering() {
        let base = std::env::temp_dir().join(format!("island-fs-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("docs")).unwrap();
        std::fs::create_dir_all(base.join("node_modules")).unwrap();
        std::fs::write(base.join("docs/report_final.pdf"), b"pdf").unwrap();
        std::fs::write(base.join("docs/photo_final.png"), b"png").unwrap();
        std::fs::write(base.join("node_modules/report_final.js"), b"js").unwrap();
        let pdfs = search_in_roots(&[base.clone()], "final", "doc", Duration::from_secs(2), 10, 4);
        assert_eq!(pdfs.len(), 1);
        assert_eq!(pdfs[0].name, "report_final.pdf");
        let _ = std::fs::remove_dir_all(&base);
    }
}
