import type { Settings } from './types.js';

export interface RenderLimits { width: number; height: number }
export interface ResolutionPlan {
  nativeWidth: number; nativeHeight: number;
  requestedWidth: number; requestedHeight: number;
  gpuLimited: boolean;
  quality: Settings['quality'];
}
export interface ResolutionReport extends ResolutionPlan {
  actualWidth: number; actualHeight: number;
  native: boolean; implementationLimited: boolean;
  /** Linear pixel scale, not the percentage of total pixels. */
  scalePercent: number;
}
const positive = (value: number, fallback: number): number => Number.isFinite(value) && value > 0 ? value : fallback;

/** 'high' is the persisted Detailed setting, now true native resolution.
 * No megapixel budget, heavy-effect penalty or 2x DPI ceiling applies to it.
 * Only hardware limits may reduce its requested size, and these are reported.
 */
export function planResolution(
  cssWidth: number, cssHeight: number, dpr: number,
  quality: Settings['quality'], heavy: boolean,
  limits: RenderLimits = { width: 16384, height: 16384 },
  adaptiveScale = 1
): ResolutionPlan {
  const w = positive(cssWidth, 1), h = positive(cssHeight, 1);
  const ratio = positive(dpr, 1);
  const nativeWidth = Math.max(1, Math.round(w * ratio));
  const nativeHeight = Math.max(1, Math.round(h * ratio));
  let width = nativeWidth, height = nativeHeight;
  if (quality === 'auto') {
    // A widget should not shade eight million pixels by default. Auto remains
    // native in small windows, with an explicit, reported budget at large sizes.
    const budget = heavy ? 1_250_000 : 2_000_000;
    const scale = Math.min(1, Math.sqrt(budget / (nativeWidth * nativeHeight)))
      * Math.max(0.5, Math.min(1, positive(adaptiveScale, 1)));
    width = Math.max(1, Math.round(nativeWidth * scale));
    height = Math.max(1, Math.round(nativeHeight * scale));
  } else if (quality !== 'high') {
    // Preserve the existing low-power choices; the UI calls them reduced.
    const budget = (heavy ? 0.52 : 1) * (quality === 'low' ? 480_000 : 1_250_000);
    const scale = Math.min(ratio, 2, Math.sqrt(budget / (w * h)));
    width = Math.max(1, Math.round(w * scale));
    height = Math.max(1, Math.round(h * scale));
  }
  const limitW = Math.max(1, Math.floor(positive(limits.width, 16384)));
  const limitH = Math.max(1, Math.floor(positive(limits.height, 16384)));
  const gpuScale = Math.min(1, limitW / width, limitH / height);
  return {
    nativeWidth, nativeHeight,
    requestedWidth: Math.max(1, Math.round(width * gpuScale)),
    requestedHeight: Math.max(1, Math.round(height * gpuScale)),
    gpuLimited: gpuScale < 1, quality
  };
}

/** The readout uses the actual WebGL drawing buffer, not canvas.width. */
export function reportResolution(plan: ResolutionPlan, actualWidth: number, actualHeight: number): ResolutionReport {
  const w = Math.max(0, Math.floor(Number.isFinite(actualWidth) ? actualWidth : 0));
  const h = Math.max(0, Math.floor(Number.isFinite(actualHeight) ? actualHeight : 0));
  return {
    ...plan, actualWidth: w, actualHeight: h,
    native: w === plan.nativeWidth && h === plan.nativeHeight,
    implementationLimited: w !== plan.requestedWidth || h !== plan.requestedHeight,
    scalePercent: Math.min(w / plan.nativeWidth, h / plan.nativeHeight) * 100
  };
}
export function describeResolution(report: ResolutionReport | null): { label: string; detail: string; limited: boolean } {
  if (!report) return { label: 'Waiting for first rendered frame…', detail: '', limited: false };
  const r = report;
  const limited = r.gpuLimited || r.implementationLimited;
  const state = r.native ? 'Native · 100%' : `${limited ? 'Graphics limited' : r.scalePercent > 100 ? 'Oversampled' : r.quality === 'auto' ? 'Auto' : 'Reduced'} · ${Math.floor(r.scalePercent)}% scale`;
  const reason = r.gpuLimited ? 'GPU size limit. ' : r.implementationLimited ? 'The graphics implementation supplied a smaller buffer. ' : '';
  return {
    label: `Rendering: ${r.actualWidth} × ${r.actualHeight} · ${state}`,
    detail: `${reason}Display area: ${r.nativeWidth} × ${r.nativeHeight} physical pixels. `
      + (r.native ? 'One rendered pixel per display pixel. No app upscaling.' : r.scalePercent > 100 ? 'The existing image is being reduced to fit the window.' : 'The image is being enlarged to fill the window.'),
    limited
  };
}
