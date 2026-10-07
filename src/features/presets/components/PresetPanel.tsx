import { useState } from 'preact/hooks';
import { MAX_CUSTOM_PRESETS, type CustomPreset } from '../../../entities/preset.entity';
import { emptyVerdicts } from '../../../entities/verdict.entity';
import type { ReviewCommand } from '../../../shared/ports/protocol.port';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import { Modal } from '../../../shared/components/Modal';
import { PresetEditor } from './PresetEditor';
import { createPresetCommand } from '../../../shared/utils/preset-hotkeys.utils';
import styles from './PresetPanel.module.css';

interface PresetPanelProps {
  nativeReview?: boolean;
  isOpen: boolean;
  presets: CustomPreset[];
  onCommand: (command: ReviewCommand) => void;
  onSave: (presets: CustomPreset[]) => void;
}

export const PresetPanel = ({ nativeReview = false, isOpen, presets, onCommand, onSave }: PresetPanelProps) => {
  const t = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const isCreating = editingIndex === presets.length;
  const editingPreset = isCreating ? null : (editingIndex === null ? null : presets[editingIndex] ?? null);

  return (
    <>
      <aside class={`${styles.panel} ${nativeReview ? styles.nativePanel : ''} ${isOpen ? styles.open : ''}`} aria-hidden={!isOpen} inert={!isOpen} aria-label={t('presetPanelTitle')}>
        <h1>{t('presetPanelTitle')}</h1>
        <div class={styles.grid}>
          {presets.map((preset, index) => (
            <div class={styles.tileWrap} key={`${preset.label}-${index}`}>
              <button
                type="button"
                 class={`${styles.tile} ${styles[preset.color]}`}
                title={`${index + 1}: ${preset.label}`}
                onClick={() => onCommand(createPresetCommand(preset))}
              >
                <kbd>{index + 1}</kbd><span>{preset.label}</span>
              </button>
              <button type="button" class={styles.edit} aria-label={`${t('editPreset')} ${preset.label}`} onClick={() => setEditingIndex(index)}>…</button>
            </div>
          ))}
          {presets.length < MAX_CUSTOM_PRESETS && (
            <button type="button" class={`${styles.tile} ${styles.add}`} aria-label={t('createPreset')} onClick={() => setEditingIndex(presets.length)}>+</button>
          )}
        </div>
        <button type="button" class={styles.reset} onClick={() => setShowResetConfirm(true)}>{t('resetVerdicts')}</button>
      </aside>
      {editingIndex !== null && (
        <PresetEditor
          nativeReview={nativeReview}
          preset={editingPreset}
          existingPresets={presets}
          onClose={() => setEditingIndex(null)}
          {...(editingPreset ? {
            onDelete: () => {
              onSave(presets.filter((_, index) => index !== editingIndex));
              setEditingIndex(null);
            }
          } : {})}
          onSave={(preset) => {
            onSave(isCreating ? [...presets, preset] : presets.map((value, index) => index === editingIndex ? preset : value));
            setEditingIndex(null);
          }}
        />
      )}
      {showResetConfirm && (
        <Modal labelledBy="vacnet-preset-reset-title" onClose={() => setShowResetConfirm(false)}>
          <form
            class={styles.resetConfirm}
            onSubmit={(event) => {
              event.preventDefault();
              onCommand({ type: 'set-verdicts', verdicts: nativeReview ? { ...emptyVerdicts(), cheating: 'skip' } : emptyVerdicts() });
              onSave([]);
              setShowResetConfirm(false);
            }}
          >
            <h2 id="vacnet-preset-reset-title">{t('confirmResetPresetsTitle')}</h2>
            <p>{t('confirmResetPresetsMessage')}</p>
            <div class={styles.resetConfirmActions}>
              <button type="button" onClick={() => setShowResetConfirm(false)}>{t('cancel')}</button>
              <button type="submit" class={styles.delete}>{t('btnResetConfirm')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
};
