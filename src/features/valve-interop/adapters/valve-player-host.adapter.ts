import { getMessage } from '../../../shared/services/i18n.service';
export interface LegacyValvePlayer {
  id: () => string;
  el: () => HTMLElement;
  duration: () => number;
  paused: () => boolean;
  playbackRate: {
    (): number;
    (value: number): void;
  };
  preload: (value: string) => void;
  src: (source: { src: string; type: string }) => void;
  language: {
    (): string;
    (value: string): void;
  };
  pause: () => void;
  dispose?: () => void;
  currentTime: {
    (): number;
    (value: number): void;
  };
  volume: {
    (): number;
    (value: number): void;
  };
  muted: {
    (): boolean;
    (value: boolean): void;
  };
  play: () => Promise<void> | void;
  on: (type: string, listener: () => void) => void;
  off: (type: string, listener: () => void) => void;
}

export interface ValveVideoJsApi {
  (target: string | Element): LegacyValvePlayer;
  VERSION?: string;
  getPlayer?: (id: string) => LegacyValvePlayer | undefined;
  getPlayers?: () => Record<string, LegacyValvePlayer>;
  addLanguage?: (locale: string, messages: Record<string, string>) => void;
}

import type { ReviewVideoHost } from '../../../shared/ports/review-video-host.port';
import { isNativeReviewPage } from '../review-mode.utils';

const LEGACY_PLAYER_SELECTOR = '.video-js, #video_html5_api, video#video, video.vjs-tech';
const SUPPORTED_VALVE_DISPOSE_VERSION = '8.23.3';

const createNoopValvePlayer = (): LegacyValvePlayer => {
  let currentTime = 0;
  let volume = 0;
  let muted = false;
  let playbackRate = 1;

  return {
    id: () => 'video',
    el: () => document.createElement('div'),
    duration: () => 0,
    paused: () => true,
    playbackRate: Object.assign(
      () => playbackRate,
      (value: number): void => {
        playbackRate = value;
      },
    ),
    preload: () => undefined,
    src: () => undefined,
    language: Object.assign(
      () => '',
      (): void => undefined,
    ),
    pause: () => undefined,
    currentTime: Object.assign(
      () => currentTime,
      (value: number): void => {
      currentTime = value;
      },
    ),
    volume: Object.assign(
      () => volume,
      (value: number): void => {
      volume = value;
      },
    ),
    muted: Object.assign(
      () => muted,
      (value: boolean): void => {
      muted = value;
      },
    ),
    play: () => Promise.resolve(),
    on: () => undefined,
    off: () => undefined,
  };
};

const installValveShim = (): void => {
  const player = createNoopValvePlayer();
  const shim = (() => player) as ValveVideoJsApi;
  shim.getPlayer = () => player;
  shim.getPlayers = () => ({ video: player });
  shim.addLanguage = () => undefined;
  window.videojs = shim;
};

const removeLegacyDom = (container: HTMLElement): void => {
  for (const element of Array.from(container.querySelectorAll<HTMLElement>(LEGACY_PLAYER_SELECTOR))) {
    element.remove();
  }
};

const disposeValvePlayer = (player: LegacyValvePlayer | undefined): void => {
  if (!player || window.videojs?.VERSION !== SUPPORTED_VALVE_DISPOSE_VERSION) return;
  try {
    player.dispose?.();
  } catch (error) {
    console.warn('player-dispose-failed', error);
  }
};

export class ValvePlayerHost {
  private host: ReviewVideoHost | null = null;
  private originalVideoJs: ValveVideoJsApi | undefined;
  private installedShim: ValveVideoJsApi | null = null;
  private nativeParent: HTMLElement | null = null;
  private nativeControls = false;

  constructor(private readonly prepareValveTeardown: () => void) {}

  mount(): ReviewVideoHost {
    if (this.host?.element.isConnected) return this.host;

    const container = document.querySelector<HTMLElement>('.videocontainer');
    if (!container) throw new Error(getMessage("errValveNoVideoContainer"));

    if (isNativeReviewPage(document)) {
      const video = container.querySelector<HTMLVideoElement>('#video_html5_api, video#video, video.vjs-tech');
      if (!video?.parentElement) throw new Error(getMessage('errValveNoVideoContainer'));
      this.nativeParent = video.parentElement;
      this.nativeControls = video.controls;
      const element = document.createElement('div');
      element.dataset.vacnetPlayerHost = 'true';
      element.dataset.vacnetNativePlayer = 'true';
      element.className = 'vacnet-review-player-host';
      video.before(element);
      element.append(video);
      this.nativeParent.classList.add('vacnet-native-player-active');
      this.host = { element, video };
      return this.host;
    }

    this.prepareValveTeardown();
    const legacyPlayer = window.videojs?.getPlayer?.('video');
    const legacyVideo = container.querySelector<HTMLVideoElement>('#video_html5_api, video#video, video.vjs-tech');
    legacyVideo?.pause();
    legacyPlayer?.pause();
    disposeValvePlayer(legacyPlayer);
    removeLegacyDom(container);
    this.originalVideoJs = window.videojs;
    installValveShim();
    this.installedShim = window.videojs ?? null;

    const element = document.createElement('div');
    element.dataset.vacnetPlayerHost = 'true';
    element.className = 'vacnet-review-player-host';
    const video = document.createElement('video');
    video.dataset.vacnetReviewVideo = 'true';
    video.id = 'vacnet-review-video';
    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = 'metadata';
    element.append(video);
    container.prepend(element);
    this.host = { element, video };
    return this.host;
  }

  dispose(): void {
    if (this.nativeParent && this.host) {
      // Restore the exact tech node: Video.js and the site's closures retain it.
      this.host.element.before(this.host.video);
      this.host.video.controls = this.nativeControls;
      this.nativeParent.classList.remove('vacnet-native-player-active');
      this.nativeParent = null;
    }
    this.host?.element.remove();
    this.host = null;
    if (this.installedShim && window.videojs === this.installedShim) {
      if (this.originalVideoJs) window.videojs = this.originalVideoJs;
      else delete window.videojs;
    }
    this.originalVideoJs = undefined;
    this.installedShim = null;
  }
}

declare global {
  interface Window {
    videojs?: ValveVideoJsApi;
    __vacnetMainWorldRuntime?: { dispose: () => void };
    SetModeLabeling?: () => void;
    SetModeConfirmLabels?: () => void;
    ShowLabelingButtons?: () => void;
    SubmitLabels?: () => void;
    ReportBadClip?: () => void;
  }
}
