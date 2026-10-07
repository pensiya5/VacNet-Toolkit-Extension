import { getMessage } from '../../../shared/services/i18n.service';
import type { ClipData, ClipDeduplication, NativeReviewControls } from '../../../entities/clip.entity';
import { emptyVerdicts, verdictNames, verdictValues, type VerdictName, type VerdictSelection, type VerdictValue } from '../../../entities/verdict.entity';
import type { Translate } from '../../../shared/services/i18n.service';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import { formatMatchDate } from '../../../shared/utils/formatters.utils';
import styles from './VerdictPanel.module.css';

interface VerdictPanelProps {
  nativeReview?: boolean;
  reviewControls?: NativeReviewControls | null;
  clip: ClipData | null;
  deduplication: ClipDeduplication | null;
  clipCount: string | null;
  error: string | null;
  onChange: (name: VerdictName, value: VerdictValue) => void;
  onSubmit: (verdicts: VerdictSelection, badClip: boolean) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onReportBadClip?: () => void;
  previousVerdicts: VerdictSelection | null;
  submitting: boolean;
  verdicts: VerdictSelection;
}

const labels = (t: Translate): Record<VerdictName, string> => ({
  cheating: t('labelCheating'),
  aimassist: t('labelAimAssist'),
  wallhack: t('labelWallHack'),
  autobhop: t('labelAutoBhop'),
  bot: t('labelBot'),
});

const choiceLabel = (value: VerdictValue, t: Translate, nativeReview = false): string => {
  if (value === 'positive') return t(nativeReview ? 'cheatingYes' : 'btnYes');
  if (value === 'negative') return t(nativeReview ? 'cheatingNo' : 'btnNo');
  return t('btnUncertain');
};

const assertNever = (value: never): never => {
  throw new Error(getMessage("errUnhandledDeduplicationStatus", String(value)));
};

interface DuplicateSummary {
  videoLabel: string;
  videoClass: string;
  momentLabel: string;
  momentClass: string;
}

const duplicateSummary = (status: ClipDeduplication | null, t: Translate): DuplicateSummary => {
  if (status === null) {
    return {
      videoLabel: t('clipSummaryChecking'),
      videoClass: styles.valSkip ?? '',
      momentLabel: t('clipSummaryChecking'),
      momentClass: styles.valSkip ?? '',
    };
  }

  switch (status) {
    case 'exact-duplicate':
      return {
        videoLabel: t('clipSummaryRepeat'),
        videoClass: styles.valPositive ?? '',
        momentLabel: t('clipSummaryRepeat'),
        momentClass: styles.valPositive ?? '',
      };
    case 'new-clip':
    case 'new-match':
      return {
        videoLabel: t('clipSummaryNew'),
        videoClass: styles.valNegative ?? '',
        momentLabel: t('clipSummaryNew'),
        momentClass: styles.valNegative ?? '',
      };
  }

  return assertNever(status);
};

const valueColorClass = (value: VerdictValue): string => {
  if (value === 'positive') return styles.valPositive ?? '';
  if (value === 'negative') return styles.valNegative ?? '';
  return styles.valSkip ?? '';
};

const choiceColorClass = (value: VerdictValue): string => {
  if (value === 'positive') return styles.positive ?? '';
  if (value === 'negative') return styles.negative ?? '';
  return styles.skip ?? '';
};

export const VerdictPanel = ({
  nativeReview = false,
  reviewControls = null,
  clip,
  clipCount,
  deduplication,
  error,
  onChange,
  onSubmit,
  onConfirm,
  onCancel,
  onReportBadClip,
  previousVerdicts,
  submitting,
  verdicts,
}: VerdictPanelProps) => {
  const t = useTranslation();
  const categoryLabels = labels(t);
  const summary = duplicateSummary(deduplication, t);
  const categories: readonly VerdictName[] = nativeReview ? ['cheating'] : verdictNames;
  const previousCategories: readonly VerdictName[] = previousVerdicts?.cheating !== undefined ? ['cheating'] : verdictNames;
  const nativeAvailability = {
    positive: reviewControls?.positiveAvailable ?? false,
    skip: reviewControls?.skipAvailable ?? false,
    negative: reviewControls?.negativeAvailable ?? false,
  };

  return (
    <section class={`${styles.panel} ${nativeReview ? styles.nativePanel : ''}`} aria-label={t('verdictTitle')}>
      <h1>{t('verdictTitle')}</h1>
      {categories.map((name) => (
        <fieldset class={styles.category} disabled={submitting || (nativeReview && Boolean(reviewControls?.confirming))} key={name}>
          <legend>{categoryLabels[name]}</legend>
          <div class={styles.choices}>
            {verdictValues.map((value) => {
              const inputId = `vacnet-${name}-${value}`;
              return (
                  <label class={`${styles.choice} ${choiceColorClass(value)}`} key={value} htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="radio"
                    name={`vacnet-${name}`}
                    value={value}
                    disabled={nativeReview && !nativeAvailability[value]}
                    checked={verdicts[name] === value}
                    onChange={() => onChange(name, value)}
                  />
                  <span>{choiceLabel(value, t, nativeReview)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {error && <p class={styles.error} role="alert">{error}</p>}
      {nativeReview && <p class={styles.hint} role="status">{t(reviewControls?.confirming ? 'nativeConfirmHint' : 'nativeWatchHint')}</p>}
      {nativeReview ? <div class={styles.actions}>
        <button type="button" disabled={submitting || !reviewControls?.confirmAvailable} onClick={onConfirm}>
          {t('btnConfirm')}
        </button>
        <button type="button" disabled={submitting || !reviewControls?.confirming} onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="button" class={styles.report} disabled={submitting || !clip || Boolean(reviewControls?.confirming)} onClick={onReportBadClip}>
          {t('btnReportBadClip')}
        </button>
      </div> : <div class={styles.actions}>
        <button type="button" disabled={submitting} onClick={() => onSubmit(verdicts, false)}>
          {t('btnSubmit')}
        </button>
        <button type="button" disabled={submitting} onClick={() => onSubmit(emptyVerdicts(), false)}>
          {t('btnSkip')}
        </button>
      </div>}
      {nativeReview && reviewControls?.decisionTick != null && <p class={styles.decisionTick}>{t('verdictTick')}: {reviewControls.decisionTick.toFixed(2)}</p>}
      
      {clip && (
        <div class={previousVerdicts ? styles.infoGrid : styles.infoGridSingle}>
          <section class={styles.previous}>
            <h2>{t('clipDetails')}</h2>
            <dl>
              <div><dt>{t('clipSummaryVideo')}</dt><dd class={summary.videoClass}>{summary.videoLabel}</dd></div>
              <div><dt>{t('clipSummaryMoment')}</dt><dd class={summary.momentClass}>{summary.momentLabel}</dd></div>
              <div><dt>{t('matchDate')}</dt><dd>{formatMatchDate(clip.matchTimestamp, t)}</dd></div>
              <div><dt>{t('taskId')}</dt><dd>{clip.taskId}</dd></div>
              <div><dt>{t('clipSummaryRange')}</dt><dd>{clip.range.start.toFixed(3)} - {clip.range.end.toFixed(3)}</dd></div>
            </dl>
          </section>
          
          {previousVerdicts && (
            <section class={styles.previous}>
              <h2>{t('previousVerdicts')}</h2>
              <dl>
                {previousCategories.map((name) => {
                  const val = previousVerdicts[name];
                  if (val === undefined) return null;
                  return (
                    <div key={name}>
                      <dt>{categoryLabels[name]}</dt>
                      <dd class={valueColorClass(val)}>{choiceLabel(val, t, name === 'cheating')}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}
        </div>
      )}

      {submitting && <p class={styles.status} role="status">{t('statusLoadingNextClip')}</p>}
      
      {clipCount && <div class={styles.clipCount}>{t('clipsLabeled')} {clipCount}</div>}
    </section>
  );
};
