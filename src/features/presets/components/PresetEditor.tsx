import { useState } from 'preact/hooks';
import { CustomPresetSchema, MAX_PRESET_LABEL_LENGTH, presetAccentColors, type CustomPreset, type PresetAccentColor } from '../../../entities/preset.entity';
import { emptyVerdicts, verdictNames, verdictValues, type VerdictName, type VerdictSelection, type VerdictValue } from '../../../entities/verdict.entity';
import type { Translate } from '../../../shared/services/i18n.service';
import { Modal } from '../../../shared/components/Modal';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import styles from './PresetEditor.module.css';

interface PresetEditorProps {
  nativeReview?: boolean;
  existingPresets: CustomPreset[];
  preset: CustomPreset | null;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (preset: CustomPreset) => void;
}

const categoryLabels = (t: Translate): Record<VerdictName, string> => ({
  cheating: t('labelCheating'),
  aimassist: t('labelAimAssist'),
  wallhack: t('labelWallHack'),
  autobhop: t('labelAutoBhop'),
  bot: t('labelBot'),
});

const valueLabel = (value: VerdictValue, t: Translate, nativeReview: boolean): string => value === 'positive' ? t(nativeReview ? 'cheatingYes' : 'btnYes') : value === 'negative' ? t(nativeReview ? 'cheatingNo' : 'btnNo') : t('btnUncertain');

export const PresetEditor = ({ nativeReview = false, existingPresets, preset, onClose, onDelete, onSave }: PresetEditorProps) => {
  const t = useTranslation();
  const [label, setLabel] = useState(preset?.label ?? '');
  const [color, setColor] = useState<PresetAccentColor>(preset?.color ?? 'green');
  const [verdicts, setVerdicts] = useState<VerdictSelection>(nativeReview
    ? { ...emptyVerdicts(), cheating: preset?.verdicts.cheating ?? 'skip' }
    : preset ? { ...preset.verdicts } : emptyVerdicts());
  const [autoSubmit, setAutoSubmit] = useState(preset?.autoSubmit ?? false);
  const normalized = label.trim().toLocaleLowerCase('en-US');
  const isDuplicate = existingPresets.some((value) => value !== preset && value.label.toLocaleLowerCase('en-US') === normalized);
  const parsed = CustomPresetSchema.safeParse({ label, color, verdicts, autoSubmit });
  const canSave = parsed.success && !isDuplicate;
  const labels = categoryLabels(t);
  const categories: readonly VerdictName[] = nativeReview ? ['cheating'] : verdictNames;

  return (
    <Modal labelledBy="vacnet-preset-editor-title" onClose={onClose}>
      <form class={styles.form} onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave(parsed.data);
      }}>
        <h2 id="vacnet-preset-editor-title">{preset ? t('editPreset') : t('createPreset')}</h2>
        <label class={styles.name}>{t('presetName')}<input value={label} maxLength={MAX_PRESET_LABEL_LENGTH} required onInput={(event) => setLabel(event.currentTarget.value)} /></label>
        <fieldset>
          <legend>{t('presetColor')}</legend>
          <div class={styles.colors}>
            {presetAccentColors.map((value) => <label key={value} title={t(`presetColor${value[0]?.toUpperCase()}${value.slice(1)}` as Parameters<Translate>[0])}>
              <input type="radio" name="preset-color" checked={color === value} onChange={() => setColor(value)} />
               <span class={styles[value]} />
            </label>)}
          </div>
        </fieldset>
        {categories.map((name) => <fieldset key={name}>
          <legend>{labels[name]}</legend>
          <div class={styles.verdicts}>
            {verdictValues.map((value) => <label key={value}>
              <input type="radio" name={`editor-${name}`} checked={verdicts[name] === value} onChange={() => setVerdicts({ ...verdicts, [name]: value })} />
              <span>{valueLabel(value, t, nativeReview)}</span>
            </label>)}
          </div>
        </fieldset>)}
        {isDuplicate && <p class={styles.error} role="alert">{t('presetNameDuplicate')}</p>}
        <div class={styles.actions}>
          <label class={styles.autoSubmitToggle}>
            <input type="checkbox" class={styles.switch} checked={autoSubmit} onChange={(e) => setAutoSubmit(e.currentTarget.checked)} />
            <span>{t('autoSubmitPreset')}</span>
          </label>
          <span />
          {onDelete && <button type="button" class={styles.delete} onClick={onDelete}>{t('deletePreset')}</button>}
          <button type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" disabled={!canSave}>{t('savePreset')}</button>
        </div>
      </form>
    </Modal>
  );
};
