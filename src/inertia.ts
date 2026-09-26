import { clamp } from './settings.js';
import type { MotionState } from './motion.js';
const BAND_KEYS = ['bass', 'mid', 'treble', 'volume', 'impact'] as const;
const ATTACK_BASE = [0.028, 0.025, 0.018, 0.018, 0.012] as const;
const ATTACK_SMOOTHING = [0.024, 0.024, 0.020, 0.018, 0.018] as const;
const RELEASE_BASE = [0.12, 0.12, 0.07, 0.08, 0.07] as const;
const RELEASE_SMOOTHING = [0.32, 0.40, 0.20, 0.20, 0.20] as const;
const clean = (n: number): number => Number.isFinite(n) ? clamp(n) : 0;

/** Analytic critically damped follower. No spring overshoot, no frame-count lerp. */
export class DampedValue {
  value = 0;
  velocity = 0;
  reset(value = 0): void { this.value = value; this.velocity = 0; }
  update(target: number, delta: number, seconds: number): number {
    target = Number.isFinite(target) ? target : 0;
    const dt = Number.isFinite(delta) ? clamp(delta, 0, 0.1) : 0;
    if (!dt) return this.value;
    const omega = 2 / Math.max(0.02, seconds), offset = this.value - target;
    const v = this.velocity + omega * offset, decay = Math.exp(-omega * dt);
    const next = target + (offset + v * dt) * decay;
    this.velocity = (this.velocity - omega * v * dt) * decay;
    // A moving target can cross existing momentum. Stop at it instead of bouncing.
    if (offset !== 0 && (next - target) * offset < 0) { this.value = target; this.velocity = 0; }
    else this.value = next;
    return this.value;
  }
}

/** Fast attacks keep the picture with the sound; releases retain visual inertia.
 * Never feed unsynchronised PCM snapshots into camera/fractal coordinates. */
export class VisualInertia {
  private bands = { bass: new DampedValue(), mid: new DampedValue(), treble: new DampedValue(), volume: new DampedValue(), impact: new DampedValue() };
  private bins = Array.from({ length: 128 }, () => new DampedValue());
  readonly spectrum = new Float32Array(128);
  readonly value = { bass: 0, mid: 0, treble: 0, volume: 0, impact: 0 };
  reset(): void {
    for (const key of BAND_KEYS) this.bands[key].reset();
    for (const b of this.bins) b.reset();
    this.spectrum.fill(0);
    for (const key of BAND_KEYS) this.value[key] = 0;
  }
  update(state: MotionState, spectrum: Float32Array, dt: number, amount = 0.75): typeof this.value {
    const a = Number.isFinite(amount) ? clamp(amount) : 0.75;
    for (let i = 0; i < BAND_KEYS.length; i++) {
      const key = BAND_KEYS[i]!;
      const target = Number.isFinite(state[key]) ? clamp(state[key]) : 0;
      const seconds = target > this.value[key]
        ? ATTACK_BASE[i]! + ATTACK_SMOOTHING[i]! * a
        : RELEASE_BASE[i]! + RELEASE_SMOOTHING[i]! * a;
      this.value[key] = this.bands[key].update(target, dt, seconds);
    }
    for (let i = 0; i < 128; i++) {
      // Small spatial smoothing, not a broad blur that erases isolated notes.
      const target = clean(spectrum[i] ?? 0)*0.60 + clean(spectrum[Math.max(0,i-1)] ?? 0)*0.20 + clean(spectrum[Math.min(127,i+1)] ?? 0)*0.20;
      this.spectrum[i] = this.bins[i]!.update(target, dt, target > this.spectrum[i]! ? 0.025 + a*0.018 : 0.065 + a*0.17);
    }
    return this.value;
  }
}

export const IMPULSE_COUNT = 24;
export const IMPULSE_LIFETIME = 4.8;
/** Ring slots may not overwrite a still-visible wave just because hats are busy. */
export class ImpulseHistory {
  readonly data = new Float32Array(IMPULSE_COUNT * 4);
  private serial = 0;
  private last = -100;
  constructor() { this.reset(); }
  reset(): void { this.data.fill(0); for (let i=0;i<IMPULSE_COUNT;i++) this.data[i*4]=-100; this.last=-100; }
  push(clock: number, strength: number): boolean {
    if (!Number.isFinite(clock) || !Number.isFinite(strength) || strength <= 0 || clock-this.last < 0.12) return false;
    for (let i=0;i<IMPULSE_COUNT;i++) {
      const age=clock-this.data[i*4]!;
      if (age < IMPULSE_LIFETIME) continue;
      this.serial++;
      this.data.set([clock,clamp(strength),Math.sin(this.serial*2.399)*0.85,Math.cos(this.serial*2.399)*0.7],i*4);
      this.last=clock; return true;
    }
    return false; // Keep the existing waves intact; fast light accents still run.
  }
}
