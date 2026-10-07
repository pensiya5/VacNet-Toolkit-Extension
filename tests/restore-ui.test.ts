import { h, render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/app/components/App';
import { PresetEditor } from '../src/features/presets/components/PresetEditor';
import { createDefaultPreferences, PreferencesSchema } from '../src/entities/preferences.entity';
import { migrateStoredPreferences } from '../src/features/preferences/preferences.migration';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { preferencesSignal, updatePreferences } from '../src/features/preferences/preferences.store';
import { snapshotSignal, resetSnapshot } from '../src/features/video-player/player/player.store';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';
import { messageKeys, type MessageCatalog } from '../src/shared/services/i18n.service';

vi.mock('../src/features/preferences/preferences.store', async () => {
  const { signal } = await import('@preact/signals');
  const { createDefaultPreferences } = await import('../src/entities/preferences.entity');
  return { preferencesSignal: signal(createDefaultPreferences()), updatePreferences: vi.fn(async (patch) => patch) };
});
vi.mock('../src/features/history/history.store', async () => {
  const { signal } = await import('@preact/signals');
  const { emptyHistory } = await import('../src/entities/history.entity');
  return { historySignal: signal(emptyHistory()) };
});
vi.mock('../src/shared/services/i18n.service', async (importOriginal) => ({
  ...await importOriginal<object>(), getMessage: (key: string) => key,
}));

let root: HTMLElement;
const catalog = { ...Object.fromEntries(messageKeys.map((key) => [key, key])), videoJsLocale: 'en',
  cheatingYes: 'cheatingYes', cheatingNo: 'cheatingNo', nativeWatchHint: 'nativeWatchHint',
  nativeConfirmHint: 'nativeConfirmHint', verdictTick: 'Тик решения', labelCheating: 'labelCheating',
} as unknown as MessageCatalog;
const mount = (children: ComponentChildren) => act(() => render(h(TranslationProvider, { catalog, children }), root));
const button = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === label)!;
const mountApp = (nativeReview: boolean, onReviewCommand = vi.fn()) => {
  const noop = vi.fn();
  mount(h(App, { nativeReview, footerTarget: null, onReviewCommand, onClearHistory: noop,
    onCopyMetrics: noop, onError: noop, onImportHistory: noop, onExportHistory: noop }));
  return onReviewCommand;
};

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  preferencesSignal.value = { ...createDefaultPreferences(), presetPanelOpen: true };
  resetSnapshot();
  vi.clearAllMocks();
});
afterEach(() => { act(() => render(null, root)); root.remove(); });

it('restores all toolbar preferences and the cheating panel in native reviews', () => {
  snapshotSignal.value = { ...snapshotSignal.value, reviewControls: { positiveAvailable: true, skipAvailable: false,
    negativeAvailable: true, confirming: false, confirmAvailable: false, decisionTick: null } };
  const command = mountApp(true);
  for (const label of ['themeToggleTitle', 'presetPanelTitle', 'hideNickname', 'autoApplyRepeatVerdicts', 'keepControlsVisible', 'stretchVideo']) {
    expect(root.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
  }
  expect(root.querySelectorAll('input[name="vacnet-cheating"]')).toHaveLength(3);
  expect(root.querySelector('input[name="vacnet-aimassist"]')).toBeNull();
  expect(root.textContent).toContain('nativeWatchHint');
  expect(root.querySelector<HTMLInputElement>('#vacnet-cheating-skip')!.disabled).toBe(true);
  act(() => root.querySelector<HTMLInputElement>('#vacnet-cheating-positive')!.click());
  expect(command).toHaveBeenLastCalledWith({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(button('btnConfirm').disabled).toBe(true);
});

it('uses explicit confirm and cancel commands and exposes the decision tick', () => {
  snapshotSignal.value = { ...snapshotSignal.value, verdicts: { ...emptyVerdicts(), cheating: 'positive' },
    reviewControls: { positiveAvailable: true, skipAvailable: true, negativeAvailable: true,
      confirming: true, confirmAvailable: true, decisionTick: 22531.75 } };
  const command = mountApp(true);
  expect(root.querySelector<HTMLInputElement>('#vacnet-cheating-positive')!.matches(':disabled')).toBe(true);
  expect(root.textContent).toContain('nativeConfirmHint');
  expect(root.textContent).toContain('Тик решения: 22531.75');
  act(() => button('btnConfirm').click());
  expect(command).toHaveBeenLastCalledWith({ type: 'confirm-verdict' });
  act(() => button('cancel').click());
  expect(command).toHaveBeenLastCalledWith({ type: 'cancel-verdict' });
});

it('preserves legacy categories and submission behavior', () => {
  const command = mountApp(false);
  expect(root.querySelectorAll('fieldset input[type="radio"]')).toHaveLength(12);
  expect(root.querySelector('input[name="vacnet-cheating"]')).toBeNull();
  act(() => button('btnSubmit').click());
  expect(command).toHaveBeenLastCalledWith({ type: 'submit', verdicts: emptyVerdicts(), badClip: false });
});

it('keeps decisions locked until the native site makes them available', () => {
  mountApp(true);
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="vacnet-cheating"]')) {
    expect(input.matches(':disabled')).toBe(true);
  }
  expect(button('btnConfirm').disabled).toBe(true);
  expect(button('cancel').disabled).toBe(true);
});

it('retains clip details and the native previous verdict and reports a bad clip', () => {
  snapshotSignal.value = { ...snapshotSignal.value,
    clip: { taskId: 'task-42', sourceWebmUrl: 'https://example.test/csow_0123456789abcdef.webm', videoId: '0123456789abcdef',
      range: { start: 1, end: 2 }, eventTime: 1.5, reviewType: 'cheating', clipCount: '42', app: '730',
      matchTimestamp: null, webmDuration: null },
    deduplication: 'exact-duplicate', previousVerdicts: { ...emptyVerdicts(), cheating: 'negative' },
    reviewControls: { positiveAvailable: true, skipAvailable: true, negativeAvailable: true,
      confirming: false, confirmAvailable: false, decisionTick: null } };
  const command = mountApp(true);
  expect(root.textContent).toContain('clipDetails');
  expect(root.textContent).toContain('task-42');
  expect(root.textContent).toContain('previousVerdicts');
  expect(root.querySelector('dl')!.textContent).toContain('clipSummaryRepeat');
  const previous = root.querySelectorAll('dl')[1]!;
  expect(previous.textContent).toContain('cheatingNo');
  expect(previous.textContent).not.toContain('labelAimAssist');
  act(() => button('btnReportBadClip').click());
  expect(command).toHaveBeenLastCalledWith({ type: 'report-bad-clip' });
});

it('keeps native preset edits isolated from legacy presets', async () => {
  const legacy = { label: 'Legacy', color: 'green' as const, verdicts: emptyVerdicts(), autoSubmit: false };
  const native = { label: 'Native', color: 'red' as const, verdicts: { ...emptyVerdicts(), cheating: 'positive' as const }, autoSubmit: false };
  preferencesSignal.value = { ...createDefaultPreferences(), presetPanelOpen: true, customPresets: [legacy], cheatingPresets: [native] };
  mountApp(true);
  expect(root.textContent).toContain('Native');
  expect(root.textContent).not.toContain('Legacy');
  await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="editPreset Native"]')!.click());
  expect(document.querySelectorAll('input[name="editor-cheating"]')).toHaveLength(3);
  expect(document.querySelector('input[name="editor-aimassist"]')).toBeNull();
  await act(async () => document.querySelector<HTMLInputElement>('input[name="editor-cheating"]')!.click());
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === 'savePreset')!.click());
  expect(updatePreferences).toHaveBeenLastCalledWith({ cheatingPresets: [native] });
});

it('starts native preset creation at uncertain and saves its selected cheating verdict', async () => {
  const save = vi.fn();
  mount(h(PresetEditor, { nativeReview: true, existingPresets: [], preset: null, onClose: vi.fn(), onSave: save }));
  const choices = document.querySelectorAll<HTMLInputElement>('input[name="editor-cheating"]');
  expect(choices).toHaveLength(3);
  expect(choices[1]!.checked).toBe(true);
  await act(async () => {
    const name = document.querySelector<HTMLInputElement>('input[maxlength]')!;
    name.value = 'Clean';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    choices[2]!.click();
  });
  await act(async () => { document.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(save).toHaveBeenCalledWith({ label: 'Clean', color: 'green', verdicts: { ...emptyVerdicts(), cheating: 'negative' }, autoSubmit: false });
});

it('migrates both preset collections independently and defaults native presets safely', () => {
  const legacy = { label: 'Old', color: 'green', verdicts: emptyVerdicts(), autoSubmit: false };
  const native = { label: 'New', color: 'red', verdicts: { ...emptyVerdicts(), cheating: 'positive' }, autoSubmit: false };
  const migration = (value: unknown) => migrateStoredPreferences(value, { dashboardOpen: null, stretchVideo: null });
  expect(migration({ customPresets: [legacy] }).cheatingPresets).toEqual([]);
  expect(migration({ customPresets: [legacy], cheatingPresets: [native] })).toMatchObject({ customPresets: [legacy], cheatingPresets: [native] });
  expect(migration({ customPresets: [legacy], cheatingPresets: [{ label: 'broken' }] })).toMatchObject({ customPresets: [legacy], cheatingPresets: [] });
  expect(PreferencesSchema.parse({ ...createDefaultPreferences(), cheatingPresets: undefined }).cheatingPresets).toEqual([]);
});
