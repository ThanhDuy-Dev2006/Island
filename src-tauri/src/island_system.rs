use serde::Serialize;
use std::mem::ManuallyDrop;
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::time::Duration;
use windows::core::{w, BOOL, BSTR, GUID, HSTRING, PCWSTR};
use windows::Win32::Devices::Display::{
    DestroyPhysicalMonitor, GetMonitorBrightness, GetNumberOfPhysicalMonitorsFromHMONITOR,
    GetPhysicalMonitorsFromHMONITOR, SetMonitorBrightness, PHYSICAL_MONITOR,
};
use windows::Win32::Foundation::{FILETIME, HANDLE, LPARAM, RECT, SYSTEMTIME, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateDCW, DeleteDC, EnumDisplayMonitors, GetDC, GetMonitorInfoW, ReleaseDC, HDC, HMONITOR,
    MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::Media::Audio::{
    eAll, IDeviceTopology, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE,
};
use windows::Win32::Media::KernelStreaming::{
    IKsControl, KSIDENTIFIER, KSIDENTIFIER_0, KSIDENTIFIER_0_0, KSPROPERTY_ONESHOT_DISCONNECT,
    KSPROPERTY_ONESHOT_RECONNECT, KSPROPERTY_TYPE_GET, KSPROPSETID_BtAudio,
};
use windows::Win32::NetworkManagement::WiFi::*;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoSetProxyBlanket, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, COINIT_MULTITHREADED,
    EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE,
};

const RPC_C_AUTHN_WINNT: u32 = 10;
const RPC_C_AUTHZ_NONE: u32 = 0;
use windows::Win32::System::Time::{
    FileTimeToSystemTime, SystemTimeToFileTime, SystemTimeToTzSpecificLocalTime,
    TzSpecificLocalTimeToSystemTime,
};
use windows::Win32::System::Variant::{
    VariantClear, VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_UI1, VT_UI4,
};
use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, IWbemServices, WbemLocator, WBEM_FLAG_FORWARD_ONLY,
    WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_INFINITE,
};
use windows::Win32::UI::ColorSystem::SetDeviceGammaRamp;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY,
};
use windows::Win32::UI::Shell::{
    SHEmptyRecycleBinW, SHQueryRecycleBinW, ShellExecuteW, SHERB_NOCONFIRMATION,
    SHERB_NOPROGRESSUI, SHERB_NOSOUND, SHQUERYRBINFO,
};
use windows::Win32::UI::WindowsAndMessaging::{
    SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, SW_HIDE, SW_SHOWNORMAL, WM_SETTINGCHANGE,
};
use winreg::enums::*;
use winreg::RegKey;

const CREATE_NO_WINDOW: u32 = 0x08000000;

// ============================================================
// 1. RADIOS (WI-FI & BLUETOOTH HARDWARE TOGGLES)
// ============================================================
#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
pub struct RadioSnapshot {
    pub wifi: Option<bool>,
    pub bluetooth: Option<bool>,
}

fn read_radios_sync() -> RadioSnapshot {
    use windows::Devices::Radios::{Radio, RadioKind, RadioState};
    let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    let mut snap = RadioSnapshot::default();
    let _ = Radio::RequestAccessAsync().and_then(|op| op.join());
    if let Ok(list) = Radio::GetRadiosAsync().and_then(|op| op.join()) {
        let count = list.Size().unwrap_or(0);
        for i in 0..count {
            if let Ok(r) = list.GetAt(i) {
                let kind = r.Kind().ok();
                let on = r.State().ok() == Some(RadioState::On);
                if kind == Some(RadioKind::WiFi) {
                    snap.wifi = Some(on);
                } else if kind == Some(RadioKind::Bluetooth) {
                    snap.bluetooth = Some(on);
                }
            }
        }
    }
    if com {
        unsafe { CoUninitialize() };
    }
    snap
}

pub fn get_radio_states() -> RadioSnapshot {
    let (tx, rx) = std::sync::mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("island-radios".into())
        .spawn(move || {
            let _ = tx.send(read_radios_sync());
        });
    rx.recv_timeout(Duration::from_millis(2500)).unwrap_or_default()
}

pub fn set_radio_state(kind: &str, on: bool) -> Result<RadioSnapshot, String> {
    use windows::Devices::Radios::{Radio, RadioKind, RadioState};
    let want = match kind {
        "wifi" => RadioKind::WiFi,
        "bluetooth" => RadioKind::Bluetooth,
        _ => return Err("Loại radio không hợp lệ".into()),
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("island-radio-set".into())
        .spawn(move || {
            let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
            let _ = Radio::RequestAccessAsync().and_then(|op| op.join());
            if let Ok(list) = Radio::GetRadiosAsync().and_then(|op| op.join()) {
                let count = list.Size().unwrap_or(0);
                for i in 0..count {
                    if let Ok(r) = list.GetAt(i) {
                        if r.Kind().ok() == Some(want) {
                            let st = if on { RadioState::On } else { RadioState::Off };
                            let _ = r.SetStateAsync(st).and_then(|op| op.join());
                        }
                    }
                }
            }
            let snap = read_radios_sync();
            if com {
                unsafe { CoUninitialize() };
            }
            let _ = tx.send(snap);
        });
    rx.recv_timeout(Duration::from_millis(3500))
        .map_err(|_| "Quá thời gian bật/tắt kết nối không dây".to_string())
}

// ============================================================
// 2. WI-FI SCANNER & CONNECTOR
// ============================================================
#[derive(Clone, Debug, Serialize, PartialEq, Eq, Default)]
pub struct WifiNetwork {
    pub ssid: String,
    pub signal: u8,
    pub secured: bool,
    pub connected: bool,
    pub profile: Option<String>,
}

#[derive(Clone, Debug, Serialize, Default)]
pub struct WifiScanResult {
    pub adapter: bool,
    pub connected: bool,
    pub denied: bool,
    pub current: Option<String>,
    pub current_bars: u8,
    pub networks: Vec<WifiNetwork>,
}

fn wide_to_string(w: &[u16]) -> String {
    let n = w.iter().position(|c| *c == 0).unwrap_or(w.len());
    String::from_utf16_lossy(&w[..n])
}

pub fn wifi_bars_from_signal(signal: u8) -> u8 {
    match signal {
        0 => 0,
        1..=25 => 1,
        26..=50 => 2,
        51..=75 => 3,
        _ => 4,
    }
}

pub fn merge_wifi_networks(raw: Vec<WifiNetwork>) -> Vec<WifiNetwork> {
    let mut out: Vec<WifiNetwork> = Vec::new();
    for n in raw {
        if n.ssid.trim().is_empty() {
            continue;
        }
        match out.iter_mut().find(|o| o.ssid == n.ssid) {
            Some(o) => {
                o.signal = o.signal.max(n.signal);
                o.secured |= n.secured;
                o.connected |= n.connected;
                if o.profile.is_none() {
                    o.profile = n.profile;
                }
            }
            None => out.push(n),
        }
    }
    out.sort_by(|a, b| {
        b.connected
            .cmp(&a.connected)
            .then(b.profile.is_some().cmp(&a.profile.is_some()))
            .then(b.signal.cmp(&a.signal))
            .then(a.ssid.cmp(&b.ssid))
    });
    out
}

pub fn current_wifi_link() -> (String, u8) {
    use windows::Networking::Connectivity::NetworkInformation;
    if let Ok(p) = NetworkInformation::GetInternetConnectionProfile() {
        if p.IsWlanConnectionProfile().unwrap_or(false) {
            let bars = p.GetSignalBars().ok().and_then(|r| r.Value().ok()).unwrap_or(0);
            let name = p.ProfileName().map(|h| h.to_string()).unwrap_or_default();
            if !name.is_empty() {
                return (name, bars.min(5));
            }
        }
    }
    // Fallback to WlanQueryInterface
    unsafe {
        let mut ver = 0u32;
        let mut h = HANDLE::default();
        if WlanOpenHandle(2, None, &mut ver, &mut h) != 0 {
            return (String::new(), 0);
        }
        let mut res = (String::new(), 0u8);
        let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
        if WlanEnumInterfaces(h, None, &mut list) == 0 && !list.is_null() {
            let l = &*list;
            for i in 0..l.dwNumberOfItems as usize {
                let info = &*l.InterfaceInfo.as_ptr().add(i);
                if info.isState != wlan_interface_state_connected {
                    continue;
                }
                let mut size = 0u32;
                let mut data: *mut std::ffi::c_void = std::ptr::null_mut();
                let rc = WlanQueryInterface(
                    h,
                    &info.InterfaceGuid,
                    wlan_intf_opcode_current_connection,
                    None,
                    &mut size,
                    &mut data,
                    None,
                );
                if rc == 0 && !data.is_null() {
                    let attrs = &*(data as *const WLAN_CONNECTION_ATTRIBUTES);
                    let s = &attrs.wlanAssociationAttributes.dot11Ssid;
                    let n = (s.uSSIDLength as usize).min(32);
                    let name = String::from_utf8_lossy(&s.ucSSID[..n]).to_string();
                    let q = attrs.wlanAssociationAttributes.wlanSignalQuality.min(100) as u8;
                    if !name.is_empty() {
                        res = (name, wifi_bars_from_signal(q));
                    }
                    WlanFreeMemory(data);
                    if !res.0.is_empty() {
                        break;
                    }
                }
            }
            WlanFreeMemory(list as *const _);
        }
        let _ = WlanCloseHandle(h, None);
        res
    }
}

fn saved_wifi_profiles(h: HANDLE, guids: &[GUID]) -> Vec<String> {
    let mut out = Vec::new();
    for g in guids {
        unsafe {
            let mut list: *mut WLAN_PROFILE_INFO_LIST = std::ptr::null_mut();
            if WlanGetProfileList(h, g, None, &mut list) == 0 && !list.is_null() {
                let l = &*list;
                for i in 0..l.dwNumberOfItems as usize {
                    let info = &*l.ProfileInfo.as_ptr().add(i);
                    let name = wide_to_string(&info.strProfileName);
                    if !name.is_empty() && !out.contains(&name) {
                        out.push(name);
                    }
                }
                WlanFreeMemory(list as *const _);
            }
        }
    }
    out
}

pub fn scan_wifi_networks(trigger_rescan: bool) -> WifiScanResult {
    let mut scan = WifiScanResult::default();
    unsafe {
        let mut ver = 0u32;
        let mut h = HANDLE::default();
        if WlanOpenHandle(2, None, &mut ver, &mut h) != 0 {
            return scan;
        }
        let mut guids = Vec::new();
        let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
        if WlanEnumInterfaces(h, None, &mut list) == 0 && !list.is_null() {
            let l = &*list;
            for i in 0..l.dwNumberOfItems as usize {
                let info = &*l.InterfaceInfo.as_ptr().add(i);
                guids.push(info.InterfaceGuid);
                if info.isState == wlan_interface_state_connected {
                    scan.connected = true;
                }
            }
            WlanFreeMemory(list as *const _);
        }
        scan.adapter = !guids.is_empty();
        if trigger_rescan {
            for g in &guids {
                let _ = WlanScan(h, g, None, None, None);
            }
            std::thread::sleep(Duration::from_millis(250));
        }

        let mut raw = Vec::new();
        for g in &guids {
            let mut avail: *mut WLAN_AVAILABLE_NETWORK_LIST = std::ptr::null_mut();
            let rc = WlanGetAvailableNetworkList(h, g, 0, None, &mut avail);
            if rc == 5 {
                scan.denied = true;
            }
            if rc == 0 && !avail.is_null() {
                let l = &*avail;
                for i in 0..l.dwNumberOfItems as usize {
                    let n = &*l.Network.as_ptr().add(i);
                    let len = (n.dot11Ssid.uSSIDLength as usize).min(32);
                    let profile = wide_to_string(&n.strProfileName);
                    raw.push(WifiNetwork {
                        ssid: String::from_utf8_lossy(&n.dot11Ssid.ucSSID[..len]).to_string(),
                        signal: n.wlanSignalQuality.min(100) as u8,
                        secured: n.bSecurityEnabled.as_bool(),
                        connected: n.dwFlags & WLAN_AVAILABLE_NETWORK_CONNECTED != 0,
                        profile: (n.dwFlags & WLAN_AVAILABLE_NETWORK_HAS_PROFILE != 0 && !profile.is_empty())
                            .then_some(profile),
                    });
                }
                WlanFreeMemory(avail as *const _);
            }
        }

        let (live_ssid, live_bars) = current_wifi_link();
        if scan.denied && raw.is_empty() {
            let sig = live_bars.saturating_mul(20);
            for p in saved_wifi_profiles(h, &guids) {
                let is_cur = !live_ssid.is_empty() && live_ssid == p;
                raw.push(WifiNetwork {
                    ssid: p.clone(),
                    signal: if is_cur { sig } else { 0 },
                    secured: true,
                    connected: is_cur,
                    profile: Some(p),
                });
            }
        }
        let _ = WlanCloseHandle(h, None);

        scan.networks = merge_wifi_networks(raw);
        if !live_ssid.is_empty() {
            if let Some(n) = scan.networks.iter_mut().find(|n| n.connected || n.ssid == live_ssid) {
                n.connected = true;
                n.signal = n.signal.max(live_bars.saturating_mul(20));
            }
        }
        scan.current = scan
            .networks
            .iter()
            .find(|n| n.connected)
            .map(|n| n.ssid.clone())
            .or_else(|| (!live_ssid.is_empty()).then_some(live_ssid));
        scan.current_bars = live_bars;
        scan
    }
}

pub fn connect_wifi_network(ssid: &str, profile: Option<String>) -> Result<(), String> {
    if ssid.trim().is_empty() {
        return Err("SSID trống".into());
    }
    unsafe {
        let mut ver = 0u32;
        let mut h = HANDLE::default();
        if WlanOpenHandle(2, None, &mut ver, &mut h) != 0 {
            return Err("Không mở được dịch vụ WLAN".into());
        }
        let mut guid: Option<GUID> = None;
        let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
        if WlanEnumInterfaces(h, None, &mut list) == 0 && !list.is_null() {
            let l = &*list;
            if l.dwNumberOfItems > 0 {
                guid = Some((*l.InterfaceInfo.as_ptr()).InterfaceGuid);
            }
            WlanFreeMemory(list as *const _);
        }
        let Some(g) = guid else {
            let _ = WlanCloseHandle(h, None);
            return Err("Không tìm thấy card Wi-Fi".into());
        };

        let bytes = ssid.as_bytes();
        let mut dot = DOT11_SSID {
            uSSIDLength: bytes.len().min(32) as u32,
            ucSSID: [0; 32],
        };
        dot.ucSSID[..bytes.len().min(32)].copy_from_slice(&bytes[..bytes.len().min(32)]);
        let prof_name = profile.unwrap_or_else(|| ssid.to_string());
        let has_prof = saved_wifi_profiles(h, &[g]).iter().any(|p| p == &prof_name);
        let prof_wide: Vec<u16> = prof_name.encode_utf16().chain(std::iter::once(0)).collect();
        let params = WLAN_CONNECTION_PARAMETERS {
            wlanConnectionMode: if has_prof {
                wlan_connection_mode_profile
            } else {
                wlan_connection_mode_discovery_unsecure
            },
            strProfile: if has_prof {
                PCWSTR(prof_wide.as_ptr())
            } else {
                PCWSTR::null()
            },
            pDot11Ssid: if has_prof {
                std::ptr::null_mut()
            } else {
                &mut dot
            },
            pDesiredBssidList: std::ptr::null_mut(),
            dot11BssType: dot11_BSS_type_infrastructure,
            dwFlags: 0,
        };
        let rc = WlanConnect(h, &g, &params, None);
        let _ = WlanCloseHandle(h, None);
        if rc == 0 {
            Ok(())
        } else {
            Err(format!("Không thể kết nối Wi-Fi (mã lỗi {rc})"))
        }
    }
}

// ============================================================
// 3. BLUETOOTH DEVICES & 1-CLICK AUDIO CONNECT
// ============================================================
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct BtDevice {
    pub name: String,
    pub connected: bool,
    pub kind: String,
    pub addr: String,
    pub audio: bool,
}

pub fn bt_addr_from_path(path: &str) -> Option<u64> {
    let l = path.to_ascii_lowercase();
    if !l.contains("bthenum") {
        return None;
    }
    let end = l.find("_c00000000")?;
    let hex = l.get(end.checked_sub(12)?..end)?;
    if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    u64::from_str_radix(hex, 16).ok().filter(|a| *a != 0)
}

pub fn kind_from_cod(cod: u32) -> &'static str {
    let major = (cod >> 8) & 0x1F;
    let minor = (cod >> 2) & 0x3F;
    match major {
        4 => "headphones",
        5 if minor & 0x10 != 0 => "keyboard",
        5 if minor & 0x20 != 0 => "mouse",
        _ => "other",
    }
}

pub fn kind_from_appearance(raw: u16) -> &'static str {
    let (cat, sub) = (raw >> 6, raw & 0x3F);
    match cat {
        0x21 | 0x25 => "headphones",
        0x0F if sub == 1 => "keyboard",
        0x0F if sub == 2 => "mouse",
        _ => "other",
    }
}

fn bt_audio_filters() -> Vec<(u64, IKsControl)> {
    let mut out = Vec::new();
    unsafe {
        let Ok(en) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else {
            return out;
        };
        let Ok(col) = en.EnumAudioEndpoints(eAll, DEVICE_STATE(1 | 8)) else {
            return out;
        };
        for i in 0..col.GetCount().unwrap_or(0) {
            let Ok(dev) = col.Item(i) else { continue };
            let Ok(topo) = dev.Activate::<IDeviceTopology>(CLSCTX_ALL, None) else { continue };
            let Ok(conn) = topo.GetConnector(0) else { continue };
            let Ok(pid) = conn.GetDeviceIdConnectedTo() else { continue };
            let path = pid.to_string().unwrap_or_default();
            let Some(addr) = bt_addr_from_path(&path) else {
                CoTaskMemFree(Some(pid.0 as *const _));
                continue;
            };
            if out.iter().any(|(a, _)| *a == addr) {
                CoTaskMemFree(Some(pid.0 as *const _));
                continue;
            }
            let ks = en
                .GetDevice(PCWSTR(pid.0))
                .and_then(|f| f.Activate::<IKsControl>(CLSCTX_ALL, None));
            CoTaskMemFree(Some(pid.0 as *const _));
            if let Ok(k) = ks {
                out.push((addr, k));
            }
        }
    }
    out
}

fn find_bt_ids(selector: windows::core::Result<HSTRING>) -> Vec<HSTRING> {
    use windows::Devices::Enumeration::DeviceInformation;
    let Ok(sel) = selector else { return vec![] };
    let Ok(op) = DeviceInformation::FindAllAsyncAqsFilter(&sel) else {
        return vec![];
    };
    let Ok(list) = op.join() else { return vec![] };
    (0..list.Size().unwrap_or(0))
        .filter_map(|i| list.GetAt(i).ok())
        .filter_map(|d| d.Id().ok())
        .collect()
}

pub fn list_bluetooth_devices() -> Vec<BtDevice> {
    use windows::Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice};
    let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    let audio: Vec<u64> = bt_audio_filters().into_iter().map(|(a, _)| a).collect();
    #[derive(Clone)]
    struct Raw {
        name: String,
        connected: bool,
        kind: String,
        addr: u64,
        audio: bool,
    }
    let mut raw = Vec::<Raw>::new();
    for id in find_bt_ids(BluetoothDevice::GetDeviceSelectorFromPairingState(true)) {
        if let Ok(op) = BluetoothDevice::FromIdAsync(&id) {
            if let Ok(d) = op.join() {
                let addr = d.BluetoothAddress().unwrap_or(0);
                let name = d.Name().map(|s| s.to_string()).unwrap_or_default();
                let connected = d.ConnectionStatus().ok() == Some(BluetoothConnectionStatus::Connected);
                let kind = d
                    .ClassOfDevice()
                    .and_then(|c| c.RawValue())
                    .map(kind_from_cod)
                    .unwrap_or("other")
                    .to_string();
                raw.push(Raw {
                    name,
                    connected,
                    kind,
                    addr,
                    audio: addr != 0 && audio.contains(&addr),
                });
            }
        }
    }
    for id in find_bt_ids(BluetoothLEDevice::GetDeviceSelectorFromPairingState(true)) {
        if let Ok(op) = BluetoothLEDevice::FromIdAsync(&id) {
            if let Ok(d) = op.join() {
                let addr = d.BluetoothAddress().unwrap_or(0);
                let name = d.Name().map(|s| s.to_string()).unwrap_or_default();
                let connected = d.ConnectionStatus().ok() == Some(BluetoothConnectionStatus::Connected);
                let kind = d
                    .Appearance()
                    .and_then(|a| a.RawValue())
                    .map(kind_from_appearance)
                    .unwrap_or("other")
                    .to_string();
                raw.push(Raw {
                    name,
                    connected,
                    kind,
                    addr,
                    audio: false,
                });
            }
        }
    }
    let mut merged = Vec::<Raw>::new();
    for d in raw {
        if d.name.trim().is_empty() {
            continue;
        }
        if let Some(o) = merged.iter_mut().find(|o| o.name == d.name) {
            o.connected |= d.connected;
            if o.kind == "other" {
                o.kind = d.kind;
            }
            if o.addr == 0 || (d.audio && !o.audio) {
                o.addr = d.addr;
            }
            o.audio |= d.audio;
        } else {
            merged.push(d);
        }
    }
    merged.sort_by(|a, b| {
        b.connected
            .cmp(&a.connected)
            .then(b.audio.cmp(&a.audio))
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    if com {
        unsafe { CoUninitialize() };
    }
    merged
        .into_iter()
        .map(|d| BtDevice {
            name: d.name,
            connected: d.connected,
            kind: d.kind,
            addr: d.addr.to_string(),
            audio: d.audio,
        })
        .collect()
}

pub fn toggle_bluetooth_audio(addr_str: &str, connect: bool) -> Result<bool, String> {
    let addr = addr_str
        .trim()
        .parse::<u64>()
        .map_err(|_| "Địa chỉ thiết bị Bluetooth không hợp lệ".to_string())?;
    let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    let ok = if let Some((_, ks)) = bt_audio_filters().into_iter().find(|(a, _)| *a == addr) {
        let id = if connect {
            KSPROPERTY_ONESHOT_RECONNECT
        } else {
            KSPROPERTY_ONESHOT_DISCONNECT
        };
        let prop = KSIDENTIFIER {
            Anonymous: KSIDENTIFIER_0 {
                Anonymous: KSIDENTIFIER_0_0 {
                    Set: KSPROPSETID_BtAudio,
                    Id: id.0 as u32,
                    Flags: KSPROPERTY_TYPE_GET,
                },
            },
        };
        let mut returned = 0u32;
        unsafe {
            ks.KsProperty(
                &prop,
                std::mem::size_of::<KSIDENTIFIER>() as u32,
                std::ptr::null_mut(),
                0,
                &mut returned,
            )
        }
        .is_ok()
    } else {
        false
    };
    if com {
        unsafe { CoUninitialize() };
    }
    if ok {
        Ok(true)
    } else {
        Err("Thiết bị Bluetooth chưa sẵn sàng kết nối âm thanh trực tiếp".to_string())
    }
}

// ============================================================
// 4. DISPLAY BRIGHTNESS (WMI + DDC/CI + SOFTWARE GAMMA FALLBACK)
// ============================================================
#[derive(Clone, Debug, Serialize)]
pub struct BrightnessState {
    pub level: u8,
    pub mode: String,
    pub soft: bool,
}

static BRIGHT_LEVEL: AtomicI32 = AtomicI32::new(-1);
static BRIGHT_MODE: AtomicI32 = AtomicI32::new(0); // 0=unknown, 1=wmi, 2=ddc, 3=software
static BRIGHT_SOFT: AtomicBool = AtomicBool::new(false);
const GAMMA_FLOOR: f32 = 0.35;

pub fn ramp_for_brightness(p: u8) -> [[u16; 256]; 3] {
    let mult = GAMMA_FLOOR + (1.0 - GAMMA_FLOOR) * (p.min(100) as f32 / 100.0);
    let mut ramp = [[0u16; 256]; 3];
    for i in 0..256 {
        let v = ((i as f32 * 257.0) * mult).round().min(65535.0) as u16;
        for c in ramp.iter_mut() {
            c[i] = v;
        }
    }
    ramp
}

pub fn ddc_value(p: u8, lo: u32, hi: u32) -> u32 {
    lo + (hi.saturating_sub(lo) as u64 * p.min(100) as u64 / 100) as u32
}

pub fn ddc_percent(cur: u32, lo: u32, hi: u32) -> u8 {
    if hi <= lo {
        return 100;
    }
    ((cur.clamp(lo, hi) - lo) as u64 * 100 / (hi - lo) as u64) as u8
}

unsafe fn connect_wmi_root() -> Option<IWbemServices> {
    unsafe {
        let loc: IWbemLocator =
            CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER).ok()?;
        let ns = BSTR::from("ROOT\\WMI");
        let empty = BSTR::new();
        let svc = loc
            .ConnectServer(&ns, &empty, &empty, &empty, 0, &empty, None)
            .ok()?;
        let _ = CoSetProxyBlanket(
            &svc,
            RPC_C_AUTHN_WINNT,
            RPC_C_AUTHZ_NONE,
            None,
            RPC_C_AUTHN_LEVEL_CALL,
            RPC_C_IMP_LEVEL_IMPERSONATE,
            None,
            EOAC_NONE,
        );
        Some(svc)
    }
}

unsafe fn wmi_read_brightness() -> Option<u8> {
    unsafe {
        let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let out = (|| -> Option<u8> {
            let svc = connect_wmi_root()?;
            let en = svc
                .ExecQuery(
                    &BSTR::from("WQL"),
                    &BSTR::from("SELECT CurrentBrightness FROM WmiMonitorBrightness"),
                    WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                    None,
                )
                .ok()?;
            let mut objs: [Option<IWbemClassObject>; 1] = [None];
            let mut ret = 0u32;
            let _ = en.Next(WBEM_INFINITE, &mut objs, &mut ret);
            if ret == 0 {
                return None;
            }
            let obj = objs[0].as_ref()?;
            let mut val = VARIANT::default();
            obj.Get(w!("CurrentBrightness"), 0, &mut val, None, None).ok()?;
            let v = &val.Anonymous.Anonymous;
            let b = match v.vt {
                VT_UI1 => Some(v.Anonymous.bVal.min(100)),
                VT_UI4 => Some((v.Anonymous.ulVal as u8).min(100)),
                _ => Some((v.Anonymous.lVal.clamp(0, 100)) as u8),
            };
            let _ = VariantClear(&mut val);
            b
        })();
        if com {
            CoUninitialize();
        }
        out
    }
}

unsafe fn wmi_set_brightness(p: u8) -> bool {
    unsafe {
        let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let ok = (|| -> Option<bool> {
            let svc = connect_wmi_root()?;
            let mut cls_opt: Option<IWbemClassObject> = None;
            svc.GetObject(
                &BSTR::from("WmiMonitorBrightnessMethods"),
                Default::default(),
                None,
                Some(&mut cls_opt),
                None,
            )
            .ok()?;
            let cls = cls_opt?;
            let mut in_def: Option<IWbemClassObject> = None;
            cls.GetMethod(w!("WmiSetBrightness"), 0, &mut in_def, std::ptr::null_mut())
                .ok()?;
            let in_params = in_def?.SpawnInstance(0).ok()?;

            let mut v_timeout = VARIANT {
                Anonymous: VARIANT_0 {
                    Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                        vt: VT_UI4,
                        Anonymous: VARIANT_0_0_0 { ulVal: 1 },
                        ..Default::default()
                    }),
                },
            };
            let _ = in_params.Put(w!("Timeout"), 0, &v_timeout, 0);
            let _ = VariantClear(&mut v_timeout);

            let mut v_bright = VARIANT {
                Anonymous: VARIANT_0 {
                    Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                        vt: VT_UI1,
                        Anonymous: VARIANT_0_0_0 { bVal: p.min(100) },
                        ..Default::default()
                    }),
                },
            };
            let _ = in_params.Put(w!("Brightness"), 0, &v_bright, 0);
            let _ = VariantClear(&mut v_bright);

            let en = svc
                .ExecQuery(
                    &BSTR::from("WQL"),
                    &BSTR::from("SELECT * FROM WmiMonitorBrightnessMethods"),
                    WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                    None,
                )
                .ok()?;
            let mut set_any = false;
            loop {
                let mut objs: [Option<IWbemClassObject>; 1] = [None];
                let mut ret = 0u32;
                let _ = en.Next(WBEM_INFINITE, &mut objs, &mut ret);
                if ret == 0 {
                    break;
                }
                let Some(inst) = objs[0].as_ref() else { continue };
                let mut path_v = VARIANT::default();
                if inst.Get(w!("__RELPATH"), 0, &mut path_v, None, None).is_ok() {
                    let path_s = path_v.Anonymous.Anonymous.Anonymous.bstrVal.to_string();
                    if !path_s.is_empty() {
                        let path_bstr = BSTR::from(&path_s);
                        if svc
                            .ExecMethod(
                                &path_bstr,
                                &BSTR::from("WmiSetBrightness"),
                                Default::default(),
                                None,
                                &in_params,
                                None,
                                None,
                            )
                            .is_ok()
                        {
                            set_any = true;
                        }
                    }
                    let _ = VariantClear(&mut path_v);
                }
            }
            Some(set_any)
        })()
        .unwrap_or(false);
        if com {
            CoUninitialize();
        }
        ok
    }
}

fn display_handles_and_devices() -> (Vec<HMONITOR>, Vec<Vec<u16>>) {
    unsafe extern "system" fn gather(h: HMONITOR, _: HDC, _: *mut RECT, lp: LPARAM) -> BOOL {
        let out = unsafe { &mut *(lp.0 as *mut Vec<HMONITOR>) };
        out.push(h);
        BOOL(1)
    }
    let mut handles: Vec<HMONITOR> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(gather),
            LPARAM(&mut handles as *mut Vec<HMONITOR> as isize),
        );
    }
    let mut devs = Vec::new();
    for &h in &handles {
        unsafe {
            let mut mi = MONITORINFOEXW::default();
            mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(h, &mut mi as *mut MONITORINFOEXW as *mut MONITORINFO).as_bool() {
                let n = mi.szDevice.iter().position(|c| *c == 0).unwrap_or(mi.szDevice.len());
                if n > 0 {
                    let mut v = mi.szDevice[..n].to_vec();
                    v.push(0);
                    devs.push(v);
                }
            }
        }
    }
    (handles, devs)
}

fn ddc_read() -> Option<u8> {
    let (handles, _) = display_handles_and_devices();
    for h in handles {
        unsafe {
            let mut n = 0u32;
            if GetNumberOfPhysicalMonitorsFromHMONITOR(h, &mut n).is_err() || n == 0 || n > 8 {
                continue;
            }
            let mut arr = vec![PHYSICAL_MONITOR::default(); n as usize];
            if GetPhysicalMonitorsFromHMONITOR(h, &mut arr).is_err() {
                continue;
            }
            let mut found = None;
            for pm in arr {
                let (mut lo, mut cur, mut hi) = (0u32, 0u32, 0u32);
                if GetMonitorBrightness(pm.hPhysicalMonitor, &mut lo, &mut cur, &mut hi) != 0 && hi > lo {
                    if found.is_none() {
                        found = Some(ddc_percent(cur, lo, hi));
                    }
                }
                let _ = DestroyPhysicalMonitor(pm.hPhysicalMonitor);
            }
            if found.is_some() {
                return found;
            }
        }
    }
    None
}

fn ddc_set(p: u8) -> bool {
    let (handles, _) = display_handles_and_devices();
    let mut any = false;
    for h in handles {
        unsafe {
            let mut n = 0u32;
            if GetNumberOfPhysicalMonitorsFromHMONITOR(h, &mut n).is_err() || n == 0 || n > 8 {
                continue;
            }
            let mut arr = vec![PHYSICAL_MONITOR::default(); n as usize];
            if GetPhysicalMonitorsFromHMONITOR(h, &mut arr).is_err() {
                continue;
            }
            for pm in arr {
                let (mut lo, mut cur, mut hi) = (0u32, 0u32, 0u32);
                if GetMonitorBrightness(pm.hPhysicalMonitor, &mut lo, &mut cur, &mut hi) != 0 && hi > lo {
                    if SetMonitorBrightness(pm.hPhysicalMonitor, ddc_value(p, lo, hi)) != 0 {
                        any = true;
                    }
                }
                let _ = DestroyPhysicalMonitor(pm.hPhysicalMonitor);
            }
        }
    }
    any
}

fn gamma_apply(p: u8) -> bool {
    let ramp = ramp_for_brightness(p);
    let (_, devices) = display_handles_and_devices();
    if devices.is_empty() {
        unsafe {
            let dc = GetDC(None);
            if dc.is_invalid() {
                return false;
            }
            let ok = SetDeviceGammaRamp(dc, ramp.as_ptr() as *const _).as_bool();
            ReleaseDC(None, dc);
            return ok;
        }
    }
    let mut ok = false;
    for d in devices {
        unsafe {
            let dc = CreateDCW(PCWSTR::null(), PCWSTR(d.as_ptr()), PCWSTR::null(), None);
            if !dc.is_invalid() {
                ok |= SetDeviceGammaRamp(dc, ramp.as_ptr() as *const _).as_bool();
                let _ = DeleteDC(dc);
            }
        }
    }
    ok
}

pub fn get_display_brightness() -> BrightnessState {
    if !BRIGHT_SOFT.load(Ordering::Relaxed) {
        if let Some(v) = unsafe { wmi_read_brightness() } {
            BRIGHT_LEVEL.store(v as i32, Ordering::Relaxed);
            BRIGHT_MODE.store(1, Ordering::Relaxed);
            return BrightnessState {
                level: v,
                mode: "wmi".into(),
                soft: false,
            };
        }
        if let Some(v) = ddc_read() {
            BRIGHT_LEVEL.store(v as i32, Ordering::Relaxed);
            BRIGHT_MODE.store(2, Ordering::Relaxed);
            return BrightnessState {
                level: v,
                mode: "ddc".into(),
                soft: false,
            };
        }
    }
    let cur = BRIGHT_LEVEL.load(Ordering::Relaxed);
    let level = if (0..=100).contains(&cur) { cur as u8 } else { 100 };
    BRIGHT_MODE.store(3, Ordering::Relaxed);
    BrightnessState {
        level,
        mode: "software".into(),
        soft: BRIGHT_SOFT.load(Ordering::Relaxed),
    }
}

pub fn latest_brightness_cached() -> (u8, bool) {
    let lvl = BRIGHT_LEVEL.load(Ordering::Relaxed);
    let soft = BRIGHT_SOFT.load(Ordering::Relaxed);
    if (0..=100).contains(&lvl) {
        (lvl as u8, soft)
    } else {
        (100, soft)
    }
}

pub fn set_display_brightness(level: u8) -> Result<BrightnessState, String> {
    let p = level.min(100);
    if !BRIGHT_SOFT.load(Ordering::Relaxed) {
        if unsafe { wmi_set_brightness(p) } {
            BRIGHT_LEVEL.store(p as i32, Ordering::Relaxed);
            BRIGHT_MODE.store(1, Ordering::Relaxed);
            return Ok(BrightnessState {
                level: p,
                mode: "wmi".into(),
                soft: false,
            });
        }
        if ddc_set(p) {
            BRIGHT_LEVEL.store(p as i32, Ordering::Relaxed);
            BRIGHT_MODE.store(2, Ordering::Relaxed);
            return Ok(BrightnessState {
                level: p,
                mode: "ddc".into(),
                soft: false,
            });
        }
    }
    BRIGHT_SOFT.store(true, Ordering::Relaxed);
    if gamma_apply(p) {
        BRIGHT_LEVEL.store(p as i32, Ordering::Relaxed);
        BRIGHT_MODE.store(3, Ordering::Relaxed);
        Ok(BrightnessState {
            level: p,
            mode: "software".into(),
            soft: true,
        })
    } else {
        Err("Màn hình hoặc driver từ chối điều chỉnh độ sáng".into())
    }
}

pub fn restore_brightness() {
    if BRIGHT_SOFT.load(Ordering::Relaxed) {
        let _ = gamma_apply(100);
        BRIGHT_SOFT.store(false, Ordering::Relaxed);
    }
}

// ============================================================
// 5. WINDOWS DARK MODE
// ============================================================
pub fn get_windows_dark_mode() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(k) = hkcu.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") {
        let val: u32 = k.get_value("AppsUseLightTheme").unwrap_or(1);
        return val == 0;
    }
    true
}

pub fn set_windows_dark_mode(dark: bool) -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        .map_err(|e| e.to_string())?;
    let v: u32 = if dark { 0 } else { 1 };
    key.set_value("AppsUseLightTheme", &v).map_err(|e| e.to_string())?;
    key.set_value("SystemUsesLightTheme", &v).map_err(|e| e.to_string())?;
    unsafe {
        let param = w!("ImmersiveColorSet");
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            WPARAM(0),
            LPARAM(param.as_ptr() as isize),
            SMTO_ABORTIFHUNG,
            250,
            None,
        );
    }
    Ok(dark)
}

// ============================================================
// 6. WINDOWS CALENDAR AGENDA (MEETING COMPANION)
// ============================================================
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct CalendarEvent {
    pub title: String,
    pub start_minute: Option<u32>,
    pub duration_minutes: u32,
    pub all_day: bool,
    pub link: Option<String>,
}

#[derive(Clone, Debug, Serialize, Default)]
pub struct CalendarAgendaResult {
    pub available: bool,
    pub events: Vec<CalendarEvent>,
}

pub fn find_meeting_link(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let start = ["https://", "http://"]
        .iter()
        .filter_map(|s| lower.find(s))
        .min()?;
    let rest = &text[start..];
    let end = rest
        .find(|c: char| c.is_whitespace() || matches!(c, '"' | '<' | '>' | '\'' | ')' | ']' | '}'))
        .unwrap_or(rest.len());
    let link = rest[..end].trim_end_matches(['.', ',', ';', ':', '!', '?']);
    (link.len() > 10).then(|| link.to_string())
}

fn local_midnight_dt(y: i32, m: u32, d: u32) -> Option<windows::Foundation::DateTime> {
    unsafe {
        let local = SYSTEMTIME {
            wYear: y as u16,
            wMonth: m as u16,
            wDay: d as u16,
            ..Default::default()
        };
        let mut utc = SYSTEMTIME::default();
        TzSpecificLocalTimeToSystemTime(None, &local, &mut utc).ok()?;
        let mut ft = FILETIME::default();
        SystemTimeToFileTime(&utc, &mut ft).ok()?;
        Some(windows::Foundation::DateTime {
            UniversalTime: ((ft.dwHighDateTime as i64) << 32) | ft.dwLowDateTime as i64,
        })
    }
}

fn dt_to_local(t: windows::Foundation::DateTime) -> Option<((i32, u32, u32), u32)> {
    unsafe {
        let v = t.UniversalTime as u64;
        let ft = FILETIME {
            dwLowDateTime: v as u32,
            dwHighDateTime: (v >> 32) as u32,
        };
        let mut utc = SYSTEMTIME::default();
        FileTimeToSystemTime(&ft, &mut utc).ok()?;
        let mut local = SYSTEMTIME::default();
        SystemTimeToTzSpecificLocalTime(None, &utc, &mut local).ok()?;
        Some((
            (local.wYear as i32, local.wMonth as u32, local.wDay as u32),
            local.wHour as u32 * 60 + local.wMinute as u32,
        ))
    }
}

pub fn get_calendar_agenda(year: i32, month: u32, day: u32) -> CalendarAgendaResult {
    use windows::ApplicationModel::Appointments::{
        AppointmentManager, AppointmentProperties, AppointmentStoreAccessType, FindAppointmentsOptions,
    };
    use windows::Foundation::TimeSpan;

    let (tx, rx) = std::sync::mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("island-cal".into())
        .spawn(move || {
            let com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
            let mut out = CalendarAgendaResult::default();
            if let Ok(op) = AppointmentManager::RequestStoreAsync(AppointmentStoreAccessType::AllCalendarsReadOnly) {
                if let Ok(store) = op.join() {
                    out.available = true;
                    if let (Some(start), Ok(opts)) = (local_midnight_dt(year, month, day), FindAppointmentsOptions::new()) {
                        if let Ok(props) = opts.FetchProperties() {
                            for p in [
                                AppointmentProperties::Subject(),
                                AppointmentProperties::StartTime(),
                                AppointmentProperties::AllDay(),
                                AppointmentProperties::Duration(),
                                AppointmentProperties::Location(),
                                AppointmentProperties::Details(),
                                AppointmentProperties::OnlineMeetingLink(),
                            ]
                            .into_iter()
                            .flatten()
                            {
                                let _ = props.Append(&p);
                            }
                        }
                        let _ = opts.SetMaxCount(25);
                        let span = TimeSpan {
                            Duration: 24 * 3600 * 10_000_000,
                        };
                        if let Ok(find_op) = store.FindAppointmentsAsyncWithOptions(start, span, &opts) {
                            if let Ok(list) = find_op.join() {
                                for a in list {
                                    let title = a.Subject().map(|s| s.to_string()).unwrap_or_default();
                                    let all_day = a.AllDay().unwrap_or(false);
                                    let start_minute = match a.StartTime().ok().and_then(dt_to_local) {
                                        Some((dt, min)) if dt == (year, month, day) && !all_day => Some(min),
                                        _ => None,
                                    };
                                    let duration_minutes = a
                                        .Duration()
                                        .map(|d| (d.Duration / 600_000_000) as u32)
                                        .unwrap_or(0);
                                    let link = [
                                        a.OnlineMeetingLink().ok(),
                                        a.Location().ok(),
                                        a.Details().ok(),
                                    ]
                                    .into_iter()
                                    .flatten()
                                    .find_map(|t| find_meeting_link(&t.to_string()));
                                    out.events.push(CalendarEvent {
                                        title,
                                        start_minute,
                                        duration_minutes,
                                        all_day,
                                        link,
                                    });
                                }
                                out.events
                                    .sort_by_key(|e| e.start_minute.map_or(0, |m| m + 1));
                            }
                        }
                    }
                }
            }
            if com {
                unsafe { CoUninitialize() };
            }
            let _ = tx.send(out);
        });
    rx.recv_timeout(Duration::from_millis(2800)).unwrap_or_default()
}

// ============================================================
// 7. RECYCLE BIN & SYSTEM ACTIONS
// ============================================================
#[derive(Clone, Debug, Serialize, Default)]
pub struct RecycleStatus {
    pub is_full: bool,
    pub count: i64,
    pub size_bytes: i64,
}

pub fn get_recycle_bin_status() -> RecycleStatus {
    let mut info = SHQUERYRBINFO {
        cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
        ..Default::default()
    };
    let ok = unsafe { SHQueryRecycleBinW(PCWSTR::null(), &mut info) }.is_ok();
    if ok {
        RecycleStatus {
            is_full: info.i64NumItems > 0,
            count: info.i64NumItems,
            size_bytes: info.i64Size,
        }
    } else {
        RecycleStatus::default()
    }
}

pub fn empty_recycle_bin() -> Result<(), String> {
    let flags = SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND;
    unsafe { SHEmptyRecycleBinW(None, PCWSTR::null(), flags) }
        .map_err(|e| format!("Không thể dọn Thùng rác: {e}"))
}

pub fn send_key_chord(vks: &[u16]) {
    if vks.is_empty() {
        return;
    }
    let make = |vk: u16, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let mut seq: Vec<INPUT> = vks.iter().map(|v| make(*v, false)).collect();
    seq.extend(vks.iter().rev().map(|v| make(*v, true)));
    unsafe {
        SendInput(&seq, std::mem::size_of::<INPUT>() as i32);
    }
}

fn shell_open(target: &str, params: &str, show_cmd: i32) {
    let target = target.to_string();
    let params = params.to_string();
    let _ = std::thread::Builder::new()
        .name("island-action".into())
        .spawn(move || unsafe {
            let com = CoInitializeEx(
                None,
                COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE,
            )
            .is_ok();
            let _ = ShellExecuteW(
                None,
                w!("open"),
                &HSTRING::from(target.as_str()),
                &HSTRING::from(params.as_str()),
                None,
                windows::Win32::UI::WindowsAndMessaging::SHOW_WINDOW_CMD(show_cmd),
            );
            if com {
                CoUninitialize();
            }
        });
}

fn system_tool_path(exe: &str) -> String {
    if let Some(root) = std::env::var_os("SystemRoot") {
        let p = std::path::Path::new(&root).join("System32").join(exe);
        if p.is_file() {
            return p.to_string_lossy().to_string();
        }
    }
    exe.to_string()
}

pub fn run_system_action(action: &str) -> Result<(), String> {
    match action {
        "lock" => {
            shell_open(&system_tool_path("rundll32.exe"), "user32.dll,LockWorkStation", SW_HIDE.0);
        }
        "sleep" => {
            shell_open(
                &system_tool_path("rundll32.exe"),
                "powrprof.dll,SetSuspendState 0,1,0",
                SW_HIDE.0,
            );
        }
        "restart" => {
            let _ = std::process::Command::new(system_tool_path("shutdown.exe"))
                .creation_flags(CREATE_NO_WINDOW)
                .args(["/r", "/t", "0"])
                .spawn();
        }
        "shutdown" => {
            let _ = std::process::Command::new(system_tool_path("shutdown.exe"))
                .creation_flags(CREATE_NO_WINDOW)
                .args(["/s", "/t", "0"])
                .spawn();
        }
        "screenshot" => send_key_chord(&[0x5B, 0x10, 0x53]),       // Win+Shift+S
        "show_desktop" => send_key_chord(&[0x5B, 0x44]),           // Win+D
        "notifications" => send_key_chord(&[0x5B, 0x4E]),          // Win+N
        "screen_mirror" => send_key_chord(&[0x5B, 0x4B]),          // Win+K
        "sound_flyout" => send_key_chord(&[0x5B, 0x11, 0x56]),     // Win+Ctrl+V
        "task_manager" => shell_open(&system_tool_path("taskmgr.exe"), "", SW_SHOWNORMAL.0),
        "calculator" => shell_open("calc.exe", "", SW_SHOWNORMAL.0),
        "notepad" => shell_open("notepad.exe", "", SW_SHOWNORMAL.0),
        "win_settings" => shell_open("ms-settings:", "", SW_SHOWNORMAL.0),
        "ms_store" => shell_open("ms-windows-store:", "", SW_SHOWNORMAL.0),
        "open_recycle_bin" => shell_open("shell:RecycleBinFolder", "", SW_SHOWNORMAL.0),
        "open_downloads" => {
            if let Some(home) = std::env::var_os("USERPROFILE") {
                let dl = std::path::PathBuf::from(home).join("Downloads");
                shell_open(&dl.to_string_lossy(), "", SW_SHOWNORMAL.0);
            }
        }
        s if matches!(
            s,
            "ms-settings:display"
                | "ms-settings:network-mobilehotspot"
                | "ms-settings:crossdevice"
                | "ms-settings:network-airplanemode"
                | "ms-settings:notifications"
                | "ms-settings:batterysaver"
                | "ms-settings:privacy-webcam"
                | "ms-settings:privacy-microphone"
                | "ms-settings:bluetooth"
                | "ms-settings:network-wifi"
                | "ms-settings:about"
        ) => {
            shell_open(s, "", SW_SHOWNORMAL.0);
        }
        _ => return Err(format!("Hành động hệ thống không được hỗ trợ: {action}")),
    }
    Ok(())
}

// ============================================================
// 8. BUILT-IN UPDATE CHECKER (GITHUB RELEASES + SEMVER)
// ============================================================
#[derive(Clone, Debug, Serialize)]
pub struct UpdateCheckResult {
    pub current: String,
    pub latest: String,
    pub has_update: bool,
    pub page_url: String,
    pub notes: String,
    pub error: Option<String>,
}

pub fn parse_semver(s: &str) -> Option<(u32, u32, u32, bool)> {
    let s = s.trim().trim_start_matches(['v', 'V']);
    let (core, pre) = match s.split_once(['-', '+']) {
        Some((c, _)) => (c, true),
        None => (s, false),
    };
    let mut it = core.split('.');
    let a = it.next()?.parse().ok()?;
    let b = it.next().unwrap_or("0").parse().ok()?;
    let c = it.next().unwrap_or("0").parse().ok()?;
    if it.next().is_some() {
        return None;
    }
    Some((a, b, c, pre))
}

pub fn is_newer_version(candidate: &str, current: &str) -> bool {
    match (parse_semver(candidate), parse_semver(current)) {
        (Some((a, b, c, pa)), Some((x, y, z, px))) => {
            (a, b, c) > (x, y, z) || ((a, b, c) == (x, y, z) && px && !pa)
        }
        _ => false,
    }
}

pub fn check_app_update(repo: Option<String>, current_ver: &str) -> UpdateCheckResult {
    let Some(repo_slug) = repo
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.contains('/') && !s.contains(".."))
    else {
        return UpdateCheckResult {
            current: current_ver.to_string(),
            latest: current_ver.to_string(),
            has_update: false,
            page_url: String::new(),
            notes: String::new(),
            error: Some("Chưa cấu hình kho phát hành cập nhật".into()),
        };
    };
    let api_url = format!("https://api.github.com/repos/{repo_slug}/releases/latest");
    let out = std::process::Command::new("curl")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-s",
            "-L",
            "--connect-timeout",
            "4",
            "--max-time",
            "10",
            "-H",
            "Accept: application/vnd.github+json",
            "-A",
            "Island/1.2.0",
            &api_url,
        ])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&o.stdout) {
                if let Some(tag) = json.get("tag_name").and_then(|v| v.as_str()) {
                    let clean = tag.trim_start_matches(['v', 'V']).to_string();
                    let page_url = json
                        .get("html_url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let notes = json
                        .get("body")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .chars()
                        .take(320)
                        .collect();
                    return UpdateCheckResult {
                        current: current_ver.to_string(),
                        latest: clean.clone(),
                        has_update: is_newer_version(&clean, current_ver),
                        page_url,
                        notes,
                        error: None,
                    };
                }
            }
            UpdateCheckResult {
                current: current_ver.to_string(),
                latest: current_ver.to_string(),
                has_update: false,
                page_url: format!("https://github.com/{repo_slug}/releases"),
                notes: String::new(),
                error: Some("Chưa có bản phát hành công khai trên GitHub".into()),
            }
        }
        _ => UpdateCheckResult {
            current: current_ver.to_string(),
            latest: current_ver.to_string(),
            has_update: false,
            page_url: String::new(),
            notes: String::new(),
            error: Some("Không thể kết nối GitHub Releases".into()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wifi_merge_and_bars() {
        let mk = |ssid: &str, sig: u8, con: bool, prof: Option<&str>| WifiNetwork {
            ssid: ssid.into(),
            signal: sig,
            secured: true,
            connected: con,
            profile: prof.map(Into::into),
        };
        let merged = merge_wifi_networks(vec![
            mk("Cafe", 85, false, None),
            mk("Home", 40, false, None),
            mk("Home", 50, true, Some("Home")),
            mk("", 99, false, None),
        ]);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].ssid, "Home");
        assert!(merged[0].connected);
        assert_eq!(merged[0].signal, 50);
        assert_eq!((wifi_bars_from_signal(0), wifi_bars_from_signal(35), wifi_bars_from_signal(90)), (0, 2, 4));
    }

    #[test]
    fn bt_addr_and_kind() {
        let p = r"{2}.\\?\bthenum#{0000110b-0000-1000-8000-00805f9b34fb}_vid&0001004c#8&2f1c8c4d&0&9C3E53ABCDEF_C00000000#{6994ad04}\wavespeaker";
        assert_eq!(bt_addr_from_path(p), Some(0x9C3E53ABCDEF));
        assert_eq!(bt_addr_from_path(r"{2}.\?\hdaudio#func_01#speaker"), None);
        assert_eq!(kind_from_cod(0x240404), "headphones");
        assert_eq!(kind_from_cod(0x002540), "keyboard");
        assert_eq!(kind_from_cod(0x002580), "mouse");
        assert_eq!(kind_from_appearance(0x0941), "headphones");
    }

    #[test]
    fn gamma_ramp_monotonic_and_ddc_scale() {
        let low = ramp_for_brightness(0);
        let full = ramp_for_brightness(100);
        assert!(low[0][255] >= (65535.0 * GAMMA_FLOOR) as u16 - 1);
        assert!(low[0].windows(2).all(|w| w[0] <= w[1]));
        assert_eq!(full[0][255], 65535);
        assert_eq!((ddc_value(50, 10, 90), ddc_percent(50, 10, 90)), (50, 50));
    }

    #[test]
    fn meeting_link_extract() {
        assert_eq!(
            find_meeting_link("Họp: https://meet.google.com/abc-defg-hij."),
            Some("https://meet.google.com/abc-defg-hij".into())
        );
        assert_eq!(find_meeting_link("Phòng 302"), None);
    }

    #[test]
    fn semver_compare() {
        assert!(is_newer_version("v1.3.0", "1.2.0"));
        assert!(is_newer_version("1.2.1", "1.2.0"));
        assert!(!is_newer_version("1.2.0", "1.2.0"));
        assert!(!is_newer_version("1.2.0-beta", "1.2.0"));
    }
}
