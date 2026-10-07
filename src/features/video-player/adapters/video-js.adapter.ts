import { getMessage } from '../../../shared/services/i18n.service';
import type { ClipData, ClipRange, PlayerMetrics } from '../../../entities/clip.entity';
import type { Preferences } from '../../../entities/preferences.entity';
import type { MessageCatalog } from '../../../shared/services/i18n.service';
import type { PlayerCommand } from '../../../shared/ports/protocol.port';
import type { ReviewPlayerPort, PreferencesChangeHandler } from '../player/player-review.port';
import { PlayerLifecycle, createAbortError, waitForVideoJsMetadata, waitForVideoJsTargetData } from '../player/player-media.utils';
import { VideoJsInstanceController } from '../controllers/video-js-instance.controller';
import { calculateEventTargetTime, calculatePlaybackRate } from '../player/player-commands.utils';
import { normalizeReviewRange } from '../player/player-range.utils';

const assertNever = (value: never): never => {
  throw new Error(getMessage("errUnhandledPlayerCommand", String(value)));
};

export class VideoJsAdapter implements ReviewPlayerPort {
  private range: ClipRange = { start: 0, end: 0 };
  private preferences: Preferences | null = null;
  private eventTime = 0;
  private speedOverlayElement: HTMLDivElement | null = null;
  private speedTimeoutId: number | null = null;
  private readonly lifecycle = new PlayerLifecycle();
  private readonly instance = new VideoJsInstanceController();

  constructor(
    private readonly catalog: () => MessageCatalog | null,
    private readonly onPreferences: PreferencesChangeHandler,
  ) {}

  configure(preferences: Preferences, clip: ClipData): void {
    const catalog = this.catalog();
    if (!catalog) throw new Error(getMessage("errVideoJsEarlyConfig"));

    this.preferences = { ...preferences };
    this.range = normalizeReviewRange(clip.range);
    this.eventTime = clip.eventTime;
    this.instance.configure(catalog, preferences, this.onVolumeChange, this.onTimeUpdate);
  }

  applyPreferences(preferences: Preferences): void {
    this.preferences = { ...preferences };
    this.instance.applyPreferences(preferences);
  }

  handle(command: PlayerCommand): void {
    const player = this.instance.getPlayer();
    if (!player) throw new Error(getMessage("errVideoJsUnavailable"));

    switch (command.type) {
      case 'toggle-playback':
        if (player.paused()) void Promise.resolve(player.play()).catch(this.reportPlaybackError);
        else player.pause();
        return;
      case 'restart':
        player.currentTime(this.range.start);
        void Promise.resolve(player.play()).catch(this.reportPlaybackError);
        return;
      case 'toggle-zoom':
        this.instance.videoElement()?.classList.toggle('vacnet-zoom-active');
        return;
      case 'jump-to-event':
        player.currentTime(calculateEventTargetTime(this.eventTime, this.range.start));
        return;
      case 'change-speed': {
        const rate = calculatePlaybackRate(player.playbackRate(), command.direction);
        player.playbackRate(rate);
        this.showSpeedOverlay(`${rate}x`);
        return;
      }
      case 'step': {
        player.pause();
        this.instance.clampStep(player, this.range, command.direction);
        return;
      }
    }
    assertNever(command);
  }

  metrics(): PlayerMetrics | null {
    const player = this.instance.getPlayer();
    if (!player) return null;
    return {
      id: player.id(),
      version: window.videojs?.VERSION ?? null,
      language: player.language() || null,
      debugEnabled: false,
      players: Object.keys(window.videojs?.getPlayers?.() ?? {}).length,
      frameDuration: this.instance.frameDuration(),
    };
  }

  hasVideo(): boolean {
    return this.instance.videoElement() !== null;
  }

  async load(source: string, clip: ClipData, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw createAbortError();
    const generation = this.lifecycle.nextGeneration();
    const operationSignal = AbortSignal.any([signal, this.lifecycle.signal]);
    const player = this.instance.getPlayer();
    if (!player) throw new Error(getMessage("errVideoJsUnavailable"));
    this.range = normalizeReviewRange(clip.range);
    this.eventTime = clip.eventTime;
    player.pause();
    this.instance.videoElement()?.classList.remove('vacnet-zoom-active');

    const video = this.instance.videoElement();
    video?.classList.add('vacnet-video-loading');
    try {
      const catalog = this.catalog();
      if (!catalog) throw new Error(getMessage('errVideoJsEarlyConfig'));
      await waitForVideoJsMetadata(player, clip.range.start, source, operationSignal, catalog);
      if (!this.lifecycle.isCurrent(generation)) throw createAbortError();
      const targetVideo = this.instance.videoElement();
      if (targetVideo) await waitForVideoJsTargetData(targetVideo, clip.range.start, operationSignal, catalog);
      if (!this.lifecycle.isCurrent(generation)) throw createAbortError();
      await Promise.resolve(player.play());
    } finally {
      if (this.lifecycle.isCurrent(generation)) video?.classList.remove('vacnet-video-loading');
    }
  }

  dispose(): void {
    this.lifecycle.dispose();
    this.instance.dispose(this.onVolumeChange, this.onTimeUpdate);
  }

  private readonly onVolumeChange = (): void => {
    const player = this.instance.getPlayer();
    if (!player) return;
    const volume = player.volume();
    const muted = player.muted();
    if (this.preferences
      && Math.abs(this.preferences.volume - volume) <= 0.001
      && this.preferences.muted === muted) return;
    this.onPreferences({ volume, muted });
  };

  private readonly onTimeUpdate = (): void => {
    const player = this.instance.getPlayer();
    if (!player) return;
  };

  private readonly reportPlaybackError = (error: unknown): void => {
    console.error('video-playback-failed', error);
  };

  private showSpeedOverlay(text: string): void {
    const videoElement = this.instance.videoElement();
    const container = videoElement?.parentElement;
    if (!container) return;
    
    if (!this.speedOverlayElement) {
      const overlay = document.createElement('div');
      overlay.className = 'vacnet-speed-overlay';
      container.appendChild(overlay);
      this.speedOverlayElement = overlay;
    }
    
    this.speedOverlayElement.textContent = text;
    this.speedOverlayElement.classList.remove('fade-out');
    
    if (this.speedTimeoutId !== null) window.clearTimeout(this.speedTimeoutId);
    this.speedTimeoutId = window.setTimeout(() => {
      if (this.speedOverlayElement) {
        this.speedOverlayElement.classList.add('fade-out');
      }
      this.speedTimeoutId = null;
    }, 1000);
  }
}
