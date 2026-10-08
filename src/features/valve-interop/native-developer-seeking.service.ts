import type { ClipData } from '../../entities/clip.entity';

// The portal's inline script declares this in the MAIN world's global lexical
// scope, rather than as a window property. Keep the native player and callbacks.
declare let furthestWatched: number;

declare global {
  interface Window { BIsMatchWatched?: () => boolean; }
}

export const installNativeDeveloperSeeking = (clip: ClipData): (() => void) => {
  const video = document.querySelector<HTMLVideoElement>('#video_html5_api, #video video');
  if (!video) {
    console.warn('[VACNET] Developer seeking inactive: the native video element was not found.');
    return () => {};
  }
  const originalWatched = window.BIsMatchWatched;
  const boundaryUnlocked = typeof furthestWatched === 'number';
  console.info('[VACNET] Developer seeking installed.', {
    watchedCheck: typeof originalWatched === 'function' ? 'replaced' : 'not found on window',
    seekBoundary: boundaryUnlocked ? 'unlocked' : 'unavailable',
  });
  const initialWatched = boundaryUnlocked ? furthestWatched : 0;
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
    // Merge intervals from both normal playback and seeking.
    // Seeking progress is also counted toward the watched boundary.
    if (playing && delta > 0
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
  // The portal polls this to unlock its answers. Reporting the clip as fully
  // watched lets a skipped/seeked clip be verdictable immediately.
  const watched = (): boolean => true;
  // The portal may restore its own check when a new clip mounts; re-assert ours.
  const assertWatchedOverride = (): void => {
    if (window.BIsMatchWatched === watched) return;
    if (typeof window.BIsMatchWatched === 'function') {
      console.warn('[VACNET] The portal replaced BIsMatchWatched; re-applying the override.');
    }
    window.BIsMatchWatched = watched;
  };
  const overrideTimer = window.setInterval(assertWatchedOverride, 1_000);
  const unlock = (): void => {
    if (!boundaryUnlocked) return;
    furthestWatched = Math.max(furthestWatched, duration());
  };
  // Seeking straight to the end does not fire the site's end-of-media handler
  // while paused, so replay the event the portal uses to unlock its answers.
  const replayEnded = (): void => { video.dispatchEvent(new Event('ended')); };
  const fireEnded = (): void => {
    const length = duration();
    if (!(length > 0 && video.currentTime >= length - 0.5)) return;
    replayEnded();
  };
  // A verdict must be possible as soon as playback starts. If the portal keeps
  // its answers locked after pressing play, replay the end-of-media event.
  let playUnlockDelay: number | null = null;
  const answersLocked = (): boolean => {
    const inputs = document.querySelectorAll<HTMLInputElement>('input[name="cheating"]');
    return inputs.length > 0 && Array.from(inputs).every((input) => input.disabled);
  };
  const unlockAnswersOnPlay = (): void => {
    if (playUnlockDelay !== null) window.clearTimeout(playUnlockDelay);
    playUnlockDelay = window.setTimeout(() => {
      playUnlockDelay = null;
      if (!answersLocked()) return;
      console.info('[VACNET] Playback started; replaying the end-of-media event to unlock the answers.');
      replayEnded();
    }, 250);
  };
  assertWatchedOverride();
  unlock();
  video.addEventListener('loadedmetadata', unlock);
  video.addEventListener('seeking', reset, true);
  video.addEventListener('seeked', reset, true);
  video.addEventListener('seeked', fireEnded, true);
  video.addEventListener('play', reset, true);
  video.addEventListener('play', unlockAnswersOnPlay, true);
  video.addEventListener('timeupdate', record, true);
  video.addEventListener('pause', record, true);
  video.addEventListener('ended', record, true);
  return () => {
    if (playUnlockDelay !== null) window.clearTimeout(playUnlockDelay);
    window.clearInterval(overrideTimer);
    video.removeEventListener('loadedmetadata', unlock);
    video.removeEventListener('seeking', reset, true);
    video.removeEventListener('seeked', reset, true);
    video.removeEventListener('seeked', fireEnded, true);
    video.removeEventListener('play', reset, true);
    video.removeEventListener('play', unlockAnswersOnPlay, true);
    video.removeEventListener('timeupdate', record, true);
    video.removeEventListener('pause', record, true);
    video.removeEventListener('ended', record, true);
    if (window.BIsMatchWatched === watched) {
      if (originalWatched) window.BIsMatchWatched = originalWatched;
      else delete window.BIsMatchWatched;
    }
    if (boundaryUnlocked) {
      furthestWatched = intervals.reduce((end, interval) => interval[0] <= end ? Math.max(end, interval[1]) : end, 0);
    }
  };
};
