import { expect, it, vi } from 'vitest';
import html from './fixtures/review-page.html?raw';
import { readValveClip } from '../src/features/valve-interop/clip.parser';
import { SubmitWorkflow, type SubmitWorkflowOptions } from '../src/app/submit-workflow.service';
import { emptyVerdicts } from '../src/entities/verdict.entity';

vi.mock('../src/shared/services/i18n.service', async (importOriginal) => ({
  ...await importOriginal<object>(), getMessage: (key: string) => key,
}));

it('loads a new single-verdict task normally after submitting a legacy clip', async () => {
  document.documentElement.innerHTML = html;
  const clip = await readValveClip(document, location.href, async () => null);
  const options: SubmitWorkflowOptions = {
    requestFactory: { create: vi.fn(() => ({ url: location.href, init: {} })) },
    pageClient: { submit: vi.fn(async () => ({ url: location.href, contentType: 'text/html', text: async () => html })) },
    pageReader: { read: vi.fn(async () => ({ document, clip })) },
    pageCommitter: { validate: vi.fn(), commit: vi.fn() },
    history: { save: vi.fn(async () => {}) }, navigator: { replace: vi.fn() }, activation: { activate: vi.fn() },
    playerTransition: { transition: vi.fn(async () => {}) },
    timerHijacker: { markClipTransition: vi.fn(), markPlayerReplacement: vi.fn(), dispose: vi.fn() },
    getContext: () => ({ clip: { ...clip, reviewType: 'legacy', eventTime: 10 } }),
    onSubmitting: vi.fn(), onError: vi.fn(),
  };
  const workflow = new SubmitWorkflow(options);
  await workflow.submit({ verdicts: emptyVerdicts(), badClip: false });
  expect(options.history.save).toHaveBeenCalledOnce();
  expect(options.navigator.replace).toHaveBeenCalledWith(location.href);
  expect(options.pageCommitter.commit).not.toHaveBeenCalled();
  expect(options.playerTransition.transition).not.toHaveBeenCalled();
  expect(options.activation.activate).not.toHaveBeenCalled();
  expect(options.onError).not.toHaveBeenCalled();
  workflow.dispose();
});
