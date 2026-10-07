import { signal } from '@preact/signals';
import type { PageSnapshot } from '../../../entities/clip.entity';
import { emptyVerdicts } from '../../../entities/verdict.entity';

const initialPageSnapshot = (): PageSnapshot => ({
  clip: null,
  deduplication: null,
  player: null,
  verdicts: emptyVerdicts(),
  previousVerdicts: null,
  hasVideo: false,
  submitting: false,
  error: null,
  reviewControls: null,
});

const normalizePageSnapshot = (snapshot: PageSnapshot): PageSnapshot => ({
  ...snapshot,
  clip: snapshot.clip ? { ...snapshot.clip, range: { ...snapshot.clip.range } } : null,
  player: snapshot.player ? { ...snapshot.player } : null,
  verdicts: { ...snapshot.verdicts },
  previousVerdicts: snapshot.previousVerdicts ? { ...snapshot.previousVerdicts } : null,
});

export const snapshotSignal = signal<PageSnapshot>(initialPageSnapshot());

export const updateSnapshot = (snapshot: PageSnapshot): void => {
  snapshotSignal.value = normalizePageSnapshot(snapshot);
};

export const resetSnapshot = (): void => {
  snapshotSignal.value = { ...initialPageSnapshot(), verdicts: emptyVerdicts() };
};
