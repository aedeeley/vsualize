import type { AudioFrame, Settings, VisualId } from './types.js';
import { PALETTES, clamp, hexRGB } from './settings.js';
import { VISUALS } from './visuals/index.js';
import { ColorCycle } from './colors.js';
import { MotionDriver } from './motion.js';
import { VisualInertia, ImpulseHistory } from './inertia.js';
import { VERTEX } from './visuals/common.js';
import { planResolution, reportResolution } from './resolution.js';
import type { RenderLimits, ResolutionReport } from './resolution.js';
import { AdaptiveQuality } from './performance.js';
import { makeRippleField } from './ripple-field.js';
import { FIXED_SMOOTHNESS, resolveVisualControls } from './visual-presets.js';

interface Program { value: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> }
interface PendingProgram { value: WebGLProgram; fragment: WebGLShader }
interface ParallelCompile { COMPLETION_STATUS_KHR: number }
interface TimerQuery { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
const DRIVE_UNIFORMS = ['clock', 'travel', 'turn', 'flow', 'colorShift', 'speed', 'bassHit', 'midHit', 'trebleHit'] as const;
const DRIVE_NAMES = ['uClock', 'uTravel', 'uTurn', 'uFlow', 'uColorShift', 'uSpeed', 'uBassHit', 'uMidHit', 'uTrebleHit'] as const;
const BAND_KEYS = ['bass', 'mid', 'treble', 'volume', 'beat'] as const;
const BAND_NAMES = ['uBass', 'uMid', 'uTreble', 'uVolume', 'uBeat'] as const;
const COLOR_NAMES = ['uColorA', 'uColorD', 'uColorB', 'uColorE', 'uColorC'] as const;
const DETAIL = { auto: 0.6, low: 0.15, medium: 0.6, high: 1 };
const PALETTE_RGB = Object.fromEntries(Object.entries(PALETTES).map(([id, p]) => [id, p.colors.map(hexRGB)]));
export class Renderer {
  frames = 0;
  paused = false;
  private gl: WebGL2RenderingContext;
  private programs = new Map<VisualId, Program>();
  private pendingPrograms = new Map<VisualId, PendingProgram>();
  private vertex: WebGLShader | null = null;
  private parallel: ParallelCompile | null = null;
  private timer: TimerQuery | null = null;
  private query: WebGLQuery | null = null;
  private queryPending = false;
  private queryKey = '';
  private timingFrames = 0;
  private timingElapsed = 0;
  private gpuMilliseconds: number | null = null;
  private autoQuality = new AdaptiveQuality();
  private performanceKey = '';
  private sleepingFrameKey = '';
  private warmTimer = 0;
  private destroyed = false;
  private spectrum: WebGLTexture;
  private waveform: WebGLTexture;
  private history: WebGLTexture;
  private rippleField: WebGLTexture;
  private rippleBytes = new Float32Array(128 * 4);
  private emptyHistory = new Uint8Array(128 * 64 * 4);
  private emptyRipple = new Float32Array(128 * 64 * 4);
  private spectrumBytes = new Uint8Array(128 * 4);
  private waveformBytes = new Uint8Array(256 * 4);
  private historyHead = 0;
  private historyElapsed = 0;
  private impulseHistory = new ImpulseHistory();
  private impulses = this.impulseHistory.data;
  readonly inertia = new VisualInertia();
  private audioRevision = 0;
  private lastImpulse = -10;
  readonly motion = new MotionDriver();
  private lost = false;
  private colorCycle = new ColorCycle();
  /** Read-only palette values for the menu's five live color chips. */
  get palettePreview(): ReadonlyArray<Readonly<[number, number, number]>> { return this.colorCycle.colors; }
  private feedback: { texture: WebGLTexture; framebuffer: WebGLFramebuffer }[] = [];
  private feedbackIndex = 0;
  private feedbackDrawn = false;
  private feedbackKey = '';
  private emptyFeedback: WebGLTexture;
  private feedbackContentKey = '';
  private backgroundKey = '';
  private backgroundRGB = hexRGB('#000000');
  private onError: (message: string) => void;
  private limits!: RenderLimits;
  private textureLimit = 16384;
  private resolutionState: ResolutionReport | null = null;
  get resolution(): Readonly<ResolutionReport> | null {
    if (!this.resolutionState) return null;
    // Pausing freezes the image, not the size of its on-screen destination.
    // Never call a frozen low-resolution frame "Native" after a fullscreen resize.
    const bounds = this.canvas.getBoundingClientRect();
    const current = planResolution(bounds.width, bounds.height, window.devicePixelRatio, 'high', false);
    return reportResolution({ ...this.resolutionState, nativeWidth: current.nativeWidth, nativeHeight: current.nativeHeight },
      this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
  }
  private lastLimitNotice = '';
  /** Measurements describe this renderer, not total system GPU utilization. */
  get performance(): { gpuMilliseconds: number | null; adaptiveScale: number; cachedEffects: number } {
    return { gpuMilliseconds: this.gpuMilliseconds, adaptiveScale: this.autoQuality.scale, cachedEffects: this.programs.size };
  }


  constructor(private canvas: HTMLCanvasElement, onError: (message: string) => void) {
    this.onError = onError;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL 2 is not available. Enable hardware acceleration or update your graphics driver.');
    this.gl = gl;
    this.readLimits();
    this.emptyFeedback = this.texture(1, 1);
    this.spectrum = this.texture(128, 1);
    this.waveform = this.texture(256, 1);
    this.history = this.texture(128, 64);
    this.rippleField = this.createRippleTexture();
    this.readExtensions();
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; onError('Graphics context lost. Trying to restore it…'); });
    canvas.addEventListener('webglcontextrestored', () => {
      this.readLimits(); this.resolutionState = null; this.programs.clear(); this.pendingPrograms.clear(); this.vertex = null;
      this.feedback = []; this.feedbackKey = ''; this.feedbackContentKey = ''; this.feedbackIndex = 0; this.feedbackDrawn = false;
      this.emptyFeedback = this.texture(1, 1); this.spectrum = this.texture(128, 1); this.waveform = this.texture(256, 1);
      this.history = this.texture(128, 64); this.rippleField = this.createRippleTexture();
      this.historyHead = 0; this.historyElapsed = 0; this.motion.resetAudio(); this.autoQuality.reset(); this.performanceKey = ''; this.sleepingFrameKey = '';
      this.readExtensions(); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); this.lost = false;
      this.warmAll();
      onError('Graphics restored.');
    });
  }
  private readExtensions(): void {
    this.parallel = this.gl.getExtension('KHR_parallel_shader_compile') as ParallelCompile | null;
    this.timer = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQuery | null;
    this.query = this.timer ? this.gl.createQuery() : null; this.queryPending = false; this.gpuMilliseconds = null;
    this.timingFrames = 0; this.timingElapsed = 0;
  }
  private createRippleTexture(): WebGLTexture {
    const t = this.texture(128, 64);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA16F, 128, 64, 0, this.gl.RGBA, this.gl.FLOAT, this.emptyRipple);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
    return t;
  }
  private readLimits(): void {
    const gl = this.gl;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const buffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    this.textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.limits = { width: Math.min(viewport[0]!, buffer), height: Math.min(viewport[1]!, buffer) };
  }
  private texture(width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('Could not allocate a graphics texture.');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  private releaseFeedback(): void {
    for (const target of this.feedback) {
      this.gl.deleteFramebuffer(target.framebuffer); this.gl.deleteTexture(target.texture);
    }
    this.feedback = []; this.feedbackIndex = 0; this.feedbackKey = ''; this.feedbackContentKey = ''; this.feedbackDrawn = false;
  }
  private prepareFeedback(width: number, height: number, key: string): void {
    if (this.feedbackKey === key) return;
    this.releaseFeedback();
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      const texture = this.texture(width, height), framebuffer = gl.createFramebuffer();
      if (!framebuffer) { gl.deleteTexture(texture); throw new Error('Could not allocate feedback buffer.'); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture); throw new Error('Feedback buffer is incomplete.');
      }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      this.feedback.push({ texture, framebuffer });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.feedbackKey = key;
  }
  private compile(source: string, type: number): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not allocate shader.');
    gl.shaderSource(shader, source); gl.compileShader(shader);
    return shader;
  }
  /** Start compilation without reading a blocking status or uniform location. */
  prewarm(id: VisualId): void {
    if (this.destroyed || this.lost || this.programs.has(id) || this.pendingPrograms.has(id)) return;
    const gl = this.gl;
    this.vertex ??= this.compile(VERTEX, gl.VERTEX_SHADER);
    const fragment = this.compile(VISUALS[id].fragment, gl.FRAGMENT_SHADER);
    const value = gl.createProgram();
    if (!value) { gl.deleteShader(fragment); throw new Error('Could not allocate program.'); }
    gl.attachShader(value, this.vertex); gl.attachShader(value, fragment); gl.linkProgram(value);
    this.pendingPrograms.set(id, { value, fragment });
  }
  /** Compile one effect at a time so the driver can populate its shader cache.
   * Without parallel compilation, warm only on intent or first selection. */
  warmAll(): void {
    if (!this.parallel || this.destroyed) return;
    window.clearTimeout(this.warmTimer);
    const ids = Object.keys(VISUALS) as VisualId[];
    let index = 0;
    const next = (): void => {
      if (this.destroyed || this.lost || index >= ids.length) return;
      if (typeof document !== 'undefined' && document.hidden) { this.warmTimer = window.setTimeout(next, 1000); return; }
      const id = ids[index]!;
      try { if (this.program(id)) index++; }
      catch (error) { this.onError(`Could not prepare ${VISUALS[id].name}: ${String(error)}`); index++; }
      this.warmTimer = window.setTimeout(next, 120);
    };
    this.warmTimer = window.setTimeout(next, 500);
  }
  private program(id: VisualId, wait = false): Program | null {
    const cached = this.programs.get(id); if (cached) return cached;
    this.prewarm(id);
    const gl = this.gl;
    const pending = this.pendingPrograms.get(id); if (!pending) return null;
    const p = pending.value;
    if (!wait && this.parallel && !gl.getProgramParameter(p, this.parallel.COMPLETION_STATUS_KHR)) return null;
    this.pendingPrograms.delete(id);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(p) || gl.getShaderInfoLog(pending.fragment);
      gl.deleteShader(pending.fragment); gl.deleteProgram(p); throw new Error(message || 'Shader link error');
    }
    gl.detachShader(p, pending.fragment); gl.deleteShader(pending.fragment);
    const program = { value: p, uniforms: new Map<string, WebGLUniformLocation | null>() };
    this.programs.set(id, program); return program;
  }
  /** Preflight each real shader, so a bad preset cannot hide until after delivery. */
  validateAll(): void { for (const id of Object.keys(VISUALS) as VisualId[]) this.program(id, true); }

  render(audio: AudioFrame, settings: Settings, dt: number): void {
    if (this.lost || this.paused) return;
    try { this.draw(audio, settings, dt); } catch (error) {
      this.paused = true;
      this.onError(`Renderer stopped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private updateTiming(settings: Settings, dt: number): void {
    this.timingElapsed += Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    if (this.timer && this.query) {
      if (this.queryPending && this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT_AVAILABLE)) {
        this.queryPending = false;
        const disjoint = this.gl.getParameter(this.timer.GPU_DISJOINT_EXT);
        if (!disjoint && this.queryKey === this.performanceKey) {
          const milliseconds = Number(this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT)) / 1e6;
          if (Number.isFinite(milliseconds) && milliseconds > 0) {
            this.gpuMilliseconds = milliseconds;
            if (settings.quality === 'auto') this.autoQuality.observe(milliseconds, this.timingElapsed, settings.fps, true);
          }
        }
        this.timingElapsed = 0;
      }
    } else if (settings.quality === 'auto') {
      this.autoQuality.observe(dt * 1000, dt, settings.fps, false);
    }
  }
  private draw(audio: AudioFrame, settings: Settings, dt: number): void {
    const gl = this.gl;
    const program = this.program(settings.visual);
    // Keep the previous image until asynchronous compilation finishes.
    if (!program) return;
    // CSS pixels and physical pixels differ under Windows scaling. Re-evaluate
    // every frame, including after fullscreen and monitor/DPI changes.
    const bounds = this.canvas.getBoundingClientRect();
    const visual = VISUALS[settings.visual];
    const controls = resolveVisualControls(settings.visual, settings);
    const performanceKey = `${settings.visual}/${settings.quality}/${settings.fps}`;
    if (performanceKey !== this.performanceKey) {
      this.autoQuality.reset(); this.performanceKey = performanceKey; this.gpuMilliseconds = null;
    }
    this.updateTiming(settings, dt);
    const limits = visual.feedback
      ? { width: Math.min(this.limits.width, this.textureLimit), height: Math.min(this.limits.height, this.textureLimit) }
      : this.limits;
    const plan = planResolution(bounds.width, bounds.height, window.devicePixelRatio,
      settings.quality, visual.cost === 'heavy', limits, this.autoQuality.scale);
    if (this.canvas.width !== plan.requestedWidth) this.canvas.width = plan.requestedWidth;
    if (this.canvas.height !== plan.requestedHeight) this.canvas.height = plan.requestedHeight;
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    this.resolutionState = reportResolution(plan, width, height);
    if (!width || !height) throw new Error('Drawing buffer unavailable. Try Balanced quality and resume.');
    if (plan.gpuLimited || this.resolutionState.implementationLimited) {
      const notice = `${width}x${height}/${plan.nativeWidth}x${plan.nativeHeight}/${settings.quality}`;
      if (notice !== this.lastLimitNotice) {
        this.onError(`Graphics limit: rendering ${width} × ${height}, not ${plan.nativeWidth} × ${plan.nativeHeight}. See Settings.`);
        this.lastLimitNotice = notice;
      }
    } else this.lastLimitNotice = '';
    if (visual.feedback) {
      // Slider updates clear retained pixels but do not reallocate GPU memory.
      this.prepareFeedback(width, height, `${width}:${height}`);
      const contentKey = [settings.visual, settings.background, settings.backgroundColor, settings.palette, settings.opacity, settings.intensity, settings.lineWidth, settings.glow].join(':');
      if (contentKey !== this.feedbackContentKey) {
        for (const target of this.feedback) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        }
        this.feedbackContentKey = contentKey; this.feedbackDrawn = false;
      }
    } else if (this.feedback.length) this.releaseFeedback();
    gl.bindFramebuffer(gl.FRAMEBUFFER, visual.feedback ? this.feedback[this.feedbackIndex]!.framebuffer : null);
    gl.viewport(0, 0, width, height);
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    const drive = this.motion.update(audio, settings, dt);
    if (this.audioRevision !== this.motion.audioRevision) {
      this.audioRevision = this.motion.audioRevision;
      this.inertia.reset(); this.impulseHistory.reset(); this.lastImpulse = -10;
      this.historyHead = 0; this.historyElapsed = 0;
      gl.bindTexture(gl.TEXTURE_2D, this.history);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,128,64,gl.RGBA,gl.UNSIGNED_BYTE,this.emptyHistory);
      gl.bindTexture(gl.TEXTURE_2D, this.rippleField);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,128,64,gl.RGBA,gl.FLOAT,this.emptyRipple);
    }
    const shape = this.inertia.update(drive, this.motion.response.value.spectrum, dt, FIXED_SMOOTHNESS);
    if (drive.sleeping) this.inertia.reset();
    const sceneDt = drive.sleeping ? 0 : dt;
    if (drive.sleeping) {
      const frozenKey = [settings.visual, width, height, settings.quality, settings.background, settings.backgroundColor,
        settings.palette, settings.opacity, settings.intensity, settings.lineWidth, settings.glow].join(':');
      // The compositor retains the presented canvas. Silence with idle motion
      // disabled does not need repeated shader work or feedback copies.
      if (frozenKey === this.sleepingFrameKey) return;
      this.sleepingFrameKey = frozenKey;
    } else this.sleepingFrameKey = '';
    if (visual.feedback && drive.sleeping && this.feedbackDrawn) {
      // Reuse the last image exactly. Repeated 8-bit feedback compositing can
      // otherwise change pixels even with frozen clocks and zero delta.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.feedback[1 - this.feedbackIndex]!.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.frames++; return;
    }
    const ambient = settings.idleMotion && audio.volume < 0.003 && drive.clock - this.lastImpulse > 3.4;
    if (drive.event || ambient) {
      if (this.impulseHistory.push(drive.clock, ambient ? 0.16 : Math.max(0.15, drive.eventStrength) * controls.response / 1.6)) this.lastImpulse = drive.clock;
    }
    for (let i = 0; i < 128; i++) {
      const b = Math.round(clamp(this.inertia.spectrum[i]! * controls.response / 1.6) * 255), p = i * 4;
      this.spectrumBytes[p] = b; this.spectrumBytes[p + 1] = b; this.spectrumBytes[p + 2] = b; this.spectrumBytes[p + 3] = 255;
    }
    const waveRms = Math.sqrt(audio.waveform.reduce((sum, n) => sum + (Number.isFinite(n) ? n * n : 0), 0) / 256);
    const waveGain = controls.response / 1.6 / Math.max(0.16, waveRms * 2.8);
    for (let i = 0; i < 256; i++) {
      const b = Math.round((clamp((audio.waveform[i] || 0) * waveGain, -1, 1) * 0.5 + 0.5) * 255);
      const p = i * 4;
      this.waveformBytes[p] = b; this.waveformBytes[p + 1] = b; this.waveformBytes[p + 2] = b; this.waveformBytes[p + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.spectrum); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.spectrumBytes);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.waveform); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.waveformBytes);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.history);
    this.historyElapsed += sceneDt * settings.motion / 0.65;
    if (this.historyElapsed >= 1 / 24) makeRippleField(this.inertia.spectrum, controls.response / 1.6, this.rippleBytes);
    while (this.historyElapsed >= 1 / 24) {
      this.historyElapsed -= 1 / 24; this.historyHead = (this.historyHead + 1) % 64;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.historyHead, 128, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.spectrumBytes);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.rippleField);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.historyHead, 128, 1, gl.RGBA, gl.FLOAT, this.rippleBytes);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.history);
    }
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.rippleField);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, visual.feedback ? this.feedback[1 - this.feedbackIndex]!.texture : this.emptyFeedback);
    gl.useProgram(program.value);
    const u = (key: string): WebGLUniformLocation | null => {
      if (!program.uniforms.has(key)) program.uniforms.set(key, gl.getUniformLocation(program.value, key));
      return program.uniforms.get(key) ?? null;
    };
    gl.uniform2f(u('uResolution'), width, height);
    gl.uniform1f(u('uTime'), drive.time);
    for (let i = 0; i < DRIVE_UNIFORMS.length; i++) gl.uniform1f(u(DRIVE_NAMES[i]!), drive[DRIVE_UNIFORMS[i]!] * (i < 6 ? 1 : controls.response / 1.6));
    gl.uniform1f(u('uImpact'), shape.impact * controls.response / 1.6);
    gl.uniform1f(u('uDelta'), sceneDt);
    gl.uniform1f(u('uAudioAccent'), drive.accent);
    gl.uniform1f(u('uMotion'), settings.motion);
    for (let i = 0; i < BAND_KEYS.length; i++) {
      const key = BAND_KEYS[i]!;
      const value = (key === 'beat' ? drive.beat : shape[key]) * controls.response / 1.6;
      gl.uniform1f(u(BAND_NAMES[i]!), value);
    }
    gl.uniform1f(u('uIntensity'), controls.amplitude);
    gl.uniform1f(u('uLineWidth'), controls.lineWidth);
    gl.uniform1f(u('uGlow'), controls.glow);
    gl.uniform1f(u('uDetail'), DETAIL[settings.quality]);
    gl.uniform1f(u('uTransparent'), settings.background === 'transparent' ? 1 : 0);
    gl.uniform1f(u('uOpacity'), settings.opacity);
    gl.uniform1f(u('uIdle'), settings.idleMotion ? 1 : 0);
    const paletteId = settings.palette === 'auto' ? VISUALS[settings.visual].palette : settings.palette;
    gl.uniform1f(u('uRainbow'), paletteId === 'spectrum' ? 1 : 0);
    gl.uniform1i(u('uFeedback'), 3);
    const randomize = paletteId === 'randomize';
    gl.uniform1f(u('uMulticolor'), randomize ? 1 : 0);
    if (randomize) {
      const colors = this.colorCycle.advance(sceneDt);
      gl.uniform1f(u('uPalettePhase'), this.colorCycle.phase);
      // Keep A/B/C as separated low/mid/highlight accents. D/E fill the two
      // additional stops in the five-color spatial gradient.
      for (let i = 0; i < COLOR_NAMES.length; i++) gl.uniform3fv(u(COLOR_NAMES[i]!), colors[i]!);
    } else {
      gl.uniform1f(u('uPalettePhase'), 0);
      const colors = PALETTE_RGB[paletteId === 'auto' ? 'iris' : paletteId]!;
      gl.uniform3fv(u('uColorA'), colors[0]!);
      gl.uniform3fv(u('uColorB'), colors[1]!);
      gl.uniform3fv(u('uColorC'), colors[2]!);
    }
    if (this.backgroundKey !== settings.backgroundColor) { this.backgroundKey = settings.backgroundColor; this.backgroundRGB = hexRGB(settings.backgroundColor); }
    gl.uniform3fv(u('uBackground'), this.backgroundRGB);
    gl.uniform1i(u('uRippleField'), 4);
    gl.uniform1i(u('uSpectrum'), 0); gl.uniform1i(u('uWaveform'), 1); gl.uniform1i(u('uHistory'), 2);
    gl.uniform1f(u('uHistoryHead'), this.historyHead);
    gl.uniform1f(u('uHistoryPhase'), this.historyElapsed * 24);
    gl.uniform4fv(u('uImpulses[0]'), this.impulses);
    const measure = settings.quality === 'auto' && this.timer && this.query && !this.queryPending && ++this.timingFrames >= 12;
    if (measure) { this.timingFrames = 0; this.queryKey = this.performanceKey; gl.beginQuery(this.timer!.TIME_ELAPSED_EXT, this.query!); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (visual.feedback) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.feedback[this.feedbackIndex]!.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.feedbackIndex = 1 - this.feedbackIndex; this.feedbackDrawn = true;
    }
    if (measure) { gl.endQuery(this.timer!.TIME_ELAPSED_EXT); this.queryPending = true; }
    this.frames++;
  }
  destroy(): void {
    const gl = this.gl;
    this.destroyed = true; window.clearTimeout?.(this.warmTimer);
    for (const p of this.programs.values()) gl.deleteProgram(p.value);
    for (const p of this.pendingPrograms.values()) { gl.deleteProgram(p.value); gl.deleteShader(p.fragment); }
    if (this.vertex) gl.deleteShader(this.vertex);
    if (this.query) gl.deleteQuery(this.query);
    this.releaseFeedback(); gl.deleteTexture(this.emptyFeedback);
    gl.deleteTexture(this.spectrum); gl.deleteTexture(this.waveform); gl.deleteTexture(this.history); gl.deleteTexture(this.rippleField);
    this.programs.clear(); this.pendingPrograms.clear();
  }
}
