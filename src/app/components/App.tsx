import { createPortal } from 'preact/compat';
import type { Preferences } from '../../entities/preferences.entity';
import type { Theme } from '../../entities/theme.entity';

import { Dashboard } from '../../features/dashboard/components/Dashboard';
import { DashboardMetrics } from '../../features/dashboard/components/DashboardMetrics';
import { dashboardStore } from '../../features/dashboard/dashboard.store';
import { DashboardHistory } from '../../features/history/components/DashboardHistory';
import { updatePreferences, preferencesSignal } from '../../features/preferences/preferences.store';
import { snapshotSignal } from '../../features/video-player/player/player.store';
import { historySignal } from '../../features/history/history.store';
import { VerdictPanel } from '../../features/verdicts/components/VerdictPanel';
import { PresetPanel } from '../../features/presets/components/PresetPanel';
import type { ReviewCommand } from '../../shared/ports/protocol.port';
import { useTranslation } from '../../shared/components/TranslationProvider';
import { Icon } from '../../shared/components/Icon';
import styles from './App.module.css';

interface AppProps {
  nativeReview?: boolean;
  footerTarget: HTMLElement | null;
  onReviewCommand: (command: ReviewCommand) => void;
  onClearHistory: () => void;
  onCopyMetrics: () => void;
  onError: (error: unknown) => void;
  onImportHistory: (data: unknown) => void;
  onExportHistory: () => void;
}

interface DashboardLinksProps {
  metricsLabel: string;
  historyLabel: string;
  onSelect: (mode: 'metrics' | 'history') => void;
}

const DashboardLinks = ({ metricsLabel, historyLabel, onSelect }: DashboardLinksProps) => {
  const selectedMode = dashboardStore.value;
  return (
    <>
      <a href="#" aria-current={selectedMode === 'metrics' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onSelect('metrics'); }}>{metricsLabel}</a>
      <a href="#" aria-current={selectedMode === 'history' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onSelect('history'); }}>{historyLabel}</a>
    </>
  );
};

const persistPreferences = (
  patch: Partial<Preferences>,
  onError: (error: unknown) => void,
): void => {
  void updatePreferences(patch).catch(onError);
};

const ToolbarButtons = ({ onError }: { onError: (error: unknown) => void }) => {
  const t = useTranslation();
  const preferences = preferencesSignal;
  const currentTheme = preferences.value.theme;
  const nextTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
  return (
    <>
      <button
        type="button"
        class={currentTheme === 'light' ? styles.active : undefined}
        aria-label={t('themeToggleTitle')}
        title={t('themeToggleHint')}
        aria-pressed={currentTheme === 'light'}
        onClick={() => persistPreferences({ theme: nextTheme }, onError)}
      ><Icon name={currentTheme === 'light' ? 'sun' : 'moon'} /></button>
      <button
        type="button"
        class={preferences.value.presetPanelOpen ? styles.active : undefined}
        aria-label={t('presetPanelTitle')}
        title={t('presetPanelHint')}
        aria-pressed={preferences.value.presetPanelOpen}
        onClick={() => persistPreferences({ presetPanelOpen: !preferences.value.presetPanelOpen }, onError)}
      ><Icon name="tune" /></button>
      <button
        type="button"
        class={preferences.value.hideNickname ? styles.active : undefined}
        aria-label={t('hideNickname')}
        title={t('hideNicknameHint')}
        aria-pressed={preferences.value.hideNickname}
        onClick={() => persistPreferences({ hideNickname: !preferences.value.hideNickname }, onError)}
      ><Icon name="eyeOff" /></button>
      <button
        type="button"
        class={preferences.value.autoApplyRepeatVerdicts ? styles.active : undefined}
        aria-label={t('autoApplyRepeatVerdicts')}
        title={t('autoApplyRepeatVerdictsHint')}
        aria-pressed={preferences.value.autoApplyRepeatVerdicts}
        onClick={() => persistPreferences({ autoApplyRepeatVerdicts: !preferences.value.autoApplyRepeatVerdicts }, onError)}
      ><Icon name="autoVerdict" /></button>
      <button
        type="button"
        class={preferences.value.keepControlsVisible ? styles.active : undefined}
        aria-label={t('keepControlsVisible')}
        title={t('keepControlsVisibleHint')}
        aria-pressed={preferences.value.keepControlsVisible}
        onClick={() => persistPreferences({ keepControlsVisible: !preferences.value.keepControlsVisible }, onError)}
      ><Icon name="lock" /></button>
      <button
        type="button"
        class={preferences.value.stretchVideo ? styles.active : undefined}
        aria-label={t('stretchVideo')}
        title={t('stretchVideo')}
        aria-pressed={preferences.value.stretchVideo}
        onClick={() => persistPreferences({ stretchVideo: !preferences.value.stretchVideo }, onError)}
      ><Icon name="stretch" /></button>
    </>
  );
};

const VerdictPanelContainer = ({ nativeReview, onReviewCommand }: { nativeReview: boolean; onReviewCommand: (command: ReviewCommand) => void }) => {
  const snapshot = snapshotSignal;
  return (
    <VerdictPanel
      nativeReview={nativeReview}
      reviewControls={snapshot.value.reviewControls}
      clip={snapshot.value.clip}
      deduplication={snapshot.value.deduplication}
      clipCount={snapshot.value.clip?.clipCount ?? null}
      error={snapshot.value.error}
      previousVerdicts={snapshot.value.previousVerdicts}
      submitting={snapshot.value.submitting}
      verdicts={snapshot.value.verdicts}
      onChange={(name, value) => {
        onReviewCommand({ type: 'set-verdict', name, value });
      }}
      onSubmit={(verdicts, badClip) => {
        onReviewCommand({ type: 'submit', verdicts, badClip });
      }}
      onConfirm={() => onReviewCommand({ type: 'confirm-verdict' })}
      onCancel={() => onReviewCommand({ type: 'cancel-verdict' })}
      onReportBadClip={() => onReviewCommand({ type: 'report-bad-clip' })}
    />
  );
};

const DashboardContainer = ({
  onImportHistory,
  onExportHistory,
  onError,
  onClearHistory,
  onCopyMetrics,
}: {
  onImportHistory: (data: unknown) => void;
  onExportHistory: () => void;
  onError: (error: unknown) => void;
  onClearHistory: () => void;
  onCopyMetrics: () => void;
}) => {
  const snapshot = snapshotSignal;
  const closeDashboard = (): void => {
    dashboardStore.close();
    persistPreferences({ dashboardOpen: false }, onError);
  };
  return (
    <Dashboard
      history={<DashboardHistory history={historySignal.value} totalClipsViewed={snapshot.value.clip?.clipCount ?? 0} />}
      metrics={<DashboardMetrics snapshot={snapshot.value} />}
      mode={dashboardStore.value}
      onImportHistory={onImportHistory}
      onExportHistory={onExportHistory}
      onImportError={onError}
      onClose={closeDashboard}
      onClearHistory={onClearHistory}
      onCopyMetrics={onCopyMetrics}
    />
  );
};

export const App = ({
  nativeReview = false,
  footerTarget,
  onClearHistory,
  onCopyMetrics,
  onError,
  onReviewCommand,
  onImportHistory,
  onExportHistory,
}: AppProps) => {
  const t = useTranslation();

  const toggleDashboard = (mode: 'metrics' | 'history'): void => {
    const nextMode = dashboardStore.value === mode ? null : mode;
    if (nextMode === null) dashboardStore.close();
    else dashboardStore.open(nextMode);
    persistPreferences({ dashboardOpen: nextMode !== null }, onError);
  };

  return (
    <div class={styles.appShell}>
      <nav class={styles.videoToolbar} aria-label={t('reviewInstructions')}>
        <div class={styles.hoverDropdown}>
          <button type="button" aria-label={t('reviewInstructions')}><Icon name="info" /></button>
          <div class={styles.dropdownContent}>
            <strong>{t(nativeReview ? 'nativeReviewInstructions' : 'watchClipInstructions')}</strong>
            <hr />
            {!nativeReview && <ul class={styles.dropdownList}>
              <li>{t('xrayActive')}</li>
              <li>{t('verdictTrainingNotice')}</li>
              <li>{t('uncertainNotice')}</li>
              <li>{t('clipSelectionNotice')}</li>
            </ul>}
          </div>
        </div>
        <div class={styles.hoverDropdown}>
          <button type="button" aria-label={t('hotkeyTitle')}><Icon name="keyboard" /></button>
          <div class={styles.dropdownContent}>
            <strong>{t('hotkeyTitle')}</strong>
            <hr />
            <ul class={styles.dropdownList}>
              {t(nativeReview ? 'nativeHotkeyHelp' : 'hotkeyHelp').split('·').map((hotkey) => <li key={hotkey}>{hotkey.trim()}</li>)}
            </ul>
          </div>
        </div>
        <ToolbarButtons onError={onError} />
      </nav>
      {footerTarget ? createPortal(
        <DashboardLinks
          metricsLabel={t('devMetricsTitle')}
          historyLabel={t('historyLogTitle')}
          onSelect={toggleDashboard}
        />,
        footerTarget
      ) : (
        <nav class={styles.footerTools} aria-label={t('devMetricsTitle')}>
          <DashboardLinks
            metricsLabel={t('devMetricsTitle')}
            historyLabel={t('historyLogTitle')}
            onSelect={toggleDashboard}
          />
        </nav>
      )}
      <div class={nativeReview ? styles.nativeReviewLayout : styles.reviewLayout}>
        <PresetPanel
          nativeReview={nativeReview}
          isOpen={preferencesSignal.value.presetPanelOpen}
          presets={nativeReview ? preferencesSignal.value.cheatingPresets : preferencesSignal.value.customPresets}
          onCommand={onReviewCommand}
          onSave={(presets) => persistPreferences(nativeReview ? { cheatingPresets: presets } : { customPresets: presets }, onError)}
        />
        <VerdictPanelContainer nativeReview={nativeReview} onReviewCommand={onReviewCommand} />
      </div>
      <DashboardContainer
        onImportHistory={onImportHistory}
        onExportHistory={onExportHistory}
        onError={onError}
        onClearHistory={onClearHistory}
        onCopyMetrics={onCopyMetrics}
      />
    </div>
  );
};
