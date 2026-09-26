// These are source/DOM-contract checks, NOT a native Windows execution test.
// The Windows message tests live in src-tauri/src/native_frame/windows/tests.rs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('static/index.html');
const main = read('src/main.ts');
const rust = read('src-tauri/src/main.rs');
const frame = read('src-tauri/src/native_frame.rs');
const guard = read('src-tauri/src/native_frame/windows.rs');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));

test('there is exactly one app-drawn window control row', () => {
  assert.equal((html.match(/class="window-actions"/g) || []).length, 1);
  for (const id of ['minimize', 'fullscreen', 'close-app']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
});
test('working custom minimize/fullscreen/quit actions are kept', () => {
  for (const pair of ["['fullscreen', 'fullscreen']", "['minimize', 'minimize']", "['close-app', 'quit']"]) {
    assert.ok(main.includes(pair));
  }
  for (const action of ['window.minimize()', 'window.close()', 'window.set_fullscreen(']) {
    assert.ok(rust.includes(action));
  }
});
test('the transparent resizable window is protected before first show', () => {
  const win = config.app.windows[0];
  assert.equal(win.decorations, false);
  assert.equal(win.shadow, false);
  assert.equal(win.transparent, true);
  assert.equal(win.resizable, true);
  assert.equal(win.visible, false);
  assert.match(rust, /native_frame::initialize_webview\(&window\);\s*window.show\(\)\?;/);
});
test('frame refreshes dispatch to the owning UI thread', () => {
  assert.equal((frame.match(/run_on_main_thread\(/g) || []).length, 2);
  assert.match(guard, /thread == GetCurrentThreadId\(\) && process == GetCurrentProcessId\(\)/);
});
test('a persistent scoped guard blocks caption paint and removes itself on destruction', () => {
  assert.match(guard, /WM_NCPAINT => \{[\s\S]*?return 0;/);
  assert.match(guard, /WM_NCACTIVATE if IsIconic\(hwnd\) == 0 => \{[\s\S]*?return 1;/);
  assert.match(guard, /WM_NCDESTROY => \{[\s\S]*?RemoveWindowSubclass/);
  assert.match(guard, /WM_STYLECHANGING/);
  assert.match(guard, /WM_PARENTNOTIFY/);
  assert.match(guard, /DWMWA_NCRENDERING_POLICY/);
});
test('package, native, and UI version identifiers agree', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.equal(config.version, version);
  assert.equal(read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1], version);
  assert.ok(html.includes(`Vsualize ${version}`));
});
