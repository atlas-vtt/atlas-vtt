import { getLocale, t } from '../../../../../i18n';
import type { DownloadJob } from '../../../../../downloads/downloadTypes';

const MB = 1_000_000;

/** One decimal below 10 of a unit, whole numbers above: "4.2 MB", "260 MB". */
function unitText(value: number, unit: string): string {
  return new Intl.NumberFormat(getLocale(), { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}

/** "120 of 260 MB": both in the larger number's precision, so the two never disagree on decimals. */
export function amountText(done: number, total: number): string {
  const digits = total / MB < 10 ? 1 : 0;
  const number = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits }).format(done / MB);
  return t('downloads.amount', { done: number, total: unitText(total / MB, 'megabyte') });
}

export function speedText(bytesPerSecond: number): string {
  return unitText(bytesPerSecond / MB, 'megabyte-per-second');
}

/** Rounded up, so the last seconds never read "0 s left". */
export function timeLeftText(seconds: number): string {
  if (seconds < 60) return t('downloads.left', { time: unitText(Math.max(1, Math.ceil(seconds / 5) * 5), 'second') });
  if (seconds < 100 * 60) return t('downloads.left', { time: unitText(Math.ceil(seconds / 60), 'minute') });
  return t('downloads.left', { time: unitText(Math.ceil(seconds / 360) / 10, 'hour') });
}

/** The line under a job's bar: what it moved, how fast and for how long yet; or what became of it. */
export function jobLine(job: DownloadJob): string {
  switch (job.state) {
    case 'queued':
      return t('downloads.queued');
    case 'cancelled':
      return t('downloads.cancelled');
    case 'failed':
      return job.failure ?? t('downloads.failed');
    case 'done':
      return t('downloads.done', { size: unitText(job.total.bytes / MB, 'megabyte') });
    case 'downloading':
      return [
        amountText(job.done.bytes, job.total.bytes),
        job.speed !== null ? speedText(job.speed) : null,
        job.secondsLeft !== null ? timeLeftText(job.secondsLeft) : null,
      ].filter((part): part is string => part !== null).join(' · ');
  }
}
