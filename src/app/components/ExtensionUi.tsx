import { effect } from '@preact/signals';
import { render } from 'preact';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { createIntegratedUi } from 'wxt/utils/content-script-ui/integrated';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { DomLocalizer } from '../../features/site-translator/dom-localizer.injector';
import { NicknameHider } from '../../features/site-translator/nickname-hider.injector';
import { dashboardStore } from '../../features/dashboard/dashboard.store';
import { createMetricsReport } from '../../features/dashboard/metrics-report.service';
import { clearHistory, findHistory, historySignal, importHistory, initializeHistoryStore, recordRepeat, saveHistoryEntry } from '../../features/history/history.store';
import { initializePreferencesStore, preferencesSignal, updatePreferences } from '../../features/preferences/preferences.store';
import { resetSnapshot, snapshotSignal } from '../../features/video-player/player/player.store';
import { installPlayerHotkeys } from '../../features/video-player/player/player-hotkeys.injector';
import { createClipIdentity } from '../../entities/clip.entity';
import type { ClipHistoryEntry } from '../../entities/history.entity';
import { createCatalog } from '../../shared/services/i18n.service';
import { createIsolatedMessageBus } from '../../shared/message-bus.adapter';
import { sendMessage } from '../../shared/ports/extension-messaging.port';
import { TranslationProvider } from '../../shared/components/TranslationProvider';
import type { HistorySaveParams } from '../../shared/ports/protocol.port';
import { App } from './App';
import { PlayerOverlays } from '../../features/video-player/components/PlayerOverlays';
import { resetPlayerOverlays } from '../../features/video-player/player/player-overlays.store';
import { createMessageHandler } from '../controllers/message-handler.controller';
import { ThemeInjector } from '../../features/theme/theme.injector';
import { markExtensionUiReady } from '../extension-boot.service';
import { isNativeReviewPage } from '../../features/valve-interop/review-mode.utils';

const VIDEO_SELECTOR = '[data-vacnet-review-video], #video_html5_api, video.vjs-tech';

const GithubLogo = () => (
  <a href="https://github.com/MartinDawgor/vacnet-toolkit-extension" target="_blank" className="vacnet-github-btn" rel="noreferrer" title="VACNet Extension GitHub">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  </a>
);

const createHistoryEntry = (
  params: HistorySaveParams,
  deduplication: ClipHistoryEntry['deduplication'],
): ClipHistoryEntry => ({
  ...params.verdicts,
  ...params.clip,
  clipKey: createClipIdentity(params.clip).clipKey,
  identityVersion: 2,
  deduplication,
  timestamp: params.submittedAt ?? Date.now(),
  badClip: params.badClip,
  verdictTick: params.verdictTick ?? null,
});

const reportError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  snapshotSignal.value = { ...snapshotSignal.value, error: message };
  console.error('ui-error', error);
};

const waitForDocument = (ctx: ContentScriptContext): Promise<void> => {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    ctx.addEventListener(document, 'DOMContentLoaded', () => resolve(), { once: true });
  });
};

export const initializeExtensionUi = async (ctx: ContentScriptContext): Promise<void> => {
  const catalog = createCatalog();
  const localizer = new DomLocalizer(catalog);
  const themeInjector = new ThemeInjector(preferencesSignal, document);
  const bus = createIsolatedMessageBus();
  const nicknameHider = new NicknameHider();
  let unsubscribeEvents: (() => void) | null = null;
  let stopHistoryFind: (() => void) | null = null;
  let stopHistorySave: (() => void) | null = null;
  let stopWebmMetadataRead: (() => void) | null = null;
  let unwatchPreferences: (() => void) | null = null;
  let unwatchHistory: (() => void) | null = null;
  let disposePreferencesBridge: (() => void) | null = null;
  let removeUi: (() => void) | null = null;
  let removeOverlayUi: (() => void) | null = null;
  let removeGithubUi: (() => void) | null = null;
  let removeUiThemeTarget: (() => void) | null = null;
  let removeOverlayThemeTarget: (() => void) | null = null;
  let isDisposed = false;
  let uiMounted = false;
  let overlayUiMounted = false;
  const getBody = (): HTMLBodyElement | null => document.querySelector('body');
  const isActive = (): boolean => !isDisposed;

  const dispose = (): void => {
    if (isDisposed) return;
    isDisposed = true;
    removeUiThemeTarget?.();
    removeOverlayThemeTarget?.();
    themeInjector.dispose();
    disposePreferencesBridge?.();
    unsubscribeEvents?.();
    stopHistoryFind?.();
    stopHistorySave?.();
    stopWebmMetadataRead?.();
    unwatchPreferences?.();
    unwatchHistory?.();
    bus.dispose();
    localizer.stop();
    removeUi?.();
    removeOverlayUi?.();
    removeGithubUi?.();
    nicknameHider.dispose();
    dashboardStore.close();
    resetSnapshot();
    resetPlayerOverlays();
    uiMounted = false;
    overlayUiMounted = false;
    getBody()?.classList.remove('dashboard-open', 'vacnet-preset-panel-open', 'vacnet-extension-root', 'vacnet-native-review');
  };
  ctx.onInvalidated(dispose);

  const messageHandler = createMessageHandler(catalog, bus);
  unsubscribeEvents = bus.subscribe((event) => {
    void messageHandler.handle(event).catch(reportError);
  });
  stopHistoryFind = bus.handleHistoryFind(async ({ clip }) => {
    const lookup = await findHistory(clip);
    if (lookup.entry) await recordRepeat();
    return lookup;
  });
  stopHistorySave = bus.handleHistorySave(async (params) => {
    const lookup = await findHistory(params.clip);
    await saveHistoryEntry(createHistoryEntry(params, lookup.status));
  });
  stopWebmMetadataRead = bus.handleWebmMetadataRead(async ({ url }) =>
    sendMessage('readWebmMetadata', url));
  installPlayerHotkeys({
    context: ctx,
    isDashboardOpen: () => dashboardStore.value !== null,
    isModalOpen: () => document.querySelector('[aria-modal="true"]') !== null,
    getPresets: () => isNativeReviewPage(document) ? preferencesSignal.value.cheatingPresets : preferencesSignal.value.customPresets,
    closeDashboard: () => {
      dashboardStore.close();
      void updatePreferences({ dashboardOpen: false }).catch(reportError);
    },
    getSnapshot: () => snapshotSignal.value,
    emitReviewCommand: (command) => bus.emit({ type: 'review-command', command }),
    emitPlayerCommand: (command) => bus.emit({ type: 'player-command', command }),
  });

  try {
    unwatchPreferences = await initializePreferencesStore(reportError);
    if (!isActive()) return;
    unwatchHistory = await initializeHistoryStore(reportError);
    if (!isActive()) return;

    if (preferencesSignal.value.dashboardOpen) dashboardStore.open('metrics');
    else dashboardStore.close();
    messageHandler.markHydrated();
    await waitForDocument(ctx);
    const body = getBody();
    if (!isActive() || !body) return;

    const nativeReview = isNativeReviewPage(document);
    body.classList.add('vacnet-extension-root');
    if (nativeReview) body.classList.add('vacnet-native-review');
    themeInjector.addTarget(body);
    localizer.start();

    const ui = await createShadowRootUi<HTMLDivElement>(ctx, {
       name: 'vacnet-extension-ui',
       position: 'inline',
       anchor: '.verdict-column',
       append: 'last',
       mode: 'open',
        isolateEvents: ['click', 'pointerdown', 'pointerup', 'keydown'],
        onMount(container, _shadow, shadowHost) {
          removeUiThemeTarget = themeInjector.addTarget(shadowHost);
         shadowHost.style.setProperty('display', 'contents', 'important');
         const root = document.createElement('div');
        root.style.setProperty('display', 'contents', 'important');
        container.append(root);
        render(
          <TranslationProvider catalog={catalog}>
            <App
              nativeReview={nativeReview}
              footerTarget={document.querySelector<HTMLElement>('.footer-buttons')}
              onReviewCommand={(command) => bus.emit({ type: 'review-command', command })}
              onClearHistory={() => {
                void clearHistory().catch(reportError);
              }}
              onCopyMetrics={() => {
                const video = document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
                const report = createMetricsReport({
                  pageUrl: window.location.href,
                  preferences: preferencesSignal.value,
                  snapshot: snapshotSignal.value,
                  video,
                });
                void navigator.clipboard.writeText(report).catch(reportError);
              }}
              onError={reportError}
              onImportHistory={(data) => { void importHistory(data).catch(reportError); }}
              onExportHistory={() => {
                const data = JSON.stringify(historySignal.value, null, 2);
                const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = `vacnet-history-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.append(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 0);
              }}
            />
          </TranslationProvider>,
          root,
        );
           uiMounted = true;
           if (overlayUiMounted) markExtensionUiReady();
           return root;
      },
       onRemove(root) {
         removeUiThemeTarget?.();
          removeUiThemeTarget = null;
          uiMounted = false;
         if (root) render(null, root);
       },
     });
     removeUi = () => ui.remove();
    const overlayUi = await createShadowRootUi<HTMLDivElement>(ctx, {
       name: 'vacnet-player-overlays',
       position: 'inline',
       anchor: '.videocontainer',
       append: 'last',
       mode: 'open',
       isolateEvents: ['click', 'pointerdown', 'pointerup'],
       onMount(container, _shadow, shadowHost) {
         removeOverlayThemeTarget = themeInjector.addTarget(shadowHost);
         shadowHost.style.setProperty('display', 'contents', 'important');
         const root = document.createElement('div');
         root.style.setProperty('display', 'contents', 'important');
         container.append(root);
         render(<PlayerOverlays />, root);
         overlayUiMounted = true;
         if (uiMounted) markExtensionUiReady();
         return root;
       },
       onRemove(root) {
         removeOverlayThemeTarget?.();
         removeOverlayThemeTarget = null;
         overlayUiMounted = false;
         if (root) render(null, root);
       },
     });
     removeOverlayUi = () => overlayUi.remove();

     const githubUi = createIntegratedUi<HTMLDivElement>(ctx, {
       position: 'inline',
       anchor: 'img.CSLogo',
       append: 'after',
       onMount(container) {
         const root = document.createElement('div');
         root.style.setProperty('display', 'contents', 'important');
         container.append(root);
         render(<GithubLogo />, root);
         return root;
       },
       onRemove(root) {
         if (root) render(null, root);
       },
     });
     removeGithubUi = () => githubUi.remove();

    if (!isActive()) {
       ui.remove();
       overlayUi.remove();
       githubUi.remove();
       return;
    }

    ui.autoMount();
    overlayUi.autoMount();
    githubUi.autoMount();
    messageHandler.sendInitialization();
    disposePreferencesBridge = effect(() => {
      if (preferencesSignal.value.hideNickname) {
        nicknameHider.apply(catalog.nicknameReplacement);
      } else {
        nicknameHider.restore();
      }
      getBody()?.classList.toggle('vacnet-preset-panel-open', preferencesSignal.value.presetPanelOpen);
      if (!isDisposed) bus.emit({ type: 'preferences', preferences: preferencesSignal.value });
    });
  } catch (error) {
    dispose();
    throw error;
  }
};
