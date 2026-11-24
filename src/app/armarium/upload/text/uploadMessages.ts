import { getLocale, t } from '../../../i18n';
import type { MessageKey, MessageValues } from '../../../i18n/types';
import {
  EXCLUSIVE_TAGS,
  LISTING_TEXT,
  MAX_TAGS,
  STALE_DEVICE_SESSION,
  UPLOAD_LIMITS,
  type CheckStage,
  type SubmissionState,
  type TagId,
  type TextLimits,
  type UploadRefusal,
} from '../uploadContract';
import { tagLabel } from './listingVocabulary';
import { ITEM_NOTES_LIMITS } from '../shareState';
import { formatByteSize } from '../../../utils/fileSize';

/**
 * What Atlas says when it shares a collection, ported from the Armarium's share page: one sentence for every
 * refusal, every error of the upload and publish routes, every state of a submission and every stage of a check.
 */

/** Where a refusal is said: with a new bundle, or with the publish of a checked draft. */
export type UploadContext = 'share' | 'publish';

type Until = string | null;
/** Says a sentence by its key: `t`, or a share's own words for what it shares (`refusalSaid`). */
export type Say = (key: MessageKey, values?: MessageValues) => string;
type Sentence = (until: Until, context: UploadContext, say: Say) => string;


function dateOf(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A day as people say it, with the year when it is not this year. */
function formatDay(date: Date): string {
  const showYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'long', ...(showYear ? { year: 'numeric' } : {}) }).format(date);
}

/** A moment as a wait names it: the time today, the day and the time on another day. */
function formatClock(date: Date): string {
  const today = date.toDateString() === new Date().toDateString();
  const options: Intl.DateTimeFormatOptions = today ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat(getLocale(), options).format(date);
}

/** The sentence with the day `until` names, or the one without a day where none was named or it cannot be read. */
function withDay(until: Until, open: () => string, dated: (day: string) => string): string {
  const date = until === null ? null : dateOf(until);
  return date === null ? open() : dated(formatDay(date));
}

const REFUSALS: Readonly<Record<UploadRefusal, Sentence>> = {
  'signed-out': (_until, _context, say) => say('armariumUpload.refusal.signed-out'),
  suspended: (until, _context, say) =>
    withDay(until, () => say('armariumUpload.refusal.suspended'), (day) => say('armariumUpload.refusal.suspendedUntil', { day })),
  restricted: (until, _context, say) =>
    withDay(until, () => say('armariumUpload.refusal.restricted'), (day) => say('armariumUpload.refusal.restrictedUntil', { day })),
  terms: (_until, _context, say) => say('armariumUpload.refusal.terms'),
  'email-unverified': (_until, _context, say) => say('armariumUpload.refusal.email-unverified'),
  'needs-linked-provider': (_until, context, say) =>
    context === 'publish' ? say('armariumUpload.refusal.needsLinkedProviderPublish') : say('armariumUpload.refusal.needs-linked-provider'),
  // The account service keeps this reason in its list and never answers with it: no account waits for its age.
  'account-too-new': (_until, _context, say) => say('armariumUpload.error.general'),
  'not-staff': (_until, _context, say) => say('armariumUpload.refusal.not-staff'),
  'session-too-old': (_until, _context, say) => say('armariumUpload.refusal.session-too-old'),
  'staff-sign-in-method': (_until, _context, say) => say('armariumUpload.refusal.staff-sign-in-method'),
  deleting: (_until, _context, say) => say('armariumUpload.refusal.deleting'),
  'uploads-closed': (_until, _context, say) => say('armariumUpload.refusal.uploads-closed'),
  'too-large': (_until, _context, say) => say('armariumUpload.refusal.too-large', { size: formatByteSize(UPLOAD_LIMITS.maxBytes, getLocale()) }),
  'too-many-open': (_until, _context, say) => say('armariumUpload.refusal.too-many-open', { count: UPLOAD_LIMITS.openSubmissions }),
  'too-many-today': (until, _context, say) => {
    const date = until === null ? null : dateOf(until);
    return date === null ? say('armariumUpload.refusal.too-many-today') : say('armariumUpload.refusal.tooManyTodayUntil', { time: formatClock(date) });
  },
  'storage-full': (_until, _context, say) => say('armariumUpload.refusal.storage-full'),
  'publishing-paused': (_until, _context, say) => say('armariumUpload.refusal.publishing-paused'),
};

/** Every other code the upload and publish routes answer with, and the ones Atlas raises itself (`network`, `empty-file`, `stopped`). */
export const UPLOAD_ERROR_CODES = [
  'not-found', 'bad-request', 'bad-origin', 'too-many-requests', 'bad-part-size', 'bad-part-hash', 'upload-incomplete',
  'upload-expired', 'upload-corrupt', 'upload-gone', 'wrong-state', 'bad-fields', 'declaration-missing', 'listing-not-yours',
  'listing-removed', 'version-not-higher', 'format-changed', 'check-files-invalid', 'blocked-file', 'changed-meanwhile', 'internal', 'network',
  'empty-file', 'stopped', STALE_DEVICE_SESSION,
] as const;
type ErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

const ERRORS: Readonly<Record<ErrorCode, (say: Say) => string>> = {
  'not-found': (say) => say('armariumUpload.error.not-found'),
  'bad-request': (say) => say('armariumUpload.error.general'),
  'bad-origin': (say) => say('armariumUpload.error.general'),
  'too-many-requests': (say) => say('armariumUpload.error.too-many-requests'),
  'bad-part-size': (say) => say('armariumUpload.error.bad-part-size'),
  'bad-part-hash': (say) => say('armariumUpload.error.bad-part-hash'),
  'upload-incomplete': (say) => say('armariumUpload.error.upload-incomplete'),
  'upload-expired': (say) => say('armariumUpload.error.upload-expired'),
  'upload-corrupt': (say) => say('armariumUpload.error.upload-corrupt'),
  'upload-gone': (say) => say('armariumUpload.error.upload-gone'),
  'wrong-state': (say) => say('armariumUpload.error.wrong-state'),
  'bad-fields': (say) => say('armariumUpload.error.bad-fields'),
  'declaration-missing': (say) => say('armariumUpload.error.declaration-missing'),
  'listing-not-yours': (say) => say('armariumUpload.error.listing-not-yours'),
  'listing-removed': (say) => say('armariumUpload.error.listing-removed'),
  'version-not-higher': (say) => say('armariumUpload.error.version-not-higher'),
  'format-changed': (say) => say('armariumUpload.error.format-changed'),
  'check-files-invalid': (say) => say('armariumUpload.error.check-files-invalid'),
  'blocked-file': (say) => say('armariumUpload.error.blocked-file'),
  'changed-meanwhile': (say) => say('armariumUpload.error.changed-meanwhile'),
  internal: (say) => say('armariumUpload.error.general'),
  network: (say) => say('armariumUpload.error.network'),
  'empty-file': (say) => say('armariumUpload.error.empty-file'),
  stopped: (say) => say('armariumUpload.error.stopped'),
  'device-session-stale': (say) => say('armariumUpload.error.device-session-stale'),
};

const has = <T extends string>(table: Readonly<Record<T, unknown>>, code: string): code is T => Object.hasOwn(table, code);

/**
 * One sentence for a code an upload or a publish was answered with, said where `context` names. `until` is the
 * moment a refusal ends, where the API named one. A code Atlas does not know gets the general sentence. A share says
 * it through `say`, in the words of what it shares.
 */
export function uploadMessageFor(code: string, until: Until = null, context: UploadContext = 'share', say: Say = t): string {
  if (has(REFUSALS, code)) return REFUSALS[code](until, context, say);
  return has(ERRORS, code) ? ERRORS[code](say) : say('armariumUpload.error.general');
}

/** Where a submission stands. */
export function stateMessage(state: SubmissionState): string {
  return state === 'failed' ? t('armariumFindings.code.check-internal') : t(`armariumUpload.state.${state}`);
}

/** A stage of a check as Atlas names it while it passes. */
export function stageLabel(stage: CheckStage): string {
  return t(`armariumUpload.stage.${stage}`);
}

function textProblem(problem: string, limits: TextLimits): string | null {
  switch (problem) {
    case 'too-short':
      return limits.min <= 1 ? t('armariumListing.problem.writeSomething') : t('armariumListing.problem.tooShort', { count: limits.min });
    case 'too-long':
      return t('armariumListing.problem.tooLong', { count: limits.max });
    case 'too-many-lines':
      return t('armariumListing.problem.tooManyLines', { count: limits.maxLines });
    case 'too-many-links':
      return t('armariumListing.problem.tooManyLinks', { count: limits.maxLinks });
    case 'hidden-characters':
      return t('armariumListing.problem.hiddenCharacters');
    default:
      return null;
  }
}

/** "No AI, AI-assisted or AI-generated", in the active language. */
function eitherOf(tags: readonly TagId[]): string {
  return new Intl.ListFormat(getLocale(), { type: 'disjunction' }).format(tags.map(tagLabel));
}

/** What the API can say of the tags. Atlas' picker lets none of it happen, so each is a picker that fell behind the list. */
function tagProblem(problem: string): string {
  switch (problem) {
    case 'missing':
      return t('armariumListing.problem.tagsMissing');
    case 'invalid':
      return t('armariumListing.problem.tagsInvalid');
    case 'unknown':
      return t('armariumListing.problem.tagUnknown');
    case 'too-many':
      return t('armariumListing.problem.tooManyTags', { count: MAX_TAGS });
    case 'duplicate':
      return t('armariumListing.problem.tagTwice');
    case 'exclusive':
      return EXCLUSIVE_TAGS.map((set) => t('armariumListing.problem.tagsExclusive', { tags: eitherOf(set) })).join(' ');
    default:
      return t('armariumListing.problem.notRight');
  }
}

function missingField(field: string): string {
  switch (field) {
    case 'kind':
      return t('armariumListing.problem.missingKind');
    case 'licence':
      return t('armariumListing.problem.missingLicence');
    case 'description':
      return t('armariumListing.problem.missingDescription');
    default:
      return t('armariumListing.problem.missing');
  }
}

/** What to change in a listing field a `bad-fields` answer refused. */
export function fieldProblemMessage(field: string, problem: string): string {
  if (field === 'tags') return tagProblem(problem);
  if (problem === 'missing') return missingField(field);
  if (field === 'description' || field === 'credits') return textProblem(problem, LISTING_TEXT[field]) ?? t('armariumListing.problem.notRight');
  if (field === 'notes') return textProblem(problem, ITEM_NOTES_LIMITS) ?? t('armariumListing.problem.notRight');
  return t('armariumListing.problem.notRight');
}
