import type { AtlasAccount } from '../../account/AtlasAccount';
import { describeError } from '../../utils/errors';
import { ArmariumError } from './armariumApi';
import { draftFrom, textLength, type ListingDraft } from './listingDraft';
import { freshShare, ShareFlow, type ShareFlowDeps } from './ShareFlow';
import { ITEM_NOTES_LIMITS, nextItemVersion, type ItemShareSnapshot, type SharedItem } from './shareState';
import { ITEM_LISTING_KINDS, type ListingFields, type OwnListing } from './uploadContract';

/** An item bundle packed for a share. */
export interface PackedItemBundle {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  /** The name the bundle carries: a template's file name, a record's own name. */
  readonly name: string;
}

export interface ItemShareDeps extends ShareFlowDeps {
  readonly account: Pick<AtlasAccount, 'state' | 'token' | 'signIn' | 'onChange' | 'refresh'>;
  readonly item: SharedItem;
  /** What a new listing's description starts with: a template's own description; null where the item has none. */
  readonly description: string | null;
  /** The uid of the account's listing of the item (`itemListingUid`). */
  readonly listingUid: (accountId: string) => Promise<string>;
  /** Packs the item as a bundle of the listing `uid` at `version`, with what changed in it. */
  readonly pack: (uid: string, version: number, notes: string | undefined) => Promise<PackedItemBundle>;
}

/**
 * One "Share in the Armarium" of a single Atlas file (a statblock template, a game system, a dice set): the account,
 * then the item with the version it becomes (one above what this account published of it, else 1) and what changed,
 * then the upload, checks, listing (its kind fixed by the item) and publish as for a collection. Its listing's uid is
 * worked out from the account and the item, so nothing is recorded in the vault.
 */
export class ItemShareSession extends ShareFlow<ItemShareSnapshot> {
  private uid: string | null = null;

  constructor(private readonly deps: ItemShareDeps) {
    const listingKind = ITEM_LISTING_KINDS[deps.item.kind];
    super(deps, { ...freshShare({ ...draftFrom(null, null), kind: listingKind }), subject: 'item', item: deps.item, listingKind, version: null, notes: '' });
  }

  setNotes(notes: string): void {
    const problems = Object.fromEntries(Object.entries(this.state.problems).filter(([field]) => field !== 'notes'));
    this.set({ notes, problems });
  }

  /** Packs the item at its version and uploads it; notes longer than a manifest carries keep it on this step. */
  confirmItem(): void {
    const { step, version, notes } = this.state;
    if (step !== 'bundle' || version === null || this.uid === null) return;
    if (textLength(notes) > ITEM_NOTES_LIMITS.max) return this.set({ problems: { notes: 'too-long' } });
    this.set({ step: 'upload', packing: { message: '', fraction: 0 }, refusal: null, problems: {} });
    void this.packAndUpload(this.uid, version);
  }

  protected async listingUid(): Promise<string | null> {
    // The listing is the account's: whose it is must be known first.
    await this.deps.account.refresh();
    const account = this.deps.account.state();
    const who = account.kind === 'signed-in' ? account.who : null;
    if (who === null || typeof who !== 'object') throw new ArmariumError(0, 'network');
    this.uid = await this.deps.listingUid(who.id);
    return this.uid;
  }

  protected knownUid(): string | null {
    return this.uid;
  }

  protected opened(ownListing: OwnListing | null): Partial<ItemShareSnapshot> {
    return { version: nextItemVersion(ownListing) };
  }

  /** What the listing holds for an update; for a new listing the item's own description. The kind is the item's. */
  protected draftOf(stored: ListingFields | null): ListingDraft {
    const draft = draftFrom(stored, null);
    return { ...draft, kind: this.state.listingKind, description: draft.description === '' ? this.deps.description?.trim() ?? '' : draft.description };
  }

  protected repack(): void {
    const { version } = this.state;
    if (version === null || this.uid === null) return;
    this.set({ packing: { message: '', fraction: 0 }, refusal: null });
    void this.packAndUpload(this.uid, version);
  }

  protected recordPublished(): Promise<void> {
    return Promise.resolve();
  }

  private async packAndUpload(uid: string, version: number): Promise<void> {
    this.set({ busy: true });
    const notes = version > 1 && this.state.notes.trim() !== '' ? this.state.notes.trim() : undefined;
    let packed: PackedItemBundle;
    try {
      packed = await this.deps.pack(uid, version, notes);
    } catch (error) {
      console.error('[Atlas] Packing the item for the Armarium failed:', error);
      return this.set({ busy: false, packing: null, refusal: { code: 'export-failed', until: null, detail: describeError(error) } });
    }
    const blob = new Blob([packed.bytes.slice()], { type: 'application/zip' });
    await this.sendBundle(blob, { fileName: packed.fileName, bytes: blob.size, name: packed.name, version });
  }
}
