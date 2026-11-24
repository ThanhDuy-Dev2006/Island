use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows::core::{GUID, PCSTR, PCWSTR};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::Media::Audio::{
    eCommunications, eConsole, eMultimedia, eRender, IAudioCaptureClient, IAudioClient,
    IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK, DEVICE_STATE_ACTIVE, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToStringAlloc};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::WindowsAndMessaging::{FindWindowA, IsWindowVisible, ShowWindow, SW_HIDE};

pub const FFT: usize = 512;
pub const BANDS: usize = 5;
pub const SPEC: usize = 16;
const RANGES: [(usize, usize); BANDS] = [(1, 2), (2, 6), (6, 18), (18, 60), (60, 200)];
const WEIGHT: [f32; BANDS] = [1.2, 1.2, 1.5, 2.8, 5.0];
pub const FLOOR: f32 = 0.0;

static BAND_ATOMICS: [AtomicU32; BANDS] = [const { AtomicU32::new(0) }; BANDS];
static SPEC_ATOMICS: [AtomicU32; SPEC] = [const { AtomicU32::new(0) }; SPEC];
static OUTPUT_NAME: Mutex<String> = Mutex::new(String::new());
static STARTED: OnceLock<()> = OnceLock::new();
static ACTIVE_AUDIO: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Serialize)]
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub fn spec_ranges() -> [(usize, usize); SPEC] {
    let (lo, hi) = (1.0f32, 200.0f32);
    let mut out = [(0usize, 0usize); SPEC];
    let mut prev = 1usize;
    for (i, slot) in out.iter_mut().enumerate() {
        let edge = (lo * (hi / lo).powf((i + 1) as f32 / SPEC as f32)).round() as usize;
        let end = edge.max(prev + 1);
        *slot = (prev, end);
        prev = end;
    }
    out
}

fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f32::consts::PI / len as f32;
        let (wr, wi) = (ang.cos(), ang.sin());
        for start in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1.0f32, 0.0f32);
            for k in 0..len / 2 {
                let (a, b) = (start + k, start + k + len / 2);
                let (tr, ti) = (re[b] * cr - im[b] * ci, re[b] * ci + im[b] * cr);
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                let nr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = nr;
            }
        }
        len <<= 1;
    }
}

pub struct Analyzer {
    buf: Vec<f32>,
    fill: usize,
    peaks: [f32; BANDS],
    prev: [f32; BANDS],
    re: Vec<f32>,
    im: Vec<f32>,
    spec: [f32; SPEC],
    spec_peaks: [f32; SPEC],
    spec_ranges: [(usize, usize); SPEC],
}

impl Default for Analyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl Analyzer {
    pub fn new() -> Self {
        Self {
            buf: vec![0.0; FFT],
            fill: 0,
            peaks: [0.01; BANDS],
            prev: [0.0; BANDS],
            re: vec![0.0; FFT],
            im: vec![0.0; FFT],
            spec: [0.0; SPEC],
            spec_peaks: [0.01; SPEC],
            spec_ranges: spec_ranges(),
        }
    }

    pub fn spectrum(&self) -> [f32; SPEC] {
        self.spec
    }

    pub fn push(&mut self, mono: &[f32], mut emit: impl FnMut([f32; BANDS])) {
        for &s in mono {
            let w = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * self.fill as f32 / FFT as f32).cos());
            self.buf[self.fill] = s * w;
            self.fill += 1;
            if self.fill == FFT {
                self.fill = 0;
                emit(self.analyze());
            }
        }
    }

    fn analyze_spectrum(&mut self) {
        let last = SPEC as f32 - 1.0;
        for i in 0..SPEC {
            let (lo, hi) = self.spec_ranges[i];
            let mut sum = 0.0;
            let mut n = 0u32;
            for b in lo..hi.min(FFT / 2) {
                sum += (self.re[b] * self.re[b] + self.im[b] * self.im[b]).sqrt();
                n += 1;
            }
            let scaled = sum / n.max(1) as f32 * (1.0 + 4.0 * i as f32 / last);
            if scaled > self.spec_peaks[i] {
                self.spec_peaks[i] = scaled;
            } else {
                self.spec_peaks[i] *= 0.99;
            }
            let target = if scaled < 1e-5 {
                0.0
            } else {
                (scaled / self.spec_peaks[i].max(0.12)).min(1.0).powf(0.75)
            };
            let smooth = if target > self.spec[i] { 0.15 } else { 0.25 };
            self.spec[i] = (self.spec[i] * smooth + target * (1.0 - smooth)).clamp(FLOOR, 1.0);
        }
    }

    fn analyze(&mut self) -> [f32; BANDS] {
        self.re.copy_from_slice(&self.buf);
        self.im.fill(0.0);
        fft(&mut self.re, &mut self.im);
        let mut out = [0.0; BANDS];
        for (i, &(lo, hi)) in RANGES.iter().enumerate() {
            let mut sum = 0.0;
            let mut n = 0u32;
            for b in lo..hi.min(FFT / 2) {
                sum += (self.re[b] * self.re[b] + self.im[b] * self.im[b]).sqrt();
                n += 1;
            }
            let scaled = sum / n.max(1) as f32 * WEIGHT[i];
            if scaled > self.peaks[i] {
                self.peaks[i] = scaled;
            } else {
                self.peaks[i] *= 0.99;
            }
            let target = if scaled < 1e-5 {
                0.0
            } else {
                (scaled / self.peaks[i].max(0.12)).min(1.0).powf(0.75)
            };
            let smooth = if target > self.prev[i] { 0.12 } else { 0.22 };
            let v = (self.prev[i] * smooth + target * (1.0 - smooth)).clamp(FLOOR, 1.0);
            self.prev[i] = v;
            out[i] = v;
        }
        self.analyze_spectrum();
        out
    }
}

#[derive(Clone, Copy, PartialEq)]
enum SampleKind {
    F32,
    I16,
    I32,
}

unsafe fn sample_kind(fmt: *const WAVEFORMATEX) -> Option<SampleKind> {
    let f = unsafe { &*fmt };
    let tag = f.wFormatTag;
    let bits = f.wBitsPerSample;
    match (tag, bits) {
        (3, 32) => Some(SampleKind::F32),
        (1, 16) => Some(SampleKind::I16),
        (1, 32) => Some(SampleKind::I32),
        (0xFFFE, _) if f.cbSize >= 22 => {
            let ext = unsafe { &*(fmt as *const WAVEFORMATEXTENSIBLE) };
            let sub = ext.SubFormat.data1;
            match (sub, bits) {
                (3, 32) => Some(SampleKind::F32),
                (1, 16) => Some(SampleKind::I16),
                (1, 32) => Some(SampleKind::I32),
                _ => None,
            }
        }
        _ => None,
    }
}

fn device_id(d: &IMMDevice) -> String {
    unsafe {
        match d.GetId() {
            Ok(id) => {
                let s = PCWSTR(id.0).to_string().unwrap_or_default();
                CoTaskMemFree(Some(id.0 as *const _));
                s
            }
            Err(_) => String::new(),
        }
    }
}

fn read_device_friendly_name(device: &IMMDevice) -> Option<String> {
    const PKEY_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
        pid: 14,
    };
    unsafe {
        let store: IPropertyStore = device.OpenPropertyStore(STGM_READ).ok()?;
        let mut pv = store.GetValue(&PKEY_FRIENDLY_NAME).ok()?;
        let s = PropVariantToStringAlloc(&pv).ok().and_then(|p| {
            let t = p.to_string().ok();
            CoTaskMemFree(Some(p.0 as *const _));
            t
        });
        let _ = PropVariantClear(&mut pv);
        s.filter(|t| !t.trim().is_empty())
    }
}

fn store_silent_zero() {
    for a in &BAND_ATOMICS {
        a.store(0, Ordering::Relaxed);
    }
    for a in &SPEC_ATOMICS {
        a.store(0, Ordering::Relaxed);
    }
    ACTIVE_AUDIO.store(false, Ordering::Relaxed);
}

unsafe fn run_loopback_session(analyzer: &mut Analyzer) -> Result<(), &'static str> {
    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(|_| "enumerator")?;
    let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole) }
        .map_err(|_| "no default audio endpoint")?;
    let id = device_id(&device);
    if let Some(name) = read_device_friendly_name(&device) {
        if let Ok(mut g) = OUTPUT_NAME.lock() {
            *g = name;
        }
    }

    let client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None) }.map_err(|_| "activate")?;
    let fmt = unsafe { client.GetMixFormat() }.map_err(|_| "mixformat")?;
    let (channels, kind, bytes_per) = unsafe {
        let ch = (*fmt).nChannels as usize;
        let k = sample_kind(fmt);
        let bp = ((*fmt).wBitsPerSample / 8) as usize;
        (ch, k, bp)
    };
    let init = unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            10_000_000,
            0,
            fmt,
            None,
        )
    };
    unsafe { CoTaskMemFree(Some(fmt as *const _)) };
    init.map_err(|_| "initialize")?;
    let Some(kind) = kind else {
        return Err("unsupported sample format");
    };
    if channels == 0 || bytes_per == 0 {
        return Err("invalid channels");
    }
    let capture: IAudioCaptureClient = unsafe { client.GetService() }.map_err(|_| "capture service")?;
    unsafe { client.Start() }.map_err(|_| "start")?;

    let mut mono: Vec<f32> = Vec::with_capacity(4096);
    let mut last_check = Instant::now();
    let mut silent_runs = 0u32;

    loop {
        let sleep_ms = if silent_runs > 35 { 90 } else { 32 };
        std::thread::sleep(Duration::from_millis(sleep_ms));

        if last_check.elapsed() >= Duration::from_secs(2) {
            last_check = Instant::now();
            if let Ok(d) = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole) } {
                if device_id(&d) != id {
                    let _ = unsafe { client.Stop() };
                    return Err("default audio device changed");
                }
            }
        }

        let mut had_audio = false;
        loop {
            let n = unsafe { capture.GetNextPacketSize() }.map_err(|_| "device invalidated")?;
            if n == 0 {
                break;
            }
            let (mut data, mut frames, mut flags) = (std::ptr::null_mut::<u8>(), 0u32, 0u32);
            unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }
                .map_err(|_| "get buffer")?;
            mono.clear();
            let silent = flags & 0x2 != 0;
            for f in 0..frames as usize {
                let mut acc = 0.0f32;
                if !silent && !data.is_null() {
                    for ch in 0..channels {
                        let p = unsafe { data.add((f * channels + ch) * bytes_per) };
                        acc += unsafe {
                            match kind {
                                SampleKind::F32 => (p as *const f32).read_unaligned(),
                                SampleKind::I16 => (p as *const i16).read_unaligned() as f32 / 32768.0,
                                SampleKind::I32 => {
                                    (p as *const i32).read_unaligned() as f32 / 2_147_483_648.0
                                }
                            }
                        };
                    }
                }
                let s = acc / channels as f32;
                if s.abs() > 0.0005 {
                    had_audio = true;
                }
                mono.push(s);
            }
            let _ = unsafe { capture.ReleaseBuffer(frames) };

            analyzer.push(&mono, |b| {
                for (i, v) in b.iter().enumerate() {
                    let u = (v * 100.0).round().clamp(0.0, 100.0) as u32;
                    BAND_ATOMICS[i].store(u, Ordering::Relaxed);
                }
            });
            for (i, v) in analyzer.spectrum().iter().enumerate() {
                let u = (v * 100.0).round().clamp(0.0, 100.0) as u32;
                SPEC_ATOMICS[i].store(u, Ordering::Relaxed);
            }
        }

        if had_audio {
            silent_runs = 0;
            ACTIVE_AUDIO.store(true, Ordering::Relaxed);
        } else {
            silent_runs = silent_runs.saturating_add(1);
            if silent_runs > 12 {
                store_silent_zero();
            }
        }
    }
}

pub fn start_loopback() {
    STARTED.get_or_init(|| {
        let _ = std::thread::Builder::new()
            .name("island-fft-loopback".into())
            .spawn(|| {
                let _com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
                let mut analyzer = Analyzer::new();
                loop {
                    if let Err(_) = unsafe { run_loopback_session(&mut analyzer) } {
                        store_silent_zero();
                        std::thread::sleep(Duration::from_millis(2000));
                    }
                }
                #[allow(unreachable_code)]
                if _com {
                    unsafe { CoUninitialize() };
                }
            });
    });
}

pub fn latest_bands() -> [u8; BANDS] {
    if !ACTIVE_AUDIO.load(Ordering::Relaxed) {
        return [0; BANDS];
    }
    let mut out = [0u8; BANDS];
    for i in 0..BANDS {
        out[i] = BAND_ATOMICS[i].load(Ordering::Relaxed).min(100) as u8;
    }
    out
}

pub fn latest_spectrum() -> [u8; SPEC] {
    if !ACTIVE_AUDIO.load(Ordering::Relaxed) {
        return [0; SPEC];
    }
    let mut out = [0u8; SPEC];
    for i in 0..SPEC {
        out[i] = SPEC_ATOMICS[i].load(Ordering::Relaxed).min(100) as u8;
    }
    out
}

pub fn current_output_name() -> String {
    OUTPUT_NAME.lock().map(|g| g.clone()).unwrap_or_default()
}

pub fn list_audio_outputs() -> Vec<AudioOutputDevice> {
    let mut out = Vec::new();
    unsafe {
        let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        if let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) {
            let def_id = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .ok()
                .map(|d| device_id(&d))
                .unwrap_or_default();
            if let Ok(col) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
                let count = col.GetCount().unwrap_or(0);
                for i in 0..count {
                    let Ok(dev) = col.Item(i) else { continue };
                    let id = device_id(&dev);
                    if id.is_empty() {
                        continue;
                    }
                    let name = read_device_friendly_name(&dev).unwrap_or_else(|| format!("Thiết bị âm thanh {}", i + 1));
                    let is_default = id == def_id;
                    out.push(AudioOutputDevice { id, name, is_default });
                }
            }
        }
        if com {
            CoUninitialize();
        }
    }
    out
}

pub fn set_default_audio_output(device_id_str: &str) -> Result<(), String> {
    if device_id_str.trim().is_empty() {
        return Err("Mã thiết bị âm thanh không hợp lệ".into());
    }
    const CLSID_POLICY_CONFIG: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);
    const IID_IPOLICY_CONFIG: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);

    use std::ffi::c_void;
    use windows::core::{IUnknown, Interface, HRESULT};

    let wide: Vec<u16> = device_id_str.encode_utf16().chain(std::iter::once(0)).collect();
    let res = unsafe {
        let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let created: windows::core::Result<IUnknown> =
            CoCreateInstance(&CLSID_POLICY_CONFIG, None, CLSCTX_ALL);
        let outcome = match created {
            Ok(unk) => {
                let mut raw_ptr: *mut c_void = std::ptr::null_mut();
                if unk.query(&IID_IPOLICY_CONFIG, &mut raw_ptr).is_ok() && !raw_ptr.is_null() {
                    let cfg = IUnknown::from_raw(raw_ptr);
                    // IUnknown (3 slots) + IPolicyConfig slots 3..12 -> SetDefaultEndpoint is slot 13
                    let vt = *(cfg.as_raw() as *const *const *const c_void);
                    let set_fn: unsafe extern "system" fn(*mut c_void, PCWSTR, i32) -> HRESULT =
                        std::mem::transmute_copy(&*vt.add(13));
                    let mut any_ok = false;
                    for role in [eConsole.0, eMultimedia.0, eCommunications.0] {
                        if set_fn(cfg.as_raw(), PCWSTR(wide.as_ptr()), role).is_ok() {
                            any_ok = true;
                        }
                    }
                    if any_ok {
                        Ok(())
                    } else {
                        Err("Không thể đặt thiết bị mặc định".to_string())
                    }
                } else {
                    Err("IPolicyConfig QueryInterface thất bại".to_string())
                }
            }
            Err(_) => Err("IPolicyConfig không khả dụng trên hệ thống này".to_string()),
        };
        if com {
            CoUninitialize();
        }
        outcome
    };
    if res.is_ok() {
        // Refresh cached name
        for d in list_audio_outputs() {
            if d.is_default {
                if let Ok(mut g) = OUTPUT_NAME.lock() {
                    *g = d.name;
                }
                break;
            }
        }
    }
    res
}

pub fn hide_native_volume_osd() {
    unsafe {
        if let Ok(h) = FindWindowA(PCSTR(c"NativeHWNDHost".as_ptr() as *const u8), PCSTR::null()) {
            if !h.0.is_null() && IsWindowVisible(h).as_bool() {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, rate: f32, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / rate).sin() * 0.8)
            .collect()
    }

    #[test]
    fn fft_silence_floor() {
        let mut a = Analyzer::new();
        let mut last = [0.0; BANDS];
        a.push(&vec![0.0; FFT * 6], |b| last = b);
        assert!(last.iter().all(|v| *v <= 0.001));
    }

    #[test]
    fn fft_pure_tone_bin() {
        let mut a = Analyzer::new();
        let mut last = [0.0; BANDS];
        a.push(&sine(937.5, 48_000.0, FFT * 25), |b| last = b);
        let top = last
            .iter()
            .enumerate()
            .max_by(|x, y| x.1.partial_cmp(y.1).unwrap())
            .unwrap()
            .0;
        assert_eq!(top, 2);
        assert!(last[2] > 0.85);
    }

    #[test]
    fn spectrum_ranges_ordered() {
        let r = spec_ranges();
        assert_eq!(r[0].0, 1);
        assert!(r.iter().all(|(a, b)| b > a));
        assert!(r.windows(2).all(|w| w[0].1 == w[1].0));
        assert!(r[SPEC - 1].1 >= 200);
    }
}
