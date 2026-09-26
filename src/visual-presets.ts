import { VISUAL_IDS } from './catalog.js';
import type { PaletteId, Settings, VisualId, VisualTuning } from './types.js';

export const FIXED_SMOOTHNESS = 0.80;
export const PALETTE_IDS: readonly PaletteId[] = ['randomize', 'auto', 'iris', 'aurora', 'ember', 'ice', 'pearl', 'spectrum', 'neon'];
export const VISUAL_TUNING_KEYS = ['intensity', 'lineWidth', 'motion', 'glow', 'palette'] as const;
export type VisualTuningKey = typeof VISUAL_TUNING_KEYS[number];
export const CONTROL_LIMITS = { intensity: [0, 3], lineWidth: [0.35, 4], motion: [0, 3], glow: [0, 1] } as const;
/** Each effect keeps its own balance between deformation and musical drive.
 * One public intensity control scales that balance instead of two competing knobs.
 * Tuple: legacy amplitude, legacy response, speed, legacy glow. */
export const RESPONSE_BASES: Readonly<Record<VisualId, readonly [number, number, number, number]>> = {
    soundform: [2.00, 1.80, 0.65, 0.20],
    'soundform-topdown': [2.00, 1.80, 0.65, 0.20],
    glass: [1.95, 1.15, 0.60, 0.30],
    mandelbrot: [1.85, 1.60, 0.90, 0.30],
    spectrum: [1.50, 1.70, 0.80, 1.00],
    organism: [0.90, 1.40, 0.55, 0.80],
    overdrive: [1.95, 1.85, 1.00, 0.20],
    dissolution: [2.00, 1.85, 1.00, 0.85],
    mandala: [1.60, 1.75, 1.00, 0.70],
    kaleidoscope: [1.85, 1.20, 2.00, 0.50],
    groove: [2.20, 1.80, 0.85, 0.00],
    lava: [1.80, 1.85, 0.20, 0.85],
};
const bound = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const finite = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
/** Preserve fine adjustment low on the slider; the upper half opens up broad halos. */
export function glowStrength(value: number): number {
    const g = bound(finite(value, 0), 0, 1);
    return g + 3 * Math.pow(Math.max(0, (g - 0.40) / 0.60), 2.2);
}
/** Imported old Glow values should not suddenly become four times brighter. */
export function migrateGlow(legacy: number): number {
    let lo = 0, hi = 1;
    const target = bound(finite(legacy, 0), 0, 1);
    for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        if (glowStrength(mid) < target)
            lo = mid;
        else
            hi = mid;
    }
    return target === 0 ? 0 : (lo + hi) / 2;
}
export function resolveVisualControls(id: VisualId, tuning: VisualTuning) {
    const base = RESPONSE_BASES[id];
    const intensity = bound(finite(tuning.intensity, 1), 0, 3);
    return {
        amplitude: base[0] * Math.pow(intensity, 0.65),
        response: base[1] * Math.sqrt(intensity),
        lineWidth: bound(finite(tuning.lineWidth, 1), 0.35, 4),
        speed: bound(finite(tuning.motion, base[2]), 0, 3),
        smoothness: FIXED_SMOOTHNESS,
        glow: glowStrength(tuning.glow),
    };
}
export const VISUAL_DEFAULTS: Readonly<Record<VisualId, Readonly<VisualTuning>>> = Object.freeze(Object.fromEntries(VISUAL_IDS.map(id => [id, Object.freeze({ intensity: 1, lineWidth: 1,
        motion: RESPONSE_BASES[id][2], glow: migrateGlow(RESPONSE_BASES[id][3]), palette: 'randomize' as const })]))) as Record<VisualId, Readonly<VisualTuning>>;
export function defaultVisualTuning(id: VisualId): VisualTuning { return { ...VISUAL_DEFAULTS[id] }; }
export function createVisualTunings(): Record<VisualId, VisualTuning> {
    return Object.fromEntries(VISUAL_IDS.map(id => [id, defaultVisualTuning(id)])) as Record<VisualId, VisualTuning>;
}
export function isVisualTuningKey(key: string): key is VisualTuningKey {
    return (VISUAL_TUNING_KEYS as readonly string[]).includes(key);
}
export function sanitizeVisualTuning(id: VisualId, value: unknown, fallback: VisualTuning = defaultVisualTuning(id)): VisualTuning {
    const tuning = { ...fallback };
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return tuning;
    const input = value as Record<string, unknown>;
    for (const key of ['intensity', 'lineWidth', 'motion', 'glow'] as const) {
        const n = input[key];
        if (typeof n === 'number' && Number.isFinite(n))
            tuning[key] = bound(n, CONTROL_LIMITS[key][0], CONTROL_LIMITS[key][1]);
    }
    if (PALETTE_IDS.includes(input.palette as PaletteId))
        tuning.palette = input.palette as PaletteId;
    return tuning;
}
/** r1-r4 independent amplitude/response collapse to a combined-drive ratio.
 * The inverse macro exponent preserves their product within the new limits,
 * not two independent settings that are no longer exposed.
 * Old smoothing is intentionally ignored: 80% is now shared by every effect. */
export function migrateLegacyTuning(id: VisualId, value: unknown, fallback: VisualTuning = defaultVisualTuning(id)): VisualTuning {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ...fallback };
    const v = value as Record<string, unknown>, base = RESPONSE_BASES[id];
    const a = typeof v.intensity === 'number' && Number.isFinite(v.intensity)
        ? bound(v.intensity, 0, 2.5) / base[0] : Math.pow(fallback.intensity, 0.65);
    const b = typeof v.reactivity === 'number' && Number.isFinite(v.reactivity)
        ? bound(v.reactivity, 0, 2) / base[1] : Math.sqrt(fallback.intensity);
    const combined = Math.pow(a * b, 1 / 1.15);
    return sanitizeVisualTuning(id, { intensity: combined, lineWidth: 1, motion: v.motion,
        glow: typeof v.glow === 'number' && Number.isFinite(v.glow) ? migrateGlow(v.glow) : fallback.glow,
        palette: v.palette }, fallback);
}
export function rememberVisualTuning(settings: Settings): void {
    const tuning = sanitizeVisualTuning(settings.visual, settings);
    settings.visualTunings = { ...settings.visualTunings, [settings.visual]: tuning };
    Object.assign(settings, tuning);
}
export function activateVisual(settings: Settings, id: VisualId): void {
    if (!VISUAL_IDS.includes(id) || settings.visual === id)
        return;
    rememberVisualTuning(settings);
    settings.visual = id;
    const tuning = sanitizeVisualTuning(id, settings.visualTunings[id]);
    settings.visualTunings = { ...settings.visualTunings, [id]: tuning };
    Object.assign(settings, tuning);
}
export function resetVisualTuning(settings: Settings): void {
    const tuning = defaultVisualTuning(settings.visual);
    settings.visualTunings = { ...settings.visualTunings, [settings.visual]: tuning };
    Object.assign(settings, tuning);
}
export function resetAllVisualTunings(settings: Settings): void {
    settings.visualTunings = createVisualTunings();
    settings.visual = 'soundform';
    Object.assign(settings, settings.visualTunings.soundform);
}
