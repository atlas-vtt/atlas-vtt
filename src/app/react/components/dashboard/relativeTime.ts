import { t } from '../../../i18n';
import type { MessageKey } from '../../../i18n/types';
import type { Campaign } from '../../../campaigns/campaignTypes';

/** The sentence for each step of a relative time; the counted ones take `{count}`. */
export interface RelativeTimePhrases {
  justNow: MessageKey;
  minutes: MessageKey;
  hours: MessageKey;
  days: MessageKey;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const AGO: RelativeTimePhrases = {
  justNow: 'dashboard.justNow',
  minutes: 'dashboard.minutesAgo',
  hours: 'dashboard.hoursAgo',
  days: 'dashboard.daysAgo',
};

/** How long ago `timestamp` was, in the dashboard's short style ("3h ago"). */
export function formatRelativeTime(timestamp: number, phrases: RelativeTimePhrases = AGO, now: number = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE) return t(phrases.justNow);
  if (diff < HOUR) return t(phrases.minutes, { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t(phrases.hours, { count: Math.floor(diff / HOUR) });
  return t(phrases.days, { count: Math.floor(diff / DAY) });
}

const PLAYED: RelativeTimePhrases = {
  justNow: 'campaign.playedJustNow',
  minutes: 'campaign.playedMinutesAgo',
  hours: 'campaign.playedHoursAgo',
  days: 'campaign.playedDaysAgo',
};

const CREATED: RelativeTimePhrases = {
  justNow: 'campaign.createdJustNow',
  minutes: 'campaign.createdMinutesAgo',
  hours: 'campaign.createdHoursAgo',
  days: 'campaign.createdDaysAgo',
};

/** "Last played 3d ago", or when it was made for a campaign never played. */
export const campaignActivity = (campaign: Campaign): string => (campaign.lastPlayed !== undefined
  ? formatRelativeTime(campaign.lastPlayed, PLAYED)
  : formatRelativeTime(campaign.createdAt, CREATED));
