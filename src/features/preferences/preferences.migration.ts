import { z } from 'zod';
import { createDefaultPreferences, PreferencesSchema, type Preferences } from '../../entities/preferences.entity';
import { CustomPresetsSchema } from '../../entities/preset.entity';
import { ThemeSchema } from '../../entities/theme.entity';

const StoredPreferencesSchema = z.object({
  dashboardOpen: z.boolean().optional(),
  stretchVideo: z.boolean().optional(),
  hideNickname: z.boolean().optional(),
  customPresets: z.unknown().optional(),
  cheatingPresets: z.unknown().optional(),
  presetPanelOpen: z.boolean().optional(),
  keepControlsVisible: z.boolean().optional(),
  autoApplyRepeatVerdicts: z.boolean().optional(),
  volume: z.number().finite().min(0).max(1).optional(),
  muted: z.boolean().optional(),
  theme: z.unknown().optional(),
});

export type LegacyPreferenceValues = {
  dashboardOpen: unknown;
  stretchVideo: unknown;
};

export const migrateStoredPreferences = (
  value: unknown,
  legacyValues: LegacyPreferenceValues,
): Preferences => {
  const defaults = createDefaultPreferences();
  const parsed = StoredPreferencesSchema.safeParse(value);
  const source = parsed.success ? parsed.data : {};
  const presets = CustomPresetsSchema.safeParse(source.customPresets);
  const cheatingPresets = CustomPresetsSchema.safeParse(source.cheatingPresets);
  const legacyDashboardOpen = z.boolean().safeParse(legacyValues.dashboardOpen);
  const legacyStretchVideo = z.boolean().safeParse(legacyValues.stretchVideo);
  const theme = ThemeSchema.parse(source.theme);

  return PreferencesSchema.parse({
    dashboardOpen: source.dashboardOpen ?? (legacyDashboardOpen.success ? legacyDashboardOpen.data : defaults.dashboardOpen),
    stretchVideo: source.stretchVideo ?? (legacyStretchVideo.success ? legacyStretchVideo.data : defaults.stretchVideo),
    hideNickname: source.hideNickname ?? defaults.hideNickname,
    customPresets: presets.success ? presets.data : defaults.customPresets,
    cheatingPresets: cheatingPresets.success ? cheatingPresets.data : defaults.cheatingPresets,
    presetPanelOpen: source.presetPanelOpen ?? defaults.presetPanelOpen,
    keepControlsVisible: source.keepControlsVisible ?? defaults.keepControlsVisible,
    autoApplyRepeatVerdicts: source.autoApplyRepeatVerdicts ?? defaults.autoApplyRepeatVerdicts,
    volume: source.volume ?? defaults.volume,
    muted: source.muted ?? defaults.muted,
    theme,
  });
};
