/** Deterministic brand SVGs and 8-bit RGBA icons. Node 20+, no packages/fonts/network. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const b of Buffer.concat([name, data])) crc = CRC[(crc ^ b) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
export function encodePng(size, rgba) {
  if (!Number.isInteger(size) || size < 1 || size > 2048 || rgba.length !== size * size * 4) {
    throw new Error('Invalid RGBA image dimensions.');
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  // PNG Sub filter, preserving exact pixels while reducing the file size.
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const base = y * (1 + size * 4); rows[base] = 1;
    for (let x = 0; x < size * 4; x++) {
      const i = y * size * 4 + x;
      rows[base + 1 + x] = (rgba[i] - (x >= 4 ? rgba[i - 4] : 0)) & 255;
    }
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
export function encodeIco(images) {
  if (!images.length || images.some(({ size, png }) => size < 1 || size > 256 || !png.subarray(0, 8).equals(SIGNATURE))) {
    throw new Error('ICO requires PNG images between 1 and 256 pixels.');
  }
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + i * 16;
    header[at] = header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function gradient(brand, y) {
  const t = Math.max(0, Math.min(1, (y - brand.gradientTop) / (brand.gradientBottom - brand.gradientTop)));
  const stops = brand.gradient;
  let index = stops.findIndex((s) => s.offset >= t);
  if (index <= 0) return rgb(stops[0].color);
  const a = stops[index - 1], b = stops[index];
  const f = (t - a.offset) / (b.offset - a.offset);
  return rgb(a.color).map((v, i) => v + (rgb(b.color)[i] - v) * f);
}
export function renderIcon(brand, size, { profile = size <= 20 ? 'micro' : size < 64 ? 'small' : 'full', tile = false, rounded = false, monochrome = null } = {}) {
  const shape = brand.profiles[profile];
  if (!shape) throw new Error(`Unknown icon profile: ${profile}`);
  const pixels = Buffer.alloc(size * size * 4);
  const samples = size <= 256 ? 4 : 2;
  const count = samples * samples;
  const scale = tile ? 0.76 : 1;
  const margin = (256 - 256 * scale) / 2;
  const background = rgb(brand.night);
  const solid = monochrome ? rgb(monochrome) : null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let sy = 0; sy < samples; sy++) {
        const vy = (y + (sy + 0.5) / samples) * 256 / size;
        const ly = (vy - margin) / scale;
        const color = solid ?? gradient(brand, ly);
        for (let sx = 0; sx < samples; sx++) {
          const vx = (x + (sx + 0.5) / samples) * 256 / size;
          const lx = (vx - margin) / scale;
          const distance = Math.hypot(lx - 128, ly - 128);
          const ink = distance <= shape.dot || shape.rings.some((r) => Math.abs(distance - r) <= shape.stroke / 2);
          const insideTile = tile && (!rounded || Math.hypot(Math.max(Math.abs(vx - 128) - 72, 0), Math.max(Math.abs(vy - 128) - 72, 0)) <= 56);
          const c = ink ? color : insideTile ? background : null;
          if (c) { red += c[0]; green += c[1]; blue += c[2]; alpha++; }
        }
      }
      const i = (y * size + x) * 4;
      if (alpha) {
        pixels[i] = Math.round(red / alpha); pixels[i + 1] = Math.round(green / alpha); pixels[i + 2] = Math.round(blue / alpha);
        pixels[i + 3] = Math.round(alpha / count * 255);
      }
    }
  }
  return encodePng(size, pixels);
}
function defs(b) {
  return `<defs><linearGradient id="ripple" x1="128" y1="${b.gradientTop}" x2="128" y2="${b.gradientBottom}" gradientUnits="userSpaceOnUse">${b.gradient.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('')}</linearGradient></defs>`;
}
function mark(b, profile = 'full', color = 'url(#ripple)') {
  const p = b.profiles[profile];
  return `<g fill="none" stroke="${color}" stroke-width="${p.stroke}">${p.rings.map((r) => `<circle cx="128" cy="128" r="${r}"/>`).join('')}</g><circle cx="128" cy="128" r="${p.dot}" fill="${color}"/>`;
}
function wordmark(b, color) {
  return `<g fill="none" stroke="${color}" stroke-width="${b.wordmark.stroke}" stroke-linecap="round" stroke-linejoin="round">${b.wordmark.glyphs.map((g) => `<g transform="translate(${g.x} 0)"><path d="${g.path}"/>${g.dot ? `<circle cx="${g.dot[0]}" cy="${g.dot[1]}" r="${g.dot[2]}" stroke="none" fill="${color}"/>` : ''}</g>`).join('')}</g>`;
}
function svg(viewBox, body, title = 'vsualize') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="brand-title"><title id="brand-title">${title}</title>${body}</svg>\n`;
}
export function makeMark(b, { profile = 'full', color = 'url(#ripple)' } = {}) {
  return svg('0 0 256 256', defs(b) + mark(b, profile, color), 'Vsualize ripple');
}
export function makeLogo(b, { layout = 'horizontal', mono = false, light = false } = {}) {
  const text = light ? b.paper : b.ink;
  const ink = mono ? text : 'url(#ripple)';
  if (layout === 'stacked') return svg('0 0 600 480', defs(b) + `<g transform="translate(108 8) scale(1.5)">${mark(b, 'full', ink)}</g><g transform="translate(52 384) scale(1.1)">${wordmark(b, text)}</g>`);
  return svg('0 0 840 220', defs(b) + `<g transform="translate(14 14) scale(.75)">${mark(b, 'full', ink)}</g><g transform="translate(260 70) scale(1.2)">${wordmark(b, text)}</g>`);
}
export async function generateBranding(root = DEFAULT_ROOT) {
  const b = JSON.parse(await readFile(path.join(root, 'assets/brand/identity.json'), 'utf8'));
  const output = new Map();
  const add = (file, content) => output.set(file, content);
  add('assets/brand/mark.svg', makeMark(b));
  add('assets/brand/mark-black.svg', makeMark(b, { color: '#000000' }));
  add('assets/brand/mark-white.svg', makeMark(b, { color: '#FFFFFF' }));
  add('assets/brand/mark-small.svg', makeMark(b, { profile: 'small' }));
  add('assets/brand/mark-micro.svg', makeMark(b, { profile: 'micro' }));
  for (const layout of ['horizontal', 'stacked']) {
    for (const light of [false, true]) {
      add(`assets/brand/logo-${layout}-${light ? 'light' : 'dark'}.svg`, makeLogo(b, { layout, light }));
      add(`assets/brand/logo-${layout}-${light ? 'white' : 'black'}.svg`, makeLogo({ ...b, ink: '#000000' }, { layout, light, mono: true }));
    }
  }
  add('assets/brand/app-tile-dark.svg', svg('0 0 256 256', defs(b) + `<rect width="256" height="256" rx="56" fill="${b.night}"/><g transform="translate(30.72 30.72) scale(.76)">${mark(b)}</g>`));
  add('assets/brand/app-tile-light.svg', svg('0 0 256 256', defs(b) + `<rect width="256" height="256" rx="56" fill="#FFFFFF"/><g transform="translate(30.72 30.72) scale(.76)">${mark(b)}</g>`));
  add('static/brand-logo.svg', makeLogo(b, { light: true }));
  // Deliberately wider gaps than the large mark, for browser-tab legibility.
  add('static/favicon.svg', makeMark(b, { profile: 'small' }));
  const images = new Map();
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    const png = renderIcon(b, size);
    images.set(size, png);
    add(`assets/brand/mark-${size}.png`, png);
  }
  for (const size of [16, 32, 48]) add(`static/favicon-${size}x${size}.png`, images.get(size));
  add('static/favicon.ico', encodeIco([32, 16, 48].map((size) => ({ size, png: images.get(size) }))));
  add('src-tauri/icons/icon.ico', encodeIco([32, 16, 24, 48, 64, 256].map((size) => ({ size, png: images.get(size) }))));
  add('src-tauri/icons/icon.png', images.get(512));
  add('src-tauri/icons/32x32.png', images.get(32));
  add('src-tauri/icons/128x128.png', images.get(128));
  add('src-tauri/icons/128x128@2x.png', images.get(256));
  add('src-tauri/icons/tray-icon.png', renderIcon(b, 32, { profile: 'micro' }));
  add('static/apple-touch-icon.png', renderIcon(b, 180, { tile: true }));
  add('static/icon-192.png', renderIcon(b, 192, { tile: true, rounded: true }));
  add('static/icon-512.png', renderIcon(b, 512, { tile: true, rounded: true }));
  add('static/icon-maskable-512.png', renderIcon(b, 512, { tile: true }));
  add('assets/brand/app-tile-dark-1024.png', renderIcon(b, 1024, { tile: true, rounded: true }));
  add('static/site.webmanifest', JSON.stringify({
    id: './', name: 'Vsualize', short_name: 'Vsualize', description: 'Your sound, in motion.',
    start_url: './', scope: './', display: 'standalone', background_color: b.night, theme_color: b.night,
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: './icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }, null, 2) + '\n');
  for (const [file, content] of output) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    // Avoid touching unchanged icons so repeated native builds stay incremental.
    const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
    let old;
    try { old = await readFile(path.join(root, file)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!old?.equals(next)) await writeFile(path.join(root, file), next);
  }
  return [...output.keys()];
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const files = await generateBranding();
  console.log(`Vsualize branding: ${files.length} deterministic assets ready.`);
}
