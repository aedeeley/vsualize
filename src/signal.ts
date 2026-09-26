import type { AudioConfig, AudioFrame, InputDiagnostics } from './types.js';
import { clamp, silentFrame } from './settings.js';

const unit = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? clamp(v) : 0;
const positive = (n: unknown): number => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0;
/** Reject a malformed native packet rather than silently displaying invented data. */
export function cleanFrame(value: unknown, target?: AudioFrame): AudioFrame | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<AudioFrame>;
  if (!Array.isArray(v.spectrum) || v.spectrum.length !== 128 || !Array.isArray(v.waveform) || v.waveform.length !== 256) return null;
  // AudioEngine reuses its owned frame. Shape validation above is atomic: an
  // invalid packet must not partly overwrite the last valid input.
  const f = target ?? silentFrame();
  for (const key of ['volume', 'bass', 'mid', 'treble', 'beat', 'desktopLevel', 'microphoneLevel'] as const) f[key] = unit(v[key]);
  for (let i = 0; i < 128; i++) f.spectrum[i] = unit(v.spectrum[i]);
  for (let i = 0; i < 256; i++) {
    const n = v.waveform[i];
    f.waveform[i] = typeof n === 'number' && Number.isFinite(n) ? clamp(n, -1, 1) : 0;
  }
  f.desktopStatus = typeof v.desktopStatus === 'string' ? v.desktopStatus : 'Unknown device status';
  f.microphoneStatus = typeof v.microphoneStatus === 'string' ? v.microphoneStatus : 'Unknown device status';
  for (const key of ['desktopInput', 'microphoneInput'] as const) {
    const input = v[key];
    if (input && typeof input === 'object') {
      const clean = f[key] ?? { rawRms: 0, packetAgeMs: null, packets: 0, sampleRate: 0, channels: 0, gated: false };
      clean.rawRms = unit(input.rawRms);
      clean.packetAgeMs = input.packetAgeMs == null ? null : positive(input.packetAgeMs);
      clean.packets = positive(input.packets); clean.sampleRate = positive(input.sampleRate);
      clean.channels = positive(input.channels); clean.gated = input.gated === true;
      f[key] = clean;
    } else f[key] = undefined;
  }
  return f;
}

export type SignalKind = 'live' | 'quiet' | 'gated' | 'connecting' | 'error' | 'partial' | 'demo' | 'off';
export interface SignalStatus { kind: SignalKind; title: string; detail: string; live: boolean }
export function describeSignal(config: AudioConfig, frame: AudioFrame, error = ''): SignalStatus {
  const result = (kind: SignalKind, title: string, detail: string, live = false): SignalStatus => ({ kind, title, detail, live });
  if (config.mode === 'demo') return result('demo', 'DEMO · not your music', 'Synthetic test signal. Select Desktop or Mic to respond to real sound.');
  if (config.mode === 'off') return result('off', 'Audio stopped', 'Choose an audio source. No sound is being captured.');
  if (error) return result('error', 'Capture error', error);
  const sources = [
    ...(config.mode === 'desktop' || config.mode === 'both' ? [{ name: 'Desktop', status: frame.desktopStatus, input: frame.desktopInput, gain: config.desktopGain }] : []),
    ...(config.mode === 'microphone' || config.mode === 'both' ? [{ name: 'Mic', status: frame.microphoneStatus, input: frame.microphoneInput, gain: config.microphoneGain }] : [])
  ];
  const failures = sources.filter(s => s.status.startsWith('Error:'));
  const audible = frame.volume > 0.006;
  if (failures.length) return result(audible ? 'partial' : 'error', audible ? 'Partial capture' : 'Capture error', failures.map(s => `${s.name}: ${s.status.replace(/^Error:\s*/, '')}`).join(' '), audible);
  const label = config.mode === 'both' ? 'Desktop + Mic' : config.mode === 'desktop' ? 'Desktop' : 'Mic';
  if (audible) return result('live', `LIVE · ${label}`, 'Receiving real audio. Pause playback to verify that the meters settle.', true);
  if (sources.some(s => /Connecting|Stopped/.test(s.status))) return result('connecting', 'Connecting to audio', 'Opening the selected device. No demo signal will be substituted.');
  if (sources.some(s => s.input?.gated)) return result('gated', 'Sound below threshold', 'The raw input is active, but the silence threshold is blocking it. Lower Silence threshold below.');
  if (sources.some(s => (s.input?.rawRms ?? 0) > 0.00001 && s.gain === 0)) return result('gated', 'Input contribution is zero', 'Sound is arriving, but its contribution is set to 0. Increase the source contribution below.');
  return result('quiet', 'No sound detected', config.mode === 'microphone' ? 'Speak or clap. Check the selected microphone and its input level.' : 'Play music. Select the output device your player actually uses, then try Reconnect.');
}
export function formatRawLevel(input?: InputDiagnostics): string {
  if (!input || input.packetAgeMs === null) return 'No samples';
  if (input.rawRms <= 0.0000158) return 'Silence';
  return `${(20 * Math.log10(input.rawRms)).toFixed(1)} dBFS`;
}
export function rawMeterValue(input?: InputDiagnostics): number {
  if (!input || input.rawRms <= 0) return 0;
  return clamp((20 * Math.log10(input.rawRms) + 72) / 72);
}
