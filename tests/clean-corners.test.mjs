// Source and asset contracts. Actual Win32-region tests live in the Rust module;
// these tests do not claim a Windows execution pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('static/style.css'), html=read('static/index.html');
const native=read('src-tauri/src/native_frame.rs'), host=read('src-tauri/src/native_frame/windows/shape.rs');

test('document backing stays clear; all drawable content belongs to the isolated surface',()=>{
  assert.match(css,/html,body\s*\{[^}]*background:transparent/);
  assert.match(css,/#app-surface\s*\{[^}]*overflow:hidden; background:transparent;[^}]*clip-path:inset\(0 round var\(--window-radius\)\);[^}]*isolation:isolate; transform:translateZ\(0\)/);
  assert.match(css,/body\.preview\.transparent-preview #app-surface\s*\{/);
  assert.doesNotMatch(css,/body\.preview\.transparent-preview\s*\{/);
  assert.equal((html.match(/id="app-surface"/g)||[]).length,1);
  assert.ok(html.indexOf('id="app-surface"')<html.indexOf('id="visualizer"'));
  assert.match(html,/id="toast"[^\n]*\n\s*<\/div>\n\s*<script/);
  assert.doesNotMatch(css,/(?:focus-within|:focus|\.visible)[^{]*\{[^}]*--window-radius/);
});

test('shape update follows the existing main-thread lifecycle and fullscreen changes',()=>{
  assert.equal((native.match(/windows::update_shape\(/g)||[]).length,3);
  assert.equal((native.match(/\.is_fullscreen\(\)/g)||[]).length,3);
  assert.equal((native.match(/\.scale_factor\(\)/g)||[]).length,3);
  const main=read('src-tauri/src/main.rs');
  assert.match(main,/WindowEvent::ScaleFactorChanged \{ \.\. \}/);
  assert.match(main,/WindowEvent::Focused\(_\) => native_frame::apply\(window, true\)/);
  for(const action of ['fullscreen','exit-fullscreen']){
    const section=main.slice(main.indexOf(`"${action}" =>`));
    assert.ok(section.slice(0,300).includes('native_frame::apply(&window, true)'));
  }
});

test('host shape is client-aligned, rounded in device units, reentry-safe and ownership-safe',()=>{
  for(const api of ['GetWindowRect','GetClientRect','ClientToScreen','GetWindowRgn','SetWindowRgn','EqualRgn']) assert.ok(host.includes(api));
  assert.ok(host.includes('UPDATING.with(|v| v.replace(true))'));
  assert.ok(host.includes('desired.release()'));
  assert.ok(host.includes('key.square'));
  assert.ok(host.includes('ptr::null_mut(), 1'));
  assert.ok(host.includes('belongs_to_ui_thread(hwnd)'));
  assert.match(read('src-tauri/src/native_frame/windows.rs'),/WM_NCDESTROY => \{\s*shape::forget\(hwnd\)/);
  assert.match(read('src-tauri/src/native_frame/corner_geometry.rs'),/RADIUS_LOGICAL: f64 = 8\.0/);
  assert.doesNotMatch(host,/SetLayeredWindowAttributes|DwmExtendFrameIntoClientArea/);
});
