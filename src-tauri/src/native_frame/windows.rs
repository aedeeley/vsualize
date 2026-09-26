//! Win32 non-client paint guard for the transparent host.
//!
//! Clearing WS_CAPTION once is insufficient: later activation/non-client paint
//! messages can redraw a ghost caption. Keep a scoped subclass installed for
//! the life of the host and its same-thread, same-process webview wrappers.
//! Never inject into WebView2 subprocesses or modify unrelated application HWNDs.
//! No GPU/compositor shutdown, opaque CSS cover, or WebView2 downgrade is used.

mod shape;

use std::{cell::Cell, ffi::c_void, mem::size_of, ptr, sync::OnceLock};

type Hwnd = *mut c_void;
type SubclassProc = unsafe extern "system" fn(Hwnd, u32, usize, isize, usize, usize) -> isize;
const SUBCLASS_ID: usize = 0x5653_4347;
const GWL_STYLE: i32 = -16;
const WS_CAPTION: u32 = 0x00C0_0000;
const WS_SYSMENU: u32 = 0x0008_0000;
const WS_MINIMIZEBOX: u32 = 0x0002_0000;
const WS_MAXIMIZEBOX: u32 = 0x0001_0000;
const WM_CREATE: u32 = 0x0001;
const WM_NCDESTROY: u32 = 0x0082;
const WM_NCPAINT: u32 = 0x0085;
const WM_NCACTIVATE: u32 = 0x0086;
const WM_STYLECHANGING: u32 = 0x007C;
const WM_PARENTNOTIFY: u32 = 0x0210;
const WM_THEMECHANGED: u32 = 0x031A;
const WM_DWMCOMPOSITIONCHANGED: u32 = 0x031E;
const SWP_NOSIZE: u32 = 0x0001;
const SWP_NOMOVE: u32 = 0x0002;
const SWP_NOZORDER: u32 = 0x0004;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_FRAMECHANGED: u32 = 0x0020;
const RDW_INVALIDATE: u32 = 0x0001;
const RDW_ALLCHILDREN: u32 = 0x0080;
const RDW_FRAME: u32 = 0x0400;
const DWMWA_NCRENDERING_POLICY: u32 = 2;
const DWMNCRP_DISABLED: i32 = 1;
const WTA_NONCLIENT: u32 = 1;
const WTNCA_NODRAWCAPTION: u32 = 1;
const WTNCA_NODRAWICON: u32 = 2;

#[repr(C)]
struct StyleStruct { old: u32, new: u32 }
#[repr(C)]
struct ThemeOptions { flags: u32, mask: u32 }

#[link(name = "user32")]
extern "system" {
    fn GetWindowLongW(hwnd: Hwnd, index: i32) -> i32;
    fn SetWindowLongW(hwnd: Hwnd, index: i32, value: i32) -> i32;
    fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
    fn EnumChildWindows(parent: Hwnd, callback: Option<unsafe extern "system" fn(Hwnd, isize) -> i32>, parameter: isize) -> i32;
    fn GetWindowThreadProcessId(hwnd: Hwnd, process_id: *mut u32) -> u32;
    fn IsWindow(hwnd: Hwnd) -> i32;
    fn IsChild(parent: Hwnd, child: Hwnd) -> i32;
    fn IsIconic(hwnd: Hwnd) -> i32;
    fn RedrawWindow(hwnd: Hwnd, rect: *const c_void, region: Hwnd, flags: u32) -> i32;
    fn RegisterWindowMessageW(name: *const u16) -> u32;
    fn PostMessageW(hwnd: Hwnd, message: u32, wparam: usize, lparam: isize) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn GetCurrentThreadId() -> u32;
    fn GetCurrentProcessId() -> u32;
    fn SetLastError(error: u32);
    fn GetLastError() -> u32;
}
#[link(name = "comctl32")]
extern "system" {
    fn SetWindowSubclass(hwnd: Hwnd, callback: Option<SubclassProc>, id: usize, data: usize) -> i32;
    fn GetWindowSubclass(hwnd: Hwnd, callback: Option<SubclassProc>, id: usize, data: *mut usize) -> i32;
    fn RemoveWindowSubclass(hwnd: Hwnd, callback: Option<SubclassProc>, id: usize) -> i32;
    fn DefSubclassProc(hwnd: Hwnd, message: u32, wparam: usize, lparam: isize) -> isize;
}
#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(hwnd: Hwnd, attribute: u32, value: *const c_void, size: u32) -> i32;
}
#[link(name = "uxtheme")]
extern "system" {
    fn SetWindowThemeAttribute(hwnd: Hwnd, attribute: u32, value: *const c_void, size: u32) -> i32;
}

static REFRESH_MESSAGE: OnceLock<u32> = OnceLock::new();
thread_local! { static APPLYING: Cell<bool> = const { Cell::new(false) }; }
struct ReentryGuard;
impl Drop for ReentryGuard {
    fn drop(&mut self) { APPLYING.with(|active| active.set(false)); }
}

fn removed_style_bits(is_root: bool) -> u32 {
    // Keep the host's operation flags for normal minimize/restore, taskbar and
    // keyboard behavior. Child rendering wrappers must not own caption buttons.
    if is_root { WS_CAPTION }
    else { WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX }
}

unsafe fn belongs_to_ui_thread(hwnd: Hwnd) -> bool {
    let mut process = 0;
    let thread = GetWindowThreadProcessId(hwnd, &mut process);
    thread != 0 && thread == GetCurrentThreadId() && process == GetCurrentProcessId()
}

unsafe fn suppress_theme_frame(hwnd: Hwnd, is_root: bool) {
    let flags = WTNCA_NODRAWCAPTION | WTNCA_NODRAWICON;
    let options = ThemeOptions { flags, mask: flags };
    // Best effort: a child HWND or an unavailable theme may reject this. The
    // subclass remains the primary protection. No system-wide setting changes.
    let _ = SetWindowThemeAttribute(hwnd, WTA_NONCLIENT,
        &options as *const _ as *const c_void, size_of::<ThemeOptions>() as u32);
    if is_root {
        // Disable only this window's DWM non-client frame, NOT composition or
        // its transparent client surface. App-drawn controls stay untouched.
        let disabled = DWMNCRP_DISABLED;
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_NCRENDERING_POLICY,
            &disabled as *const _ as *const c_void, size_of::<i32>() as u32);
    }
}

unsafe fn install_one(hwnd: Hwnd, root: Hwnd, repaint: bool) -> bool {
    if !belongs_to_ui_thread(hwnd) || (hwnd != root && IsChild(root, hwnd) == 0) { return false; }
    let mut data = 0;
    let installed = GetWindowSubclass(hwnd, Some(caption_proc), SUBCLASS_ID, &mut data) != 0;
    if !installed && SetWindowSubclass(hwnd, Some(caption_proc), SUBCLASS_ID, root as usize) == 0 {
        return false;
    }
    let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
    let next = style & !removed_style_bits(hwnd == root);
    let mut changed = false;
    if next != style {
        SetLastError(0);
        let previous = SetWindowLongW(hwnd, GWL_STYLE, next as i32);
        changed = previous != 0 || GetLastError() == 0;
    }
    if !installed || repaint { suppress_theme_frame(hwnd, hwnd == root); }
    if changed || !installed {
        let _ = SetWindowPos(hwnd, ptr::null_mut(), 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
    true
}

unsafe extern "system" fn visit_child(hwnd: Hwnd, root: isize) -> i32 {
    // EnumChildWindows already visits descendants recursively.
    let _ = install_one(hwnd, root as Hwnd, false);
    1
}

unsafe fn request_refresh(root: Hwnd) {
    if let Some(&message) = REFRESH_MESSAGE.get() {
        if message != 0 && IsWindow(root) != 0 {
            let _ = PostMessageW(root, message, 0, 0);
        }
    }
}

unsafe extern "system" fn caption_proc(
    hwnd: Hwnd, message: u32, wparam: usize, lparam: isize, id: usize, root: usize,
) -> isize {
    // No panicking operations, heap-owned callback data or borrowed pointers.
    if REFRESH_MESSAGE.get().is_some_and(|m| *m != 0 && *m == message) {
        apply(root as Hwnd, true);
        return 0;
    }
    match message {
        WM_NCPAINT => {
            // The host and these rendering wrappers have no native caption to
            // paint. In particular, do not call the default caption painter.
            return 0;
        }
        WM_NCACTIVATE if IsIconic(hwnd) == 0 => {
            // Accept activation/deactivation without painting an active/inactive
            // title bar. WM_ACTIVATE, focus, hit testing, input and all client
            // painting still go through the existing Tauri/WebView procedures.
            return 1;
        }
        WM_STYLECHANGING if wparam as isize == GWL_STYLE as isize && lparam != 0 => {
            let result = DefSubclassProc(hwnd, message, wparam, lparam);
            // Windows owns this writable STYLESTRUCT for this synchronous call.
            let proposed = &mut *(lparam as *mut StyleStruct);
            proposed.new &= !removed_style_bits(hwnd as usize == root);
            return result;
        }
        WM_PARENTNOTIFY if wparam as u32 & 0xFFFF == WM_CREATE => {
            let result = DefSubclassProc(hwnd, message, wparam, lparam);
            // Defer enumeration until the new child has finished construction.
            request_refresh(root as Hwnd);
            return result;
        }
        WM_THEMECHANGED | WM_DWMCOMPOSITIONCHANGED => {
            let result = DefSubclassProc(hwnd, message, wparam, lparam);
            // Updating theme attributes may itself emit theme notifications.
            // Do not create a recursive repaint or queued-message loop.
            if !APPLYING.with(|active| active.get()) {
                request_refresh(root as Hwnd);
            }
            return result;
        }
        WM_NCDESTROY => {
            shape::forget(hwnd);
            let _ = RemoveWindowSubclass(hwnd, Some(caption_proc), id);
            return DefSubclassProc(hwnd, message, wparam, lparam);
        }
        _ => (),
    }
    // Includes minimize, close, fullscreen sizing, WM_PAINT, WM_NCCALCSIZE,
    // keyboard input, accessibility, focus, drag and resize hit-testing.
    DefSubclassProc(hwnd, message, wparam, lparam)
}

/// Must run on the root HWND's owning thread. Callers dispatch through Tauri.
pub fn apply(root: Hwnd, repaint: bool) {
    if root.is_null() || unsafe { !belongs_to_ui_thread(root) } { return; }
    if APPLYING.with(|active| active.replace(true)) { return; }
    let _guard = ReentryGuard;
    REFRESH_MESSAGE.get_or_init(|| {
        let name: Vec<u16> = "Vsualize.CaptionGuard.Refresh.v1\0".encode_utf16().collect();
        unsafe { RegisterWindowMessageW(name.as_ptr()) }
    });
    // SAFETY: the root belongs to this process and thread, child enumeration is
    // synchronous, each child is checked before hooking, and the subclass
    // removes itself on destruction. No other application window is targeted.
    unsafe {
        if !install_one(root, root, repaint) { return; }
        EnumChildWindows(root, Some(visit_child), root as isize);
        if repaint {
            RedrawWindow(root, ptr::null(), ptr::null_mut(),
                RDW_INVALIDATE | RDW_ALLCHILDREN | RDW_FRAME);
        }
    }
}

/// Apply the outer window cutout without changing caption or client rendering.
pub fn update_shape(root: Hwnd, fullscreen: bool, scale: f64, verify: bool) {
    shape::update(root, fullscreen, scale, verify);
}

#[cfg(test)]
mod tests;
