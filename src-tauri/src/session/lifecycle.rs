//! This subclass belongs only to our main HWND; no global hooks or power changes.
use std::ffi::c_void;
use tauri::Manager;
type Hwnd = *mut c_void;
type Proc = unsafe extern "system" fn(Hwnd,u32,usize,isize,usize,usize)->isize;
const ID: usize = 0x5653_5346;
#[link(name="comctl32")]
extern "system" {
    fn SetWindowSubclass(hwnd:Hwnd, callback:Option<Proc>, id:usize, data:usize)->i32;
    fn RemoveWindowSubclass(hwnd:Hwnd, callback:Option<Proc>, id:usize)->i32;
    fn DefSubclassProc(hwnd:Hwnd, message:u32, wparam:usize, lparam:isize)->isize;
}
#[link(name="wtsapi32")]
extern "system" {
    fn WTSRegisterSessionNotification(hwnd:Hwnd, flags:u32)->i32;
    fn WTSUnRegisterSessionNotification(hwnd:Hwnd)->i32;
}
unsafe extern "system" fn callback(hwnd:Hwnd, message:u32, wparam:usize, lparam:isize, _id:usize, data:usize)->isize {
    if message == 0x0082 { // WM_NCDESTROY owns the single boxed handle.
        RemoveWindowSubclass(hwnd,Some(callback),ID); WTSUnRegisterSessionNotification(hwnd);
        drop(Box::from_raw(data as *mut tauri::AppHandle));
    } else if (message == 0x02B1 && wparam == 7) // WTS_SESSION_LOCK
        || (message == 0x0218 && matches!(wparam,4|7|18)) { // suspend / resume / automatic resume
        let app = &*(data as *const tauri::AppHandle);
        super::stop(app,"wake");
    }
    DefSubclassProc(hwnd,message,wparam,lparam)
}
pub fn install(window:&tauri::WebviewWindow)->Result<(),String> {
    let hwnd=window.hwnd().map_err(|e|e.to_string())?.0 as Hwnd;
    let app=Box::into_raw(Box::new(window.app_handle().clone()));
    unsafe {
        if SetWindowSubclass(hwnd,Some(callback),ID,app as usize)==0 { drop(Box::from_raw(app)); return Err("Could not install session lifecycle guard".into()); }
        if WTSRegisterSessionNotification(hwnd,0)==0 {
            RemoveWindowSubclass(hwnd,Some(callback),ID); drop(Box::from_raw(app));
            return Err("Could not subscribe to workstation lock events".into());
        }
    }
    Ok(())
}
