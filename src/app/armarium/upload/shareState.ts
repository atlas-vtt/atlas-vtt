import type { BundleProgress } from '../../services/collectionBundle/bundleProgress';
import type { ExportChoice, ExportPreview } from '../../services/collectionBundle/collectionExport';
import { MAX_ITEM_NOTES, type ItemRef } from '../../services/itemBundle/itemBundleFormat';
import type { UnreadablePart } from '../../services/musicBundle/musicPacking';
import type { UploadProgress } from './BundleUpload';
import type { ListingDraft } from './listingDraft';
import type { ListingKind, OwnListing, SubmissionView, TextLimits } from './uploadContract';
import type { MusicShareSnapshot } from './musicShareState';

/** The steps of a share as the dialog's rail lists them. */
export const SHARE_STEPS = ['account', 'bundle', 'upload', 'checks', 'listing', 'publish'] as const;
export type ShareStep = (typeof SHARE_STEPS)[number] | 'done';

/** A refusal or failure with its code, shown in the step that is open. */
export interface Refusal {
  readonly code: string;
  readonly until: string | null;
  /** What went wrong in Atlas itself (packing the collection), in the error's own words. */
  readonly detail?: string;
  /** What packing music could not read; null where it cannot tell. Music says it in Atlas' words, never the engine's. */
  readonly unreadable?: UnreadablePart | null;
}

/** Whether the account may share now, as the eligibility route said. */
export type Gate =
  | { readonly status: 'checking' }
  | { readonly status: 'open' }
  | { readonly status: 'refused'; readonly refusal: Refusal };

/** The bundle as it was packed for this share. */
export interface PackedBundle {
  readonly fileName: string;
  readonly bytes: number;
  readonly name: string;
  readonly version: number;
}

/** What every share shows, whatever it shares; a session changes it, the dialog only reads it and sends actions. */
export interface ShareCommon {
  readonly step: ShareStep;
  /** Null while nobody is signed in. */
  readonly gate: Gate | null;
  /** The account's listing of what is shared, when it has one: an update's form starts from it. */
  readonly ownListing: OwnListing | null;
  readonly packing: BundleProgress | null;
  readonly bundle: PackedBundle | null;
  readonly upload: UploadProgress | null;
  readonly submission: SubmissionView | null;
  readonly draft: ListingDraft;
  /** Listing fields that are not right yet, with their problem codes. */
  readonly problems: Readonly<Record<string, string>>;
  readonly declared: boolean;
  /** A request of this step is on its way (eligibility, saving, publishing). */
  readonly busy: boolean;
  /** The publish waits for this device to be approved again. */
  readonly reapproving: boolean;
  readonly refusal: Refusal | null;
  /** Published (or held for the team): where its page will be, and whether the vault's release record failed. */
  /** Published (processing until its page is built), or held for the Armarium team. */
  readonly published: { readonly held: boolean; readonly recordFailed: string | null } | null;
}

/** A share of a collection: its export, and the release or fork the GM chose in the export dialog. */
export interface CollectionShareSnapshot extends ShareCommon {
  readonly subject: 'collection';
  /** The collection's export, with the version floor raised above what the Armarium has published of it. */
  readonly preview: ExportPreview;
  readonly choice: ExportChoice | null;
}

/** A single Atlas file of the vault as a share names it: its kind, the id inside its file, and its name. */
export type SharedItem = ItemRef & { readonly name: string };

/** A share of one Atlas file of the vault: a statblock template, a game system or a dice set. */
export interface ItemShareSnapshot extends ShareCommon {
  readonly subject: 'item';
  readonly item: SharedItem;
  /** The listing's kind, which the item decides. */
  readonly listingKind: ListingKind;
  /** The version this share publishes, once the account's listings were read: the newest published one + 1, else 1. */
  readonly version: number | null;
  /** What changed in this version; asked for from the second version on. */
  readonly notes: string;
  /** The image packed as the listing's cover, as chosen; null for none. */
  readonly cover: Blob | null;
  /** The listing's cover as published, once fetched, and the image uploaded in this dialog: what the picker offers. */
  readonly listedCover: Blob | null;
  readonly uploadedCover: Blob | null;
}

/** Everything the share dialog shows. */
export type ShareSnapshot = CollectionShareSnapshot | ItemShareSnapshot | MusicShareSnapshot;

/** How long an item's release notes may be, as its manifest carries them. */
export const ITEM_NOTES_LIMITS: TextLimits = { min: 0, max: MAX_ITEM_NOTES, maxLines: 40, maxLinks: 5 };

/** The version an item's share publishes: one above the listing's newest, or the first of a new listing. */
export function nextItemVersion(listing: OwnListing | null): number {
  return (listing?.newestVersion ?? 0) + 1;
}

/** States of a submission whose check is still on its way: the session asks again. */
export const CHECKING_STATES: readonly SubmissionView['state'][] = ['uploaded', 'checking'];

export type StepStatus = 'done' | 'current' | 'waiting';

/** Where `step` stands against the open step. */
export function stepStatus(open: ShareStep, step: (typeof SHARE_STEPS)[number]): StepStatus {
  if (open === 'done') return 'done';
  const at = SHARE_STEPS.indexOf(step);
  const current = SHARE_STEPS.indexOf(open);
  return at < current ? 'done' : at === current ? 'current' : 'waiting';
}

/**
 * The export's version floor above the listing's newest published version: a release must count up, and an
 * update offers the next number. A fork becomes a listing of its own and keeps its own numbers.
 */
export function withPublishedFloor(preview: ExportPreview, listing: OwnListing | null): ExportPreview {
  if (preview.publisher === 'other' || listing?.newestVersion == null) return preview;
  const floor = listing.newestVersion + 1;
  return { ...preview, minimumVersion: Math.max(preview.minimumVersion, floor), suggestedVersion: Math.max(preview.suggestedVersion, floor) };
}
