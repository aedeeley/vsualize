import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { DEFAULT_ROOT as root, renderIcon, makeLogo, encodeIco } from '../scripts/branding/generate-branding.mjs';
import { inlineBrandPreview } from '../scripts/branding/brand-preview.mjs';
const brand = JSON.parse(await readFile(path.join(root, 'assets/brand/identity.json'), 'utf8'));
const read = (name) => readFile(path.join(root, name));
function decodePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let width, height, idat = [];
  for (let i = 8; i < bytes.length;) {
    const size = bytes.readUInt32BE(i), type = bytes.toString('ascii', i + 4, i + 8);
    const data = bytes.subarray(i + 8, i + 8 + size);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8); assert.equal(data[9], 6); // 8-bit RGBA, not RGB/paletted.
    }
    if (type === 'IDAT') idat.push(data);
    i += size + 12;
  }
  const rows = inflateSync(Buffer.concat(idat));
  assert.equal(rows.length, height * (1 + width * 4));
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 4 + 1);
    assert.equal(rows[offset], 1);
    for (let x = 0; x < width * 4; x++) {
      const i = y * width * 4 + x;
      pixels[i] = (rows[offset + 1 + x] + (x >= 4 ? pixels[i - 4] : 0)) & 255;
    }
  }
  return { width, height, pixels };
}
test('large, small and micro profiles have separate rings and a clear central dot', () => {
  for (const p of Object.values(brand.profiles)) {
    assert.ok(p.rings[0] - p.stroke / 2 > p.dot);
    for (let i = 1; i < p.rings.length; i++) assert.ok(p.rings[i] - p.rings[i - 1] > p.stroke);
    assert.ok(p.rings.at(-1) + p.stroke / 2 < 128);
  }
});
test('PNG exports use square, 8-bit RGBA images with transparent corners', async () => {
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    const { width, height, pixels } = decodePng(await read(`assets/brand/mark-${size}.png`));
    assert.equal(width, size); assert.equal(height, size); assert.equal(pixels[3], 0);
    assert.equal(pixels[((size / 2 | 0) * size + (size / 2 | 0)) * 4 + 3], 255);
  }
});
test('Windows ICO contains all Tauri sizes, with 32px first', async () => {
  const ico = await read('src-tauri/icons/icon.ico');
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 6);
  const sizes = [];
  for (let i = 0; i < 6; i++) {
    const at = 6 + i * 16;
    const size = ico[at] || 256; sizes.push(size);
    assert.equal(ico[at + 1] || 256, size);
    assert.equal(ico.readUInt16LE(at + 4), 1); assert.equal(ico.readUInt16LE(at + 6), 32);
    const length = ico.readUInt32LE(at + 8), start = ico.readUInt32LE(at + 12);
    assert.ok(start + length <= ico.length);
    assert.equal(decodePng(ico.subarray(start, start + length)).width, size);
  }
  assert.deepEqual(sizes, [32, 16, 24, 48, 64, 256]);
});
test('ICO encoder rejects invalid and oversized frames', () => {
  assert.throws(() => encodeIco([]));
  assert.throws(() => encodeIco([{ size: 512, png: Buffer.alloc(8) }]));
});
test('icon generation is deterministic and matches committed 32px export', async () => {
  assert.deepEqual(renderIcon(brand, 32), await read('assets/brand/mark-32.png'));
});
test('tray uses the wider-spaced micro profile', async () => {
  assert.deepEqual(await read('src-tauri/icons/tray-icon.png'), renderIcon(brand, 32, { profile: 'micro' }));
});
test('maskable and Apple icons have opaque backgrounds and a safe logo inset', async () => {
  for (const file of ['static/apple-touch-icon.png', 'static/icon-maskable-512.png']) {
    const { pixels } = decodePng(await read(file));
    for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  }
  assert.ok((brand.profiles.full.rings.at(-1) + brand.profiles.full.stroke / 2) * 0.76 <= 256 * 0.4);
});
test('manifest uses local files and includes a separate maskable icon', async () => {
  const manifest = JSON.parse(await read('static/site.webmanifest'));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('./'));
    assert.ok((await stat(path.join(root, 'static', icon.src))).isFile());
  }
  assert.equal(manifest.icons.filter((i) => i.purpose === 'maskable').length, 1);
});
test('wordmarks are vector paths, with no dependency on external fonts or images', async () => {
  for (const layout of ['horizontal', 'stacked']) {
    for (const tone of ['dark', 'light', 'black', 'white']) {
      const logo = (await read(`assets/brand/logo-${layout}-${tone}.svg`)).toString();
      assert.doesNotMatch(logo, /<text\b|<image\b|font-family|<script\b|href=/i);
      assert.match(logo, /<path\b/); assert.match(logo, /<title[^>]*>vsualize<\/title>/);
    }
  }
});
test('monochrome lockup assigns one ink to both ripple and lettering', () => {
  const svg = makeLogo({ ...brand, ink: '#000000' }, { mono: true });
  // Gradient definitions may be retained, but no visible shape references them.
  assert.doesNotMatch(svg, /(?:fill|stroke)="url\(/);
  assert.match(svg, /stroke="#000000"/);
});
test('standalone HTML embeds its logo and favicon and removes installation-only links', async () => {
  const input = `<head>
<link rel="stylesheet" href="./brand.css">
<link rel="icon" href="./favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" type="image/svg+xml" href="./favicon.svg" sizes="any">
<link rel="apple-touch-icon" href="./apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="./site.webmanifest">
</head><img src="./brand-logo.svg" alt="vsualize">`;
  const result = await inlineBrandPreview(input, root);
  assert.match(result, /src="data:image\/svg\+xml;base64,/);
  assert.match(result, /href="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(result, /\.\/(?:brand|favicon|apple-touch|site\.webmanifest)/);
  assert.match(result, /<style>/);
});
