// Real browser/WebGL integration with explicit mocked Windows IPC.
// Run after npm run build, with Playwright installed or PLAYWRIGHT_MODULE set.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 600 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const fixture = await readFile('tests/live-desktop-ui.py', 'utf8');
const native = fixture.split("stub='''<script>")[1].split("</script>'''")[0];
await page.addInitScript(native);
await page.addInitScript(() => {
  const invoke = window.__TAURI__.core.invoke;
  window.__TAURI__.core.invoke = async (command, args) => {
    if (command === 'check_update') {
      window.nativeCalls.push({ command, args });
      return { currentVersion: '0.4.0', version: '0.4.1', notes: 'Test update' };
    }
    if (command === 'install_update') {
      window.nativeCalls.push({ command, args });
      throw new Error('Simulated interrupted download');
    }
    if (command === 'get_now_playing') return { title: 'Test song', artist: 'Test artist' };
    return invoke(command, args);
  };
});
try {
  await page.goto(pathToFileURL(path.resolve('Vsualize-Preview.html')).href + '?validate&ui=visible');
  await page.waitForFunction(() => window.__vsualize?.renderer.frames > 2);
  assert.equal(await page.locator('body.menu-study').count(), 1, 'native frontend uses the new menu');
  await page.locator('#study-settings-card').click();
  await page.getByText('Devices & capture', { exact: true }).click();
  assert.ok(await page.locator('#desktop-device').isVisible(), 'native device selector remains accessible');
  await page.locator('#study-tab-app').click();
  assert.ok(await page.locator('#check-updates').isVisible(), 'updater is outside collapsed settings');
  await page.locator('#check-updates').click();
  await page.waitForFunction(() => document.querySelector('#update-status').textContent.includes('0.4.1'));
  assert.equal(await page.evaluate(() => nativeCalls.filter(c => c.command === 'install_update').length), 0);
  await page.locator('#install-update').click();
  await page.waitForFunction(() => document.querySelector('#update-status').textContent.includes('try again'));
  assert.deepEqual(await page.evaluate(() => nativeCalls.find(c => c.command === 'install_update').args), { version: '0.4.1' });
  assert.ok(await page.locator('#install-update').isEnabled(), 'failed download permits retry');
  await page.keyboard.press('Escape');
  await page.locator('[data-adjust="kaleidoscope"]').click();
  assert.ok(await page.getByText('Pattern variety', { exact: true }).isVisible());
  await page.keyboard.press('Escape');
  for (const [width, height] of [[640, 600], [300, 240]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#study-settings-card').click();
    await page.locator('#study-tab-app').click();
    await page.locator('#check-updates').scrollIntoViewIfNeeded();
    const rect = await page.locator('#check-updates').boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  await mkdir('artifacts', { recursive: true });
  await page.setViewportSize({ width: 640, height: 600 });
  await page.locator('#study-settings-card').click();
  await page.locator('#study-tab-app').click();
  await page.screenshot({ path: 'artifacts/desktop-menu.png' });
  console.log('PASS: native menu, device selection, update discovery/install retry, shader compilation, and small-window access. Windows IPC was mocked.');
} finally {
  await browser.close();
}
