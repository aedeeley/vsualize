import type { AudioConfig, AudioFrame, AudioMode } from './types.js';
import { clamp, demoFrame, silentFrame } from './settings.js';
import { cleanFrame } from './signal.js';
import { isNative, startNativeAudio, stopNativeAudio } from './native.js';

/** Native capture owns device/FFT work; browser preview supports an explicitly chosen mic. */
export class AudioEngine {
  frame = silentFrame();
  mode: AudioMode = 'off';
  error = '';
  ticks = 0;
  private generation = 0;
  private pending: Promise<void> = Promise.resolve();
  private lastNativeFrame = 0;
  private stream?: MediaStream;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private frequencies?: Float32Array<ArrayBuffer>;
  private samples?: Float32Array<ArrayBuffer>;
  private frequencyBins = new Uint16Array(128);
  private config?: AudioConfig;
  private previous = 0;
  private beatEnvelope = 0;
  private lastBeat = 0;

  /** Stop accepting the old source immediately while UI slider changes debounce. */
  invalidateForRestart(config: AudioConfig): void {
    this.generation++; this.mode = 'off'; this.error = ''; this.frame = silentFrame();
    this.frame.desktopStatus = ['desktop', 'both'].includes(config.mode) ? 'Connecting…' : 'Not selected';
    this.frame.microphoneStatus = ['microphone', 'both'].includes(config.mode) ? 'Connecting…' : 'Not selected';
  }

  start(config: AudioConfig): Promise<void> {
    const token = ++this.generation;
    const selected = { ...config };
    this.mode = selected.mode; this.error = ''; this.frame = silentFrame();
    // Serialize stop/start. Rapid source changes must never stop a newer session.
    this.pending = this.pending.catch(() => {}).then(async () => {
      if (token !== this.generation) return;
      this.config = selected;
      this.previous = 0; this.beatEnvelope = 0; this.lastBeat = 0;
      try {
        await this.closeBrowser();
        await stopNativeAudio();
        if (token !== this.generation) return;
        if (selected.mode === 'demo' || selected.mode === 'off') return;
        this.frame.desktopStatus = ['desktop', 'both'].includes(selected.mode) ? 'Connecting…' : 'Not selected';
        this.frame.microphoneStatus = ['microphone', 'both'].includes(selected.mode) ? 'Connecting…' : 'Not selected';
        this.lastNativeFrame = performance.now();
        if (isNative) {
          await startNativeAudio(selected, value => {
            if (token !== this.generation) return;
            const frame = cleanFrame(value, this.frame);
            if (!frame) { this.error = 'Invalid audio packet. Rebuild the desktop app, then reconnect.'; this.clearEnergy(); return; }
            this.error = ''; this.frame = frame; this.lastNativeFrame = performance.now();
          });
          if (token !== this.generation) await stopNativeAudio();
        } else if (selected.mode === 'microphone') {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs a supported browser. Use the Windows app for desktop audio.');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: selected.microphoneDevice ? { exact: selected.microphoneDevice } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
          if (token !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
          this.stream = stream;
          this.context = new AudioContext({ latencyHint: 'interactive' });
          await this.context.resume();
          if (token !== this.generation) { await this.closeBrowser(); return; }
          this.analyser = this.context.createAnalyser();
          // Structural smoothing belongs to MotionDriver; capture should retain
          // fresh transients instead of adding another independent low-pass stage.
          this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0;
          this.context.createMediaStreamSource(stream).connect(this.analyser);
          // Never connect capture to audio output: no mic feedback or echo.
          this.frequencies = new Float32Array(this.analyser.frequencyBinCount);
          this.samples = new Float32Array(this.analyser.fftSize);
          for (let i = 0; i < 128; i++) this.frequencyBins[i] = Math.round(30 * (16000 / 30) ** (i / 127) * this.analyser.fftSize / this.context.sampleRate);
          stream.getTracks().forEach(track => track.addEventListener('ended', () => {
            if (token === this.generation) { this.error = 'Microphone disconnected. Use Audio → Reconnect.'; this.clearEnergy(); }
          }));
        } else {
          throw new Error('Desktop and combined capture require vsualize.exe. This browser preview cannot hear desktop audio.');
        }
      } catch (error) {
        if (token !== this.generation) return;
        this.error = error instanceof Error ? error.message : String(error);
        this.clearEnergy();
        this.frame.desktopStatus = `Error: ${this.error}`;
        this.frame.microphoneStatus = `Error: ${this.error}`;
        await this.closeBrowser();
      }
    });
    return this.pending;
  }

  private clearEnergy(): void {
    const f = this.frame;
    f.volume = f.bass = f.mid = f.treble = f.beat = f.desktopLevel = f.microphoneLevel = 0;
    f.spectrum.fill(0); f.waveform.fill(0);
    f.desktopInput = f.microphoneInput = undefined;
  }

  tick(now: number, dt: number): AudioFrame {
    this.ticks++;
    if (this.mode === 'demo') return this.frame = demoFrame(now / 1000);
    if (this.mode === 'off' || this.error) { this.clearEnergy(); return this.frame; }
    if (this.analyser && this.frequencies && this.samples && this.context && this.config) {
      const f = this.frame;
      this.analyser.getFloatFrequencyData(this.frequencies);
      this.analyser.getFloatTimeDomainData(this.samples);
      const gain = this.config.microphoneGain * this.config.sensitivity;
      const rms = Math.sqrt(this.samples.reduce((s, v) => s + v * v, 0) / this.samples.length);
      const open = rms > this.config.noiseGate;
      f.volume = open ? clamp(Math.sqrt(rms * gain) * 1.8) : 0;
      for (let i = 0; i < 128; i++) {
        const idx = this.frequencyBins[i] ?? 0;
        const db = this.frequencies[idx] ?? -100;
        f.spectrum[i] = open ? clamp((db + 72) / 65 * gain) : 0;
      }
      const average = (a: number, b: number) => {
        let total = 0;
        for (let i = a; i < b; i++) total += f.spectrum[i] ?? 0;
        return total / (b - a);
      };
      f.bass = average(5, 44); f.mid = average(44, 89); f.treble = average(89, 125);
      for (let i = 0; i < 256; i++) f.waveform[i] = open ? clamp((this.samples[i * 8] ?? 0) * gain, -1, 1) : 0;
      const flux = Math.max(0, f.bass - this.previous);
      if (flux > 0.065 && now - this.lastBeat > 200) { this.beatEnvelope = clamp(flux * 6); this.lastBeat = now; }
      this.previous += (f.bass - this.previous) * (1 - Math.exp(-dt * 5));
      this.beatEnvelope *= Math.exp(-dt * 7);
      f.microphoneInput = { rawRms: rms, packetAgeMs: 0, packets: 1, sampleRate: this.context.sampleRate, channels: 1, gated: rms > 0 && !open };
      f.beat = this.beatEnvelope; f.microphoneLevel = f.volume; f.microphoneStatus = 'Listening (browser microphone)';
      this.frame = f;
    } else if (isNative && now - this.lastNativeFrame > 600) {
      const decay = Math.exp(-dt * 8);
      this.frame.desktopLevel *= decay; this.frame.microphoneLevel *= decay;
      this.frame.volume *= decay; this.frame.bass *= decay; this.frame.mid *= decay; this.frame.treble *= decay; this.frame.beat *= decay;
      for (let i = 0; i < this.frame.spectrum.length; i++) this.frame.spectrum[i] = (this.frame.spectrum[i] ?? 0) * decay;
      for (let i = 0; i < this.frame.waveform.length; i++) this.frame.waveform[i] = (this.frame.waveform[i] ?? 0) * decay;
      if (now - this.lastNativeFrame > 3000) { this.error = 'Audio engine is not responding. Use Audio → Reconnect.'; this.clearEnergy(); }
    }
    return this.frame;
  }
  private async closeBrowser(): Promise<void> {
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
    if (this.context) { try { await this.context.close(); } catch { /* Already closed. */ } }
    this.context = undefined; this.analyser = undefined;
  }
  /** Invalidate immediately; never wait for a pending microphone permission dialog. */
  async stop(): Promise<void> {
    this.generation++; this.mode = 'off'; this.error = ''; this.frame = silentFrame();
    await Promise.all([this.closeBrowser(), stopNativeAudio()]);
  }
  async destroy(): Promise<void> { await this.stop(); }
}
