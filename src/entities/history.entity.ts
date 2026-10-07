import { z } from 'zod';
import { ClipDataSchema, ClipDeduplicationSchema } from './clip.entity';
import { VerdictSelectionSchema } from './verdict.entity';

export const HISTORY_STATE_VERSION = 4 as const;
export const HISTORY_LIMIT = 1_000;

export const ClipHistoryEntrySchema = VerdictSelectionSchema.merge(ClipDataSchema).extend({
  identityVersion: z.union([z.literal(1), z.literal(2)]),
  clipKey: z.string().trim().min(1).max(4_096),
  deduplication: ClipDeduplicationSchema,
  timestamp: z.number().finite().nonnegative(),
  badClip: z.boolean(),
  verdictTick: z.number().finite().nonnegative().nullable().default(null),
  matchTimestamp: z.number().finite().nonnegative().nullable().default(null),
  webmDuration: z.number().finite().nonnegative().nullable().default(null),
});

export const HistoryLookupSchema = z.strictObject({
  status: ClipDeduplicationSchema,
  entry: ClipHistoryEntrySchema.nullable(),
});

export const HistoryStateSchema = z.strictObject({
  version: z.literal(HISTORY_STATE_VERSION),
  entries: z.record(z.string(), ClipHistoryEntrySchema),
  stats: z.strictObject({
    repeats: z.number().int().nonnegative(),
  }),
});

export type ClipHistoryEntry = z.infer<typeof ClipHistoryEntrySchema>;

export type HistoryLookup = z.infer<typeof HistoryLookupSchema>;

export type HistoryState = z.infer<typeof HistoryStateSchema>;

export const emptyHistory = (): HistoryState => ({
  version: HISTORY_STATE_VERSION,
  entries: {},
  stats: { repeats: 0 },
});

export const historyKey = (entry: ClipHistoryEntry): string =>
  `${entry.clipKey}|task:${entry.taskId}|at:${entry.timestamp}`;
