import type { AudioMode, DeviceInfo, Settings, VisualId } from './types.js';
import { activateVisual, isVisualTuningKey, rememberVisualTuning, resetVisualTuning, resetAllVisualTunings } from './visual-presets.js';
import { DEFAULTS, PALETTES, PALETTE_ORDER, VISUAL_IDS, loadSettings, saveSettings, startupMode, silentFrame } from './settings.js';
import { describeSignal, formatRawLevel, rawMeterValue } from './signal.js';
import { AudioEngine } from './audio.js';
import { initializeUpdater } from './updater.js';
import { FramePacer } from './performance.js';
import { exportStudioProfiles, importStudioProfiles } from './studio-profiles.js';
import { Renderer } from './renderer.js';
import { describeResolution } from './resolution.js';
import { CATEGORIES } from './catalog.js';
import { matchesVisual, nextVisual } from './library.js';
import { THUMBNAILS } from './visuals/thumbnails.js';
import { VISUALS } from './visuals/index.js';
import { isNative, nativeDevices, syncWindowCorners, windowAction } from './native.js';

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};
const settings = loadSettings();
const query = new URLSearchParams(location.search);
settings.mode = startupMode(settings.mode, isNative);
if (VISUAL_IDS.includes(query.get('visual') as VisualId)) activateVisual(settings, query.get('visual') as VisualId);
const canvas = byId<HTMLCanvasElement>('visualizer');
const panel = byId('panel');
const chrome = byId('chrome');
// The root clip also covers the canvas, translucent backdrop, and drag gradient.
let cornerSyncTimer = 0;
function scheduleCornerSync() {
  window.clearTimeout(cornerSyncTimer);
  cornerSyncTimer = window.setTimeout(() => { void syncWindowCorners(); }, 80);
}
document.addEventListener('fullscreenchange', () => { void syncWindowCorners(); });
window.addEventListener('resize', scheduleCornerSync);
window.addEventListener('focus', () => { void syncWindowCorners(); });
void syncWindowCorners();
let visible = false;
let interacting = false;
let lastInteraction = performance.now();
let toastTimer = 0;
let restartTimer = 0;
let persistTimer = 0;
let savedWarning = false;
let comparing = false;
let hasHeardAudio = false;
let sessionStarted = performance.now();
const comparisonFrame = silentFrame();

function toast(message: string): void {
  const el = byId('toast'); el.textContent = message; el.hidden = false;
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { el.hidden = true; }, 9000);
}
function persist(): void {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    if (!saveSettings(settings) && !savedWarning) { savedWarning = true; toast('Settings storage is unavailable. Changes will last for this session only.'); }
  }, 150);
}
function show(keyboard = false): void {
  visible = true; lastInteraction = performance.now();
  panel.inert = false; chrome.inert = false;
  panel.classList.add('visible'); chrome.classList.add('visible');
  panel.setAttribute('aria-hidden', 'false'); chrome.setAttribute('aria-hidden', 'false');
  if (keyboard) panel.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')?.focus();
}
function hide(): void {
  visible = false;
  if (panel.contains(document.activeElement) || chrome.contains(document.activeElement)) canvas.focus({ preventScroll: true });
  panel.classList.remove('visible'); chrome.classList.remove('visible');
  panel.inert = true; chrome.inert = true;
  panel.setAttribute('aria-hidden', 'true'); chrome.setAttribute('aria-hidden', 'true');
}
function setTab(name: string): void {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => {
    const selected = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    byId(`page-${button.dataset.tab}`).hidden = !selected;
  });
  lastInteraction = performance.now();
}

let renderer: Renderer;
try {
  renderer = new Renderer(canvas, toast);
  if (query.has('validate')) renderer.validateAll();
} catch (error) {
  toast(`Graphics initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  show();
  throw error;
}
// Opt-in local validation exposes renderer measurements without capture data.
const validationContext = query.has('validate') ? canvas.getContext('webgl2') : null;
const validationExtension = validationContext?.getExtension('WEBGL_debug_renderer_info');
const validationGpu = validationContext && validationExtension
  ? String(validationContext.getParameter(validationExtension.UNMASKED_RENDERER_WEBGL)) : 'Not exposed';
const audio = new AudioEngine();
window.__vsualize = { settings, renderer, audio, show, hide };

let searchText = '';
let category = 'All';
let favoritesOnly = false;
function matchingIds(): VisualId[] {
  return VISUAL_IDS.filter(id => matchesVisual(VISUALS[id], searchText, category, favoritesOnly, settings.favorites));
}
function filterVisuals(): void {
  const pool = matchingIds();
  document.querySelectorAll<HTMLElement>('[data-card]').forEach(card => { card.hidden = !pool.includes(card.dataset.card as VisualId); });
  byId('library-count').textContent = `${pool.length} / ${VISUAL_IDS.length}`;
  byId('empty-library').hidden = pool.length > 0;
  byId('favorites-only').setAttribute('aria-pressed', String(favoritesOnly));
  for (const id of ['previous-visual', 'next-visual', 'random-visual']) byId<HTMLButtonElement>(id).disabled = pool.length < 2;
}
function selectVisual(id: VisualId): void {
  activateVisual(settings, id); persist(); syncUI(); lastInteraction = performance.now();
}
function cycleVisual(direction: number): void { selectVisual(nextVisual(settings.visual, direction, matchingIds())); }
function buildVisualPicker(): void {
  const grid = byId('visual-grid');
  for (const id of VISUAL_IDS) {
    const def = VISUALS[id];
    const card = document.createElement('div'); card.className = 'visual-item'; card.dataset.card = id;
    const button = document.createElement('button');
    button.className = 'visual-card'; button.dataset.visual = id;
    button.setAttribute('aria-label', `${def.name}: ${def.subtitle}`);
    button.title = `${def.subtitle}${def.reference ? ` · Reference: ${def.reference}` : ''}`;
    const image = document.createElement('img'); image.alt = ''; image.width = 240; image.height = 152;
    if (THUMBNAILS[id]) image.src = THUMBNAILS[id]!;
    else image.className = 'thumbnail-pending';
    button.append(image);
    const label = document.createElement('span'); label.className = 'visual-title'; label.textContent = def.name; button.append(label);
    button.addEventListener('pointerenter', () => renderer.prewarm(id));
    button.addEventListener('focus', () => renderer.prewarm(id));
    button.addEventListener('click', () => selectVisual(id));
    const favorite = document.createElement('button'); favorite.className = 'favorite-visual'; favorite.dataset.favorite = id;
    favorite.textContent = '☆'; favorite.setAttribute('aria-label', `Favorite ${def.name}`);
    favorite.addEventListener('click', () => {
      settings.favorites = settings.favorites.includes(id) ? settings.favorites.filter(value => value !== id) : [...settings.favorites, id];
      syncUI(); persist();
    });
    card.append(button, favorite); grid.append(card);
  }
  for (const value of CATEGORIES) {
    const button = document.createElement('button'); button.className = 'category-chip'; button.textContent = value;
    button.dataset.category = value; button.setAttribute('aria-pressed', String(value === category));
    button.addEventListener('click', () => {
      category = value;
      document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === value)));
      filterVisuals(); grid.scrollTop = 0;
    });
    byId('categories').append(button);
  }
  byId<HTMLInputElement>('visual-search').addEventListener('input', event => {
    searchText = (event.target as HTMLInputElement).value; filterVisuals(); grid.scrollTop = 0;
  });
  byId('favorites-only').addEventListener('click', () => { favoritesOnly = !favoritesOnly; filterVisuals(); grid.scrollTop = 0; });
  byId('previous-visual').addEventListener('click', () => cycleVisual(-1));
  byId('next-visual').addEventListener('click', () => cycleVisual(1));
  byId('random-visual').addEventListener('click', () => {
    const pool = matchingIds().filter(id => id !== settings.visual);
    if (pool.length) selectVisual(pool[Math.floor(Math.random() * pool.length)]!);
  });
}
function buildPalettes(): void {
  const holder = byId('palettes');
  for (const id of PALETTE_ORDER) {
    const button = document.createElement('button'); button.className = 'palette-button'; button.dataset.palette = id;
    if (id === 'randomize') {
      button.classList.add('randomize');
      button.title = 'Randomize: five colors at once, continuously evolving into fresh palettes';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h2c6 0 8 12 14 12h2m-4-4 4 4-4 4M3 18h2c2 0 4-2 6-5m2-3c2-3 4-4 6-4h2m-4-4 4 4-4 4"/></svg>';
    }
    else if (id === 'auto') { button.classList.add('auto'); button.textContent = '◌'; button.title = 'Visual default'; }
    else { const p = PALETTES[id]; button.style.background = id === 'spectrum' ? 'conic-gradient(#ff4679,#ffeb72,#71fbbb,#59c4ff,#7a59ff,#ff4679)' : `linear-gradient(135deg,${p.colors.join(',')})`; button.title = p.name; }
    button.setAttribute('aria-label', id === 'randomize' ? 'Randomize' : button.title);
    button.addEventListener('click', () => { settings.palette = id; rememberVisualTuning(settings); persist(); syncUI(); });
    holder.append(button);
  }
}

const paletteChips = Array.from(byId('live-palette').children) as HTMLElement[];
function syncPalettePreview(): void {
  if (settings.palette !== 'randomize') return;
  renderer.palettePreview.forEach((color, i) => {
    paletteChips[i]!.style.backgroundColor = `rgb(${color.map(c => Math.round(c * 255)).join(',')})`;
  });
}

function syncUI(): void {
  byId('visual-name').textContent = VISUALS[settings.visual].name;
  byId('visual-description').textContent = VISUALS[settings.visual].subtitle;
  byId('reset-response').title = `Restore ${VISUALS[settings.visual].name}'s intensity, line thickness, speed, glow and palette. Other effects and audio settings stay unchanged.`;
  byId('reset-response').setAttribute('aria-label', `Reset ${VISUALS[settings.visual].name} to defaults`);
  byId('width-note').hidden = !['glass', 'lava'].includes(settings.visual);
  byId('lineWidth').title = ['glass', 'lava'].includes(settings.visual) ? 'Width of luminous highlights and surface ridges; does not change object size.' : 'Fine filaments to bold ribbons. Changes stroke width, not resolution or zoom.';
  byId('visual-description').title = VISUALS[settings.visual].reference ? `Inspired by the style of ${VISUALS[settings.visual].reference}. Original Vsualize implementation.` : '';
  byId('render-cost').textContent = VISUALS[settings.visual].cost === 'heavy' ? 'GPU intensive' : '';
  document.querySelectorAll<HTMLButtonElement>('[data-favorite]').forEach(button => {
    const saved = settings.favorites.includes(button.dataset.favorite as VisualId);
    button.setAttribute('aria-pressed', String(saved)); button.textContent = saved ? '★' : '☆';
  });
  filterVisuals();
  panel.className = `panel ${settings.menuPosition}${visible ? ' visible' : ''}`;
  for (const selector of ['visual', 'palette', 'mode', 'background'] as const) {
    document.querySelectorAll<HTMLButtonElement>(`[data-${selector}]`).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[selector] === settings[selector])));
  }
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]').forEach(input => {
    const key = input.dataset.setting as keyof Settings;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(settings[key]);
    else input.value = String(settings[key]);
    if (input instanceof HTMLInputElement && input.type === 'range') {
      input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
      const out = document.getElementById(`${input.id}-value`);
      if (out) out.textContent = key === 'noiseGate' ? `${(Number(input.value) * 100).toFixed(2)}%` : key === 'opacity' || key === 'glow' || key === 'intensity' ? `${Math.round(Number(input.value) * 100)}%` : `${Number(input.value).toFixed(2)}×`;
    }
  });
  byId('palette-name').textContent = settings.palette === 'randomize' ? 'Randomize' : settings.palette === 'auto' ? 'Visual default' : PALETTES[settings.palette].name;
  byId('randomize-details').hidden = settings.palette !== 'randomize';
  syncPalettePreview();
  byId('desktop-options').hidden = !['desktop', 'both'].includes(settings.mode);
  byId('microphone-options').hidden = !['microphone', 'both'].includes(settings.mode);
  byId('solid-color-control').hidden = settings.background !== 'solid';
  byId('transparency-options').hidden = settings.background !== 'transparent';
  if (!isNative) {
    document.body.classList.toggle('transparent-preview', settings.background === 'transparent');
    byId('preview-label').textContent = `Browser preview · ${settings.mode === 'demo' ? 'DEMO: not your music' : settings.mode === 'microphone' ? 'Microphone selected' : 'No audio connected; choose Mic or Demo in Audio'}${settings.background === 'transparent' ? ' · Sample backdrop' : ''}`;
  }
}

const audioKeys = ['mode', 'desktopDevice', 'microphoneDevice', 'desktopGain', 'microphoneGain', 'sensitivity', 'noiseGate'];
function restartAudio(): void {
  clearTimeout(restartTimer);
  audio.invalidateForRestart(settings);
  comparing = false; syncComparison(); hasHeardAudio = false; sessionStarted = performance.now();
  restartTimer = window.setTimeout(async () => { renderer.motion.resetAudio(); await audio.start(settings); if (audio.error) toast(audio.error); }, 220);
}
async function changeSetting(key: keyof Settings, value: unknown): Promise<void> {
  const old = settings[key];
  (settings as unknown as Record<string, unknown>)[key] = value;
  if (isVisualTuningKey(key)) rememberVisualTuning(settings);
  syncUI();
  if (key === 'layer' || key === 'hideTaskbar') {
    try { await windowAction(key === 'layer' ? 'layer' : 'taskbar', value as string | boolean); }
    catch (error) { (settings as unknown as Record<string, unknown>)[key] = old; syncUI(); toast(String(error)); return; }
  }
  if (audioKeys.includes(key)) restartAudio();
  persist();
}

async function refreshDevices(): Promise<void> {
  const button = byId<HTMLButtonElement>('refresh-devices'); button.disabled = true;
  try {
    let devices: DeviceInfo[];
    if (isNative) devices = await nativeDevices();
    else {
      const available = await navigator.mediaDevices?.enumerateDevices();
      devices = (available || []).filter(d => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, name: d.label || `Microphone ${i + 1}`, kind: 'microphone' }));
    }
    for (const kind of ['desktop', 'microphone'] as const) {
      const select = byId<HTMLSelectElement>(`${kind}-device`);
      select.replaceChildren(new Option(kind === 'desktop' ? 'Follow default output' : 'Follow default microphone', ''));
      for (const device of devices.filter(d => d.kind === kind)) select.add(new Option(device.name, device.id));
      const key = kind === 'desktop' ? 'desktopDevice' : 'microphoneDevice';
      if (settings[key] && !Array.from(select.options).some(o => o.value === settings[key])) select.add(new Option('Saved device (currently unavailable)', settings[key]));
      select.value = settings[key];
    }
  } catch (error) { toast(`Could not list audio devices: ${String(error)}`); }
  finally { button.disabled = false; }
}

buildVisualPicker(); buildPalettes();
const spectrumBars = Array.from({ length: 32 }, () => {
  const bar = document.createElement('i'); bar.setAttribute('aria-hidden', 'true'); byId('live-spectrum').append(bar); return bar;
});
function syncComparison(): void {
  byId('compare-audio').setAttribute('aria-pressed', String(comparing));
  byId('compare-audio').textContent = comparing ? 'Restore music response' : 'Compare: response on';
  byId('compare-note').hidden = !comparing;
}
byId('reset-response').addEventListener('click', () => {
  resetVisualTuning(settings);
  comparing = false;
  renderer.motion.resetAudio();
  syncComparison();
  syncUI();
  persist();
  toast(`${VISUALS[settings.visual].name} defaults restored. Other effects and audio settings were kept.`);
});
byId('compare-audio').addEventListener('click', () => {
  comparing = !comparing;
  renderer.motion.resetAudio(); syncComparison();
});
byId('signal-monitor').addEventListener('click', () => { show(); setTab('audio'); });
byId('copy-diagnostics').addEventListener('click', async () => {
  const f = audio.frame;
  const data = {
    app: 'Vsualize 0.3.0', native: isNative, capturedAt: new Date().toISOString(), source: settings.mode,
    rendering: renderer.resolution, performance: { ...renderer.performance, frames: renderer.frames },
    status: describeSignal(settings, f, audio.error), responseDisabledForComparison: comparing,
    volume: f.volume, bass: f.bass, mid: f.mid, treble: f.treble, beat: f.beat,
    desktop: { status: f.desktopStatus, input: f.desktopInput }, microphone: { status: f.microphoneStatus, input: f.microphoneInput },
    settings: { desktopGain: settings.desktopGain, microphoneGain: settings.microphoneGain, sensitivity: settings.sensitivity, noiseGate: settings.noiseGate, intensity: settings.intensity, idleMotion: settings.idleMotion }
  };
  try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); toast('Audio diagnostics copied. No recording or waveform was included.'); }
  catch { toast('Clipboard unavailable. A screenshot of this Audio panel shows the current status and levels.'); }
});
if (!isNative) {
  document.body.classList.add('preview'); byId('preview-label').hidden = false;
  for (const id of ['minimize', 'close-app', 'layer', 'hide-taskbar', 'center-window']) byId<HTMLButtonElement>(id).setAttribute('disabled', '');
  byId('drag-zone').title = 'Window dragging is available in the Windows app.';
  document.querySelectorAll<HTMLButtonElement>('[data-mode="desktop"],[data-mode="both"]').forEach(button => { button.disabled = true; button.title = 'Available in the Windows app'; });
}
syncUI();

canvas.addEventListener('click', () => visible ? hide() : show());
canvas.addEventListener('contextmenu', event => { event.preventDefault(); show(); });
byId('dismiss').addEventListener('click', hide);
panel.addEventListener('pointerdown', () => { lastInteraction = performance.now(); interacting = true; });
panel.addEventListener('input', () => { lastInteraction = performance.now(); });
window.addEventListener('pointerup', () => { interacting = false; lastInteraction = performance.now(); });
panel.addEventListener('pointerleave', () => { lastInteraction = performance.now(); });
byId('drag-zone').addEventListener('pointerdown', event => {
  if (event.button !== 0 || !isNative) return;
  lastInteraction = performance.now(); interacting = true;
  void windowAction('drag').catch(error => toast(String(error))).finally(() => { interacting = false; lastInteraction = performance.now(); });
});
document.querySelectorAll<HTMLElement>('[data-resize]').forEach(edge => edge.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !isNative) return;
  event.preventDefault(); void windowAction('resize', edge.dataset.resize).catch(error => toast(String(error)));
}));
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => {
  button.addEventListener('click', () => setTab(button.dataset.tab!));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['visuals', 'audio', 'settings'];
    const idx = tabs.indexOf(button.dataset.tab!);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (idx + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    setTab(tabs[target]!); byId(`tab-${tabs[target]}`).focus();
  });
});
document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]').forEach(input => {
  input.addEventListener(input instanceof HTMLInputElement && input.type === 'range' ? 'input' : 'change', () => {
    const key = input.dataset.setting as keyof Settings;
    let value: unknown = input.value;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') value = input.checked;
    else if (input.dataset.number || input instanceof HTMLInputElement && input.type === 'range') value = Number(input.value);
    void changeSetting(key, value);
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => void changeSetting('mode', button.dataset.mode as AudioMode)));
document.querySelectorAll<HTMLButtonElement>('[data-background]').forEach(button => button.addEventListener('click', () => void changeSetting('background', button.dataset.background)));
byId('export-profiles').addEventListener('click', () => {
  const blob = new Blob([exportStudioProfiles(settings)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'vsualize-effect-settings.json'; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
});
const profileFile = byId<HTMLInputElement>('profile-file');
byId('import-profiles').addEventListener('click', () => profileFile.click());
profileFile.addEventListener('change', async () => {
  const file = profileFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 100_000) throw new Error('This settings file is too large. Choose a Vsualize effect-settings JSON file.');
    const count = importStudioProfiles(settings, await file.text());
    syncUI(); persist(); toast('Imported settings for ' + count + ' effects.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not import effect settings.'); }
  finally { profileFile.value = ''; }
});
byId('reconnect').addEventListener('click', restartAudio);
byId('refresh-devices').addEventListener('click', () => void refreshDevices());
byId('pause').addEventListener('click', () => {
  renderer.paused = !renderer.paused;
  byId('pause').textContent = renderer.paused ? 'Resume' : 'Pause';
  byId('pause').setAttribute('aria-label', renderer.paused ? 'Resume animation' : 'Pause animation');
});
for (const [id, action] of [['fullscreen', 'fullscreen'], ['minimize', 'minimize'], ['close-app', 'quit'], ['center-window', 'center']] as const) byId(id).addEventListener('click', () => void windowAction(action).catch(error => toast(String(error))));
byId('reset-settings').addEventListener('click', () => {
  resetAllVisualTunings(settings);
  for (const key of ['background', 'backgroundColor', 'opacity', 'menuPosition', 'controlsTimeout', 'fps', 'quality', 'idleMotion', 'gentlePeaks', 'showSignal'] as const) (settings as unknown as Record<string, unknown>)[key] = DEFAULTS[key];
  persist(); syncUI(); toast('Appearance and all effect defaults reset. Audio devices and window layer were kept.');
});
window.addEventListener('keydown', event => {
  lastInteraction = performance.now();
  const target = event.target as HTMLElement;
  const editing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
  if (event.key === 'Escape') { event.preventDefault(); if (visible) hide(); else void windowAction('exit-fullscreen').catch(() => {}); return; }
  if (event.key === 'F11') { event.preventDefault(); void windowAction('fullscreen').catch(error => toast(String(error))); return; }
  if (editing || event.altKey || event.ctrlKey || event.metaKey) return;
  if ((event.key === 'Enter' || event.key === 'Tab') && !visible) { event.preventDefault(); show(true); }
  else if (event.code === 'Space' && (target === canvas || target === document.body)) { event.preventDefault(); byId('pause').click(); }
  else if (!visible && ['ArrowRight', 'ArrowLeft'].includes(event.key)) {
    event.preventDefault(); cycleVisual(event.key === 'ArrowRight' ? 1 : -1);
  }
});

window.setInterval(() => {
  if (!visible || settings.controlsTimeout === 0 || interacting || panel.matches(':hover') || chrome.matches(':hover')) return;
  if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement) return;
  if (performance.now() - lastInteraction > settings.controlsTimeout * 1000) hide();
}, 400);

let minimized = false;
const pacer = new FramePacer();
let lastDiagnostics = 0;
function loop(now: number): void {
  requestAnimationFrame(loop);
  const dt = pacer.next(now, settings.fps, document.hidden || minimized);
  if (dt === null) return;
  const frame = audio.tick(now, dt);
  renderer.render(comparing ? comparisonFrame : frame, comparing ? { ...settings, idleMotion: true } : settings, dt);
  if (now - lastDiagnostics > 70) {
    lastDiagnostics = now;
    if (validationContext) canvas.dataset.validation = JSON.stringify({ time: now, frames: renderer.frames,
      visual: settings.visual, quality: settings.quality, paused: renderer.paused, gpu: validationGpu,
      ...renderer.performance, resolution: renderer.resolution });
    const status = describeSignal(settings, frame, audio.error);
    if (status.live) hasHeardAudio = true;
    const warn = settings.mode === 'demo' || comparing || status.kind === 'error' || status.kind === 'partial'
      || (isNative && !hasHeardAudio && now - sessionStarted > 3000);
    byId('signal-monitor').hidden = visible || !(settings.showSignal || warn);
    byId('monitor-label').textContent = comparing ? 'COMPARISON · audio response off' : status.title;
    byId<HTMLMeterElement>('monitor-level').value = frame.volume;
    byId('monitor-dot').className = `signal-dot${status.live && !comparing ? ' active' : status.kind === 'error' || status.kind === 'demo' || comparing ? ' error' : ''}`;
    if (visible) {
      const resolution = describeResolution(renderer.resolution);
      byId('render-resolution').textContent = resolution.label + (renderer.paused ? ' · Paused' : '');
      byId('render-resolution').title = resolution.detail;
      byId('render-resolution').dataset.limited = String(resolution.limited);
      byId('render-resolution-detail').textContent = resolution.detail;
      // An allocation error pauses rendering; make the recovery button honest.
      byId('pause').textContent = renderer.paused ? 'Resume' : 'Pause';
      byId('pause').setAttribute('aria-label', renderer.paused ? 'Resume animation' : 'Pause animation');
      syncPalettePreview();
      byId('signal-summary').textContent = comparing ? 'COMPARISON · response off' : status.title;
      byId('signal-summary').title = status.detail;
      byId('signal-dot').className = `signal-dot${status.live ? ' active' : status.kind === 'error' || status.kind === 'demo' ? ' error' : ''}`;
      byId('audio-proof').dataset.state = status.kind;
      byId('capture-title').textContent = status.title;
      byId('capture-detail').textContent = status.detail;
      byId('beat-led').classList.toggle('active', frame.beat > 0.15);
      byId('beat-led').textContent = settings.mode === 'demo' ? 'DEMO' : 'BEAT';
      byId<HTMLMeterElement>('master-level').value = frame.volume;
      for (let i = 0; i < spectrumBars.length; i++) {
        const energy = Math.max(...frame.spectrum.slice(i * 4, i * 4 + 4));
        spectrumBars[i]!.style.transform = `scaleY(${Number.isFinite(energy) ? energy : 0})`;
      }
      for (const band of ['bass', 'mid', 'treble'] as const) byId<HTMLMeterElement>(`${band}-meter`).value = frame[band];
      for (const source of ['desktop', 'microphone'] as const) {
        const input = source === 'desktop' ? frame.desktopInput : frame.microphoneInput;
        byId(`${source}-status`).textContent = source === 'desktop' ? frame.desktopStatus : frame.microphoneStatus;
        byId(`${source}-raw-value`).textContent = settings.mode === 'demo' ? 'Synthetic' : formatRawLevel(input);
        byId<HTMLMeterElement>(`${source}-raw-meter`).value = rawMeterValue(input);
        byId(`${source}-raw-value`).title = input ? `${input.sampleRate} Hz · ${input.channels} channels · ${input.packets} packets · last ${input.packetAgeMs ?? 'no'} ms ago` : 'Rebuild the native app for source diagnostics.';
      }
      const error = status.kind === 'error' || status.kind === 'partial' ? status.detail : '';
      byId('audio-error').textContent = error; byId('audio-error').hidden = !error;
    }
  }
}
requestAnimationFrame(loop);
renderer.warmAll();
initializeUpdater();
void refreshDevices();
persist();
void audio.start(settings).then(() => { if (audio.error) { show(); setTab('audio'); toast(audio.error); } });
if (isNative) {
  // These settings are restored only after a tray icon is available on the Rust side.
  void windowAction('layer', settings.layer).catch(error => { settings.layer = 'normal'; syncUI(); toast(String(error)); });
  if (settings.hideTaskbar) void windowAction('taskbar', true).catch(error => { settings.hideTaskbar = false; syncUI(); toast(String(error)); });
  void window.__TAURI__!.event.listen('ui-reveal', () => { minimized = false; show(); });
  void window.__TAURI__!.event.listen<boolean>('window-minimized', event => { minimized = event.payload; });
  void window.__TAURI__!.event.listen('window-recovered', () => {
    document.body.classList.remove('window-fullscreen'); void syncWindowCorners();
    settings.layer = 'normal'; settings.hideTaskbar = false; minimized = false; syncUI(); persist(); show();
  });
  void window.__TAURI__!.event.listen('audio-stopped', () => {
    settings.mode = 'off'; void audio.start(settings); syncUI(); persist(); show(); setTab('audio');
  });
  void windowAction('ready').catch(error => toast(String(error)));
}
if ((!isNative && query.get('ui') !== 'hidden') || query.get('ui') === 'visible') show();
window.addEventListener('beforeunload', () => { saveSettings(settings); renderer.destroy(); void audio.destroy(); });
