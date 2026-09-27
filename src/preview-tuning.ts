import type { VisualId } from './types.js';

/** Browser design study only. Native programs continue using their original shaders. */
export interface PreviewTuning { spin: number; variety: number }
export const PREVIEW_TUNING_KEY = 'vsualize-menu-study-tuning-v1';
export function cleanPreviewTuning(value: unknown): PreviewTuning {
  const v = value && typeof value === 'object' ? value as Partial<PreviewTuning> : {};
  const clamp = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 1;
  return { spin: clamp(v.spin, -3, 3), variety: clamp(v.variety, 0, 2) };
}
export const SPIN_WEIGHTS: Partial<Record<VisualId, readonly [number, number]>> = {
  kaleidoscope: [0.13, 0.62], mandala: [0, 0.055], dissolution: [0, 0.035],
};

/** Integrate rate changes so adjusting spin does not jump to a new orientation. */
export class PreviewSpin {
  private lastClock = 0;
  private lastTurn = 0;
  private offsets: Partial<Record<VisualId, number>> = {};
  update(id: VisualId, clock: number, turn: number, speed: number): number {
    const [a, b] = SPIN_WEIGHTS[id] ?? [0, 0];
    const delta = Math.max(0, clock - this.lastClock) * a + Math.max(0, turn - this.lastTurn) * b;
    this.lastClock = clock; this.lastTurn = turn;
    this.offsets[id] = (this.offsets[id] ?? 0) + delta * (speed - 1);
    return clock * a + turn * b + this.offsets[id]!;
  }
}

export function previewFragment(id: VisualId, source: string): string {
  let shader = source.replace('uniform vec2 uResolution;', 'uniform vec2 uResolution;\nuniform float uPreviewSpin, uVariety;');
  const replace = (before: string, after: string) => {
    if (!shader.includes(before)) throw new Error(`Preview control no longer matches ${id}: ${before}`);
    shader = shader.replace(before, after);
  };
  if (id === 'kaleidoscope') {
    replace('uClock*0.13+uTurn*0.62', 'uPreviewSpin');
    replace('float variety=1.0;', 'float variety=uVariety;');
  } else if (id === 'mandala') {
    replace('uTurn*0.055', 'uPreviewSpin');
    replace('(petals+diamond*0.80+spokes*0.23)', '(petals+(diamond*0.80+spokes*0.23)*uVariety)');
    replace('(filigree*0.66+beads)', '(filigree*0.66+beads)*uVariety');
  } else if (id === 'dissolution') {
    replace('uTurn*0.035', 'uPreviewSpin');
    replace('+fine);', '+fine*uVariety);');
  } else if (id === 'organism') {
    replace('float fine=fbm(q*3.6+flow*2.0);', 'float fine=fbm(q*3.6+flow*2.0)*uVariety;');
    replace('rings*cell*0.45', 'rings*cell*0.45*uVariety');
  } else if (id === 'overdrive') {
    replace('float coord=(l-lobes)', 'float coord=(l-lobes*uVariety)');
  } else if (id === 'lava') {
    replace('0.15+uMid*0.27', '(0.15+uMid*0.27)*(0.25+0.75*uVariety)');
  }
  return shader;
}
