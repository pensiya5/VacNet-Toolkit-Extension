import { h, render } from 'preact';
import { afterEach, expect, it } from 'vitest';
import { createCatalog, getMessage } from '../src/shared/services/i18n.service';
import { ClipHistoryEntrySchema } from '../src/entities/history.entity';
import { emptyVerdicts } from '../src/entities/verdict.entity';
import { HistoryMatchCard } from '../src/features/history/components/HistoryMatchCard';
import { TranslationProvider } from '../src/shared/components/TranslationProvider';

let root: HTMLElement | null = null;
afterEach(() => { if (root) render(null, root); root = null; });

it('uses Russian messages even when browser i18n is unavailable in the main world', () => {
  expect(createCatalog().videoJsLocale).toBe('ru');
  expect(getMessage('cheatingYes')).toBe('Читер');
  expect(getMessage('cheatingNo')).toBe('Не читер');
  expect(getMessage('errHistoryLookupFailed', 'test')).toContain('test');
});

it.each(['positive', 'skip', 'negative'] as const)('renders the new %s history answer in Russian without inventing four answers', (cheating) => {
  root = document.createElement('div'); document.body.append(root);
  const entry = ClipHistoryEntrySchema.parse({
    ...emptyVerdicts(), cheating, reviewType: 'cheating', taskId: 'test', sourceWebmUrl: 'https://replay-video.valve.net/test.webm',
    videoId: 'test', range: { start: 0, end: 350 }, eventTime: -1, clipCount: null, app: '730',
    clipKey: 'test', identityVersion: 2, deduplication: 'new-match', timestamp: 1, badClip: false, verdictTick: cheating === 'positive' ? 22531.75 : null,
  });
  const catalog = createCatalog();
  render(h(TranslationProvider, { catalog, children: h(HistoryMatchCard, {
    match: { matchTimestamp: null, fallbackVideoId: 'test', entries: [entry] }, matchNumber: 1,
  }) }), root);
  expect(root.textContent).toContain(cheating === 'positive' ? 'Читер' : cheating === 'negative' ? 'Не читер' : catalog.btnUncertain);
  expect(root.textContent).not.toContain(catalog.labelAimAssist);
  if (cheating === 'positive') expect(root.textContent).toContain('22531.75');
});
