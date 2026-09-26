/** Keep the requested average cadence on 60/120/144/165 Hz screens without
 * rendering catch-up frames or treating a hidden window as an audio backlog. */
export class FramePacer {
  private due = 0;
  private last = 0;
  private rate = 0;
  reset(now = 0): void { this.due = now; this.last = 0; this.rate = 0; }
  next(now: number, fps: number, hidden = false): number | null {
    if (!Number.isFinite(now)) return null;
    if (hidden) { this.reset(now); return null; }
    const rate = Number.isFinite(fps) ? Math.max(1, Math.min(120, fps)) : 60;
    const interval = 1000 / rate;
    if (rate !== this.rate) { this.rate = rate; this.due = now; }
    if (now + 0.35 < this.due) return null;
    const dt = this.last ? Math.min(0.1, Math.max(0, (now - this.last) / 1000)) : interval / 1000;
    this.last = now;
    this.due += interval;
    if (this.due <= now - interval) this.due = now + interval;
    return dt;
  }
}

/** Conservative scale steps, quick relief under sustained load, slow recovery.
 * GPU samples are asynchronously read; frame gaps are only a fallback signal. */
export class AdaptiveQuality {
  scale = 1;
  private slow = 0;
  private fast = 0;
  private settle = 1;
  reset(): void { this.scale = 1; this.slow = 0; this.fast = 0; this.settle = 1; }
  observe(milliseconds: number, elapsed: number, fps: number, gpuSample: boolean): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0 || !Number.isFinite(elapsed) || elapsed <= 0) return;
    // A single tab/resize/compile stall says nothing about steady rendering cost.
    const dt = Math.min(elapsed, 0.25);
    if (this.settle > 0) { this.settle -= dt; return; }
    // Without a GPU timer, 120fps on a 60Hz display is indistinguishable from
    // slow rendering. Keep the fallback conservative about refresh ceilings.
    const interval = 1000 / Math.max(30, Math.min(gpuSample ? 120 : 60, fps));
    const budget = gpuSample ? Math.min(9, interval * 0.55) : interval * 1.3;
    const slow = milliseconds > budget;
    const fast = milliseconds < (gpuSample ? budget * 0.58 : interval * 1.12);
    this.slow = slow ? this.slow + dt : Math.max(0, this.slow - dt * 2);
    this.fast = fast ? this.fast + dt : 0;
    if (this.slow >= 0.65 && this.scale > 0.5) {
      this.scale = Math.max(0.5, this.scale - 0.125); this.slow = 0; this.fast = 0; this.settle = 1.5;
    } else if (this.fast >= 8 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.125); this.slow = 0; this.fast = 0; this.settle = 3;
    }
  }
}
