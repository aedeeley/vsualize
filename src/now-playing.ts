import { invoke, isNative } from './native.js';

interface NowPlaying { title: string; artist: string }

/** Refresh only while the controls are open; ignore replies from an older opening. */
export function initializeNowPlaying() {
  const container = document.getElementById('now-playing')!;
  const title = document.getElementById('song-title')!;
  const artist = document.getElementById('song-artist')!;
  let generation = 0;
  let timer = 0;

  async function refresh(request: number): Promise<void> {
    try {
      const track = await invoke<NowPlaying | null>('get_now_playing');
      if (request !== generation) return;
      title.textContent = track?.title ?? '';
      artist.textContent = track?.artist ?? '';
      title.hidden = !track?.title;
      artist.hidden = !track?.artist;
      container.hidden = !track || (!track.title && !track.artist);
    } catch {
      if (request !== generation) return;
      container.hidden = true;
    }
    if (request === generation) timer = window.setTimeout(() => { void refresh(request); }, 3000);
  }

  return {
    show() {
      window.clearTimeout(timer);
      const request = ++generation;
      container.hidden = true;
      if (isNative) void refresh(request);
    },
    hide() {
      ++generation;
      window.clearTimeout(timer);
      container.hidden = true;
    },
  };
}
