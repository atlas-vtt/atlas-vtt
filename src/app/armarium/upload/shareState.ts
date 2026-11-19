import type { BundleProgress } from '../../services/collectionBundle/bundleProgress';
import type { ExportChoice, ExportPreview } from '../../services/collectionBundle/collectionExport';
import type { UploadProgress } from './BundleUpload';
import type { ListingDraft } from './listingDraft';
import type { OwnListing, SubmissionView } from './uploadContract';

/** The steps of a share as the dialog's rail lists them. */
export const SHARE_STEPS = ['account', 'bundle', 'upload', 'checks', 'listing', 'publish'] as const;
export type ShareStep = (typeof SHARE_STEPS)[number] | 'done';

/** A refusal or failure with its code, shown in the step that is open. */
export interface Refusal {
  readonly code: string;
  readonly until: string | null;
  /** What went wrong in Atlas itself (packing the collection), in the error's own words. */
  readonly detail?: string;
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

/** Everything the share dialog shows; `ShareSession` changes it, the dialog only reads it and sends actions. */
export interface ShareSnapshot {
  readonly step: ShareStep;
  /** Null while nobody is signed in. */
  readonly gate: Gate | null;
  /** The collection's export, with the version floor raised above what the Armarium has published of it. */
  readonly preview: ExportPreview;
  /** The account's listing of this collection, when it has one: an update's form starts from it. */
  readonly ownListing: OwnListing | null;
  readonly choice: ExportChoice | null;
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
  readonly published: { readonly slug: string | null; readonly held: boolean; readonly recordFailed: string | null } | null;
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
