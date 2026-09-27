import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const css = read('static/style.css');
const body = css.match(/^body\s*\{([^}]*)\}/m)?.[1];
const surface = css.match(/#app-surface\s*\{([^}]*)\}/)?.[1];

test('the whole application defaults to an 8px outer corner clip', () => {
  assert.ok(body, 'Missing body style');
  assert.match(body, /--window-radius:\s*8px\s*;/);
  assert.match(surface, /border-radius:\s*var\(--window-radius\)\s*;/);
  assert.match(surface, /clip-path:\s*inset\(0 round var\(--window-radius\)\)\s*;/);
});

test('the canvas and drag toolbar remain descendants of the clipped surface', () => {
  const bodyHtml = read('static/index.html').split('<body>')[1]?.split('</body>')[0];
  assert.ok(bodyHtml);
  assert.match(bodyHtml, /id="app-surface"/);
  assert.match(bodyHtml, /id="visualizer"/);
  assert.match(bodyHtml, /id="chrome"/);
  assert.equal((bodyHtml.match(/class="window-actions"/g) ?? []).length, 1);
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(config.app.windows[0].transparent, true);
  assert.equal(config.app.windows[0].backgroundColor, '#00000000');
  assert.equal(config.app.windows[0].decorations, false);
});

test('both distributed frontend forms include the corner clip', () => {
  assert.equal(read('dist/style.css'), css);
  const preview = read('artifacts/preview/vsualize.html');
  assert.ok(preview.includes(body));
  assert.ok(preview.includes(surface));
});

test('fullscreen removes only the outer corner radius', () => {
  assert.match(css, /body\.window-fullscreen, html:fullscreen > body, body:fullscreen\s*\{\s*--window-radius:\s*0px\s*;/);
  assert.match(css, /\.panel\s*\{[^}]*border-radius:16px/);
  const permissions = JSON.parse(read('src-tauri/capabilities/main.json')).permissions;
  assert.ok(permissions.includes('core:window:allow-is-fullscreen'));
  assert.ok(!permissions.includes('core:default'), 'No broad permissions added');
  const main = read('src/main.ts');
  assert.match(main, /document\.addEventListener\('fullscreenchange'/);
  assert.match(main, /window\.addEventListener\('resize', scheduleCornerSync\)/);
  assert.match(main, /window\.addEventListener\('focus'/);
});
