import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from './fixtures/review-page.html?raw';
import { createDefaultPreferences } from '../src/entities/preferences.entity';
import type { ClipData } from '../src/entities/clip.entity';
import type { MessageCatalog } from '../src/shared/services/i18n.service';
import { ValvePlayerHost } from '../src/features/valve-interop/adapters/valve-player-host.adapter';
import { PlyrAdapter } from '../src/features/video-player/adapters/plyr.adapter';

vi.mock('../src/shared/services/i18n.service', async (importOriginal) => ({
  ...await importOriginal<object>(), getMessage: (key: string) => key,
}));

const clip: ClipData = { taskId: 'test-task', sourceWebmUrl: 'https://replay-video.valve.net/test.webm', videoId: 'test', reviewType: 'cheating', eventTime: -1, range: { start: 0, end: 70 }, app: 'cs2', clipCount: null, matchTimestamp: null, webmDuration: 90 };
const catalog = { triggerMarkerLabel: 'Event', videoJsPlay: 'Play', videoJsPause: 'Pause', videoJsReset: 'Restart', videoJsVolumeLevel: 'Volume', playerSettings: 'Settings', videoJsFullscreen: 'Fullscreen', videoJsExitFullscreen: 'Exit fullscreen', shareClip: 'Share', clipLinkCopied: 'Copied' } as MessageCatalog;
let adapter: PlyrAdapter | null;
let load: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
let overlay: ReturnType<typeof vi.fn>;

function createAdapter() {
  overlay = vi.fn();
  adapter = new PlyrAdapter({ playerHost: new ValvePlayerHost(() => {}), catalog: () => catalog, onPreferences: vi.fn(), onPlayerOverlay: overlay });
  return adapter;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('TextTrack', class TextTrack {});
  document.documentElement.innerHTML = html;
  sessionStorage.clear();
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
  video.className = 'vjs-tech';
  Object.defineProperty(video, 'duration', { configurable: true, value: 90 });
  video.currentTime = 6.25;
});

afterEach(async () => {
  adapter?.dispose(); adapter = null;
  delete window.videojs;
  await vi.runAllTimersAsync();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Plyr over the preserved native review video', () => {
  it('restores native media after a partial Plyr initialization failure', () => {
    const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
    const root = video.parentElement!;
    const source = video.querySelector('source');
    const defineProperty = Object.defineProperty;
    vi.spyOn(Object, 'defineProperty').mockImplementation((object, property, descriptor) => {
      if (object instanceof HTMLVideoElement && property === 'quality') throw new Error('HTML5 setup failed');
      return defineProperty(object, property, descriptor);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const player = createAdapter(); player.configure(createDefaultPreferences(), clip);
    expect(document.querySelector('#video_html5_api')).toBe(video);
    expect(root.querySelector('.plyr')).toBeNull();
    expect(video.controls).toBe(true);
    player.dispose(); adapter = null;
    expect(video.parentElement).toBe(root);
    expect(video.querySelector('source')).toBe(source);
    expect(video.currentTime).toBe(6.25);
    expect(load.mock.contexts).not.toContain(video);
    expect(pause.mock.contexts).not.toContain(video);
  });

  it('keeps legacy loading and allows free seeking beyond the range', async () => {
    document.querySelector('#verdictbuttons_cheating')!.remove();
    document.querySelector('[name=verdict_tick]')!.remove();
    const legacyClip: ClipData = { ...clip, reviewType: 'legacy', eventTime: 5, range: { start: 2, end: 70 } };
    const player = createAdapter(); player.configure(createDefaultPreferences(), legacyClip);
    const video = document.querySelector<HTMLVideoElement>('#vacnet-review-video')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 90 });
    Object.defineProperty(video, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
    const loading = player.load(legacyClip.sourceWebmUrl, legacyClip, new AbortController().signal);
    video.dispatchEvent(new Event('loadedmetadata'));
    await loading;
    expect(video.src).toBe('https://replay-video.valve.net/test.webm');
    expect(video.currentTime).toBe(2);
    expect(video.paused).toBe(false);
    expect(load.mock.contexts).toContain(video);
    expect(document.querySelector('.plyr__progress__marker')).not.toBeNull();
    video.currentTime = 75; video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(75);
    expect(video.paused).toBe(false);
  });

  it('routes controls through native media and preserves the site freeze handler', async () => {
    const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
    const root = video.parentElement!;
    let frozen = true;
    let furthestWatched = video.currentTime;
    video.addEventListener('play', () => { if (frozen) video.pause(); });
    video.addEventListener('timeupdate', () => { furthestWatched = Math.max(furthestWatched, video.currentTime); });
    const player = createAdapter(); player.configure(createDefaultPreferences(), clip);
    await vi.advanceTimersByTimeAsync(0);
    root.querySelector<HTMLButtonElement>('.plyr__controls [data-plyr=play]')!.click();
    expect(video.paused).toBe(true);
    frozen = false;
    root.querySelector<HTMLButtonElement>('.plyr__controls [data-plyr=play]')!.click();
    expect(video.paused).toBe(false);
    video.currentTime = 8; video.dispatchEvent(new Event('timeupdate'));
    expect(furthestWatched).toBe(8);
    const slider = root.querySelector<HTMLInputElement>('.vacnet-volume-menu__slider')!;
    slider.value = '0.42'; slider.dispatchEvent(new Event('input'));
    expect(video.volume).toBe(0.42);
    root.querySelector<HTMLButtonElement>('[data-plyr=speed][value="1.5"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(video.playbackRate).toBe(1.5);
    player.applyPreferences({ ...createDefaultPreferences(), stretchVideo: true, keepControlsVisible: true });
    expect(root.querySelector('.vacnet-video-stretched')).not.toBeNull();
    expect(root.querySelector('.vacnet-keep-controls')).not.toBeNull();
    player.handle({ type: 'toggle-zoom' });
    expect(root.querySelector('.vacnet-zoom-active')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-plyr=fullscreen]')!.click();
    expect(root.classList.contains('plyr--fullscreen-fallback')).toBe(true);
    player.dispose(); adapter = null;
    expect(root.classList.contains('plyr--fullscreen-fallback')).toBe(false);
  });

  it('does not bubble Plyr media proxies into Video.js site handlers', async () => {
    const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
    const root = video.parentElement!;
    const site = vi.fn(); root.addEventListener('timeupdate', site);
    const player = createAdapter(); player.configure(createDefaultPreferences(), clip);
    await vi.advanceTimersByTimeAsync(0);
    video.dispatchEvent(new Event('timeupdate'));
    expect(site).not.toHaveBeenCalled();
    root.dispatchEvent(new Event('timeupdate'));
    expect(site).toHaveBeenCalledOnce();
  });

  it('mounts controls without replacing the Video.js object or its captured media', async () => {
    const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
    const source = video.querySelector('source');
    const root = video.parentElement!;
    const overlay = document.createElement('div'); overlay.className = 'vjs-text-track-display'; root.append(overlay);
    const native = { currentTime: () => video.currentTime, pause: () => video.pause(), dispose: () => { root.remove(); } };
    const videojs = Object.assign(() => native, { VERSION: '8.23.3', getPlayer: () => native });
    window.videojs = videojs as never;
    const player = createAdapter(); player.configure(createDefaultPreferences(), clip);
    await vi.runAllTimersAsync();
    expect(window.videojs).toBe(videojs);
    expect(document.querySelector('#video_html5_api')).toBe(video);
    expect(video.querySelector('source')).toBe(source);
    expect(root.isConnected).toBe(true);
    expect(overlay.parentElement).toBe(root);
    expect(root.querySelector('.plyr__controls')).not.toBeNull();
    expect(root.querySelector('[data-plyr=fullscreen]')).not.toBeNull();
    expect(root.querySelector('.vacnet-share-clip')).not.toBeNull();
    expect(root.querySelector('.vacnet-volume-menu')).not.toBeNull();
    expect(root.querySelector('[data-plyr=settings]')).not.toBeNull();
    expect(root.querySelector('.plyr__time--current')?.textContent).toBe('00:06');
    expect(root.querySelector('.plyr__time--duration')?.textContent).toBe('01:30');
    expect(native.currentTime()).toBe(6.25);
    expect(pause.mock.contexts).not.toContain(video);
    expect(load.mock.contexts).not.toContain(video);
  });

  it('does not reload or seek the site-owned clip during load', async () => {
    const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
    const source = video.querySelector('source');
    const player = createAdapter(); player.configure(createDefaultPreferences(), clip);
    expect(document.querySelector('#video_html5_api')).toBe(video);
    const loading = player.load(clip.sourceWebmUrl, clip, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    await loading;
    player.handle({ type: 'jump-to-event' });
    expect(video.currentTime).toBe(6.25);
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.querySelector('source')).toBe(source);
    expect(load.mock.contexts).not.toContain(video);
    expect(pause.mock.contexts).not.toContain(video);
  });

  it('does not flash a missing trigger or clamp native playback to the legacy range', async () => {
    const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
    const player = createAdapter(); player.configure(createDefaultPreferences(), clip);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('#video_html5_api')).toBe(video);
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.currentTime = 0; video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.mock.calls.some(([event]) => event.phase === 'flash')).toBe(false);
    video.currentTime = 75; video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(75);
    video.dispatchEvent(new Event('ended'));
    expect(video.currentTime).toBe(75);
    expect(document.querySelector('.plyr__progress__marker')).toBeNull();
  });

  it('tears down and mounts again without clearing sources, resetting time, or removing site listeners', async () => {
    const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
    const root = video.parentElement!;
    const source = video.querySelector('source');
    const site = vi.fn(); video.addEventListener('timeupdate', site);
    const player = createAdapter(); player.configure(createDefaultPreferences(), clip);
    await vi.advanceTimersByTimeAsync(0);
    video.currentTime = 9.5;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    player.dispose(); adapter = null;
    expect(document.querySelector('#video_html5_api')).toBe(video);
    expect(video.parentElement).toBe(root);
    expect(video.querySelector('source')).toBe(source);
    expect(video.currentTime).toBe(9.5);
    expect(video.paused).toBe(false);
    expect(video.controls).toBe(false);
    expect(root.querySelector('.plyr')).toBeNull();
    expect(Object.hasOwn(video, 'quality')).toBe(false);
    expect(pause.mock.contexts).not.toContain(video);
    expect(load.mock.contexts).not.toContain(video);
    video.dispatchEvent(new Event('timeupdate'));
    expect(site).toHaveBeenCalledOnce();
    const second = createAdapter(); second.configure(createDefaultPreferences(), clip);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('#video_html5_api')).toBe(video);
    expect(root.querySelector('.plyr__controls')).not.toBeNull();
    expect(video.currentTime).toBe(9.5);
  });
});
