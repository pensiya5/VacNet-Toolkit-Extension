import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { readValveClip } from '../src/features/valve-interop/clip.parser';
import { ClipDataSchema } from '../src/entities/clip.entity';

vi.mock('../src/shared/services/i18n.service', async (importOriginal) => ({
  ...await importOriginal<object>(), getMessage: (key: string) => key,
}));

// Optional local verification. Private saved pages are never checked into the repository.
it.skipIf(!process.env.VACNET_SAVED_PAGE)('parses the supplied saved page without executing scripts or loading media', async () => {
  const root = new DOMParser().parseFromString(readFileSync(process.env.VACNET_SAVED_PAGE!, 'utf8'), 'text/html');
  const clip = await readValveClip(root, 'https://www.counter-strike.net/vacnet/clips', async () => null);
  expect(ClipDataSchema.safeParse(clip).success).toBe(true);
  expect(clip.reviewType).toBe('cheating');
  expect(clip.eventTime).toBe(-1);
  expect(clip.range.end).toBeGreaterThan(clip.range.start);
});
