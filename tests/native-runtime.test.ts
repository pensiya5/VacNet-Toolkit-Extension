import { afterEach, expect, it, vi } from 'vitest';
import html from './fixtures/review-page.html?raw';
import { MainWorldRuntime } from '../src/app/main-world-runtime.injector';
import { createDefaultPreferences } from '../src/entities/preferences.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { createClipIdentity, type ClipDeduplication } from '../src/entities/clip.entity';
import { messageKeys, type MessageCatalog } from '../src/shared/services/i18n.service';
import type { MainMessageBus } from '../src/shared/ports/message-bus.port';
import type { IsolatedEvent, MainEvent } from '../src/shared/ports/protocol.port';

vi.mock('../src/shared/services/i18n.service', async (importOriginal) => ({
  ...await importOriginal<object>(), getMessage: (key: string) => key,
}));

let runtime: MainWorldRuntime | null = null;
afterEach(() => { runtime?.dispose(); runtime = null; delete window.videojs; delete window.CancelVerdict; sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
  { metadataState: 'available', legacyDiagnostic: false, delayedDom: false },
  { metadataState: 'failed', legacyDiagnostic: false, delayedDom: false },
  { metadataState: 'pending', legacyDiagnostic: false, delayedDom: false },
  { metadataState: 'available', legacyDiagnostic: true, delayedDom: false },
  { metadataState: 'available', legacyDiagnostic: true, delayedDom: true },
])('restores native Plyr with $metadataState metadata, legacy diagnostic=$legacyDiagnostic and delayed DOM=$delayedDom', async ({ metadataState, legacyDiagnostic, delayedDom }) => {
  vi.stubGlobal('TextTrack', class TextTrack {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.documentElement.innerHTML = html;
  const video = document.querySelector('#video_html5_api');
  const nativeSubmit = vi.fn();
  window.SubmitLabels = nativeSubmit;
  const player = {
    id: () => 'video', el: () => document.querySelector<HTMLElement>('#video')!,
    language: vi.fn(() => 'en'), currentTime: vi.fn(() => 0), pause: vi.fn(),
    dispose: vi.fn(), on: vi.fn(), off: vi.fn(), volume: vi.fn(() => 1), muted: vi.fn(() => false),
  };
  window.videojs = Object.assign(() => player, { VERSION: '8.23.3', getPlayer: () => player, getPlayers: () => ({ video: player }) }) as unknown as typeof window.videojs;
  let receive: (event: IsolatedEvent) => void = () => {};
  const events: MainEvent[] = [];
  const bus: MainMessageBus = {
    emit: (event) => { events.push(event); }, subscribe: (listener) => { receive = listener; return () => {}; },
    findHistory: vi.fn(async () => ({ status: 'new-match' as const, entry: null })),
    saveHistory: vi.fn(async () => {}), readWebmMetadata: vi.fn(async () => {
      if (metadataState === 'failed') throw new Error('metadata timeout');
      if (metadataState === 'pending') return new Promise<null>(() => {});
      return null;
    }), dispose: vi.fn(),
  };
  const timers = { markClipTransition: vi.fn(), markPlayerReplacement: vi.fn(), dispose: vi.fn() };
  if (legacyDiagnostic) sessionStorage.setItem('vacnet:player-mode', 'legacy');
  const detached = document.createDocumentFragment();
  if (delayedDom) detached.append(...document.body.childNodes);
  runtime = new MainWorldRuntime(bus, timers);
  runtime.start();
  if (delayedDom) document.body.append(detached);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const catalog = { ...Object.fromEntries(messageKeys.map((key) => [key, key])), videoJsLocale: 'en' } as MessageCatalog;
  receive({ type: 'initialize', preferences: createDefaultPreferences(), catalog });
  await vi.waitFor(() => expect(events.some((event) => event.type === 'snapshot' && event.snapshot.clip?.reviewType === 'cheating')).toBe(true));
  receive({ type: 'review-command', command: { type: 'submit', verdicts: emptyVerdicts(), badClip: false } });
  receive({ type: 'player-command', command: { type: 'jump-to-event' } });
  receive({ type: 'preferences', preferences: { volume: 0.4, muted: true } });
  expect(window.SubmitLabels).toBe(nativeSubmit);
  expect(document.querySelector('#video_html5_api')).toBe(video);
  expect(document.querySelectorAll('input[name=cheating]:disabled')).toHaveLength(3);
  expect(document.querySelector('.plyr')).not.toBeNull();
  expect(Object.hasOwn(document.querySelector('#submitverdictform')!, 'submit')).toBe(true);
  expect(player.dispose).not.toHaveBeenCalled();
  expect(player.currentTime).not.toHaveBeenCalled();
  expect(player.volume).not.toHaveBeenCalled();
  expect(timers.markPlayerReplacement).not.toHaveBeenCalled();
  expect(bus.saveHistory).not.toHaveBeenCalled();
  const snapshot = events.filter((event) => event.type === 'snapshot').at(-1)!;
  expect(snapshot.snapshot).toMatchObject({ hasVideo: true, error: null, player: { id: 'video_html5_api', version: '3.8.4' } });
  delete window.SubmitLabels;
});

const startRuntimeWithPreviousVerdict = async (status: ClipDeduplication, autoApplyRepeatVerdicts: boolean) => {
  vi.stubGlobal('TextTrack', class TextTrack {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.documentElement.innerHTML = html;
  const panel = document.querySelector('.verdict-column')!;
  const radio = document.querySelector<HTMLInputElement>('input[name="cheating"][value="positive"]')!;
  radio.disabled = false;
  radio.addEventListener('change', () => {
    panel.classList.add('confirming');
    radio.disabled = true;
  });
  window.CancelVerdict = () => {
    radio.checked = false;
    radio.disabled = false;
    panel.classList.remove('confirming');
  };
  let receive: (event: IsolatedEvent) => void = () => {};
  const events: MainEvent[] = [];
  const bus: MainMessageBus = {
    emit: (event) => { events.push(event); }, subscribe: (listener) => { receive = listener; return () => {}; },
    findHistory: async ({ clip }) => ({ status, entry: {
      ...clip, ...emptyVerdicts(), cheating: 'positive', identityVersion: 2,
      clipKey: createClipIdentity(clip).clipKey, deduplication: status,
      timestamp: 1, badClip: false, verdictTick: 22531.75,
    } }),
    saveHistory: async () => {}, readWebmMetadata: async () => null, dispose: vi.fn(),
  };
  runtime = new MainWorldRuntime(bus, { markClipTransition: vi.fn(), markPlayerReplacement: vi.fn(), dispose: vi.fn() });
  runtime.start();
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const catalog = { ...Object.fromEntries(messageKeys.map((key) => [key, key])), videoJsLocale: 'en' } as MessageCatalog;
  receive({ type: 'initialize', preferences: { ...createDefaultPreferences(), autoApplyRepeatVerdicts }, catalog });
  await vi.waitFor(() => expect(events.some((event) => event.type === 'snapshot' && event.snapshot.deduplication === status)).toBe(true));
  return { receive, radio, panel };
};

it('keeps a cancelled repeat verdict cleared through unrelated preferences and reapplies only after toggling auto-verdict', async () => {
  const { receive, radio, panel } = await startRuntimeWithPreviousVerdict('exact-duplicate', true);
  expect(radio.checked).toBe(true);
  receive({ type: 'review-command', command: { type: 'cancel-verdict' } });
  expect(radio.checked).toBe(false);
  for (const preferences of [{ volume: 0.4 }, { theme: 'light' as const }, { stretchVideo: true }, { autoApplyRepeatVerdicts: true }]) {
    receive({ type: 'preferences', preferences });
    expect(radio.checked).toBe(false);
    expect(panel.classList.contains('confirming')).toBe(false);
  }
  receive({ type: 'preferences', preferences: { autoApplyRepeatVerdicts: false } });
  expect(radio.checked).toBe(false);
  receive({ type: 'preferences', preferences: { autoApplyRepeatVerdicts: true } });
  expect(radio.checked).toBe(true);
  expect(panel.classList.contains('confirming')).toBe(true);
});

it.each(['new-match', 'new-clip'] as const)('does not apply a previous native verdict to %s when enabling auto-verdict', async (status) => {
  const { receive, radio, panel } = await startRuntimeWithPreviousVerdict(status, false);
  receive({ type: 'preferences', preferences: { autoApplyRepeatVerdicts: true } });
  expect(radio.checked).toBe(false);
  expect(panel.classList.contains('confirming')).toBe(false);
});
