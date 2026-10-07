import { getMessage } from '../../../shared/services/i18n.service';
import type { ClipData, ClipRange, PlayerMetrics } from '../../../entities/clip.entity';
import type { Preferences } from '../../../entities/preferences.entity';
import type { MessageCatalog } from '../../../shared/services/i18n.service';
import type { PlayerCommand, PlayerOverlayEvent } from '../../../shared/ports/protocol.port';
import type { ReviewVideoHostPort } from '../../../shared/ports/review-video-host.port';
import type { PreferencesChangeHandler, ReviewPlayerPort } from '../player/player-review.port';
import { PlayerLifecycle, createAbortError, waitForPlyrMetadata, waitForPlyrTargetData } from '../player/player-media.utils';
import { PlyrInstanceController } from '../controllers/plyr-instance.controller';
import { calculateEventTargetTime, calculatePlaybackRate } from '../player/player-commands.utils';
import { normalizeReviewRange } from '../player/player-range.utils';
const FRAME_RATE_FALLBACK = 60;
const PLYR_VERSION = '3.8.4';
const assertNever = (value: never): never => {
  throw new Error(getMessage("errUnhandledPlayerCommand", String(value)));
};

interface PlyrAdapterOptions {
  playerHost: ReviewVideoHostPort;
  catalog: () => MessageCatalog | null;
  onPreferences: PreferencesChangeHandler;
  onPlayerOverlay: (overlay: PlayerOverlayEvent) => void;
}

export class PlyrAdapter implements ReviewPlayerPort {
  private range: ClipRange = { start: 0, end: 0 };
  private clip: ClipData | null = null;
  private preferences: Preferences | null = null;
  private isLoopTransitioning = false;
  private stepTargetTime: number | null = null;
  private stepTimeoutId: number | null = null;
  private triggerOverlay: Extract<PlayerOverlayEvent, { kind: 'trigger' }> = { kind: 'trigger', phase: 'hidden', text: '' };
  private readonly lifecycle = new PlayerLifecycle();
  private readonly instance: PlyrInstanceController;

  constructor(private readonly options: PlyrAdapterOptions) {
    this.instance = new PlyrInstanceController(options.playerHost);
  }

  configure(preferences: Preferences, clip: ClipData): void {
    this.preferences = { ...preferences };
    this.clip = clip;
    this.requireVideo();
    this.range = normalizeReviewRange(clip.range);
    this.applyPreferences(preferences);
  }

  applyPreferences(preferences: Preferences): void {
    this.preferences = { ...preferences };
    this.instance.applyPreferences(this.preferences);
    this.instance.element?.classList.toggle('vacnet-video-stretched', preferences.stretchVideo);
  }

  handle(command: PlayerCommand): void {
    const video = this.requireVideo();

    switch (command.type) {
      case 'toggle-playback':
        if (video.paused) void this.play(video);
        else video.pause();
        return;
      case 'restart':
        void this.restartRange(video);
        return;
      case 'toggle-zoom':
        this.instance.element?.classList.toggle('vacnet-zoom-active');
        return;
      case 'jump-to-event':
        if (this.clip?.eventTime === -1) return;
        video.currentTime = calculateEventTargetTime(this.clip?.eventTime ?? this.range.start, this.range.start);
        return;
      case 'change-speed': {
        const rate = calculatePlaybackRate(video.playbackRate, command.direction);
        video.playbackRate = rate;
        this.options.onPlayerOverlay({ kind: 'speed', text: `${rate}x` });
        return;
      }
      case 'step': {
        video.pause();
        const clamped = this.calculateStepTime(video, command.direction);
        this.stepTargetTime = clamped;
        video.currentTime = clamped;
        this.resetStepTimeout();
        return;
      }
    }
    assertNever(command);
  }

  async load(source: string, clip: ClipData, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw createAbortError();
    const generation = this.lifecycle.nextGeneration();
    const operationSignal = AbortSignal.any([signal, this.lifecycle.signal]);
    this.clip = clip;
    const video = this.requireVideo();
    this.range = normalizeReviewRange(clip.range);
    if (clip.reviewType === 'cheating') {
      // The site owns source selection, playback position and watched progress.
      this.instance.updateMarker(clip, this.options.catalog()?.triggerMarkerLabel ?? '');
      return;
    }
    video.pause();
    this.instance.element?.classList.remove('vacnet-zoom-active');
    this.instance.element?.classList.add('vacnet-video-loading');

    try {
       const catalog = this.options.catalog();
       if (!catalog) throw new Error(getMessage('errVideoJsEarlyConfig'));
       const metadata = waitForPlyrMetadata(video, operationSignal, catalog);
      video.src = source;
       video.load();
       await metadata;
        if (!this.lifecycle.isCurrent(generation)) throw createAbortError();
       video.currentTime = this.range.start;
        this.instance.updateMarker(clip, catalog.triggerMarkerLabel);
        await waitForPlyrTargetData(video, this.range.start, operationSignal, catalog);
        if (!this.lifecycle.isCurrent(generation)) throw createAbortError();
       await this.play(video);
    } finally {
      if (this.lifecycle.isCurrent(generation)) this.instance.element?.classList.remove('vacnet-video-loading');
    }
  }

  metrics(): PlayerMetrics | null {
    const video = this.instance.video;
    if (!video) return null;
    return {
      id: video.id,
      version: this.instance.isPlyr ? PLYR_VERSION : null,
      language: document.documentElement.lang || null,
      debugEnabled: true,
      players: 1,
      frameDuration: this.frameDuration(video),
    };
  }

  hasVideo(): boolean {
    return this.instance.video?.isConnected ?? false;
  }

  dispose(): void {
    this.lifecycle.dispose();
    if (this.stepTimeoutId !== null) window.clearTimeout(this.stepTimeoutId);
    this.stepTimeoutId = null;
    this.stepTargetTime = null;
    this.instance.dispose((video) => this.removeVideoListeners(video));
  }

  private requireVideo(): HTMLVideoElement {
    const t = this.options.catalog();
    const markerLabel = t?.triggerMarkerLabel ?? '';
    const labels = {
      play: t?.videoJsPlay ?? getMessage('videoJsPlay'),
      pause: t?.videoJsPause ?? getMessage('videoJsPause'),
      restart: t?.videoJsReset ?? getMessage('videoJsReset'),
      volume: t?.videoJsVolumeLevel ?? getMessage('videoJsVolumeLevel'),
      settings: t?.playerSettings ?? getMessage('playerSettings'),
      enterFullscreen: t?.videoJsFullscreen ?? getMessage('videoJsFullscreen'),
      exitFullscreen: t?.videoJsExitFullscreen ?? getMessage('videoJsExitFullscreen'),
      share: t?.shareClip ?? getMessage('shareClip'),
      copied: t?.clipLinkCopied ?? getMessage('clipLinkCopied'),
    };
    const video = this.instance.ensureMounted(this.preferences, this.clip, markerLabel, labels, (element) => this.addVideoListeners(element));
    return video;
  }

  private addVideoListeners(video: HTMLVideoElement): void {
    video.addEventListener('volumechange', this.onVolumeChange);
    video.addEventListener('timeupdate', this.onTimeUpdate);
    video.addEventListener('ended', this.onEnded);
  }

  private removeVideoListeners(video: HTMLVideoElement): void {
    video.removeEventListener('volumechange', this.onVolumeChange);
    video.removeEventListener('timeupdate', this.onTimeUpdate);
    video.removeEventListener('ended', this.onEnded);
  }

  private frameDuration(video: HTMLVideoElement): number {
    const framesPerSecond = Number(video.dataset.fps);
    return Number.isFinite(framesPerSecond) && framesPerSecond >= 20 && framesPerSecond <= 240
      ? 1 / framesPerSecond
      : 1 / FRAME_RATE_FALLBACK;
  }

  private async restartRange(video: HTMLVideoElement): Promise<void> {
    if (this.isLoopTransitioning) return;
    this.isLoopTransitioning = true;
    try {
      video.pause();
      video.currentTime = this.range.start;
      await this.play(video);
    } finally {
      this.isLoopTransitioning = false;
    }
  }

  private readonly onVolumeChange = (): void => {
    const video = this.instance.video;
    if (!video || !this.preferences) return;
    this.instance.updateVolumePopup();

    if (Math.abs(this.preferences.volume - video.volume) <= 0.001 && this.preferences.muted === video.muted) return;
    this.options.onPreferences({ volume: video.volume, muted: video.muted });
  };

  private readonly onTimeUpdate = (): void => {
    const video = this.instance.video;
    if (this.clip && this.clip.eventTime >= 0) {
      const timeToTrigger = this.clip.eventTime - (video?.currentTime ?? 0);
      const t = this.options.catalog();
      if (timeToTrigger > 1 && timeToTrigger <= 4) this.setTriggerOverlay('countdown', t ? t.triggerCountdown.replace('[time]', String(Math.ceil(timeToTrigger - 1))) : '');
      else if (timeToTrigger <= 1 && timeToTrigger >= -1) this.setTriggerOverlay('flash', t?.triggerFlash ?? '');
      else this.setTriggerOverlay('hidden');
    } else this.setTriggerOverlay('hidden');

    if (this.clip?.reviewType === 'cheating') return;
    if (!video || video.currentTime < this.range.end || video.paused) return;
    video.pause();
    video.currentTime = this.range.end;
  };

  private readonly onEnded = (): void => {
    if (this.clip?.reviewType === 'cheating') return;
    const video = this.instance.video;
    if (!video || video.currentTime < this.range.end) return;
    video.currentTime = this.range.end;
  };

  private calculateStepTime(video: HTMLVideoElement, direction: number): number {
    const baseTime = this.stepTargetTime !== null ? this.stepTargetTime : video.currentTime;
    const upper = this.range.end > this.range.start
      ? this.range.end
      : Number.isFinite(video.duration) && video.duration >= this.range.start
        ? video.duration
        : baseTime + this.frameDuration(video);
    const target = baseTime + direction * this.frameDuration(video);
    const lower = this.range.end > this.range.start ? this.range.start : 0;
    return Math.min(upper, Math.max(lower, target));
  }

  private resetStepTimeout(): void {
    if (this.stepTimeoutId !== null) window.clearTimeout(this.stepTimeoutId);
    this.stepTimeoutId = window.setTimeout(() => {
      this.stepTargetTime = null;
      this.stepTimeoutId = null;
    }, 150);
  }

  private setTriggerOverlay(phase: Extract<PlayerOverlayEvent, { kind: 'trigger' }>['phase'], text = ''): void {
    if (this.triggerOverlay.phase === phase && this.triggerOverlay.text === text) return;
    this.triggerOverlay = { kind: 'trigger', phase, text };
    this.options.onPlayerOverlay(this.triggerOverlay);
  }


  private async play(video: HTMLVideoElement): Promise<void> {
    try {
      await video.play();
    } catch (error) {
      console.error('video-playback-failed', error);
    }
  }
}
