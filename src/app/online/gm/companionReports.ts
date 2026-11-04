import { ERROR_REPORTS_KEPT_DAYS, type FeedbackSender } from '../protocol/index.ts';

/** What the GM is told about the companion's error reports, beside their switch. */
export const COMPANION_REPORTS_NOTE = 'Off unless you switch it on. Errors of Atlas Online then go to the table server: the error\'s name, '
  + 'message and stack with codes, keys and names removed, the versions of Atlas Online, Atlas and Obsidian, the system family and a '
  + `hash of the table code. Never your notes, maps or players. Kept for ${ERROR_REPORTS_KEPT_DAYS} days.`;

/** Feedback, and the switch for error reports, as the online panel offers them. */
export interface CompanionFeedback extends FeedbackSender {
  reportsErrors(): boolean;
  setReportErrors(on: boolean): void;
}
