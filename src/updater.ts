import { invoke, isNative } from './native.js';

interface UpdateInfo { currentVersion: string; version: string | null; notes: string | null }
interface UpdateProgress { downloaded: number; total: number | null; phase: 'downloading' | 'installing' }
export const UPDATE_CHECK_INTERVAL = 12 * 60 * 60 * 1000;

/** Automatic checks are quiet unless a release is available; installation is explicit. */
export function initializeUpdater(): void {
  const section = document.getElementById('app-updates');
  if (!section) return;
  section.hidden = !isNative;
  if (!isNative) return;
  const check = document.getElementById('check-updates') as HTMLButtonElement;
  const install = document.getElementById('install-update') as HTMLButtonElement;
  const status = document.getElementById('update-status')!;
  const dialog = document.getElementById('update-dialog') as HTMLDialogElement;
  const accept = document.getElementById('update-dialog-install') as HTMLButtonElement;
  const later = document.getElementById('update-dialog-later') as HTMLButtonElement;
  const message = document.getElementById('update-dialog-message')!;
  const progressStatus = document.getElementById('update-dialog-status')!;
  const changelog = document.getElementById('update-changelog') as HTMLAnchorElement;
  let version: string | null = null;
  let busy = false;
  let installing = false;
  let pendingPrompt = false;
  let nextCheckAt = Date.now();
  let timer = 0;

  function setStatus(text: string): void {
    status.textContent = text;
    progressStatus.textContent = text;
  }
  function setBusy(value: boolean): void {
    busy = value;
    check.disabled = install.disabled = accept.disabled = value;
    later.disabled = installing;
  }
  function showPrompt(): void {
    if (!version || document.hidden || dialog.open) return;
    pendingPrompt = false;
    message.textContent = `Vsualize ${version} is ready. Update now, or keep enjoying the app and install later.`;
    changelog.href = `https://github.com/aedeeley/vsualize/releases/tag/v${encodeURIComponent(version)}`;
    progressStatus.textContent = '';
    dialog.showModal();
    later.focus();
  }
  function scheduleCheck(): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void checkForUpdates(true), Math.max(0, nextCheckAt - Date.now()));
  }
  async function checkForUpdates(automatic = false): Promise<void> {
    // Keep the release being reviewed stable until the user makes a choice.
    nextCheckAt = Date.now() + UPDATE_CHECK_INTERVAL;
    scheduleCheck();
    if (busy || dialog.open) return;
    setBusy(true);
    if (!automatic) setStatus('Checking for updates…');
    try {
      const info = await invoke<UpdateInfo>('check_update');
      version = info.version;
      install.hidden = !version;
      setStatus(version ? `Vsualize ${version} is available.` : `Vsualize ${info.currentVersion} is up to date.`);
      status.title = info.notes ?? '';
      pendingPrompt = Boolean(version);
      showPrompt();
    } catch {
      if (!automatic) setStatus('Could not check for updates. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  async function installUpdate(): Promise<void> {
    if (busy || !version) return;
    showPrompt();
    installing = true;
    setBusy(true);
    setStatus('Downloading update…');
    try {
      await invoke<void>('install_update', { version });
      setStatus('Installing update. Vsualize will restart.');
    } catch {
      setStatus('Update could not be installed. Your current version is unchanged; try again.');
      installing = false;
      setBusy(false);
    }
  }
  function dismiss(): void {
    if (installing) return;
    pendingPrompt = false;
    dialog.close();
  }
  check.addEventListener('click', () => void checkForUpdates());
  install.addEventListener('click', installUpdate);
  accept.addEventListener('click', installUpdate);
  later.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  // Let the native dialog handle Escape and focus trapping, without app shortcuts.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  changelog.addEventListener('click', event => {
    event.preventDefault();
    if (version) void invoke('open_update_changelog', { version }).catch(() => {
      progressStatus.textContent = 'Could not open your browser. Try the What’s new link again.';
    });
  });
  void window.__TAURI__?.event.listen<UpdateProgress>('update-progress', event => {
    const progress = event.payload;
    setStatus(progress.phase === 'installing'
      ? 'Verifying and installing update. Vsualize will restart.'
      : progress.total ? `Downloading update… ${Math.min(100, Math.round(progress.downloaded / progress.total * 100))}%`
      : 'Downloading update…');
  }).catch(() => { /* Installation still works without optional progress events. */ });
  function resume(): void {
    if (document.hidden) return;
    if (pendingPrompt) showPrompt();
    if (Date.now() >= nextCheckAt) void checkForUpdates(true);
  }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  scheduleCheck(); // Check on startup, once this initialization has completed.
}
