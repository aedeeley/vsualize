import type { AudioConfig, AudioFrame, DeviceInfo } from './types.js';
export const isNative = !!window.__TAURI__?.core;

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__) throw new Error('This action requires the Windows app, not the browser preview.');
  return window.__TAURI__.core.invoke<T>(command, args);
}
let cornerSyncRequest = 0;
/** Read the actual fullscreen state; never infer it from window dimensions. */
export async function syncWindowCorners(): Promise<void> {
  const request = ++cornerSyncRequest;
  try {
    const fullscreen = isNative
      ? await window.__TAURI__?.window?.getCurrentWindow().isFullscreen()
      : Boolean(document.fullscreenElement);
    if (request !== cornerSyncRequest || typeof fullscreen !== 'boolean') return;
    document.body.classList.toggle('window-fullscreen', fullscreen);
  } catch {
    // A failed cosmetic state query must not prevent controls or audio from working.
    // Keep the last known shape and retry on the next resize, focus, or action.
  }
}
export async function windowAction(action: string, value?: string | boolean): Promise<void> {
  if (!isNative && action === 'exit-fullscreen') {
    if (document.fullscreenElement) await document.exitFullscreen();
    await syncWindowCorners();
    return;
  }
  if (!isNative && action === 'fullscreen') {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    await syncWindowCorners();
    return;
  }
  await invoke<void>('window_action', { action, value: value ?? null });
  if (action === 'fullscreen' || action === 'exit-fullscreen' || action === 'ready') await syncWindowCorners();
}
export async function startNativeAudio(config: AudioConfig, receive: (frame: AudioFrame) => void): Promise<void> {
  if (!window.__TAURI__) throw new Error('Native audio capture is available in the Windows app.');
  const channel = new window.__TAURI__.core.Channel<AudioFrame>();
  channel.onmessage = receive;
  await invoke('start_audio', { config, onFrame: channel });
}
export const stopNativeAudio = (): Promise<void> => isNative ? invoke('stop_audio') : Promise.resolve();
export const nativeDevices = (): Promise<DeviceInfo[]> => invoke('list_audio_devices');
