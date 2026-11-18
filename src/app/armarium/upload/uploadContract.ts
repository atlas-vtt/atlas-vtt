/**
 * The Armarium's upload and publish routes as Atlas speaks them, mirrored from the services' contract
 * (`packages/armarium-contract`: `uploads.ts`, `checkReport.ts`, `listingFields.ts`, `tags.ts`, `publishing.ts`).
 * Plan: `docs/plans/2026-11-18-armarium-upload-from-atlas.md`.
 */

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

export const UPLOAD_LIMITS = {
  /** Every part but the last is exactly this long; the ticket names the size that counts. */
  partBytes: 16 * MIB,
  maxBytes: GIB,
  /** Submissions uploading, uploaded, checking or checked at once, per account. */
  openSubmissions: 3,
  /** Parts on their way at a time. */
  partsInFlight: 3,
  uploadsPerDay: 20,
} as const;

export const SUBMISSION_STATES = ['uploading', 'uploaded', 'checking', 'rejected', 'failed', 'checked', 'held', 'published', 'withdrawn', 'removed', 'expired'] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

/** What the creator may discard: everything they still hold that is neither under a check nor public. */
export const DISCARDABLE_STATES: readonly SubmissionState[] = ['uploading', 'uploaded', 'checked', 'rejected', 'failed'];

/** The stages of a check in the order they run. */
export const CHECK_STAGES = ['archive', 'manifest', 'json', 'notes', 'bases', 'images', 'cross-files', 'rebuild', 'outputs'] as const;
export type CheckStage = (typeof CHECK_STAGES)[number];

/** Why the account service refuses a capability (`@atlas/accounts-contract`). */
export const DENY_REASONS = ['suspended', 'restricted', 'terms', 'email-unverified', 'needs-linked-provider', 'account-too-new', 'not-staff', 'session-too-old', 'staff-sign-in-method', 'deleting'] as const;

/** Every reason an upload or a publish is refused. */
export const UPLOAD_REFUSALS = ['signed-out', ...DENY_REASONS, 'uploads-closed', 'too-large', 'too-many-open', 'too-many-today', 'storage-full', 'publishing-paused'] as const;
export type UploadRefusal = (typeof UPLOAD_REFUSALS)[number];

/** Refusals whose way on is the account page: the Terms, the email, a linked Discord or GitHub account. */
export const ACCOUNT_PAGE_REFUSALS: readonly string[] = ['terms', 'email-unverified', 'needs-linked-provider'];

/** A publish from a device session approved too long ago: the GM approves this device again, then it publishes. */
export const STALE_DEVICE_SESSION = 'device-session-stale';

/** Every code the bundle rules raise. */
export const RULE_CODES = [
  'path-empty', 'path-too-long', 'path-absolute', 'path-backslash', 'path-control-character', 'path-dot-segment',
  'path-colon', 'path-reserved-name', 'path-trailing-dot-or-space', 'path-not-normalised', 'path-not-portable',
  'path-duplicate', 'path-collision',
  'file-type', 'checksum-missing',
  'manifest-not-export', 'export-too-new', 'export-outdated', 'manifest-damaged', 'manifest-folder', 'manifest-cover',
  'manifest-own-file', 'manifest-statblock-image',
  'zip-not-a-zip', 'zip-too-large', 'zip-too-many-entries', 'zip-entry-too-large', 'zip-total-too-large',
  'zip-duplicate-entry', 'zip-encrypted', 'zip-zip64', 'zip-symlink', 'zip-trailing-data', 'zip-size-mismatch',
  'zip-method', 'zip-ratio',
  'note-raw-html', 'note-runs-code', 'note-unsafe-link', 'note-code-language',
  'asset-type', 'asset-id', 'asset-path',
  'json-invalid', 'json-too-large', 'json-too-deep', 'json-duplicate-key', 'json-shape', 'json-unknown-property', 'json-data-url',
  'json-forbidden-key',
  'base-yaml-unsupported', 'base-shape', 'base-expression',
] as const;

/** What only the checker finds: in the bytes it decodes, against the Armarium's history, or about the check itself. */
export const CHECKER_CODES = [
  'upload-corrupt', 'file-missing', 'file-unlisted', 'checksum-mismatch', 'text-encoding', 'image-not-image',
  'image-type-mismatch', 'image-type-converted', 'image-too-large', 'image-animated', 'image-decode', 'video-not-video',
  'video-codec', 'video-too-large', 'link-missing-file', 'blocked-file', 'listing-not-yours', 'version-not-higher',
  'rebuild-too-large', 'check-too-slow', 'check-internal',
] as const;

export type FindingCode = (typeof RULE_CODES)[number] | (typeof CHECKER_CODES)[number];

/** One finding of a check. `code` is kept as the API names it, also where Atlas has no sentence for it yet. */
export interface CheckFinding {
  code: string;
  level: 'error' | 'warning';
  /** The bundle path or zip entry. */
  path?: string;
  /** A line number, an extension, a JSON pointer: what the sentence names. */
  detail?: string;
}

export interface CheckProgress {
  stage: CheckStage;
  done: number;
  total: number;
}

/** What the listing shows from the bundle's manifest: name, version and notes come from the export. */
export interface ManifestSummary {
  uid: string;
  version: number;
  name: string;
  notes: string | null;
}

export const KINDS = ['adventure', 'maps', 'tokens', 'templates', 'game-system'] as const;
export type ListingKind = (typeof KINDS)[number];

export const LICENCES = ['cc0', 'cc-by-4.0', 'cc-by-sa-4.0', 'cc-by-nc-4.0', 'all-rights-reserved'] as const;
export type LicenceId = (typeof LICENCES)[number];

/** Atlas's built-in game systems by preset key, and `any`. */
export const SYSTEMS = ['any', 'cairn', 'coc7e', 'cyberpunkred', 'daggerheart', 'dnd5e', 'drawsteel', 'ose', 'pathfinder2e', 'shadowdark'] as const;
export type SystemId = (typeof SYSTEMS)[number];

/** The tags a creator ticks from, grouped as the picker shows them. Ids never change: listings store them. */
export const TAG_GROUPS = [
  { id: 'genre', tags: ['fantasy', 'dark-fantasy', 'fairy-tale', 'horror', 'mystery', 'sci-fi', 'cyberpunk', 'post-apocalyptic', 'modern', 'historical', 'western'] },
  {
    id: 'place',
    tags: ['dungeon', 'underground', 'forest', 'mountains', 'desert', 'swamp', 'snow-and-ice', 'coast-and-sea', 'river-or-lake', 'settlement', 'tavern-or-shop', 'castle-or-fort', 'temple-or-tomb', 'ruins', 'ship-or-vehicle', 'space', 'other-planes'],
  },
  { id: 'format', tags: ['one-shot', 'short-campaign', 'long-campaign', 'quickstart', 'battle-map', 'world-map', 'hex-map'] },
  { id: 'content', tags: ['monsters', 'npcs', 'player-characters', 'encounters', 'items-and-loot', 'puzzles-and-traps', 'random-tables', 'setting-guide', 'handouts'] },
  { id: 'features', tags: ['dynamic-lighting', 'walls-and-doors', 'statblocks', 'day-night-variants', 'linked-notes'] },
  { id: 'ai', tags: ['no-ai', 'ai-assisted', 'ai-generated'] },
] as const;

export type TagGroupId = (typeof TAG_GROUPS)[number]['id'];
export type TagId = (typeof TAG_GROUPS)[number]['tags'][number];

/** Every tag in the list's order: group by group. */
export const TAG_IDS: readonly TagId[] = TAG_GROUPS.flatMap((group) => [...group.tags]);
export const MAX_TAGS = 8;
/** Sets of which a listing takes one tag at most. */
export const EXCLUSIVE_TAGS: readonly (readonly TagId[])[] = [['no-ai', 'ai-assisted', 'ai-generated']];

export interface TextLimits {
  min: number;
  max: number;
  maxLines: number;
  maxLinks: number;
}

export const LISTING_TEXT = {
  description: { min: 20, max: 5000, maxLines: 80, maxLinks: 5 },
  credits: { min: 0, max: 2000, maxLines: 30, maxLinks: 5 },
} as const satisfies { description: TextLimits; credits: TextLimits };

/** What the creator chooses for a listing; name, version, notes and cover come from the bundle. */
export interface ListingFields {
  kind: ListingKind;
  system: SystemId | null;
  description: string;
  tags: TagId[];
  licence: LicenceId;
  credits: string;
}

/** What a creator declares when they publish. The API stores the text of the version Atlas showed. */
export const DECLARATION = { version: 1, text: 'I made this, or I have the right to share all of it.' } as const;

/** Send `parts` parts of `partBytes` (the last one the remainder) before `expiresAt`. */
export interface UploadTicket {
  id: string;
  partBytes: number;
  parts: number;
  expiresAt: string;
}

/** `GET /v1/armarium/uploads/eligibility`: whether a ticket would be given now. */
export type UploadEligibility = { may: true } | { may: false; reason: string; until: string | null };

/** A submission as its creator sees it. */
export interface SubmissionView {
  id: string;
  state: SubmissionState;
  bytes: number;
  /** The parts received, for a resume. */
  parts: { n: number; sha256: string }[];
  progress: CheckProgress | null;
  /** A refused check's findings are its statement of reasons; a passed check's warnings are notes. */
  findings: CheckFinding[];
  manifest: ManifestSummary | null;
  listing: ListingFields | null;
}

/** One of the account's own listings (`GET /v1/armarium/mine`): what an update starts from, and where its page is. */
export interface OwnListing {
  uid: string;
  slug: string;
  fields: ListingFields | null;
  /** The newest published version; null for a listing without one. */
  newestVersion: number | null;
}
