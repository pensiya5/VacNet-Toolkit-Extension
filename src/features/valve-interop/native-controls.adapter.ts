import type { NativeReviewControls } from '../../entities/clip.entity';
import { emptyVerdicts, verdictNames, type VerdictSelection, type VerdictValue } from '../../entities/verdict.entity';
import type { ReviewCommand } from '../../shared/ports/protocol.port';

// The extension presents controls, while the server page remains the source of
// availability, confirmation timing, watched progress and decision ticks.
export class NativeReviewController {
  private readonly observer: MutationObserver;
  private readonly video: HTMLVideoElement | null;
  private repeatVerdict: VerdictValue | null = null;
  private autoSubmit = false;
  private lastState = '';
  private disposed = false;
  private isSubmitting = false;

  constructor(private readonly root: Document, private readonly onChange: () => void) {
    this.observer = new MutationObserver(this.refresh);
    const panel = root.querySelector('.verdict-column');
    if (panel) this.observer.observe(panel, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['disabled', 'class', 'checked', 'value'],
    });
    this.video = root.querySelector<HTMLVideoElement>('#video_html5_api, #video video');
    for (const type of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'seeked']) this.video?.addEventListener(type, this.refresh);
    root.addEventListener('change', this.refresh);
    this.refresh();
  }

  snapshot(): NativeReviewControls {
    const confirming = this.root.querySelector('.verdict-column')?.classList.contains('confirming') ?? false;
    const button = this.root.querySelector<HTMLButtonElement>('#submitVerdictButton');
    const rawTick = this.root.querySelector<HTMLInputElement>('#form_verdict_tick')?.value.trim();
    const tick = rawTick ? Number(rawTick) : null;
    return {
      positiveAvailable: this.available('positive'), skipAvailable: this.available('skip'), negativeAvailable: this.available('negative'),
      confirming, confirmAvailable: confirming && !!button && !button.disabled && !this.isSubmitting,
      decisionTick: tick !== null && Number.isFinite(tick) && tick >= 0 ? tick : null,
    };
  }

  verdicts(): VerdictSelection {
    const value = this.root.querySelector<HTMLInputElement>('input[name="cheating"]:checked')?.value;
    return { ...emptyVerdicts(), ...(value === 'positive' || value === 'skip' || value === 'negative' ? { cheating: value } : {}) };
  }

  submitting(): boolean { return this.isSubmitting; }

  setRepeatVerdict(value: VerdictValue | null): void {
    this.repeatVerdict = value;
    this.refresh();
  }

  handle(command: ReviewCommand): void {
    if (this.disposed || this.isSubmitting) return;
    switch (command.type) {
      case 'set-verdict':
        if (command.name === 'cheating') { this.repeatVerdict = null; this.select(command.value); }
        break;
      case 'set-verdicts':
        this.repeatVerdict = null;
        if (command.verdicts.cheating) this.select(command.verdicts.cheating);
        else if (verdictNames.every((name) => command.verdicts[name] === 'skip')) this.cancel();
        break;
      case 'submit':
        this.repeatVerdict = null;
        if (command.badClip) this.report();
        else if (command.verdicts.cheating) {
          if (this.verdicts().cheating !== command.verdicts.cheating && !this.select(command.verdicts.cheating)) break;
          this.autoSubmit = true;
        }
        break;
      case 'confirm-verdict': this.confirm(); break;
      case 'cancel-verdict': this.cancel(); break;
      case 'report-bad-clip': this.report(); break;
    }
    this.refresh();
  }

  dispose(): void {
    this.disposed = true;
    this.observer.disconnect();
    this.root.removeEventListener('change', this.refresh);
    for (const type of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'seeked']) this.video?.removeEventListener(type, this.refresh);
  }

  private input(value: VerdictValue): HTMLInputElement | null {
    return this.root.querySelector<HTMLInputElement>(`input[name="cheating"][value="${value}"]`);
  }
  private available(value: VerdictValue): boolean {
    const input = this.input(value);
    return !!input && !input.disabled && !this.isSubmitting;
  }
  private select(value: VerdictValue): boolean {
    if (!this.available(value)) return false;
    this.input(value)!.click();
    return this.verdicts().cheating === value;
  }
  private confirm(): void {
    if (!this.snapshot().confirmAvailable) return;
    this.autoSubmit = false;
    this.isSubmitting = true;
    try { this.root.querySelector<HTMLButtonElement>('#submitVerdictButton')!.click(); }
    catch (error) { this.isSubmitting = false; throw error; }
  }
  private cancel(): void {
    this.autoSubmit = false;
    this.repeatVerdict = null;
    if (this.snapshot().confirming) window.CancelVerdict?.();
  }
  private report(): void {
    this.autoSubmit = false;
    this.repeatVerdict = null;
    if (window.ReportBadClip) {
      this.isSubmitting = true;
      try { window.ReportBadClip(); } catch (error) { this.isSubmitting = false; throw error; }
    }
  }

  private readonly refresh = (): void => {
    if (this.disposed) return;
    if (this.repeatVerdict && !this.verdicts().cheating && this.available(this.repeatVerdict)) {
      const value = this.repeatVerdict;
      this.repeatVerdict = null;
      this.select(value);
    }
    if (this.autoSubmit && this.snapshot().confirmAvailable) this.confirm();
    const state = JSON.stringify([this.snapshot(), this.verdicts().cheating, this.isSubmitting]);
    if (state !== this.lastState) { this.lastState = state; this.onChange(); }
  };
}

declare global {
  interface Window { CancelVerdict?: () => void; }
}
