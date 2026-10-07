import type { ClipData } from '../../entities/clip.entity';

// The portal's inline script declares this in the MAIN world's global lexical
// scope, rather than as a window property. Keep the native player and callbacks.
declare let furthestWatched: number;

declare global {
  interface Window { BIsMatchWatched?: () => boolean; }
}

export const installNativeDeveloperSeeking = (clip: ClipData): (() => void) => {
  const video = document.querySelector<HTMLVideoElement>('#video_html5_api, #video video');
  const originalWatched = window.BIsMatchWatched;
  if (!video || !originalWatched || typeof furthestWatched !== 'number') return () => {};
  const initialWatched = furthestWatched;
  const intervals: Array<[number, number]> = initialWatched > 0 ? [[0, initialWatched]] : [];
  let position = video.currentTime;
  let clock = performance.now();
  let playing = !video.paused;
  const duration = (): number => Number.isFinite(video.duration) && video.duration > 0
    ? video.duration : clip.range.end;
  const reset = (): void => { position = video.currentTime; clock = performance.now(); playing = !video.paused; };
  const record = (): void => {
    const next = video.currentTime;
    const now = performance.now();
    const delta = next - position;
    // Seeking resets the anchor. Merge only normal playback intervals so jumps
    // and replaying the same segment cannot unlock the site's end-only answers.
    if (playing && !video.seeking && delta > 0
      && delta <= ((now - clock) / 1000) * Math.max(0.1, video.playbackRate) + 0.5) {
      intervals.push([position, next]);
      intervals.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < intervals.length;) {
        if (intervals[i]![0] <= intervals[i - 1]![1]) {
          intervals[i - 1]![1] = Math.max(intervals[i - 1]![1], intervals[i]![1]);
          intervals.splice(i, 1);
        } else i++;
      }
    }
    reset();
  };
  const watched = (): boolean => {
    const length = duration();
    return length > 0 && intervals.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(end, length) - start), 0) >= length - 5;
  };
  const unlock = (): void => { furthestWatched = Math.max(furthestWatched, duration()); };
  // Raising the native seek boundary also enables the portal's J/L shortcuts.
  // BIsMatchWatched remains based on actual coverage, not this seek boundary.
  window.BIsMatchWatched = watched;
  unlock();
  video.addEventListener('loadedmetadata', unlock);
  video.addEventListener('seeking', reset, true);
  video.addEventListener('seeked', reset, true);
  video.addEventListener('play', reset, true);
  video.addEventListener('timeupdate', record, true);
  video.addEventListener('pause', record, true);
  video.addEventListener('ended', record, true);
  return () => {
    video.removeEventListener('loadedmetadata', unlock);
    video.removeEventListener('seeking', reset, true);
    video.removeEventListener('seeked', reset, true);
    video.removeEventListener('play', reset, true);
    video.removeEventListener('timeupdate', record, true);
    video.removeEventListener('pause', record, true);
    video.removeEventListener('ended', record, true);
    if (window.BIsMatchWatched === watched) window.BIsMatchWatched = originalWatched;
    furthestWatched = intervals.reduce((end, interval) => interval[0] <= end ? Math.max(end, interval[1]) : end, 0);
  };
};
