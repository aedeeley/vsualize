export type VisualId = typeof import('./catalog.js').VISUAL_IDS[number];
export type AudioMode = 'desktop' | 'microphone' | 'both' | 'demo' | 'off';
export type MenuPosition = 'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right' | 'top-center' | 'top-left' | 'center';
export type PaletteId = 'randomize' | 'auto' | 'iris' | 'aurora' | 'ember' | 'ice' | 'pearl' | 'spectrum' | 'neon';

export interface InputDiagnostics {
  /** Linear RMS before user gain and the silence gate. */
  rawRms: number;
  packetAgeMs: number | null;
  packets: number;
  sampleRate: number;
  channels: number;
  gated: boolean;
}

export interface AudioFrame {
  volume: number;
  bass: number;
  mid: number;
  treble: number;
  beat: number;
  spectrum: number[];
  waveform: number[];
  desktopLevel: number;
  microphoneLevel: number;
  desktopStatus: string;
  microphoneStatus: string;
  desktopInput?: InputDiagnostics;
  microphoneInput?: InputDiagnostics;
}

export interface AudioConfig {
  mode: AudioMode;
  desktopDevice: string;
  microphoneDevice: string;
  desktopGain: number;
  microphoneGain: number;
  sensitivity: number;
  noiseGate: number;
}

/** Only these controls vary per effect. Audio/window/render settings remain global. */
export interface VisualTuning {
  intensity: number;
  lineWidth: number;
  /** Reaction setting (0 = soft, 3 = snappy); legacy storage key retained. */
  motion: number;
  glow: number;
  zoom: number;
  palette: PaletteId;
}

export interface Settings extends AudioConfig, VisualTuning {
  sessionMinutes: import('./session.js').SessionDuration;
  safetyNoticeVersion: number;
  unlimitedAcknowledged: boolean;
  gentlerVisuals: boolean;
  /** Simplified per-effect controls, migrated from earlier profiles. */
  visualTuningVersion: 2;
  visualTunings: Record<VisualId, VisualTuning>;
  version: 1;
  audioBehavior: 2;
  /** One-time adoption of the cycling default; later manual choices are preserved. */
  colorBehavior: 1;
  showSignal: boolean;
  visual: VisualId;
  favorites: VisualId[];
  background: 'solid' | 'transparent';
  backgroundColor: string;
  opacity: number;
  menuPosition: MenuPosition;
  controlsTimeout: number;
  fps: 30 | 60 | 120;
  quality: 'auto' | 'low' | 'medium' | 'high';
  layer: 'normal' | 'top' | 'bottom';
  hideTaskbar: boolean;
  idleMotion: boolean;
  gentlePeaks: boolean;
}

export interface DeviceInfo { id: string; name: string; kind: 'desktop' | 'microphone' }
export interface Palette { name: string; colors: [string, string, string] }
export interface VisualDefinition {
  id: VisualId;
  name: string;
  subtitle: string;
  palette: PaletteId;
  category: string;
  cost: 'light' | 'medium' | 'heavy';
  /** Inspiration identifier only. No external shaders or assets are loaded. */
  reference?: string;
  feedback?: boolean;
  fragment: string;
}

interface Channel<T> { onmessage: (message: T) => void }
interface TauriGlobal {
  window?: { getCurrentWindow(): { isFullscreen(): Promise<boolean> } };
  core: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    Channel: new <T>() => Channel<T>;
  };
  event: {
    listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
  };
}
declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    __vsualize?: { settings: Settings; renderer: { frames: number }; audio: { frame: AudioFrame }; show: () => void; hide: () => void };
  }
}
