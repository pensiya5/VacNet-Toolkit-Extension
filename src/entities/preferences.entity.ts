import { z } from 'zod';
import { createDefaultCustomPresets, CustomPresetsSchema } from './preset.entity';
import { ThemeSchema } from './theme.entity';

export const PreferencesSchema = z.strictObject({
  dashboardOpen: z.boolean(),
  stretchVideo: z.boolean(),
  hideNickname: z.boolean(),
  customPresets: CustomPresetsSchema,
  cheatingPresets: CustomPresetsSchema.default([]),
  presetPanelOpen: z.boolean(),
  keepControlsVisible: z.boolean(),
  autoApplyRepeatVerdicts: z.boolean(),
  volume: z.number().finite().min(0).max(1),
  muted: z.boolean(),
  theme: ThemeSchema,
});

export const PreferencesPatchSchema = PreferencesSchema.partial();

export type Preferences = z.infer<typeof PreferencesSchema>;

export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;


const createPreferences = (): Preferences => ({
  dashboardOpen: false,
  stretchVideo: false,
  hideNickname: true,
  customPresets: createDefaultCustomPresets(),
  cheatingPresets: [],
  presetPanelOpen: false,
  keepControlsVisible: false,
  autoApplyRepeatVerdicts: false,
  volume: 0.1,
  muted: false,
  theme: 'dark',
});

export const createDefaultPreferences = (): Preferences => createPreferences();

