import html from './fixtures/review-page.html?raw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipDataSchema } from '../src/entities/clip.entity';
import { ClipHistoryEntrySchema } from '../src/entities/history.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { readValveClip } from '../src/features/valve-interop/clip.parser';
import { installNativeReviewBridge, flushPendingNativeReview } from '../src/features/valve-interop/native-review.service';

vi.mock('../src/shared/services/i18n.service', async (importOriginal) => ({
  ...await importOriginal<object>(), getMessage: (key: string) => key,
}));

const readClip = () => readValveClip(document, location.href, async () => null);
const prepare = (label: string, tick = '') => {
  const form = document.querySelector<HTMLFormElement>('#submitverdictform')!;
  const input = document.createElement('input');
  input.name = 'verdict_labels[]';
  input.value = label;
  form.append(input);
  form.querySelector<HTMLInputElement>('[name=verdict_tick]')!.value = tick;
  return form;
};

beforeEach(() => { document.documentElement.innerHTML = html; sessionStorage.clear(); });

describe('updated site compatibility', () => {
  it('reads a full match without a marked event', async () => {
    const clip = await readClip();
    expect(clip).toMatchObject({ reviewType: 'cheating', eventTime: -1, range: { start: 0, end: 358.79998779297 } });
    expect(ClipDataSchema.parse(clip)).toEqual(clip);
  });

  it('continues to parse legacy clips and rejects a missing event declaration', async () => {
    document.querySelector('#verdictbuttons_cheating')!.remove();
    document.querySelector('[name=verdict_tick]')!.remove();
    document.querySelector('script')!.textContent = "const startTime = 2;\nconst endTime = startTime + 10;\nconst eventTime = 7;\nvideojs('video');";
    expect(await readClip()).toMatchObject({ reviewType: 'legacy', eventTime: 7, range: { start: 2, end: 12 } });
    document.querySelector('script')!.textContent = "const startTime = 2;\nconst endTime = 12;\nvideojs('video');";
    await expect(readClip()).rejects.toThrow('errValveNoTiming');
  });

  it('preserves old history and the new cheating verdict with its tick', async () => {
    const clip = await readClip();
    const entry = { ...clip, ...emptyVerdicts(), clipKey: 'test', identityVersion: 2, deduplication: 'new-match', timestamp: 1, badClip: false };
    const { reviewType: _, ...oldEntry } = { ...entry, eventTime: 3 };
    expect(ClipHistoryEntrySchema.parse(oldEntry).reviewType).toBe('legacy');
    expect(ClipHistoryEntrySchema.parse({ ...entry, cheating: 'positive', verdictTick: 22531.75 })).toMatchObject({ cheating: 'positive', verdictTick: 22531.75 });
  });

  it.each(['guilty_cheating', 'skip_cheating', 'innocent_cheating', 'tag_badclip'])('observes %s without changing submission or unlocking choices', async (label) => {
    const clip = await readClip();
    const form = prepare(label, label === 'guilty_cheating' ? '22531.75' : '');
    const originalSubmit = vi.fn();
    form.submit = originalSubmit;
    const before = new URLSearchParams(new FormData(form) as never).toString();
    const dispose = installNativeReviewBridge({ clip, root: document, onChange: vi.fn() });
    form.submit();
    expect(originalSubmit).toHaveBeenCalledOnce();
    expect(new URLSearchParams(new FormData(form) as never).toString()).toBe(before);
    expect(document.querySelectorAll('input[name=cheating]:disabled')).toHaveLength(3);
    expect(document.querySelector('#video_html5_api')).not.toBeNull();
    const save = vi.fn(async (_params: import('../src/shared/ports/protocol.port').HistorySaveParams) => {});
    await flushPendingNativeReview(clip.taskId, save);
    expect(save).not.toHaveBeenCalled();
    await flushPendingNativeReview('next-task', save);
    expect(save).toHaveBeenCalledOnce();
    const params = save.mock.calls[0]![0];
    expect(params).toMatchObject({ clip, badClip: label === 'tag_badclip', verdictTick: label === 'guilty_cheating' ? 22531.75 : null });
    if (label !== 'tag_badclip') expect(params.verdicts.cheating).toBe(({ guilty_cheating: 'positive', skip_cheating: 'skip', innocent_cheating: 'negative' } as Record<string, string>)[label]);
    await flushPendingNativeReview('another-task', save);
    expect(save).toHaveBeenCalledOnce();
    dispose();
    expect(form.submit).toBe(originalSubmit);
  });

  it('retains a pending record if history storage fails', async () => {
    const clip = await readClip();
    const form = prepare('guilty_cheating', '0.00');
    form.submit = vi.fn();
    const dispose = installNativeReviewBridge({ clip, root: document, onChange: vi.fn() });
    form.submit();
    await expect(flushPendingNativeReview('next-task', async () => { throw new Error('storage failure'); })).rejects.toThrow();
    const save = vi.fn(async () => {});
    await flushPendingNativeReview('next-task', save);
    expect(save).toHaveBeenCalledOnce();
    dispose();
  });

  it('still submits when session storage is unavailable', async () => {
    const clip = await readClip();
    const form = prepare('guilty_cheating', '22531.75');
    const originalSubmit = vi.fn();
    form.submit = originalSubmit;
    const dispose = installNativeReviewBridge({ clip, root: document, onChange: vi.fn() });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
    expect(() => form.submit()).not.toThrow();
    expect(originalSubmit).toHaveBeenCalledOnce();
    spy.mockRestore();
    dispose();
  });
});
