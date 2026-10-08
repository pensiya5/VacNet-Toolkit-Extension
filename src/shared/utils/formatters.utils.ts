import type { Translate } from '../services/i18n.service';

export const formatClipRange = (start: number, end: number, t: Translate): string => {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return t('notAvailable');
  return t('timeRangeSeconds', [start.toFixed(3), end.toFixed(3)]);
};

export const formatVideoTime = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  let whole = Math.floor(seconds);
  let centis = Math.round((seconds - whole) * 100);
  if (centis >= 100) { whole += 1; centis = 0; }
  const part = (value: number): string => String(value).padStart(2, '0');
  return `${Math.floor(whole / 60)}:${part(whole % 60)}.${part(centis)}`;
};

export const formatMatchDate = (matchTimestamp: number | null, t: Translate): string => {
  if (matchTimestamp === null) return t('legacy');
  if (!Number.isFinite(matchTimestamp)) return t('notAvailable');
  const date = new Date(matchTimestamp * 1000);
  if (Number.isNaN(date.getTime())) return t('notAvailable');
  const part = (value: number): string => String(value).padStart(2, '0');
  return `${part(date.getDate())}.${part(date.getMonth() + 1)}.${part(date.getFullYear() % 100)} | ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
};
