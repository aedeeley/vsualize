import { VISUAL_IDS as IDS } from './catalog.js';
import { PALETTE_IDS, createVisualTunings, defaultVisualTuning, sanitizeVisualTuning, migrateLegacyTuning } from './visual-presets.js';
import type { Settings, PaletteId, Palette, AudioFrame, VisualId } from './types.js';

export const DEFAULTS: Settings = {
  version: 1, audioBehavior: 2, colorBehavior: 1, visualTuningVersion: 2, visualTunings: createVisualTunings(),
  showSignal: false, visual: 'soundform', favorites: [], ...defaultVisualTuning('soundform'),
  background: 'solid', backgroundColor: '#07080d', opacity: 0.94,
  menuPosition: 'bottom-right', controlsTimeout: 7, fps: 60, quality: 'auto',
  layer: 'normal', hideTaskbar: false, idleMotion: false, gentlePeaks: true,
  mode: 'desktop', desktopDevice: '', microphoneDevice: '', desktopGain: 1,
  microphoneGain: 1, sensitivity: 1.35, noiseGate: 0.002
};

export const PALETTES: Record<Exclude<PaletteId, 'auto' | 'randomize'>, Palette> = {
  iris: { name: 'Iris', colors: ['#8357ff', '#f47bea', '#91cbff'] },
  aurora: { name: 'Aurora', colors: ['#2bbd9c', '#9ff6d0', '#8773ff'] },
  ember: { name: 'Ember', colors: ['#ef6540', '#ffd997', '#ee4a8c'] },
  ice: { name: 'Ice', colors: ['#377ccf', '#a1eeff', '#9d8bed'] },
  pearl: { name: 'Pearl', colors: ['#728091', '#f0f5ff', '#bdc8d8'] },
  spectrum: { name: 'Prismatic', colors: ['#ff4679', '#71fbbb', '#7a59ff'] },
  neon: { name: 'Neon', colors: ['#ff32df', '#a1ff48', '#3bead7'] }
};
/** The picker order is explicit: cycling first, visual default second, then fixed palettes. */
export const PALETTE_ORDER: readonly PaletteId[] = PALETTE_IDS;
export const VISUAL_IDS: readonly VisualId[] = IDS;
export const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));
export const hexRGB = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

export function sanitizeSettings(value: unknown): Settings {
  const s = { ...DEFAULTS, favorites: [...DEFAULTS.favorites], visualTunings: createVisualTunings() };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return s;
  const v = value as Record<string, unknown>;
  const choice = <K extends keyof Settings>(key: K, choices: readonly Settings[K][]) => {
    if (choices.includes(v[key] as Settings[K])) s[key] = v[key] as Settings[K];
  };
  choice('visual', VISUAL_IDS);
  if (Array.isArray(v.favorites)) s.favorites = [...new Set(v.favorites.filter((id): id is VisualId => typeof id === 'string' && VISUAL_IDS.includes(id as VisualId)))];
  choice('mode', ['desktop', 'microphone', 'both', 'demo', 'off']);
  choice('background', ['solid', 'transparent']);
  choice('menuPosition', ['bottom-right', 'bottom-center', 'bottom-left', 'top-right', 'top-center', 'top-left', 'center']);
  choice('fps', [30, 60, 120]); choice('quality', ['auto', 'low', 'medium', 'high']); choice('layer', ['normal', 'top', 'bottom']);
  const limits: Partial<Record<keyof Settings, [number, number]>> = {
    opacity: [0.1, 1],
    controlsTimeout: [0, 30], desktopGain: [0, 3], microphoneGain: [0, 3],
    sensitivity: [0.25, 4], noiseGate: [0, 0.025]
  };
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = v[key];
    if (typeof n === 'number' && Number.isFinite(n)) (s as unknown as Record<string, unknown>)[key] = clamp(n, min, max);
  }
  for (const key of ['hideTaskbar', 'idleMotion', 'gentlePeaks', 'showSignal'] as const) if (typeof v[key] === 'boolean') s[key] = v[key];
  for (const key of ['desktopDevice', 'microphoneDevice'] as const) if (typeof v[key] === 'string' && v[key].length < 1024) s[key] = v[key];
  if (typeof v.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(v.backgroundColor)) s.backgroundColor = v.backgroundColor;
  // Upgrade once. Keep devices, gain, favorites, placement and custom response.
  // Users can re-enable ambient drift; the marker preserves that choice later.
  if (v.audioBehavior !== 2) {
    s.idleMotion = false;
  }
  // Read legacy artist profiles and current simplified profiles. Retired IDs
  // cannot overwrite Soundform with another effect's top-level controls.
  if (v.visualTuningVersion === 1 || v.visualTuningVersion === 2) {
    const profiles = v.visualTunings && typeof v.visualTunings === 'object' && !Array.isArray(v.visualTunings)
      ? v.visualTunings as Record<string, unknown> : {};
    const read = v.visualTuningVersion === 1 ? migrateLegacyTuning : sanitizeVisualTuning;
    for (const id of VISUAL_IDS) s.visualTunings[id] = read(id, profiles[id]);
    if (v.visual === s.visual) s.visualTunings[s.visual] = read(s.visual, v, s.visualTunings[s.visual]);
  }
  Object.assign(s, s.visualTunings[s.visual]);
  if (v.colorBehavior !== 1) {
    s.palette = 'randomize';
    s.visualTunings[s.visual].palette = 'randomize';
  }
  return s;
}

/** A synthetic source is always an explicit, per-session choice. */
export function startupMode(mode: Settings['mode'], native: boolean): Settings['mode'] {
  return native ? (mode === 'demo' ? 'desktop' : mode) : 'off';
}

const KEY = 'vsualize.settings.v1';
const LEGACY_KEY = 'resonance.settings.v1';
export function loadSettings(): Settings {
  try {
    const current = localStorage.getItem(KEY);
    const stored = current ?? localStorage.getItem(LEGACY_KEY);
    const settings = sanitizeSettings(JSON.parse(stored || 'null'));
    try {
      if (current && !localStorage.getItem('vsualize.settings.before-simple-controls.v2')) {
        const previous = JSON.parse(current);
        if (previous && typeof previous === 'object' && previous.visualTuningVersion !== 2) {
          localStorage.setItem('vsualize.settings.before-simple-controls.v2', current);
        }
      }
    } catch { /* Optional local backup must not prevent loading usable settings. */ }
    // This migrates only data accessible in the current webview/browser origin.
    if (current == null && stored) {
      try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Read-only storage is usable. */ }
    }
    return settings;
  } catch { return sanitizeSettings(null); }
}
export function saveSettings(settings: Settings): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(sanitizeSettings(settings))); return true; } catch { return false; }
}
export function silentFrame(): AudioFrame {
  return { volume: 0, bass: 0, mid: 0, treble: 0, beat: 0, spectrum: Array(128).fill(0), waveform: Array(256).fill(0), desktopLevel: 0, microphoneLevel: 0, desktopStatus: 'Stopped', microphoneStatus: 'Stopped' };
}

/** A visibly labelled, deterministic preview signal. Never a fallback for failed capture. */
export function demoFrame(time: number): AudioFrame {
  const f = silentFrame();
  const phase = (time * 1.82) % 1;
  const kick = Math.exp(-phase * 12);
  const hat = Math.exp(-((time * 7.28) % 1) * 19);
  f.bass = 0.20 + kick * 0.62;
  f.mid = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(time * 1.3));
  f.treble = 0.07 + hat * 0.42;
  f.volume = 0.15 + kick * 0.4;
  f.beat = kick;
  f.spectrum = f.spectrum.map((_, i) => clamp(0.28 * Math.exp(-i / 75) * (0.6 + 0.4 * Math.sin(i * 0.15 + time * 1.3)) + kick * 0.64 * Math.exp(-(((i - 20) / 12) ** 2)) + hat * 0.33 * Math.exp(-(((i - 96) / 18) ** 2))));
  f.waveform = f.waveform.map((_, i) => (Math.sin(i * 0.093 + time * 3) * kick + Math.sin(i * 0.37 - time * 2) * 0.2) * 0.55);
  f.desktopStatus = 'Demo signal (not desktop audio)';
  return f;
}
