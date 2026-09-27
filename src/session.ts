export type SessionDuration = 15 | 30 | 60 | 120 | 0;
export type SessionPhase = 'running' | 'suspended' | 'stopped';
export type StopReason = 'manual' | 'expired' | 'wake' | 'notice' | 'error';
export const SAFETY_NOTICE_VERSION = 1;
export const SESSION_DURATIONS: readonly SessionDuration[] = [15, 30, 60, 120, 0];

/** Time belongs to the session, not to frames, input events or audio reconnects. */
export class SessionController {
  phase: SessionPhase = 'stopped';
  reason: StopReason = 'notice';
  startedAt = 0;
  constructor(public duration: SessionDuration = 30, private now: () => number = Date.now) {}
  get deadline(): number | null { return this.duration ? this.startedAt + this.duration * 60_000 : null; }
  get active(): boolean { return this.phase !== 'stopped'; }
  start(hidden = false): void {
    this.startedAt = this.now(); this.phase = hidden ? 'suspended' : 'running'; this.reason = 'manual';
  }
  stop(reason: StopReason = 'manual'): void { this.phase = 'stopped'; this.reason = reason; }
  check(): boolean {
    if (this.phase !== 'stopped' && this.deadline !== null && this.now() >= this.deadline) this.stop('expired');
    return this.phase === 'running';
  }
  setDuration(duration: SessionDuration): void { this.duration = duration; this.check(); }
  visibility(hidden: boolean): void {
    this.check();
    if (this.phase !== 'stopped') this.phase = hidden ? 'suspended' : 'running';
  }
}

/** Neither wall-clock rollback nor suspended animation callbacks extend a session. */
export function sessionClock(wall: () => number = Date.now, monotonic: () => number = () => performance.now()): () => number {
  let previousWall = wall(), previousMono = monotonic(), elapsed = previousWall;
  return () => {
    const w = wall(), m = monotonic();
    elapsed += Math.max(0, w - previousWall, m - previousMono);
    previousWall = w; previousMono = m;
    return elapsed;
  };
}
