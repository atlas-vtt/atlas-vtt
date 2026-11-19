import { isRecord } from '../../utils/guards';
import {
  CHECK_STAGES,
  KINDS,
  LICENCES,
  SUBMISSION_STATES,
  SYSTEMS,
  TAG_IDS,
  type CheckFinding,
  type CheckProgress,
  type ListingFields,
  type ManifestSummary,
  type OwnListing,
  type SubmissionView,
  type UploadEligibility,
  type UploadTicket,
} from './uploadContract';

/** An answer of the Armarium API in a shape Atlas does not know: a fault on the server's side, shown as `internal`. */
export class AnswerShapeError extends Error {
  constructor(where: string) {
    super(`The Armarium answered in a shape Atlas does not know (${where}).`);
    this.name = 'AnswerShapeError';
  }
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) throw new AnswerShapeError(where);
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new AnswerShapeError(where);
  return value;
}

function count(value: unknown, where: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new AnswerShapeError(where);
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], where: string): T {
  const found = values.find((known) => known === value);
  if (found === undefined) throw new AnswerShapeError(where);
  return found;
}

const textOrNull = (value: unknown, where: string): string | null => (value === null || value === undefined ? null : text(value, where));

export function parseEligibility(value: unknown): UploadEligibility {
  const fields = record(value, 'eligibility');
  if (fields.may === true) return { may: true };
  if (fields.may !== false) throw new AnswerShapeError('eligibility.may');
  return { may: false, reason: text(fields.reason, 'eligibility.reason'), until: textOrNull(fields.until, 'eligibility.until') };
}

export function parseTicket(value: unknown): UploadTicket {
  const fields = record(value, 'ticket');
  return {
    id: text(fields.id, 'ticket.id'),
    partBytes: count(fields.partBytes, 'ticket.partBytes', 1),
    parts: count(fields.parts, 'ticket.parts', 1),
    expiresAt: text(fields.expiresAt, 'ticket.expiresAt'),
  };
}

export function parseListingFields(value: unknown, where = 'listing'): ListingFields {
  const fields = record(value, where);
  if (!Array.isArray(fields.tags)) throw new AnswerShapeError(`${where}.tags`);
  return {
    kind: oneOf(fields.kind, KINDS, `${where}.kind`),
    system: fields.system === null || fields.system === undefined ? null : oneOf(fields.system, SYSTEMS, `${where}.system`),
    description: text(fields.description, `${where}.description`),
    // A tag a later Armarium added is left out: the form offers only the ones Atlas knows.
    tags: fields.tags.flatMap((tag: unknown) => TAG_IDS.filter((known) => known === tag)),
    licence: oneOf(fields.licence, LICENCES, `${where}.licence`),
    credits: text(fields.credits, `${where}.credits`),
  };
}

function parseFinding(value: unknown): CheckFinding {
  const fields = record(value, 'finding');
  const finding: CheckFinding = { code: text(fields.code, 'finding.code'), level: oneOf(fields.level, ['error', 'warning'], 'finding.level') };
  if (typeof fields.path === 'string') finding.path = fields.path;
  if (typeof fields.detail === 'string') finding.detail = fields.detail;
  return finding;
}

function parseProgress(value: unknown): CheckProgress | null {
  if (value === null || value === undefined) return null;
  const fields = record(value, 'progress');
  // A stage a later checker added shows as the last one Atlas knows.
  const stage = CHECK_STAGES.find((known) => known === fields.stage) ?? 'outputs';
  return { stage, done: count(fields.done, 'progress.done'), total: count(fields.total, 'progress.total') };
}

function parseManifest(value: unknown): ManifestSummary | null {
  if (value === null || value === undefined) return null;
  const fields = record(value, 'manifest');
  return { uid: text(fields.uid, 'manifest.uid'), version: count(fields.version, 'manifest.version', 1), name: text(fields.name, 'manifest.name'), notes: textOrNull(fields.notes, 'manifest.notes') };
}

export function parseSubmission(value: unknown): SubmissionView {
  const fields = record(value, 'submission');
  const parts = Array.isArray(fields.parts) ? fields.parts : [];
  const findings = Array.isArray(fields.findings) ? fields.findings : [];
  return {
    id: text(fields.id, 'submission.id'),
    state: oneOf(fields.state, SUBMISSION_STATES, 'submission.state'),
    bytes: count(fields.bytes, 'submission.bytes'),
    parts: parts.map((part: unknown) => {
      const entry = record(part, 'submission.parts');
      return { n: count(entry.n, 'submission.parts.n', 1), sha256: text(entry.sha256, 'submission.parts.sha256') };
    }),
    progress: parseProgress(fields.progress),
    findings: findings.map(parseFinding),
    manifest: parseManifest(fields.manifest),
    listing: fields.listing === null || fields.listing === undefined ? null : parseListingFields(fields.listing),
  };
}

/** One listing of My uploads, or null for an entry Atlas cannot read (the others still count). */
export function parseOwnListing(value: unknown): OwnListing | null {
  try {
    const fields = record(value, 'mine.listing');
    const versions = Array.isArray(fields.versions) ? fields.versions : [];
    const numbers = versions.flatMap((version: unknown) => (isRecord(version) && typeof version.version === 'number' && Number.isSafeInteger(version.version) ? [version.version] : []));
    return {
      uid: text(fields.uid, 'mine.listing.uid'),
      slug: text(fields.slug, 'mine.listing.slug'),
      fields: fields.fields === null || fields.fields === undefined ? null : parseListingFields(fields.fields, 'mine.listing.fields'),
      newestVersion: numbers.length === 0 ? null : Math.max(...numbers),
    };
  } catch {
    return null;
  }
}

/** Each listing field a `bad-fields` answer names with its problem; null for any other answer. */
export function readFieldProblems(body: unknown): Record<string, string> | null {
  const problems = isRecord(body) ? body.problems : undefined;
  if (!isRecord(problems)) return null;
  const entries = Object.entries(problems).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length === 0 ? null : Object.fromEntries(entries);
}
