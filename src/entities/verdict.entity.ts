import { z } from 'zod';

export const verdictNames = ['aimassist', 'wallhack', 'autobhop', 'bot'] as const;

export const verdictValues = ['positive', 'skip', 'negative'] as const;

export const VerdictNameSchema = z.enum([...verdictNames, 'cheating']);

export const VerdictValueSchema = z.enum(verdictValues);

export const VerdictSelectionSchema = z.strictObject({
  aimassist: VerdictValueSchema,
  wallhack: VerdictValueSchema,
  autobhop: VerdictValueSchema,
  bot: VerdictValueSchema,
  cheating: VerdictValueSchema.optional(),
});

export type VerdictName = z.infer<typeof VerdictNameSchema>;

export type VerdictValue = z.infer<typeof VerdictValueSchema>;

export type VerdictSelection = z.infer<typeof VerdictSelectionSchema>;

export const emptyVerdicts = (): VerdictSelection => ({
  aimassist: 'skip',
  wallhack: 'skip',
  autobhop: 'skip',
  bot: 'skip',
});
