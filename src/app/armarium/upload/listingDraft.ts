import {
  EXCLUSIVE_TAGS,
  KINDS,
  LICENCES,
  LISTING_TEXT,
  MAX_TAGS,
  SYSTEM_LABEL,
  SYSTEMS,
  TAG_IDS,
  isKnownSystem,
  knownSystemOf,
  type LicenceId,
  type ListingFields,
  type ListingKind,
  type ListingSystem,
  type TagId,
} from './uploadContract';

/** The listing's fields as the form holds them: nothing chosen yet is null, and no system is the empty text. */
export interface ListingDraft {
  kind: ListingKind | null;
  /** A known system's id, the name typed for another, or empty for none. */
  system: ListingSystem;
  description: string;
  tags: TagId[];
  licence: LicenceId | null;
  credits: string;
}

/** The Armarium system of a collection's game system preset: a built-in's key where the Armarium names it, else none. */
export function systemOfPreset(presetId: string | undefined): ListingSystem | null {
  const key = presetId?.startsWith('builtin:') ? presetId.slice('builtin:'.length) : null;
  return SYSTEMS.find((system) => system !== 'any' && system === key) ?? null;
}

/** A game system's own listing names the system it is: the known one its name means, else its name where it fits. */
export function systemOfSharedPreset(name: string): ListingSystem | null {
  const known = knownSystemOf(name);
  if (known !== null) return known;
  const length = textLength(name);
  return length >= SYSTEM_LABEL.min && length <= SYSTEM_LABEL.max ? name.trim() : null;
}

/** The form's start: what the submission or the listing already holds, else the system the shared thing names. */
export function draftFrom(fields: ListingFields | null, startSystem: ListingSystem | null): ListingDraft {
  if (fields !== null) return { ...fields, tags: [...fields.tags], system: fields.system ?? '' };
  return { kind: null, system: startSystem ?? '', description: '', tags: [], licence: null, credits: '' };
}

/** What a typed system name may not be; the Armarium checks the rest (hidden characters, links). */
function systemProblem(system: ListingSystem): FieldProblems {
  if (system.trim() === '' || isKnownSystem(system)) return {};
  const length = textLength(system.replace(/\s+/gu, ' '));
  if (length < SYSTEM_LABEL.min) return { system: 'too-short' };
  return length > SYSTEM_LABEL.max ? { system: 'too-long' } : {};
}

/** Characters as the API counts them for a text's limits: code points of the text without the white space around it. */
export function textLength(text: string): number {
  return [...text.trim()].length;
}

type FieldProblems = Record<string, string>;

function textProblem(text: string, limits: { min: number; max: number }, field: string): FieldProblems {
  const length = textLength(text);
  if (limits.min > 0 && length === 0) return { [field]: 'missing' };
  if (length < limits.min) return { [field]: 'too-short' };
  if (length > limits.max) return { [field]: 'too-long' };
  return {};
}

/** What keeps the listing step from going on: a kind, and a description within its limits. The API checks the rest. */
export function listingProblems(draft: ListingDraft): FieldProblems {
  return {
    ...(draft.kind === null ? { kind: 'missing' } : {}),
    ...systemProblem(draft.system),
    ...textProblem(draft.description, LISTING_TEXT.description, 'description'),
  };
}

/** What keeps the publish step from going on: a licence, and credits within their limit. */
export function rightsProblems(draft: ListingDraft): FieldProblems {
  return {
    ...(draft.licence === null ? { licence: 'missing' } : {}),
    ...textProblem(draft.credits, LISTING_TEXT.credits, 'credits'),
  };
}

/** What the form sends, or null while a kind or a licence is not chosen. */
export function fieldsOfDraft(draft: ListingDraft): ListingFields | null {
  const kind = KINDS.find((known) => known === draft.kind);
  const licence = LICENCES.find((known) => known === draft.licence);
  if (kind === undefined || licence === undefined) return null;
  return { kind, system: draft.system.trim() === '' ? null : knownSystemOf(draft.system) ?? draft.system.trim(), description: draft.description, tags: TAG_IDS.filter((tag) => draft.tags.includes(tag)), licence, credits: draft.credits };
}

/**
 * The tags after a tick on `tag`: off when it was on; on otherwise, in place of another tag of its exclusive set (one
 * AI tag at most). A tag beyond the most a listing takes is not added.
 */
export function toggledTags(tags: readonly TagId[], tag: TagId): TagId[] {
  if (tags.includes(tag)) return tags.filter((chosen) => chosen !== tag);
  const rivals = EXCLUSIVE_TAGS.find((set) => set.includes(tag)) ?? [];
  const kept = tags.filter((chosen) => !rivals.includes(chosen));
  if (kept.length >= MAX_TAGS) return [...tags];
  return TAG_IDS.filter((known) => known === tag || kept.includes(known));
}
