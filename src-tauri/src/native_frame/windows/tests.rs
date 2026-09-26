//! Windows-only regression tests. These exercise the actual Win32 subclass,
//! not a JavaScript simulation. They create hidden, disposable STATIC windows.
//! They do not prove the absence of WebView2 compositor artifacts on real GPUs.
use super::*;

const WS_CHILD: u32 = 0x4000_0000;
const WS_THICKFRAME: u32 = 0x0004_0000;
const WM_APP_PROBE: u32 = 0x8000 + 415;
const PROBE_ID: usize = 0x5653_5453;
thread_local! {
    static PAINTS: Cell<u32> = const { Cell::new(0) };
    static ACTIVATIONS: Cell<u32> = const { Cell::new(0) };
    static DESTROYS: Cell<u32> = const { Cell::new(0) };
}
#[link(name = "user32")]
extern "system" {
    fn CreateWindowExW(ex_style: u32, class: *const u16, title: *const u16,
        style: u32, x: i32, y: i32, width: i32, height: i32,
        parent: Hwnd, menu: Hwnd, instance: Hwnd, parameter: *mut c_void) -> Hwnd;
    fn DestroyWindow(hwnd: Hwnd) -> i32;
    fn SendMessageW(hwnd: Hwnd, message: u32, wparam: usize, lparam: isize) -> isize;
}

struct TestWindow(Hwnd);
impl TestWindow {
    fn new(parent: Hwnd) -> Self {
        let name: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let mut style = WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_THICKFRAME;
        if !parent.is_null() { style |= WS_CHILD; }
        let hwnd = unsafe { CreateWindowExW(0, name.as_ptr(), name.as_ptr(), style,
            0, 0, 320, 240, parent, ptr::null_mut(), ptr::null_mut(), ptr::null_mut()) };
        assert!(!hwnd.is_null(), "Could not create native caption test window: {}", unsafe { GetLastError() });
        Self(hwnd)
    }
}
impl Drop for TestWindow {
    fn drop(&mut self) { unsafe { DestroyWindow(self.0); } }
}

unsafe extern "system" fn probe(
    hwnd: Hwnd, message: u32, wparam: usize, lparam: isize, id: usize, _: usize,
) -> isize {
    match message {
        WM_NCPAINT => PAINTS.with(|n| n.set(n.get() + 1)),
        WM_NCACTIVATE => ACTIVATIONS.with(|n| n.set(n.get() + 1)),
        WM_APP_PROBE => return 415,
        WM_NCDESTROY => {
            DESTROYS.with(|n| n.set(n.get() + 1));
            RemoveWindowSubclass(hwnd, Some(probe), id);
        }
        _ => (),
    }
    DefSubclassProc(hwnd, message, wparam, lparam)
}

#[test]
fn style_policy_keeps_host_operations_but_not_child_caption_buttons() {
    let operations = WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_THICKFRAME;
    assert_eq!(operations & removed_style_bits(true), 0);
    assert_eq!(WS_CAPTION & !removed_style_bits(true), 0);
    assert_eq!((WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX) & !removed_style_bits(false), 0);
    assert_eq!(WS_THICKFRAME & removed_style_bits(false), 0);
}

#[test]
fn native_caption_paint_is_blocked_while_other_messages_and_destroy_are_forwarded() {
    let window = TestWindow::new(ptr::null_mut());
    unsafe {
        assert_ne!(SetWindowSubclass(window.0, Some(probe), PROBE_ID, 0), 0);
    }
    apply(window.0, true);
    PAINTS.with(|n| n.set(0));
    ACTIVATIONS.with(|n| n.set(0));
    DESTROYS.with(|n| n.set(0));
    unsafe {
        let mut data = 0;
        assert_ne!(GetWindowSubclass(window.0, Some(caption_proc), SUBCLASS_ID, &mut data), 0);
        assert_eq!(data, window.0 as usize);
        assert_eq!(SendMessageW(window.0, WM_NCPAINT, 1, 0), 0);
        assert_eq!(SendMessageW(window.0, WM_NCACTIVATE, 1, 0), 1);
        assert_eq!(SendMessageW(window.0, WM_NCACTIVATE, 0, 0), 1);
        assert_eq!(SendMessageW(window.0, WM_APP_PROBE, 0, 0), 415);
    }
    assert_eq!(PAINTS.with(Cell::get), 0, "Native caption painter must not run");
    assert_eq!(ACTIVATIONS.with(Cell::get), 0, "Caption activation painter must not run");
    drop(window);
    assert_eq!(DESTROYS.with(Cell::get), 1, "Destruction must reach the original procedure");
}

#[test]
fn style_cannot_reintroduce_caption_and_unrelated_windows_are_untouched() {
    let window = TestWindow::new(ptr::null_mut());
    let unrelated = TestWindow::new(ptr::null_mut());
    let before = unsafe { GetWindowLongW(unrelated.0, GWL_STYLE) };
    apply(window.0, true);
    unsafe {
        let operations = WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_THICKFRAME;
        let style = GetWindowLongW(window.0, GWL_STYLE) as u32;
        assert_eq!(style & WS_CAPTION, 0);
        assert_eq!(style & operations, operations);
        SetWindowLongW(window.0, GWL_STYLE, (style | WS_CAPTION) as i32);
        assert_eq!(GetWindowLongW(window.0, GWL_STYLE) as u32 & WS_CAPTION, 0);
        assert_eq!(GetWindowLongW(unrelated.0, GWL_STYLE), before);
        let mut data = 0;
        assert_eq!(GetWindowSubclass(unrelated.0, Some(caption_proc), SUBCLASS_ID, &mut data), 0);
    }
}

#[test]
fn existing_and_later_children_are_protected_idempotently() {
    let window = TestWindow::new(ptr::null_mut());
    let first = TestWindow::new(window.0);
    apply(window.0, true);
    let later = TestWindow::new(window.0);
    // This is also what the deferred parent-notify refresh invokes.
    apply(window.0, false);
    apply(window.0, false);
    unsafe {
        for child in [first.0, later.0] {
            let mut data = 0;
            assert_ne!(GetWindowSubclass(child, Some(caption_proc), SUBCLASS_ID, &mut data), 0);
            assert_eq!(data, window.0 as usize);
            assert_eq!(GetWindowLongW(child, GWL_STYLE) as u32 & removed_style_bits(false), 0);
        }
    }
}

#[test]
fn attempting_to_install_from_a_foreign_thread_is_a_noop() {
    let window = TestWindow::new(ptr::null_mut());
    let hwnd = window.0 as usize;
    std::thread::spawn(move || apply(hwnd as Hwnd, true)).join().unwrap();
    unsafe {
        let mut data = 0;
        assert_eq!(GetWindowSubclass(window.0, Some(caption_proc), SUBCLASS_ID, &mut data), 0);
        assert_ne!(GetWindowLongW(window.0, GWL_STYLE) as u32 & WS_CAPTION, 0);
    }
}
