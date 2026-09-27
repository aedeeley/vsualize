import type { Settings } from './types.js';
import type { AudioEngine } from './audio.js';
import type { Renderer } from './renderer.js';
import { invoke, isNative } from './native.js';
import { SAFETY_NOTICE_VERSION, SESSION_DURATIONS, SessionController, sessionClock } from './session.js';
import type { SessionDuration, StopReason } from './session.js';

type NativeSession = { revision: number; epoch: number; phase: string; reason: string };
type Hooks = { persist(): void; sync(): void; show(): void; hide(): void; running(): void; stopped(): void; toast(message: string): void };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;

export function initializeSafety(settings: Settings, audio: AudioEngine, renderer: Renderer, hooks: Hooks) {
  const session = new SessionController(settings.sessionMinutes, sessionClock());
  const notice = $<HTMLDialogElement>('safety-dialog'), unlimited = $<HTMLDialogElement>('unlimited-dialog');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let revision = 0, epoch = 0, generation = 0, ready = false, minimized = false, restTimer = 0;
  let lastTick = Date.now();
  const hidden = () => document.hidden || minimized;
  const status = () => {
    $('session-status').textContent = settings.sessionMinutes === 0 ? 'Automatic stop disabled.'
      : `Automatic stop: ${settings.sessionMinutes} minutes from session start.`;
    $<HTMLSelectElement>('session-minutes').value = String(settings.sessionMinutes);
    $('pause').textContent = session.phase === 'stopped' ? 'Resume' : 'Stop';
    $('pause').setAttribute('aria-label', session.phase === 'stopped' ? 'Resume visuals and capture' : 'Stop visuals and capture');
  };
  function rest() {
    clearTimeout(restTimer);
    if (session.phase !== 'stopped' || notice.open || unlimited.open) return;
    $('session-message').textContent = session.reason === 'expired' ? 'Session ended' : session.reason === 'wake' ? 'Stopped after sleep or lock' : session.reason === 'error' ? 'Stopped — check audio or graphics' : 'Visuals stopped';
    $('session-rest').hidden = false;
    restTimer = window.setTimeout(() => {
      if (notice.open || unlimited.open) return;
      if ($('session-rest').contains(document.activeElement)) $('visualizer').focus({ preventScroll: true });
      $('session-rest').hidden = true; hooks.hide();
    }, 10_000);
  }
  async function native(action: string): Promise<boolean> {
    const request = ++revision;
    if (!isNative) return true;
    const requestEpoch = epoch;
    const result = await invoke<NativeSession>('session_control', { action, minutes: settings.sessionMinutes, revision: request, epoch: requestEpoch });
    if (requestEpoch !== epoch) return false;
    if (request !== revision) return false;
    if ((action === 'start' || action === 'restore' || action === 'duration') && result.phase === 'stopped') {
      session.stop(result.reason === 'expired' ? 'expired' : 'wake'); deactivate(); return false;
    }
    return true;
  }
  function deactivate() {
    ready = false; ++generation; renderer.stop();
    document.body.classList.add('session-stopped');
    hooks.stopped(); hooks.hide(); status();
    void audio.stop().catch(error => hooks.toast(`Could not stop capture: ${String(error)}. Quit Vsualize if capture remains active.`));
    rest();
  }
  function stop(reason: StopReason = 'manual') {
    session.stop(reason); deactivate();
    void native('stop').catch(error => hooks.toast(`Native stop failed: ${String(error)}. Quit Vsualize if capture remains active.`));
  }
  async function activate(action: 'start' | 'restore') {
    const token = ++generation;
    try {
      if (!await native(action) || token !== generation || !session.check()) return;
      await audio.start(settings);
      if (token !== generation) return;
      if (!session.check()) { stop(session.reason); return; }
      if (audio.error) { const error = audio.error; stop('error'); hooks.toast(error); return; }
      ready = true; renderer.resume(); document.body.classList.remove('session-stopped');
      $('session-rest').hidden = true; clearTimeout(restTimer); status(); hooks.running();
    } catch (error) { if (token === generation) { stop('error'); hooks.toast(String(error)); } }
  }
  function resume() {
    if (notice.open || unlimited.open) return;
    if (settings.safetyNoticeVersion !== SAFETY_NOTICE_VERSION) { openNotice(); return; }
    if (session.phase !== 'stopped') return;
    lastTick = Date.now(); session.start(hidden());
    if (session.check()) void activate('start');
    else { deactivate(); void native('start').then(() => native('suspend')).catch(error => hooks.toast(String(error))); }
  }
  function visibility(value = minimized) {
    minimized = value;
    const before = session.phase; session.visibility(hidden());
    if (before === session.phase) return;
    if (session.phase === 'stopped') { stop(session.reason); return; }
    if (session.phase === 'suspended') { deactivate(); void native('suspend').catch(error => { stop('error'); hooks.toast(String(error)); }); }
    else { lastTick = Date.now(); void activate('restore'); }
  }
  function openNotice() {
    stop('notice'); $<HTMLInputElement>('notice-gentler').checked = settings.gentlerVisuals || reduced.matches;
    notice.showModal(); $('safety-title').focus();
  }
  function acknowledge(start: boolean) {
    settings.safetyNoticeVersion = SAFETY_NOTICE_VERSION;
    settings.gentlerVisuals = $<HTMLInputElement>('notice-gentler').checked;
    hooks.persist(); hooks.sync(); notice.close();
    if (start) resume(); else rest();
  }
  function duration(value: SessionDuration) {
    settings.sessionMinutes = value; session.setDuration(value); hooks.persist(); status();
    if (session.phase === 'stopped') { deactivate(); void native('stop').catch(error => hooks.toast(String(error))); }
    else void native('duration').catch(error => { stop('error'); hooks.toast(String(error)); });
  }
  $('pause').addEventListener('click', () => session.phase === 'stopped' ? resume() : stop());
  $('session-resume').addEventListener('click', resume);
  $('session-controls').addEventListener('click', () => { $('session-rest').hidden = true; hooks.show(); });
  $('safety-help').addEventListener('click', openNotice);
  $('safety-start').addEventListener('click', () => acknowledge(true));
  $('safety-stay').addEventListener('click', () => acknowledge(false));
  notice.addEventListener('cancel', event => { event.preventDefault(); acknowledge(false); });
  $('eco-mode').addEventListener('click', () => { settings.quality = 'auto'; settings.fps = 30; hooks.persist(); hooks.sync(); });
  $('session-minutes').addEventListener('change', () => {
    const value = Number($<HTMLSelectElement>('session-minutes').value) as SessionDuration;
    if (!SESSION_DURATIONS.includes(value)) { status(); return; }
    if (value === 0 && settings.sessionMinutes !== 0) {
      $<HTMLInputElement>('unlimited-confirm').checked = false; $<HTMLButtonElement>('unlimited-enable').disabled = true;
      unlimited.showModal(); status();
    } else duration(value);
  });
  $('unlimited-confirm').addEventListener('change', () => { $<HTMLButtonElement>('unlimited-enable').disabled = !$<HTMLInputElement>('unlimited-confirm').checked; });
  $('unlimited-enable').addEventListener('click', () => {
    if (!$<HTMLInputElement>('unlimited-confirm').checked) return;
    settings.unlimitedAcknowledged = true; unlimited.close(); duration(0);
  });
  $('unlimited-cancel').addEventListener('click', () => { unlimited.close(); status(); rest(); });
  unlimited.addEventListener('cancel', () => { status(); setTimeout(rest, 0); });
  window.addEventListener('pointerdown', rest);
  window.addEventListener('keydown', rest);
  document.addEventListener('visibilitychange', () => visibility());
  window.addEventListener('pageshow', event => { if (event.persisted) stop('wake'); });
  reduced.addEventListener('change', event => { if (event.matches) stop('notice'); });
  window.setInterval(() => {
    const now = Date.now(), gap = now - lastTick; lastTick = now;
    if (session.phase === 'running' && !hidden() && gap > 5000) { stop('wake'); return; }
    if (session.active) { session.check(); if (!session.active) stop(session.reason); }
  }, 250);
  async function initialize() {
    deactivate();
    const initialization = generation;
    if (isNative) {
      await window.__TAURI__!.event.listen<NativeSession>('session-stopped', event => {
        if (event.payload.epoch < epoch) return;
        epoch = event.payload.epoch;
        stop(event.payload.reason === 'expired' ? 'expired' : event.payload.reason === 'manual' ? 'manual' : 'wake');
      });
      const snapshot = await invoke<NativeSession>('session_status');
      epoch = Math.max(epoch, snapshot.epoch); revision = Math.max(revision, snapshot.revision);
      if (initialization !== generation) return;
      if (snapshot.epoch > 0 && snapshot.phase === 'stopped') { session.stop('wake'); deactivate(); return; }
      if (!await native('stop') || initialization !== generation) return;
    }
    if (settings.safetyNoticeVersion !== SAFETY_NOTICE_VERSION) openNotice();
    else if (reduced.matches) { settings.gentlerVisuals = true; hooks.sync(); rest(); }
    else resume();
  }
  void initialize().catch(error => { stop('error'); hooks.toast(String(error)); });
  return {
    session, stop, resume, visibility,
    canRun(): boolean {
      if (!session.check()) { if (ready) stop(session.reason); return false; }
      return ready;
    },
    async restartAudio() {
      if (!session.check() || !ready) return;
      const token = generation;
      renderer.motion.resetAudio(); await audio.start(settings);
      if (token === generation && audio.error) { const error = audio.error; stop('error'); hooks.toast(error); }
    },
  };
}
