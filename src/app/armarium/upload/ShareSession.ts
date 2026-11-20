import type { ExportChoice, ExportedBundle, ExportPreview } from '../../services/collectionBundle/collectionExport';
import type { BundleProgressListener } from '../../services/collectionBundle/bundleProgress';
import { describeError } from '../../utils/errors';
import { draftFrom, type ListingDraft } from './listingDraft';
import { freshShare, ShareFlow, type ShareFlowDeps } from './ShareFlow';
import { withPublishedFloor, type CollectionShareSnapshot } from './shareState';
import type { ListingFields, ListingSystem, OwnListing } from './uploadContract';

export { POLL_MS } from './ShareFlow';

export interface ShareSessionDeps extends ShareFlowDeps {
  readonly preview: ExportPreview;
  /** The collection's game system as the Armarium names it, which a new listing's form starts with. */
  readonly collectionSystem: ListingSystem | null;
  /** Packs the collection in memory, as Export collection does, without handing the file anywhere. */
  readonly pack: (preview: ExportPreview, choice: ExportChoice, onProgress: BundleProgressListener) => Promise<ExportedBundle>;
  /** Whether a fork's name is taken by another collection of this vault. */
  readonly nameTaken: (name: string) => Promise<boolean>;
  /** The release was recorded in the vault (a fork made the collection this vault's own). */
  readonly committed: (choice: ExportChoice) => Promise<void>;
  /** Says why a name is taken, for the export dialog. */
  readonly nameTakenText: (name: string) => string;
}

/**
 * One "Share in the Armarium" of a collection: the account and whether it may share, the export in memory (a release
 * or a fork, chosen in the export dialog), the upload, the checks, the listing, the declaration and the publish. The
 * export is recorded in the vault (`commit`) only once the Armarium published it.
 */
export class ShareSession extends ShareFlow<CollectionShareSnapshot> {
  private exported: ExportedBundle | null = null;

  constructor(private readonly deps: ShareSessionDeps) {
    super(deps, { ...freshShare(draftFrom(null, deps.collectionSystem)), subject: 'collection', preview: deps.preview, choice: null });
  }

  /** The export dialog's choice: packs and uploads it, or answers why it cannot be packed. */
  async confirmBundle(choice: ExportChoice): Promise<string | null> {
    if (this.state.step !== 'bundle') return null;
    if (choice.kind === 'fork' && await this.deps.nameTaken(choice.name)) return this.deps.nameTakenText(choice.name);
    this.set({ step: 'upload', choice, packing: { message: '', fraction: 0 }, refusal: null });
    void this.packAndUpload(choice);
    return null;
  }

  override startOver(): void {
    this.exported = null;
    super.startOver();
  }

  protected listingUid(): Promise<string | null> {
    return Promise.resolve(this.state.preview.collection.uid || null);
  }

  protected knownUid(): string | null {
    return this.state.preview.collection.uid || null;
  }

  protected opened(ownListing: OwnListing | null): Partial<CollectionShareSnapshot> {
    return { preview: withPublishedFloor(this.deps.preview, ownListing) };
  }

  protected draftOf(stored: ListingFields | null): ListingDraft {
    return draftFrom(stored, this.deps.collectionSystem);
  }

  protected repack(): void {
    const { choice } = this.state;
    if (choice === null) return;
    this.set({ packing: { message: '', fraction: 0 }, refusal: null });
    void this.packAndUpload(choice);
  }

  protected async recordPublished(): Promise<void> {
    await this.exported?.commit();
    if (this.state.choice !== null) await this.deps.committed(this.state.choice);
  }

  private async packAndUpload(choice: ExportChoice): Promise<void> {
    this.set({ busy: true });
    try {
      this.exported = await this.deps.pack(this.state.preview, choice, (packing) => this.set({ packing }));
    } catch (error) {
      console.error('[Atlas] Packing the collection for the Armarium failed:', error);
      return this.set({ busy: false, packing: null, refusal: { code: 'export-failed', until: null, detail: describeError(error) } });
    }
    const { blob, fileName, collectionName, version } = this.exported;
    await this.sendBundle(blob, { fileName, bytes: blob.size, name: collectionName, version });
  }
}
