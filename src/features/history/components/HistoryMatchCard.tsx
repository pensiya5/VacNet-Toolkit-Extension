import { historyKey, type ClipHistoryEntry } from '../../../entities/history.entity';
import { verdictNames, type VerdictValue } from '../../../entities/verdict.entity';
import type { Translate } from '../../../shared/services/i18n.service';
import { useTranslation } from '../../../shared/components/TranslationProvider';
import { formatClipRange, formatMatchDate } from '../../../shared/utils/formatters.utils';
import { getSafeExternalUrl } from '../../../shared/utils/external-url.utils';
import { type MatchHistory } from '../history.utils';
import styles from './HistoryMatchCard.module.css';

interface HistoryMatchCardProps {
  match: MatchHistory;
  matchNumber: number;
}

const verdictText = (value: VerdictValue, t: Translate): string => {
  if (value === 'positive') return t('btnYes');
  if (value === 'negative') return t('btnNo');
  return t('btnUncertain');
};

const deduplicationText = (entry: ClipHistoryEntry, t: Translate): string => {
  if (entry.deduplication === 'exact-duplicate') return t('clipStatusExactDuplicate');
  if (entry.deduplication === 'new-clip') return t('clipStatusNewClip');
  return t('clipStatusNewMatch');
};

const clipLink = (entry: ClipHistoryEntry): string =>
  `${entry.sourceWebmUrl}#t=${entry.range.start.toFixed(3)}`;

const statusClass = (entry: ClipHistoryEntry): string => {
  if (entry.deduplication === 'exact-duplicate') return `${styles.status} ${styles.statusExact}`;
  return `${styles.status} ${styles.statusNew}`;
};

const verdictClass = (value: VerdictValue): string => {
  if (value === 'positive') return styles.positive ?? '';
  if (value === 'negative') return styles.negative ?? '';
  return styles.skip ?? '';
};

export const HistoryMatchCard = ({ match, matchNumber }: HistoryMatchCardProps) => {
  const t = useTranslation();
  const entries = [...match.entries].sort((first, second) => first.timestamp - second.timestamp);
  const lastClip = entries.at(-1);
  if (!lastClip) return null;
  const firstClip = entries[0];
  if (!firstClip) return null;

  const taskIds = Array.from(new Set(entries.map((entry) => entry.taskId)));
  const labels = {
    aimassist: t('labelAimAssist'),
    wallhack: t('labelWallHack'),
    autobhop: t('labelAutoBhop'),
    bot: t('labelBot'),
  };

  return (
     <details class={styles.item}>
       <summary>
         <span title={match.fallbackVideoId ?? t('unknownDate')}>
           {t('historyMatchSummary', [String(matchNumber), formatMatchDate(match.matchTimestamp, t)])}
         </span>
       </summary>
       <button
         type="button"
         class={styles.taskTrigger}
         aria-label={`${t('taskId')}: ${taskIds.join(', ')}`}
         aria-describedby={`history-task-tooltip-${matchNumber}`}
       >
         {taskIds.length} {t('historyTasks')}
         <span class={styles.taskTooltip} id={`history-task-tooltip-${matchNumber}`} role="tooltip">
           {taskIds.map((taskId) => <span key={taskId}>{taskId}</span>)}
         </span>
       </button>
      <div class={styles.content}>
        <div class={styles.tools}>
          {getSafeExternalUrl(firstClip.sourceWebmUrl)
            ? <a href={getSafeExternalUrl(firstClip.sourceWebmUrl) ?? undefined} target="_blank" rel="noreferrer">{t('openVideo')}</a>
            : <span>{t('openVideo')}</span>}
          <span>{entries.length}</span>
        </div>
        {match.fallbackVideoId && <p class={styles.videoId}>{t('videoId')}: {match.fallbackVideoId}</p>}
        <ol class={styles.clipList}>
          {entries.map((entry, index) => (
            <li class={styles.clip} key={historyKey(entry)}>
              <div class={styles.clipHeader}>
                <strong>{t('clipNumber')} {index + 1}</strong>
                {getSafeExternalUrl(clipLink(entry))
                  ? <a href={getSafeExternalUrl(clipLink(entry)) ?? undefined} target="_blank" rel="noreferrer">
                      {formatClipRange(entry.range.start, entry.range.end, t)}
                    </a>
                   : <span>{formatClipRange(entry.range.start, entry.range.end, t)}</span>}
              </div>
              <div class={styles.clipMeta}>
                {match.fallbackVideoId === null && <span title={entry.videoId}>{t('videoId')}: {entry.videoId.substring(0, 16)}...</span>}
                <span>{t('taskId')}: {entry.taskId}</span>
                 <span>{t('eventTime')}: {entry.eventTime >= 0 ? t('timeSeconds', entry.eventTime.toFixed(3)) : t('none')}</span>
                {entry.verdictTick !== null && <span>{t('verdictTick')}: {entry.verdictTick.toFixed(2)}</span>}
                <span class={statusClass(entry)}>
                  {deduplicationText(entry, t)}
                </span>
              </div>
              {entry.badClip && <strong class={styles.badClip}>{t('badClip')}</strong>}
              <dl>
                {entry.reviewType === 'cheating' ? (entry.cheating && !entry.badClip && <div>
                  <dt>{t('labelCheating')}</dt>
                  <dd class={verdictClass(entry.cheating)}>{entry.cheating === 'positive' ? t('cheatingYes') : entry.cheating === 'negative' ? t('cheatingNo') : t('btnUncertain')}</dd>
                </div>) : verdictNames.map((name) => (
                  <div key={name}>
                    <dt>{labels[name]}</dt>
                    <dd class={verdictClass(entry[name])}>{verdictText(entry[name], t)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
};
