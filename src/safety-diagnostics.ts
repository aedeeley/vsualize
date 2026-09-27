import { invoke, isNative } from './native.js';
import type { Renderer } from './renderer.js';
import type { AudioEngine } from './audio.js';
import type { SessionController } from './session.js';
import type { Settings } from './types.js';

/** Only an opt-in diagnostic native build enables sampling; production returns false. */
export async function initializeSafetyDiagnostics(session: SessionController, renderer: Renderer, audio: AudioEngine, settings: Settings): Promise<void> {
  if (!isNative || !await invoke<boolean>('safety_diagnostics', { sample: null }).catch(() => false)) return;
  const timer = window.setInterval(() => {
    const resolution = renderer.resolution;
    void invoke<boolean>('safety_diagnostics', { sample: {
      phase: session.phase, frames: renderer.frames, ...renderer.diagnostics, audioTicks: audio.ticks,
      hidden: document.hidden, fps: settings.fps,
      width: resolution?.actualWidth ?? 0, height: resolution?.actualHeight ?? 0,
    } }).then(enabled => { if (!enabled) clearInterval(timer); }).catch(() => clearInterval(timer));
  }, 1000);
  window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
}
