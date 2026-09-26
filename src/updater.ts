import { invoke, isNative } from './native.js';

interface UpdateInfo { currentVersion: string; version: string | null; notes: string | null }
interface UpdateProgress { downloaded: number; total: number | null; phase: 'downloading' | 'installing' }

/** Checks never interrupt listening. Installation is always an explicit action. */
export function initializeUpdater(): void {
  const section = document.getElementById('app-updates');
  if (!section) return;
  section.hidden = !isNative;
  if (!isNative) return;
  const check = document.getElementById('check-updates') as HTMLButtonElement;
  const install = document.getElementById('install-update') as HTMLButtonElement;
  const status = document.getElementById('update-status')!;
  let version: string | null = null;
  let busy = false;

  async function checkForUpdates(automatic = false): Promise<void> {
    if (busy) return;
    busy = true;
    check.disabled = install.disabled = true;
    if (!automatic) status.textContent = 'Checking for updates…';
    try {
      const info = await invoke<UpdateInfo>('check_update');
      version = info.version;
      install.hidden = !version;
      status.textContent = version ? `Vsualize ${version} is available.` : `Vsualize ${info.currentVersion} is up to date.`;
      status.title = info.notes ?? '';
    } catch {
      if (!automatic) status.textContent = 'Could not check for updates. Check your connection and try again.';
    } finally {
      busy = false;
      check.disabled = install.disabled = false;
    }
  }

  check.addEventListener('click', () => void checkForUpdates());
  install.addEventListener('click', async () => {
    if (busy || !version) return;
    busy = true;
    check.disabled = install.disabled = true;
    status.textContent = 'Downloading update…';
    try {
      await invoke<void>('install_update', { version });
      status.textContent = 'Installing update. Vsualize will restart.';
    } catch {
      status.textContent = 'Update could not be installed. Your current version is unchanged; try again.';
      busy = false;
      check.disabled = install.disabled = false;
    }
  });
  void window.__TAURI__?.event.listen<UpdateProgress>('update-progress', event => {
    const progress = event.payload;
    status.textContent = progress.phase === 'installing'
      ? 'Verifying and installing update. Vsualize will restart.'
      : progress.total ? `Downloading update… ${Math.min(100, Math.round(progress.downloaded / progress.total * 100))}%`
      : 'Downloading update…';
  }).catch(() => { /* Download still works without optional progress events. */ });
  window.setTimeout(() => void checkForUpdates(true), 15_000);
  window.setInterval(() => { if (!document.hidden) void checkForUpdates(true); }, 6 * 60 * 60 * 1000);
}
