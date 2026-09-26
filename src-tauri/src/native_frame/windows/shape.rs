//! Native outer cutout for the main host. CSS rounds the client contents, but
//! cannot remove a rectangular host/backing surface outside the webview clip.
//! This region is independent of activation, z-order and visible controls.
//!
//! All calls run on the owning UI thread. The region is in WINDOW coordinates,
//! not client coordinates. Its conservative coverage leaves CSS antialiasing
//! intact. No effect shader, palette, alpha within the surface, or audio changes.

use super::{belongs_to_ui_thread, Hwnd, IsIconic, IsWindow};
use super::super::corner_geometry::{bands, radius_for_scale};
use std::{cell::{Cell, RefCell}, collections::HashMap, ffi::c_void, ptr};

type Hrgn = *mut c_void;
#[repr(C)]
#[derive(Default)]
struct Rect { left: i32, top: i32, right: i32, bottom: i32 }
#[repr(C)]
#[derive(Default)]
struct Point { x: i32, y: i32 }

#[link(name = "user32")]
extern "system" {
    fn GetWindowRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
    fn GetClientRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
    fn ClientToScreen(hwnd: Hwnd, point: *mut Point) -> i32;
    fn SetWindowRgn(hwnd: Hwnd, region: Hrgn, redraw: i32) -> i32;
    fn GetWindowRgn(hwnd: Hwnd, region: Hrgn) -> i32;
    fn IsZoomed(hwnd: Hwnd) -> i32;
}
#[link(name = "gdi32")]
extern "system" {
    fn CreateRectRgn(left: i32, top: i32, right: i32, bottom: i32) -> Hrgn;
    fn CombineRgn(destination: Hrgn, source1: Hrgn, source2: Hrgn, mode: i32) -> i32;
    fn EqualRgn(first: Hrgn, second: Hrgn) -> i32;
    fn DeleteObject(object: *mut c_void) -> i32;
}
const RGN_OR: i32 = 2;
const REGION_ERROR: i32 = 0;

/// Only untransferred region handles are owned here. On SetWindowRgn success
/// Windows takes ownership, so release() intentionally prevents DeleteObject.
struct Region(Hrgn);
impl Region {
    unsafe fn rect(left: i32, top: i32, right: i32, bottom: i32) -> Option<Self> {
        let handle = CreateRectRgn(left, top, right, bottom);
        if handle.is_null() { None } else { Some(Self(handle)) }
    }
    fn release(self) { std::mem::forget(self); }
}
impl Drop for Region {
    fn drop(&mut self) { unsafe { DeleteObject(self.0); } }
}

#[derive(Clone, Copy, PartialEq)]
struct ShapeKey { x: i32, y: i32, width: i32, height: i32, radius: f64, square: bool }
thread_local! {
    static LAST_SHAPE: RefCell<HashMap<usize, ShapeKey>> = RefCell::new(HashMap::new());
    static UPDATING: Cell<bool> = const { Cell::new(false) };
}
struct UpdateGuard;
impl Drop for UpdateGuard {
    fn drop(&mut self) { UPDATING.with(|v| v.set(false)); }
}

pub(super) fn forget(hwnd: Hwnd) {
    LAST_SHAPE.with(|cache| { cache.borrow_mut().remove(&(hwnd as usize)); });
}

unsafe fn desired_region(key: ShapeKey) -> Option<Region> {
    let region = Region::rect(0, 0, 0, 0)?;
    for band in bands(key.width, key.height, key.radius) {
        let part = Region::rect(key.x + band.left, key.y + band.top,
            key.x + band.right, key.y + band.bottom)?;
        if CombineRgn(region.0, region.0, part.0, RGN_OR) == REGION_ERROR { return None; }
    }
    Some(region)
}

/// `verify` checks the OS region after focus/theme/recovery operations even if
/// dimensions are unchanged. Ordinary moves use the cached key, avoiding GDI
/// churn. SetWindowRgn sends window-position messages, so guard reentrancy and
/// never hold a RefCell borrow across any Win32 call.
pub(super) fn update(hwnd: Hwnd, fullscreen: bool, scale: f64, verify: bool) {
    if hwnd.is_null() || unsafe { IsWindow(hwnd) == 0 || !belongs_to_ui_thread(hwnd) || IsIconic(hwnd) != 0 } { return; }
    if UPDATING.with(|v| v.replace(true)) { return; }
    let _guard = UpdateGuard;
    let mut client = Rect::default();
    let mut window = Rect::default();
    let mut origin = Point::default();
    // SAFETY: this HWND belongs to the calling thread and process. All output
    // pointers are live stack values and every API result is checked.
    unsafe {
        if GetClientRect(hwnd, &mut client) == 0 || GetWindowRect(hwnd, &mut window) == 0
            || ClientToScreen(hwnd, &mut origin) == 0 { return; }
    }
    let Some(width) = client.right.checked_sub(client.left) else { return; };
    let Some(height) = client.bottom.checked_sub(client.top) else { return; };
    let Some(x) = origin.x.checked_sub(window.left) else { return; };
    let Some(y) = origin.y.checked_sub(window.top) else { return; };
    // Region coordinates are 27-bit signed values; real desktop dimensions are
    // far below this bound. Defensive limits also protect offset arithmetic.
    if width <= 0 || height <= 0 || width > 1_000_000 || height > 1_000_000
        || !(-1_000_000..=1_000_000).contains(&x) || !(-1_000_000..=1_000_000).contains(&y) { return; }
    let key = ShapeKey { x, y, width, height, radius: radius_for_scale(scale, width, height),
        square: fullscreen || unsafe { IsZoomed(hwnd) != 0 } };
    let cached = LAST_SHAPE.with(|cache| cache.borrow().get(&(hwnd as usize)).copied());
    if !verify && cached == Some(key) { return; }

    let applied = unsafe {
        if let Some(current) = Region::rect(0, 0, 0, 0) {
            let has_region = GetWindowRgn(hwnd, current.0) != REGION_ERROR;
            if key.square {
                // Remove our cutout for true fullscreen/maximize. No guessing
                // based on a window merely having monitor-like dimensions.
                !has_region || SetWindowRgn(hwnd, ptr::null_mut(), 1) != 0
            } else if let Some(desired) = desired_region(key) {
                if has_region && EqualRgn(current.0, desired.0) != 0 { true }
                else if SetWindowRgn(hwnd, desired.0, 1) != 0 {
                    desired.release();
                    true
                } else { false }
            } else { false }
        } else { false }
    };
    if applied {
        LAST_SHAPE.with(|cache| { cache.borrow_mut().insert(hwnd as usize, key); });
    } else {
        eprintln!("Vsualize could not apply the native corner cutout; the client clip remains enabled.");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[link(name = "user32")]
    extern "system" {
        fn CreateWindowExW(ex_style: u32, class: *const u16, title: *const u16,
            style: u32, x: i32, y: i32, width: i32, height: i32,
            parent: Hwnd, menu: Hwnd, instance: Hwnd, parameter: *mut c_void) -> Hwnd;
        fn DestroyWindow(hwnd: Hwnd) -> i32;
        fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
        fn SendMessageW(hwnd: Hwnd, message: u32, wparam: usize, lparam: isize) -> isize;
    }
    #[link(name = "gdi32")]
    extern "system" { fn PtInRegion(region: Hrgn, x: i32, y: i32) -> i32; }
    struct Host(Hwnd);
    impl Host {
        fn new() -> Self {
            let name: Vec<u16> = "STATIC\0".encode_utf16().collect();
            let hwnd = unsafe { CreateWindowExW(0,name.as_ptr(),name.as_ptr(),0x8000_0000,
                10,10,320,240,ptr::null_mut(),ptr::null_mut(),ptr::null_mut(),ptr::null_mut()) };
            assert!(!hwnd.is_null());
            Self(hwnd)
        }
        fn region(&self) -> Region {
            let region = unsafe { Region::rect(0,0,0,0).unwrap() };
            assert_ne!(unsafe { GetWindowRgn(self.0,region.0) },REGION_ERROR);
            region
        }
    }
    impl Drop for Host { fn drop(&mut self) { forget(self.0); unsafe { DestroyWindow(self.0); } } }
    #[test]
    fn native_cutout_is_identical_after_activation_and_deactivation() {
        let host = Host::new();
        update(host.0,false,1.0,true);
        let first = host.region();
        for active in [1,0,1,0] {
            unsafe { SendMessageW(host.0,0x0086,active,0); }
            update(host.0,false,1.0,true);
            let next = host.region();
            assert_ne!(unsafe { EqualRgn(first.0,next.0) },0);
            assert_eq!(unsafe { PtInRegion(next.0,0,0) },0);
            assert_ne!(unsafe { PtInRegion(next.0,160,0) },0);
        }
    }
    #[test]
    fn native_resize_dpi_fullscreen_restore_and_replaced_region() {
        let host = Host::new();
        update(host.0,false,1.0,false);
        let small = host.region();
        update(host.0,false,2.0,false);
        let large = host.region();
        assert_eq!(unsafe { EqualRgn(small.0,large.0) },0);
        update(host.0,true,2.0,false);
        let empty = unsafe { Region::rect(0,0,0,0).unwrap() };
        assert_eq!(unsafe { GetWindowRgn(host.0,empty.0) },REGION_ERROR);
        update(host.0,false,2.0,false);
        assert_ne!(unsafe { EqualRgn(large.0,host.region().0) },0);
        unsafe { SetWindowRgn(host.0,ptr::null_mut(),1); }
        update(host.0,false,2.0,true);
        assert_ne!(unsafe { EqualRgn(large.0,host.region().0) },0);
        unsafe { SetWindowPos(host.0,ptr::null_mut(),0,0,640,480,0x0002|0x0004|0x0010); }
        update(host.0,false,2.0,false);
        let resized = host.region();
        assert_eq!(unsafe { PtInRegion(resized.0,639,479) },0);
        assert_ne!(unsafe { PtInRegion(resized.0,638,240) },0);
    }
    #[test]
    fn unrelated_and_foreign_thread_windows_are_not_modified() {
        let host = Host::new(); let other = Host::new();
        update(host.0,false,1.0,false);
        let region = unsafe { Region::rect(0,0,0,0).unwrap() };
        assert_eq!(unsafe { GetWindowRgn(other.0,region.0) },REGION_ERROR);
        let raw = other.0 as usize;
        std::thread::spawn(move || update(raw as Hwnd,false,1.0,true)).join().unwrap();
        assert_eq!(unsafe { GetWindowRgn(other.0,region.0) },REGION_ERROR);
    }
}
