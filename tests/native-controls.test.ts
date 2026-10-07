import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import html from './fixtures/review-page.html?raw';
import { NativeReviewController } from '../src/features/valve-interop/native-controls.adapter';
import { emptyVerdicts } from '../src/entities/verdict.entity';

let controller: NativeReviewController;
let submitted: ReturnType<typeof vi.fn>;
const radio = (value: string) => document.querySelector<HTMLInputElement>(`input[name=cheating][value=${value}]`)!;
const tick = () => document.querySelector<HTMLInputElement>('[name=verdict_tick]')!;
const arm = async () => {
  document.querySelector<HTMLButtonElement>('#submitVerdictButton')!.disabled = false;
  await new Promise<void>((resolve) => queueMicrotask(resolve));
};

beforeEach(() => {
  document.documentElement.innerHTML = html;
  const panel = document.querySelector('.verdict-column')!;
  const form = document.querySelector<HTMLFormElement>('form')!;
  const buttons = document.createElement('div');
  buttons.id = 'submitbuttons';
  panel.append(buttons);
  submitted = vi.fn();
  form.submit = submitted;
  window.CancelVerdict = () => {
    radio('positive').checked = false; radio('skip').checked = false; radio('negative').checked = false;
    tick().value = '';
    panel.classList.remove('confirming');
    radio('positive').disabled = false;
    buttons.replaceChildren();
  };
  window.ReportBadClip = vi.fn();
  document.querySelector('.verdicts-container')!.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    tick().value = value === 'positive' ? '22531.75' : '';
    panel.classList.add('confirming');
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name=cheating]')) input.disabled = true;
    buttons.innerHTML = '<button id="backbutton">Cancel</button><button id="submitVerdictButton" disabled>Confirm</button>';
    buttons.querySelector('#backbutton')!.addEventListener('click', () => window.CancelVerdict!());
    buttons.querySelector('#submitVerdictButton')!.addEventListener('click', () => form.submit());
  });
  controller = new NativeReviewController(document, vi.fn());
});
afterEach(() => { controller.dispose(); delete window.CancelVerdict; delete window.ReportBadClip; });

it('routes a custom cheating choice through the site and keeps its exact tick and arming gate', async () => {
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'negative' });
  expect(controller.verdicts().cheating).toBeUndefined();
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  expect(controller.verdicts().cheating).toBe('positive');
  expect(controller.snapshot()).toMatchObject({ confirming: true, confirmAvailable: false, decisionTick: 22531.75 });
  controller.handle({ type: 'confirm-verdict' });
  expect(submitted).not.toHaveBeenCalled();
  await arm();
  controller.handle({ type: 'confirm-verdict' });
  expect(submitted).toHaveBeenCalledOnce();
  expect(tick().value).toBe('22531.75');
});

it('cancels using native logic and clears the decision tick', () => {
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdict', name: 'cheating', value: 'positive' });
  controller.handle({ type: 'cancel-verdict' });
  expect(tick().value).toBe('');
  expect(controller.snapshot().confirming).toBe(false);
  expect(controller.verdicts().cheating).toBeUndefined();
});

it('auto-submits a native preset only after the server page enables confirmation', async () => {
  radio('positive').disabled = false;
  controller.handle({ type: 'submit', verdicts: { ...emptyVerdicts(), cheating: 'positive' }, badClip: false });
  expect(submitted).not.toHaveBeenCalled();
  await arm();
  expect(submitted).toHaveBeenCalledOnce();
});

it('keeps legacy presets from manufacturing a cheating verdict and preserves reporting', () => {
  radio('positive').disabled = false;
  controller.handle({ type: 'set-verdicts', verdicts: { ...emptyVerdicts(), aimassist: 'positive' } });
  expect(controller.verdicts().cheating).toBeUndefined();
  controller.handle({ type: 'report-bad-clip' });
  expect(window.ReportBadClip).toHaveBeenCalledOnce();
});

it('applies a repeated answer when available without unlocking answers or submitting', async () => {
  controller.setRepeatVerdict('negative');
  expect(controller.verdicts().cheating).toBeUndefined();
  radio('negative').disabled = false;
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(controller.verdicts().cheating).toBe('negative');
  expect(submitted).not.toHaveBeenCalled();
});
