import type { AudioFrame, Settings } from './types.js';
import { clamp } from './settings.js';
import { ResponseAnalyzer } from './response.js';
import { FIXED_SMOOTHNESS, resolveVisualControls } from './visual-presets.js';

export interface MotionState {
  /** Accumulated positions, never wall-time multiplied by instantaneous volume. */
  time: number; clock: number; travel: number; turn: number; flow: number; colorShift: number;
  speed: number; sleeping: boolean; accent: number;
  volume: number; bass: number; mid: number; treble: number; beat: number;
  bassHit: number; midHit: number; trebleHit: number;
  event: boolean; eventStrength: number; impact: number;
}
const finite = (value: number): number => Number.isFinite(value) ? clamp(value) : 0;
const follow = (current: number, target: number, dt: number, attack: number, release: number): number =>
  current + (target - current) * (1 - Math.exp(-dt / (target > current ? attack : release)));

/**
 * Shared musical transport. Audio changes velocity; integrated positions retain
 * their progress after a beat. No BPM is guessed and silence creates no onsets.
 * The attack/release envelopes preserve transients between native audio packets.
 */
export class MotionDriver {
  audioRevision = 0;
  readonly state: MotionState = {
    time: 0, clock: 0, travel: 0, turn: 0, flow: 0, colorShift: 0, speed: 0, sleeping: true, accent: 0,
    volume: 0, bass: 0, mid: 0, treble: 0, beat: 0,
    bassHit: 0, midHit: 0, trebleHit: 0, event: false, eventStrength: 0, impact: 0
  };
  private elapsed = 0;
  private silentFor = 1;
  private lastEvent = -100;
  private previousBeat = 0;
  readonly response = new ResponseAnalyzer();
  private pulse = 0;
  private velocities = { time: 0, travel: 0, turn: 0, flow: 0, colorShift: 0 };

  /** Clear input history on device/source changes without rewinding the scene. */
  resetAudio(): void {
    this.audioRevision++;
    this.response.reset();
    this.previousBeat = 0; this.pulse = 0;
    this.lastEvent = this.elapsed;
    this.silentFor = 1;
    for (const key of ['volume', 'bass', 'mid', 'treble', 'beat', 'bassHit', 'midHit', 'trebleHit'] as const) this.state[key] = 0;
    this.state.event = false; this.state.eventStrength = 0; this.state.impact = 0;
  }

  update(audio: AudioFrame, settings: Settings, delta: number): MotionState {
    const dt = Number.isFinite(delta) ? clamp(delta, 0, 0.1) : 0;
    const s = this.state;
    s.event = false; s.eventStrength = 0;
    if (!dt) return s;
    this.elapsed += dt;
    const volume = finite(audio.volume), audible = volume > 0.002;
    const controls = resolveVisualControls(settings.visual, settings);
    const response = controls.response;
    const features = this.response.update(audio, dt);
    this.silentFor = audible ? 0 : this.silentFor + dt;
    s.sleeping = !settings.idleMotion && this.silentFor >= 1.6;
    if (s.sleeping) {
      for (const key of ['volume', 'bass', 'mid', 'treble', 'beat', 'bassHit', 'midHit', 'trebleHit', 'accent', 'speed', 'impact'] as const) s[key] = 0;
      for (const key of Object.keys(this.velocities) as (keyof typeof this.velocities)[]) this.velocities[key] = 0;
      this.previousBeat = 0; this.pulse = 0;
      this.response.value.spectrum.fill(0);
      return s;
    }
    s.volume = follow(s.volume, volume, dt, 0.012, 0.16);
    for (const key of ['bass', 'mid', 'treble', 'bassHit', 'midHit', 'trebleHit'] as const) s[key] = features[key];
    const nativeBeat = audible ? finite(audio.beat) : 0;
    const nativeOnset = nativeBeat > 0.18 && nativeBeat - this.previousBeat > 0.08;
    const spectralOnset = features.lowOnset || features.midOnset || features.highOnset;
    if (audible && this.elapsed - this.lastEvent >= 0.10 && (nativeOnset || spectralOnset)) {
      s.event = true;
      s.eventStrength = clamp(Math.max(nativeOnset ? nativeBeat : 0, features.strength));
      this.pulse = Math.max(this.pulse, s.eventStrength);
      this.lastEvent = this.elapsed;
    }
    this.previousBeat = nativeBeat;
    this.pulse *= Math.exp(-dt / 0.16);
    // Geometry keeps its full attack even when exposure flashes are softened.
    s.impact = Math.max(s.bassHit, s.midHit * 0.60, s.trebleHit * 0.20, this.pulse * 0.60);
    // Gentle peaks affects flashes only, not the music's forward momentum.
    s.beat = Math.max(this.pulse, nativeBeat * 0.7) * (settings.gentlePeaks ? 0.45 : 1);
    // Exposure accents are bounded, not full-screen strobes. Gentle peaks stays on.
    s.accent = clamp(response * (s.volume * 0.12 + s.bass * 0.08 + Math.max(s.bassHit, s.midHit, s.trebleHit) * (settings.gentlePeaks ? 0.09 : 0.20) + s.beat * 0.12));
    const active = audible || s.volume > 0.004;
    const idle = settings.idleMotion ? 1 : 0;
    const v = active ? s.volume : 0, b = active ? s.bass : 0, m = active ? s.mid : 0, h = active ? s.treble : 0;
    const thrust = this.pulse * response;
    const targets = {
      time: idle * 0.42 + (active ? 0.30 : 0) + response * (v * 1.9 + b * 0.8 + m * 0.45) + thrust * 0.8,
      travel: idle * 0.14 + (active ? 0.22 : 0) + response * (v * 0.85 + b * 1.15) + thrust * 1.5,
      turn: idle * 0.04 + (active ? 0.025 : 0) + response * (m * 0.20 + h * 0.035),
      flow: idle * 0.20 + (active ? 0.12 : 0) + response * (m * 1.1 + b * 0.3 + h * 0.4),
      colorShift: idle * 0.006 + response * (h * 0.026 + s.trebleHit * 0.010)
    };
    const motion = controls.speed;
    const smoothing = FIXED_SMOOTHNESS;
    const rates = { time: 5 - smoothing * 2.5, travel: 6 - smoothing * 3.5, turn: 2.5 - smoothing, flow: 3.5 - smoothing * 1.8, colorShift: 2 - smoothing };
    // Ease toward rest during silence, rather than cutting velocity at 0.8 s.
    const coast = settings.idleMotion ? 1 : 1 - clamp((this.silentFor - 0.65) / 0.95);
    for (const key of Object.keys(targets) as (keyof typeof targets)[]) targets[key] *= coast;
    for (const key of ['time', 'travel', 'turn', 'flow', 'colorShift'] as const) {
      const old = this.velocities[key], target = targets[key];
      // Every attack responds promptly; Reaction changes how quickly movement
      // catches and releases the sound without multiplying its musical clock.
      const rate = target > old ? 40 * Math.max(1, controls.reactionRate) : rates[key] * controls.reactionRate;
      const decay = Math.exp(-rate * dt);
      // Exact integration of the eased velocity for this timestep. Importantly,
      // releasing bass never subtracts the distance gained during a bass hit.
      const distance = target * dt + (old - target) * (1 - decay) / rate;
      this.velocities[key] = target + (old - target) * decay;
      s[key] += Math.max(0, distance) * motion;
    }
    // Impulse timestamps and their refractory periods are measured in seconds.
    s.clock += dt;
    s.speed = this.velocities.travel * motion;
    return s;
  }
}
