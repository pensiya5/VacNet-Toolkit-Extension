import { h, render } from 'preact';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../src/app/components/App';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { messageKeys, type MessageCatalog } from '../src/shared/services/i18n.service';
import { installPlayerHotkeys } from '../src/features/video-player/player/player-hotkeys.injector';
import { snapshotSignal } from '../src/features/video-player/player/player.store';
import html from './fixtures/review-page.html?raw';

vi.mock('../src/features/preferences/preferences.store', async () => {
  const { signal } = await import('@preact/signals');
  const { createDefaultPreferences } = await import('../src/entities/preferences.entity');
  return { preferencesSignal: signal({ ...createDefaultPreferences(), presetPanelOpen: true }), updatePreferences: vi.fn() };
});
vi.mock('../src/features/history/history.store', async () => {
  const { signal } = await import('@preact/signals');
  const { emptyHistory } = await import('../src/entities/history.entity');
  return { historySignal: signal(emptyHistory()) };
});
vi.mock('../src/shared/services/i18n.service', async (importOriginal) => ({
  ...await importOriginal<object>(), getMessage: (key: string) => key,
}));

let root: HTMLElement | null = null;
afterEach(() => { if (root) render(null, root); root = null; });

it('shows native instructions, the single question and all restored toolbar functions', () => {
  document.documentElement.innerHTML = html;
  root = document.createElement('div');
  document.body.append(root);
  const catalog = { ...Object.fromEntries(messageKeys.map((key) => [key, key])), videoJsLocale: 'en' } as MessageCatalog;
  const noop = vi.fn();
  render(h(TranslationProvider, { catalog, children: h(App, {
    nativeReview: true, footerTarget: null, onReviewCommand: noop, onClearHistory: noop, onCopyMetrics: noop,
    onError: noop, onImportHistory: noop, onExportHistory: noop,
  }) }), root);
  expect(root.textContent).toContain('nativeReviewInstructions');
  expect(root.textContent).toContain('labelCheating');
  expect(root.textContent).not.toContain('labelAimAssist');
  expect(root.querySelector('[aria-label=presetPanelTitle]')).not.toBeNull();
  expect(root.querySelector('[aria-label=autoApplyRepeatVerdicts]')).not.toBeNull();
  expect(root.querySelector('[aria-label=keepControlsVisible]')).not.toBeNull();
  expect(root.querySelector('[aria-label=hideNickname]')).not.toBeNull();
  expect(document.querySelectorAll('input[name=cheating]:disabled')).toHaveLength(3);
});

it('routes restored player keys and native confirmation without submitting four legacy answers', () => {
  document.documentElement.innerHTML = html;
  let listener: (event: KeyboardEvent) => void = () => {};
  const review = vi.fn();
  const player = vi.fn();
  installPlayerHotkeys({
    context: { addEventListener: (_target: unknown, _event: unknown, handler: typeof listener) => { listener = handler; } } as never,
    isDashboardOpen: () => false, isModalOpen: () => false, closeDashboard: vi.fn(), getPresets: () => [],
    getSnapshot: () => ({ ...snapshotSignal.value, hasVideo: true, clip: { taskId: 'test', eventTime: -1 } as never }), emitReviewCommand: review, emitPlayerCommand: player,
  });
  for (const code of ['Space', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace']) {
    const event = new KeyboardEvent('keydown', { code, cancelable: true });
    listener(event);
    expect(event.defaultPrevented).toBe(true);
  }
  expect(review).toHaveBeenCalledWith({ type: 'confirm-verdict' });
  expect(review).toHaveBeenCalledWith({ type: 'set-verdict', name: 'cheating', value: 'skip' });
  expect(player).toHaveBeenCalledWith({ type: 'toggle-playback' });
  expect(player).toHaveBeenCalledWith({ type: 'step', direction: -1 });
  expect(player).toHaveBeenCalledWith({ type: 'step', direction: 1 });
});
