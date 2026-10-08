import { z } from 'zod';
import { VerdictSelectionSchema } from './verdict.entity';

const boundedText = z.string().trim().min(1).max(2_048);

export const ClipRangeSchema = z.strictObject({
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
}).refine(({ end, start }) => end > start, {
  message: 'Clip end must be greater than clip start.',
  path: ['end'],
});

export const ClipDeduplicationSchema = z.enum([
  'new-match',
  'new-clip',
  'exact-duplicate',
]);

export const ClipIdentitySchema = z.strictObject({
  taskId: boundedText,
  sourceWebmUrl: z.url().max(8_192),
  videoId: boundedText,
});

export const ClipDetailsSchema = z.strictObject({
  range: ClipRangeSchema,
  eventTime: z.union([z.number().finite().nonnegative(), z.literal(-1)]),
  reviewType: z.enum(['legacy', 'cheating']).default('legacy'),
  clipCount: z.string().trim().max(128).nullable(),
  app: boundedText,
  matchTimestamp: z.number().finite().nonnegative().nullable().default(null),
  webmDuration: z.number().finite().nonnegative().nullable().default(null),
});

export const ClipDataSchema = ClipIdentitySchema.merge(ClipDetailsSchema);

export const PlayerMetricsSchema = z.strictObject({
  id: boundedText,
  version: z.string().max(128).nullable(),
  language: z.string().max(128).nullable(),
  debugEnabled: z.boolean(),
  players: z.number().int().nonnegative(),
  frameDuration: z.number().finite().positive(),
});

export const NativeReviewControlsSchema = z.strictObject({
  positiveAvailable: z.boolean(),
  skipAvailable: z.boolean(),
  negativeAvailable: z.boolean(),
  confirming: z.boolean(),
  confirmAvailable: z.boolean(),
  decisionTick: z.number().finite().nonnegative().nullable(),
  decisionTime: z.number().finite().nonnegative().nullable(),
});
export type NativeReviewControls = z.infer<typeof NativeReviewControlsSchema>;

export const PageSnapshotSchema = z.strictObject({
  clip: ClipDataSchema.nullable(),
  deduplication: ClipDeduplicationSchema.nullable(),
  player: PlayerMetricsSchema.nullable(),
  verdicts: VerdictSelectionSchema,
  previousVerdicts: VerdictSelectionSchema.nullable(),
  hasVideo: z.boolean(),
  submitting: z.boolean(),
  error: z.string().max(8_192).nullable(),
  reviewControls: NativeReviewControlsSchema.nullable().default(null),
});

export type ClipRange = z.infer<typeof ClipRangeSchema>;

export type ClipDeduplication = z.infer<typeof ClipDeduplicationSchema>;

export type ClipIdentity = z.infer<typeof ClipIdentitySchema>;

export type ClipData = z.infer<typeof ClipDataSchema>;

export type PlayerMetrics = z.infer<typeof PlayerMetricsSchema>;

export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;

export interface ClipCompositeIdentity {
  clipKey: string;
  identity: string;
}

export const extractVideoId = (sourceWebmUrl: string): string => {
  let filename = sourceWebmUrl;
  try {
    const url = new URL(sourceWebmUrl);
    filename = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
  } catch {
    filename = sourceWebmUrl.split(/[/?#]/u).filter(Boolean).at(-1) ?? sourceWebmUrl;
  }
  const stem = filename.replace(/\.webm$/iu, '');
  const hash = stem.match(/^(?:csow|cl)_([0-9a-f]{16,})$/iu)?.[1];
  return (hash ?? stem).trim().toLowerCase();
};

export const createClipIdentity = (
  clip: Pick<ClipData, 'taskId' | 'videoId' | 'range'>,
): ClipCompositeIdentity => {
  const videoId = clip.videoId.trim().toLowerCase();
  const start = Math.round(clip.range.start * 1_000);
  const end = Math.round(clip.range.end * 1_000);
  const clipKey = `video:${videoId}|start:${start}|end:${end}`;
  return {
    clipKey,
    identity: `${clip.taskId}\u0000${clipKey}`,
  };
};
