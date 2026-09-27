import type { Settings } from './types.js';
import { glowStrength, migrateGlow } from './visual-presets.js';

/** A rendering overlay: the user's profiles and exported artwork stay intact. */
export function gentleSettings(settings: Settings): Settings {
  if (!settings.gentlerVisuals) return settings;
  return { ...settings, intensity: settings.intensity * 0.5,
    // Convert half of effective glow back through the nonlinear control curve.
    glow: inverseGlow(glowStrength(settings.glow) * 0.5),
    motion: 0, idleMotion: false, gentlePeaks: true };
}
function inverseGlow(value: number): number {
  if (value <= 1) return migrateGlow(value);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (glowStrength(mid) < value) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
