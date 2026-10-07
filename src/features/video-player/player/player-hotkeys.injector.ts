import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { PageSnapshot } from '../../../entities/clip.entity';
import { emptyVerdicts } from '../../../entities/verdict.entity';
import { isNativeReviewPage } from '../../valve-interop/review-mode.utils';
import type { PlayerCommand, ReviewCommand } from '../../../shared/ports/protocol.port';
import type { CustomPreset } from '../../../entities/preset.entity';
import { createPresetCommand, presetIndexFromCode } from '../../../shared/utils/preset-hotkeys.utils';
export const PLAYER_HOTKEYS = {
  submit: 'Enter',
  togglePlayback: 'Space',
  restart: 'KeyR',
  toggleZoom: 'KeyZ',
  stepBackward: 'ArrowLeft',
  stepForward: 'ArrowRight',
  closeDashboard: 'Escape',
  skip: 'Backspace',
  jumpToEvent: 'KeyE',
  decreaseSpeed: 'BracketLeft',
  increaseSpeed: 'BracketRight',
} as const;

interface HotkeyDependencies {
  context: ContentScriptContext;
  isDashboardOpen: () => boolean;
  isModalOpen: () => boolean;
  closeDashboard: () => void;
  getPresets: () => CustomPreset[];

  getSnapshot: () => PageSnapshot;
  emitReviewCommand: (command: ReviewCommand) => void;
  emitPlayerCommand: (command: PlayerCommand) => void;
}

const isInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  const element = target.closest<HTMLElement>('*');
  if (!element) return false;
  if (element.isContentEditable || element.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  return element.closest('input, textarea, select, button, a[href], summary, [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="slider"]') !== null;
};

export const installPlayerHotkeys = ({ context, isDashboardOpen, isModalOpen, closeDashboard, getPresets, getSnapshot, emitReviewCommand, emitPlayerCommand }: HotkeyDependencies): void => {
  context.addEventListener(document, 'keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

    if (event.code === PLAYER_HOTKEYS.closeDashboard && isDashboardOpen()) {
      event.preventDefault();
      closeDashboard();
      return;
    }
    const snapshot = getSnapshot();
    const nativeReview = isNativeReviewPage(document);
    const target = event.composedPath()[0] as EventTarget | null;
    if (isInteractiveTarget(target) || isModalOpen() || snapshot.submitting) return;
    const handledCodes = new Set<string>(Object.values(PLAYER_HOTKEYS));
    if (nativeReview && (handledCodes.has(event.code) || presetIndexFromCode(event.code) !== null)) event.stopImmediatePropagation();

    const presetIndex = presetIndexFromCode(event.code);
    if (presetIndex !== null) {
      const preset = getPresets()[presetIndex];
      if (!preset || !snapshot.clip || !snapshot.hasVideo) return;
      event.preventDefault();
      emitReviewCommand(createPresetCommand(preset));
      return;
    }

    if (event.code === PLAYER_HOTKEYS.submit) {
      if (!snapshot.clip || !snapshot.hasVideo) return;
      event.preventDefault();
      emitReviewCommand(nativeReview ? { type: 'confirm-verdict' } : { type: 'submit', verdicts: snapshot.verdicts, badClip: false });
      return;
    }
    if (event.code === PLAYER_HOTKEYS.skip) {
      event.preventDefault();
      emitReviewCommand(nativeReview ? { type: 'set-verdict', name: 'cheating', value: 'skip' } : { type: 'submit', verdicts: emptyVerdicts(), badClip: false });
      return;
    }
    if (event.code === PLAYER_HOTKEYS.jumpToEvent) {
      if (nativeReview && (snapshot.clip?.eventTime ?? -1) < 0) return;
      event.preventDefault();
      emitPlayerCommand({ type: 'jump-to-event' });
      return;
    }
    if (event.code === PLAYER_HOTKEYS.decreaseSpeed || event.code === PLAYER_HOTKEYS.increaseSpeed) {
      event.preventDefault();
      emitPlayerCommand({ type: 'change-speed', direction: event.code === PLAYER_HOTKEYS.decreaseSpeed ? -1 : 1 });
      return;
    }
    if (event.code === PLAYER_HOTKEYS.togglePlayback) {
      event.preventDefault();
      emitPlayerCommand({ type: 'toggle-playback' });
      return;
    }
    if (event.code === PLAYER_HOTKEYS.restart) {
      event.preventDefault();
      emitPlayerCommand({ type: 'restart' });
      return;
    }
    if (event.code === PLAYER_HOTKEYS.toggleZoom) {
      event.preventDefault();
      emitPlayerCommand({ type: 'toggle-zoom' });
      return;
    }
    if (event.code !== PLAYER_HOTKEYS.stepBackward && event.code !== PLAYER_HOTKEYS.stepForward) return;
    event.preventDefault();
    emitPlayerCommand({ type: 'step', direction: event.code === PLAYER_HOTKEYS.stepBackward ? -1 : 1 });
  }, { capture: true });
};
