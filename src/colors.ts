/** Generative five-color journeys. Each destination changes the spacing,
 * saturation and brightness of the colors, not just their common hue.
 * Seeded randomness is used at palette boundaries, never for individual pixels
 * or animation frames. No short playlist or 60-second hue loop is repeated. */
export type RGB = [number, number, number];
export type RGBPalette = [RGB, RGB, RGB, RGB, RGB];
export const PALETTE_SECONDS_MIN = 7;
export const PALETTE_SECONDS_MAX = 12;
const wrap = (n: number): number => Number.isFinite(n) ? ((n % 1) + 1) % 1 : 0;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

// Ordered circular hue gaps. Each family covers widely separated hues; the
// unequal gaps make warm/cool pairs, split complements and triads as well as
// spectrum-like combinations. Jitter makes new variations of every family.
const HARMONIES: readonly (readonly number[])[] = [
  [72, 72, 72, 72, 72],
  [30, 120, 40, 50, 120],
  [35, 85, 40, 80, 120],
  [25, 140, 30, 40, 125],
  [50, 36, 118, 36, 120],
  [28, 32, 115, 45, 140],
  [110, 28, 42, 135, 45]
];
interface Keyframe {
  base: number;
  offsets: number[];
  saturation: number[];
  value: number[];
}

function hsvInto(hue: number, saturation: number, value: number, out: RGB): void {
  const h = wrap(hue) * 6, sector = Math.floor(h), fraction = h - sector;
  const p = value * (1 - saturation), q = value * (1 - saturation * fraction), t = value * (1 - saturation * (1 - fraction));
  switch (sector) {
    case 0: out[0] = value; out[1] = t; out[2] = p; break;
    case 1: out[0] = q; out[1] = value; out[2] = p; break;
    case 2: out[0] = p; out[1] = value; out[2] = t; break;
    case 3: out[0] = p; out[1] = q; out[2] = value; break;
    case 4: out[0] = t; out[1] = p; out[2] = value; break;
    default: out[0] = value; out[1] = p; out[2] = q;
  }
}

export class ColorCycle {
  private randomState: number;
  private family = -1;
  private readonly direction: number;
  private from: Keyframe;
  private to: Keyframe;
  private elapsed = 0;
  private duration: number;
  private flow = 0;
  private destinations = 0;
  private readonly output: RGBPalette = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];

  constructor(seed = Math.random()) {
    const initial = wrap(seed);
    this.randomState = ((Math.floor(initial * 0xffffffff) ^ 0x9e3779b9) >>> 0) || 1;
    this.direction = this.random() < 0.5 ? 1 : -1;
    this.from = this.keyframe(initial);
    this.to = this.nextKeyframe();
    this.duration = this.nextDuration();
    this.sample();
  }
  private random(): number {
    // xorshift32: state is bounded so long sessions do not lose float precision.
    let x = this.randomState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0x100000000;
  }
  private keyframe(base: number): Keyframe {
    let family = Math.floor(this.random() * (this.family < 0 ? HARMONIES.length : HARMONIES.length - 1));
    if (this.family >= 0 && family >= this.family) family++;
    this.family = family;
    const gaps = HARMONIES[family]!.map(g => g * (0.90 + this.random() * 0.20));
    const sum = gaps.reduce((a, b) => a + b, 0);
    let offset = 0;
    const offsets = gaps.map(g => { const current = offset; offset += g / sum; return current; });
    const saturation = offsets.map((_, i) => i === 4 ? 0.62 + this.random() * 0.20 : 0.74 + this.random() * 0.21);
    const value = offsets.map(() => 0.78 + this.random() * 0.22);
    return { base, offsets, saturation, value };
  }
  private nextKeyframe(): Keyframe {
    const direction = this.random() < 0.35 ? -1 : 1;
    return this.keyframe(this.from.base + direction * (0.09 + this.random() * 0.17));
  }
  private nextDuration(): number {
    return PALETTE_SECONDS_MIN + this.random() * (PALETTE_SECONDS_MAX - PALETTE_SECONDS_MIN);
  }
  private sample(): void {
    const t = ease(Math.min(this.elapsed / this.duration, 1));
    for (let i = 0; i < 5; i++) {
      // Interpolate ordered hue offsets, not RGB vectors. Colors cannot collide
      // into one common hue or desaturate to grey halfway through a transition.
      const hue = lerp(this.from.base, this.to.base, t) + this.direction * lerp(this.from.offsets[i]!, this.to.offsets[i]!, t);
      hsvInto(hue, lerp(this.from.saturation[i]!, this.to.saturation[i]!, t), lerp(this.from.value[i]!, this.to.value[i]!, t), this.output[i]!);
    }
  }
  /** The flow phase moves the spatial palette through existing effect layers. */
  get phase(): number { return this.flow; }
  /** Compatibility for diagnostics that previously inspected the hue clock. */
  get hue(): number { return this.flow; }
  get generatedPalettes(): number { return this.destinations + 2; }
  get colors(): ReadonlyArray<Readonly<RGB>> { return this.output; }

  /** Renderer passes active scene time. Pause, minimized windows and settled
   * music-only silence freeze the journey. Capping suspended-frame gaps avoids
   * a jump on resume. Tuples are reused instead of allocating every frame. */
  advance(dt: number): RGBPalette {
    const delta = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    if (delta <= 0) return this.output;
    this.elapsed += delta;
    this.flow = wrap(this.flow + delta * 0.018);
    while (this.elapsed >= this.duration) {
      this.elapsed -= this.duration;
      this.from = this.to;
      this.from.base = wrap(this.from.base);
      this.to = this.nextKeyframe();
      this.duration = this.nextDuration();
      this.destinations++;
    }
    this.sample();
    return this.output;
  }
}
