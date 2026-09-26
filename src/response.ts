import type { AudioFrame } from './types.js';
import { clamp } from './settings.js';

const N = 128;
const names = ['bass', 'mid', 'treble'] as const;
type Band = typeof names[number];
const ranges: Record<Band, [number, number]> = { bass: [5, 44], mid: [44, 89], treble: [89, 125] };
const clean = (n: number): number => Number.isFinite(n) ? clamp(n) : 0;
const follow = (v: number, t: number, dt: number, tau: number): number => v + (t - v) * (1 - Math.exp(-dt / tau));

/** Inverse of the native display_spectrum curve. Recover amplitude contrast
 * before adaptive visual scaling; adding gain to a dB display just flattens it.
 * Values already clipped by the native display cannot be reconstructed. */
export function spectralAmplitude(display: number): number {
  const v = clean(display);
  return v > 0 ? 10 ** ((v * 65 - 72) / 20) : 0;
}

export interface MusicResponse {
  bass: number; mid: number; treble: number;
  bassHit: number; midHit: number; trebleHit: number;
  spectrum: Float32Array;
  /** Independent low/mid/high attacks, NOT an instrument or tempo classifier. */
  lowOnset: boolean; midOnset: boolean; highOnset: boolean;
  strength: number;
}

/** Render-rate-independent envelopes over held or fresh native packets.
 * A floor and bounded gain preserve silence instead of turning noise into music.
 * Sustain shapes the scene; positive changes create short, separate accents. */
export class ResponseAnalyzer {
  readonly value: MusicResponse = {
    bass: 0, mid: 0, treble: 0, bassHit: 0, midHit: 0, trebleHit: 0,
    spectrum: new Float32Array(N), lowOnset: false, midOnset: false, highOnset: false, strength: 0
  };
  private time = 0;
  private peaks = { bass: 0.025, mid: 0.025, treble: 0.025 };
  private average = { bass: 0.01, mid: 0.01, treble: 0.01 };
  private previous = { bass: 0, mid: 0, treble: 0 };
  private last = { bass: -10, mid: -10, treble: -10 };
  private hit = { bass: 0, mid: 0, treble: 0 };
  private binPeak = new Float32Array(N).fill(0.012);
  private binPrevious = new Float32Array(N);

  reset(): void {
    this.peaks = { bass: 0.025, mid: 0.025, treble: 0.025 };
    this.average = { bass: 0.01, mid: 0.01, treble: 0.01 };
    this.previous = { bass: 0, mid: 0, treble: 0 };
    this.last = { bass: this.time - 10, mid: this.time - 10, treble: this.time - 10 };
    this.hit = { bass: 0, mid: 0, treble: 0 };
    this.binPeak.fill(0.012); this.binPrevious.fill(0);
    for (const k of ['bass', 'mid', 'treble', 'bassHit', 'midHit', 'trebleHit'] as const) this.value[k] = 0;
    this.value.spectrum.fill(0);
    this.value.lowOnset = this.value.midOnset = this.value.highOnset = false;
    this.value.strength = 0;
  }

  update(audio: AudioFrame, delta: number): MusicResponse {
    const dt = Number.isFinite(delta) ? clamp(delta, 0, 0.1) : 0;
    const out = this.value;
    out.lowOnset = out.midOnset = out.highOnset = false; out.strength = 0;
    if (!dt) return out;
    this.time += dt;
    const audible = clean(audio.volume) > 0.002;
    const flux = { bass: 0, mid: 0, treble: 0 };
    const power = { bass: 0, mid: 0, treble: 0 };
    for (let i = 0; i < N; i++) {
      const raw = audible ? clean(audio.spectrum[i] ?? 0) : 0;
      const amp = spectralAmplitude(raw);
      this.binPeak[i] = Math.max(0.008, amp, this.binPeak[i]! * Math.exp(-dt / 3.0));
      const scale = Math.max(0.010, this.binPeak[i]! * 1.15 + 0.004);
      const rise = Math.max(0, amp - this.binPrevious[i]!) / scale;
      for (const k of names) if (i >= ranges[k][0] && i < ranges[k][1]) {
        const count = ranges[k][1] - ranges[k][0];
        flux[k] += rise / count;
        power[k] += amp * amp / count;
      }
      this.binPrevious[i] = amp;
      const target = audible ? clamp(0.12 * raw + 0.88 * amp / scale) : 0;
      const current = out.spectrum[i]!;
      out.spectrum[i] = follow(current, target, dt, target > current ? 0.010 : 0.070);
    }
    for (const k of names) {
      // RMS of spectral amplitudes preserves narrow notes. Averaging log-display
      // bins first diluted isolated bass notes into almost nothing. The packet
      // summary is only a floor for sources with incomplete spectral data.
      const raw = audible ? Math.max(Math.sqrt(power[k]), spectralAmplitude(audio[k])) : 0;
      this.peaks[k] = Math.max(0.010, raw, this.peaks[k] * Math.exp(-dt / 3.0));
      const target = clamp(raw / (0.007 + this.peaks[k] * 1.15));
      out[k] = follow(out[k], target, dt, target > out[k] ? 0.010 : 0.080);
      const rise = Math.max(0, raw - this.previous[k]) / Math.max(0.005, this.average[k] * 0.65);
      const novelty = Math.max(rise, flux[k] * 3.2);
      const refractory = k === 'bass' ? 0.13 : k === 'mid' ? 0.10 : 0.075;
      const event = audible && novelty > 0.20 && this.time - this.last[k] >= refractory;
      const key = `${k}Hit` as 'bassHit' | 'midHit' | 'trebleHit';
      const tau = k === 'bass' ? 0.16 : k === 'mid' ? 0.115 : 0.065;
      if (event) {
        const strength = clamp(novelty * 0.80);
        this.hit[k] = Math.max(this.hit[k], strength);
        out[k === 'bass' ? 'lowOnset' : k === 'mid' ? 'midOnset' : 'highOnset'] = true;
        out.strength = Math.max(out.strength, strength);
        this.last[k] = this.time;
      }
      // Mean over the rendered interval gives short hits equal area at 30/60/120 Hz.
      out[key] = this.hit[k] * tau / dt * (1 - Math.exp(-dt / tau));
      this.hit[k] *= Math.exp(-dt / tau);
      this.average[k] = follow(this.average[k], raw, dt, 1.25);
      this.previous[k] = raw;
      if (!audible && out[k] < 0.00005) out[k] = 0;
      if (out[key] < 0.00005) out[key] = 0;
    }
    return out;
  }
}
