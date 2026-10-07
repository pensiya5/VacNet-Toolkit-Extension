import Plyr from 'plyr';
import type { ClipData } from '../../../entities/clip.entity';
import plyrSprite from '../assets/plyr-sprite.svg?raw';
import type { Preferences } from '../../../entities/preferences.entity';
import type { ReviewVideoHost, ReviewVideoHostPort } from '../../../shared/ports/review-video-host.port';
import { VolumeMenuController } from './volume-menu.controller';
import { ShareButtonController } from './share-button.controller';
import { PreciseProgressController } from './precise-progress.controller';

export type ReviewPlayerMode = 'plyr' | 'native-fallback';
interface PlayerControlLabels { play: string; pause: string; restart: string; volume: string; settings: string; enterFullscreen: string; exitFullscreen: string; share: string; copied: string; }
export const getReviewPlayerMode = (): ReviewPlayerMode => { try { return sessionStorage.getItem('vacnet:player-mode') === 'native-fallback' ? 'native-fallback' : 'plyr'; } catch { return 'plyr'; } };

// These internals are verified against the pinned Plyr 3.8.4 implementation.
// A shell keeps its non-configurable HTML5 `quality` accessor off Video.js's tech.
interface PlyrHtml5Internals extends Plyr {
  media: HTMLVideoElement;
  elements: Plyr.Elements & { original: HTMLVideoElement };
  eventListeners: Array<{ element: EventTarget; type: string; callback: EventListener; options: AddEventListenerOptions | boolean }>;
}

export class PlyrInstanceController {
  private host: ReviewVideoHost | null = null;
  private plyr: Plyr | null = null;
  private spriteContainer: HTMLDivElement | null = null;
  private volume: VolumeMenuController | null = null;
  private share: ShareButtonController | null = null;
  private progress: PreciseProgressController | null = null;
  private mode: ReviewPlayerMode = getReviewPlayerMode();
  private nativeShell: HTMLVideoElement | null = null;
  constructor(private readonly playerHost: ReviewVideoHostPort) {}
  get video(): HTMLVideoElement | null { return this.host?.video ?? null; }
  get element(): HTMLDivElement | null { return this.host?.element ?? null; }
  get isPlyr(): boolean { return this.plyr !== null; }
  ensureMounted(preferences: Preferences | null, clip: ClipData | null, markerLabel: string, labels: PlayerControlLabels, addListeners: (video: HTMLVideoElement) => void): HTMLVideoElement {
    if (this.host?.video.isConnected) return this.host.video;
    this.host = this.playerHost.mount(); addListeners(this.host.video); this.applyPreferences(preferences);
    if (this.mode === 'native-fallback') return this.host.video;
    this.ensureSprite();
    try {
      const native = this.host.element.dataset.vacnetNativePlayer === 'true';
      const config: ConstructorParameters<typeof Plyr>[1] = { autoplay: false, clickToPlay: !native, controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'settings', 'fullscreen'], i18n: { play: labels.play, pause: labels.pause, restart: labels.restart, volume: labels.volume, mute: labels.volume, unmute: labels.volume, settings: labels.settings, enterFullscreen: labels.enterFullscreen, exitFullscreen: labels.exitFullscreen }, keyboard: { focused: false, global: false }, invertTime: false, loadSprite: false, storage: { enabled: false }, tooltips: { controls: true, seek: true } };
      if (clip && clip.eventTime >= 0) config.markers = { enabled: true, points: [{ time: clip.eventTime, label: markerLabel }] };
      if (native) {
        this.nativeShell = document.createElement('video');
        this.host.video.before(this.nativeShell);
        config.settings = ['speed'];
        config.speed = { selected: this.host.video.playbackRate, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 4] };
        config.fullscreen = { container: '#video' };
        config.blankVideo = 'data:video/mp4,';
        if (Number.isFinite(this.host.video.duration)) config.duration = this.host.video.duration;
        this.plyr = new Plyr(this.nativeShell, config);
        const internals = this.plyr as PlyrHtml5Internals;
        this.nativeShell.replaceWith(this.host.video);
        internals.media = this.host.video;
        for (const listener of internals.eventListeners) {
          const target = listener.element === this.nativeShell ? this.host.video
            : listener.element === this.nativeShell.textTracks ? this.host.video.textTracks : null;
          if (!target) continue;
          listener.element.removeEventListener(listener.type, listener.callback, listener.options);
          target.addEventListener(listener.type, listener.callback, listener.options);
          listener.element = target;
        }
        // Plyr proxies media events as bubbling CustomEvents. Video.js already
        // forwards the tech events to #video; do not run site handlers twice.
        const types = new Set(internals.eventListeners.filter((listener) => listener.element === this.host?.video).map((listener) => listener.type));
        for (const type of types) this.host.element.addEventListener(type, this.stopNativeProxyEvent);
        // Refresh Plyr's time/play state without dispatching a synthetic media
        // event through the site's watched-progress or freeze handlers.
        for (const listener of internals.eventListeners) {
          if (listener.element === this.host.video && listener.type === 'timeupdate') {
            listener.callback.call(this.host.video, new Event('timeupdate'));
          }
        }
      } else this.plyr = new Plyr(this.host.video, config);
      this.host.video.controls = false; this.applyPreferences(preferences);
      this.volume = new VolumeMenuController(this.host.element, this.plyr, labels.volume); this.share = new ShareButtonController(this.host.element, this.plyr, labels.share, labels.copied); this.progress = new PreciseProgressController(this.host.element, this.plyr);
    } catch (error) { this.disposeControllers(); try { this.destroyPlyr(); } catch (disposeError) { console.warn('player-dispose-failed', disposeError); } this.plyr = null; this.mode = 'native-fallback'; this.host.video.controls = true; console.warn('player-init-failed-native-fallback', error); }
    return this.host.video;
  }
  updateMarker(clip: ClipData | null, markerLabel: string): void { if (!this.plyr || !this.host?.element) return; const progress = this.host.element.querySelector('.plyr__progress'); if (!progress) return; progress.querySelectorAll('.plyr__progress__marker').forEach((el) => el.remove()); if (clip && clip.eventTime >= 0 && this.host.video.duration) { const marker = document.createElement('span'); marker.className = 'plyr__progress__marker'; marker.title = markerLabel; marker.style.left = `${(clip.eventTime / this.host.video.duration) * 100}%`; progress.appendChild(marker); } }
  applyPreferences(preferences: Preferences | null): void { if (!preferences || !this.host) return; this.host.element.classList.toggle('vacnet-keep-controls', preferences.keepControlsVisible); if (this.plyr) { if (Math.abs(this.plyr.volume - preferences.volume) > 0.001) this.plyr.volume = preferences.volume; if (this.plyr.muted !== preferences.muted) this.plyr.muted = preferences.muted; } else { if (Math.abs(this.host.video.volume - preferences.volume) > 0.001) this.host.video.volume = preferences.volume; if (this.host.video.muted !== preferences.muted) this.host.video.muted = preferences.muted; } this.volume?.update(); }
  updateVolumePopup(): void { this.volume?.update(); }
  dispose(removeListeners: (video: HTMLVideoElement) => void): void { const video = this.host?.video; if (video) { if (this.host?.element.dataset.vacnetNativePlayer !== 'true') video.pause(); removeListeners(video); } this.disposeControllers(); try { this.destroyPlyr(); } catch (error) { console.warn('[VACNET] Plyr disposal failed.', error); } this.plyr = null; this.host = null; this.spriteContainer?.remove(); this.spriteContainer = null; this.playerHost.dispose(); }
  private destroyPlyr(): void {
    // The constructor stores this reference before wrapping/building. Recover it
    // when construction throws so partially registered listeners are released.
    if (!this.plyr && this.nativeShell) {
      this.plyr = (this.nativeShell as HTMLVideoElement & { plyr?: Plyr }).plyr ?? null;
    }
    const nativeContainer = this.nativeShell
      ? this.plyr?.elements?.container ?? this.nativeShell.closest('.plyr') : null;
    if (this.nativeShell && this.host && this.plyr) {
      const internals = this.plyr as PlyrHtml5Internals;
      if (this.plyr.fullscreen.active) this.plyr.fullscreen.exit();
      // Full destroy unbinds cached listeners. Its stop/cancelRequests must only
      // touch the inert shell, never the site's playing video or source nodes.
      internals.media = this.nativeShell;
      internals.elements.original = this.host.video;
      // A failed or unsupported initialization can leave ready=false, in which
      // case destroy() returns early. Still release any listeners already bound.
      for (const listener of internals.eventListeners ?? []) {
        listener.element.removeEventListener(listener.type, listener.callback, listener.options);
      }
      internals.eventListeners = [];
    }
    this.plyr?.destroy();
    if (nativeContainer && this.host) {
      if (nativeContainer.contains(this.host.video)) this.host.element.append(this.host.video);
      nativeContainer.remove();
    }
    this.nativeShell?.remove();
    this.nativeShell = null;
  }
  private readonly stopNativeProxyEvent = (event: Event): void => {
    if (event instanceof CustomEvent && event.detail?.plyr === this.plyr) event.stopPropagation();
  };
  private disposeControllers(): void { this.progress?.dispose(); this.share?.dispose(); this.volume?.dispose(); this.progress = null; this.share = null; this.volume = null; }
  private ensureSprite(): void { if (document.getElementById('vacnet-plyr-sprite')) return; const container = document.createElement('div'); container.id = 'vacnet-plyr-sprite'; container.style.display = 'none'; const svg = new DOMParser().parseFromString(plyrSprite, 'image/svg+xml').documentElement; if (svg instanceof SVGElement) container.appendChild(document.importNode(svg, true)); document.body.prepend(container); this.spriteContainer = container; }
}
