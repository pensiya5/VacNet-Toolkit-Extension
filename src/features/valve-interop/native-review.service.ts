import type { ClipData } from '../../entities/clip.entity';
import { emptyVerdicts, type VerdictSelection, type VerdictValue } from '../../entities/verdict.entity';
import { HistorySaveParamsSchema, type HistorySaveParams } from '../../shared/ports/protocol.port';
import { getAllowedValveSubmitUrl } from '../../shared/utils/url.utils';

const PENDING_KEY = 'vacnet:v3:pending-native-review';
const PENDING_TTL = 10 * 60 * 1_000;
const labels: Record<string, VerdictValue> = {
  guilty_cheating: 'positive', skip_cheating: 'skip', innocent_cheating: 'negative',
};

const readSubmission = (form: HTMLFormElement, clip: ClipData): HistorySaveParams | null => {
  if (!getAllowedValveSubmitUrl(form.action) || form.method.toLowerCase() !== 'post') return null;
  const data = new FormData(form);
  if (data.get('verdict_task') !== clip.taskId) return null;
  const submittedLabels = data.getAll('verdict_labels[]');
  if (submittedLabels.length !== 1 || typeof submittedLabels[0] !== 'string') return null;
  const label = submittedLabels[0];
  const badClip = label === 'tag_badclip';
  const cheating = labels[label];
  if (!badClip && !cheating) return null;
  const rawTick = data.get('verdict_tick');
  const verdictTick = cheating === 'positive' && typeof rawTick === 'string' && rawTick.trim()
    ? Number(rawTick) : null;
  if (cheating === 'positive' && (verdictTick === null || !Number.isFinite(verdictTick) || verdictTick < 0)) return null;
  return {
    clip, verdicts: { ...emptyVerdicts(), ...(cheating && !badClip ? { cheating } : {}) },
    badClip, verdictTick, submittedAt: Date.now(),
  };
};

export const installNativeReviewBridge = ({ clip, root, onChange }: {
  clip: ClipData; root: Document; onChange: (verdicts: VerdictSelection) => void;
}): (() => void) => {
  const form = root.querySelector<HTMLFormElement>('#submitverdictform');
  if (!form) return () => {};
  const originalSubmit = form.submit;
  const originalDescriptor = Object.getOwnPropertyDescriptor(form, 'submit');
  const capture = (): void => {
    // Recording history must never prevent the site's submission, even with blocked storage.
    try {
      const params = readSubmission(form, clip);
      if (params) sessionStorage.setItem(PENDING_KEY, JSON.stringify(params));
    } catch { /* Native submission remains authoritative. */ }
  };
  const submit = function (this: HTMLFormElement): void {
    capture();
    originalSubmit.call(this);
  };
  // The site calls form.submit() directly, which does not dispatch a submit event.
  form.submit = submit;
  form.addEventListener('submit', capture);
  const change = (): void => {
    const selected = root.querySelector<HTMLInputElement>('input[name="cheating"]:checked');
    const cheating = selected?.value;
    onChange({ ...emptyVerdicts(), ...(cheating === 'positive' || cheating === 'skip' || cheating === 'negative' ? { cheating } : {}) });
  };
  root.addEventListener('change', change);
  return () => {
    form.removeEventListener('submit', capture);
    root.removeEventListener('change', change);
    if (form.submit === submit) {
      if (originalDescriptor) Object.defineProperty(form, 'submit', originalDescriptor);
      else delete (form as Partial<HTMLFormElement>).submit;
    }
  };
};

// A new task confirms navigation away from the submitted task. Keep pending data on
// the same task (e.g. rejected submission), and retry after transient storage failures.
export const flushPendingNativeReview = async (
  currentTaskId: string, save: (params: HistorySaveParams) => Promise<void>,
): Promise<void> => {
  let raw: string | null;
  try { raw = sessionStorage.getItem(PENDING_KEY); } catch { return; }
  if (!raw) return;
  let params: HistorySaveParams | null = null;
  try {
    const parsed = HistorySaveParamsSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.clip.reviewType === 'cheating' && parsed.data.submittedAt !== undefined) params = parsed.data;
  } catch { /* Discard malformed pending data. */ }
  if (!params || params.submittedAt! > Date.now() || Date.now() - params.submittedAt! > PENDING_TTL) {
    sessionStorage.removeItem(PENDING_KEY);
    return;
  }
  if (params.clip.taskId === currentTaskId) return;
  await save(params);
  if (sessionStorage.getItem(PENDING_KEY) === raw) sessionStorage.removeItem(PENDING_KEY);
};
