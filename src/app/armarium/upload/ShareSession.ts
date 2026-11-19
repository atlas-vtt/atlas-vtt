import type { AtlasAccount } from '../../account/AtlasAccount';
import type { ExportChoice, ExportedBundle, ExportPreview } from '../../services/collectionBundle/collectionExport';
import type { BundleProgressListener } from '../../services/collectionBundle/bundleProgress';
import { describeError } from '../../utils/errors';
import { ArmariumError, failureOf, type ArmariumApi } from './armariumApi';
import { BundleUpload, UploadCancelled } from './BundleUpload';
import { draftFrom, fieldsOfDraft, listingProblems, rightsProblems, toggledTags, type ListingDraft } from './listingDraft';
import { abandonSubmission, type AbandonOutcome } from './shareCleanup';
import { CHECKING_STATES, withPublishedFloor, type Refusal, type ShareSnapshot } from './shareState';
import { STALE_DEVICE_SESSION, type SubmissionView, type SystemId, type TagId } from './uploadContract';

/** How often the session asks how far the checks are. */
export const POLL_MS = 2000;
/** Fields of the listing step; a problem with one of them opens that step again. */
const LISTING_FIELDS = ['kind', 'system', 'description', 'tags'];

export interface ShareSessionDeps {
  readonly account: Pick<AtlasAccount, 'state' | 'token' | 'signIn' | 'onChange'>;
  readonly api: Pick<ArmariumApi, 'eligibility' | 'ownListing' | 'ticket' | 'putPart' | 'complete' | 'submission' | 'discard' | 'putListing' | 'publish'>;
  readonly preview: ExportPreview;
  /** The collection's game system as the Armarium names it, which a new listing's form starts with. */
  readonly collectionSystem: SystemId | null;
  /** Packs the collection in memory, as Export collection does, without handing the file anywhere. */
  readonly pack: (preview: ExportPreview, choice: ExportChoice, onProgress: BundleProgressListener) => Promise<ExportedBundle>;
  /** Whether a fork's name is taken by another collection of this vault. */
  readonly nameTaken: (name: string) => Promise<boolean>;
  /** The release was recorded in the vault (a fork made the collection this vault's own). */
  readonly committed: (choice: ExportChoice) => Promise<void>;
  readonly sha256: (bytes: ArrayBuffer) => Promise<string>;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Says why a name is taken, for the export dialog. */
  readonly nameTakenText: (name: string) => string;
}

/**
 * One "Share in the Armarium" of a collection: the account and whether it may share, the export in memory, the
 * upload, the checks, the listing, the declaration and the publish. The export is recorded in the vault (`commit`)
 * only once the Armarium published it. The dialog reads `snapshot()` and calls the actions; nothing here knows React.
 */
export class ShareSession {
  private state: ShareSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly stopper = new AbortController();
  private upload: BundleUpload | null = null;
  private exported: ExportedBundle | null = null;
  private touched = false;
  private stopAccount: () => void = () => undefined;

  constructor(private readonly deps: ShareSessionDeps) {
    this.state = {
      step: 'account', gate: null, preview: deps.preview, ownListing: null, choice: null, packing: null, bundle: null, upload: null,
      submission: null, draft: draftFrom(null, deps.collectionSystem), problems: {}, declared: false, busy: false, reapproving: false,
      refusal: null, published: null,
    };
  }

  snapshot(): ShareSnapshot {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begins at the account: signed in, it asks whether the account may share; otherwise it waits for a sign-in. */
  start(): void {
    this.stopAccount = this.deps.account.onChange(() => this.followAccount());
    this.followAccount();
  }

  /** Asks again whether the account may share (after the GM saw to it on the account page). */
  recheck(): void {
    if (this.state.step === 'account' && this.deps.account.token() !== null) void this.checkGate();
  }

  /** The export dialog's choice: packs and uploads it, or answers why it cannot be packed. */
  async confirmBundle(choice: ExportChoice): Promise<string | null> {
    if (this.state.step !== 'bundle') return null;
    if (choice.kind === 'fork' && await this.deps.nameTaken(choice.name)) return this.deps.nameTakenText(choice.name);
    this.set({ step: 'upload', choice, packing: { message: '', fraction: 0 }, refusal: null });
    void this.packAndUpload(choice);
    return null;
  }

  /** Sends what is missing of the upload after it stopped, or packs again where packing failed. */
  retryUpload(): void {
    if (this.state.step !== 'upload' || this.state.busy) return;
    if (this.upload === null && this.state.choice !== null) {
      this.set({ packing: { message: '', fraction: 0 }, refusal: null });
      void this.packAndUpload(this.state.choice);
      return;
    }
    if (this.upload !== null) void this.runUpload((upload) => upload.retry());
  }

  /** Asks again how far the checks are, after an ask that stopped (a sign-in that ran out, no connection). */
  askAgain(): void {
    const submission = this.state.submission;
    if (this.state.step !== 'checks' || this.state.busy || submission === null) return;
    this.set({ refusal: null, busy: true });
    void this.watchChecks(submission).then(
      () => this.set({ busy: false }),
      (error: unknown) => {
        if (!this.stopper.signal.aborted) this.set({ busy: false, refusal: refusalOf(error) });
      },
    );
  }

  /** After a refused or failed check: the upload is discarded, and the GM fixes the collection and exports again. */
  startOver(): void {
    const id = this.state.submission?.id;
    if (id !== undefined) void this.deps.api.discard(id).catch(() => undefined);
    this.upload = null;
    this.exported = null;
    this.set({ step: 'bundle', submission: null, upload: null, bundle: null, packing: null, refusal: null });
  }

  setDraft(change: Partial<ListingDraft>): void {
    this.touched = true;
    this.set({ draft: { ...this.state.draft, ...change } });
  }

  toggleTag(tag: TagId): void {
    this.setDraft({ tags: toggledTags(this.state.draft.tags, tag) });
  }

  setDeclared(declared: boolean): void {
    this.set({ declared, refusal: declared && this.state.refusal?.code === 'declaration-missing' ? null : this.state.refusal });
  }

  /** From the listing to the rights and the declaration, once a kind and a description are given. */
  continueToPublish(): void {
    const problems = listingProblems(this.state.draft);
    this.set({ problems, refusal: null, ...(Object.keys(problems).length === 0 ? { step: 'publish' as const } : {}) });
  }

  backToListing(): void {
    if (this.state.step === 'publish' && !this.state.busy) this.set({ step: 'listing', refusal: null });
  }

  /** Stores the listing and publishes; a device approved too long ago is approved again first, then it publishes. */
  async publish(): Promise<void> {
    const submission = this.state.submission;
    if (this.state.step !== 'publish' || this.state.busy || submission === null) return;
    const problems = rightsProblems(this.state.draft);
    const fields = fieldsOfDraft(this.state.draft);
    if (Object.keys(problems).length > 0 || fields === null) return this.set({ problems });
    if (!this.state.declared) return this.set({ problems: {}, refusal: { code: 'declaration-missing', until: null } });
    this.set({ busy: true, problems: {}, refusal: null });
    try {
      await this.deps.api.putListing(submission.id, fields);
      await this.finish(await this.publishApproved(submission.id));
    } catch (error) {
      const problemsOf = error instanceof ArmariumError ? error.problems ?? {} : {};
      const back = LISTING_FIELDS.some((field) => Object.hasOwn(problemsOf, field));
      this.set({ busy: false, reapproving: false, problems: problemsOf, refusal: refusalOf(error), ...(back ? { step: 'listing' as const } : {}) });
    }
  }

  /**
   * The GM closes the dialog before the collection was published: the upload stops and the submission is discarded, or
   * discarded once its check is done where it is under one. Nothing was recorded in the vault.
   */
  async abandon(): Promise<AbandonOutcome> {
    this.dispose();
    const { published, submission } = this.state;
    if (published !== null) return 'nothing';
    // An upload on its way stops and discards its own submission; one that completed is discarded below.
    if (submission === null && this.upload !== null) {
      await this.upload.cancel();
      return this.upload.submissionId === null ? 'nothing' : 'discarded';
    }
    if (submission === null) return 'nothing';
    return abandonSubmission(this.deps.api, submission.id, submission.state, this.deps.sleep);
  }

  dispose(): void {
    this.stopAccount();
    this.stopper.abort(new UploadCancelled());
  }

  private followAccount(): void {
    const account = this.deps.account.state();
    if (account.kind !== 'signed-in') {
      if (this.state.step === 'account') this.set({ gate: null });
      return;
    }
    if (this.state.step === 'account' && this.state.gate === null) void this.checkGate();
  }

  private async checkGate(): Promise<void> {
    this.set({ gate: { status: 'checking' }, refusal: null });
    const uid = this.state.preview.collection.uid;
    try {
      const [gate, ownListing] = await Promise.all([this.deps.api.eligibility(), uid ? this.deps.api.ownListing(uid) : Promise.resolve(null)]);
      if (gate.may) {
        this.set({ gate: { status: 'open' }, ownListing, preview: withPublishedFloor(this.deps.preview, ownListing), step: 'bundle' });
        if (!this.touched) this.set({ draft: draftFrom(ownListing?.fields ?? null, this.deps.collectionSystem) });
      } else {
        this.set({ gate: { status: 'refused', refusal: { code: gate.reason, until: gate.until } } });
      }
    } catch (error) {
      // Signed out by the server: the account step asks for a sign-in again.
      this.set({ gate: this.deps.account.token() === null ? null : { status: 'refused', refusal: refusalOf(error) } });
    }
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
    this.set({ packing: null, bundle: { fileName, bytes: blob.size, name: collectionName, version } });
    this.upload = new BundleUpload(blob, fileName, { api: this.deps.api, sha256: this.deps.sha256, sleep: this.deps.sleep }, (upload) => this.set({ upload }));
    await this.runUpload((upload) => upload.start());
  }

  private async runUpload(run: (upload: BundleUpload) => Promise<SubmissionView>): Promise<void> {
    const upload = this.upload;
    if (upload === null) return;
    this.set({ busy: true, refusal: null, upload: upload.progress() });
    try {
      const submission = await run(upload);
      this.set({ busy: false, step: 'checks', submission });
      await this.watchChecks(submission);
    } catch (error) {
      if (error instanceof UploadCancelled || this.stopper.signal.aborted) return;
      this.set({ busy: false, refusal: refusalOf(error) });
    }
  }

  /** Asks how far the checks are until they are done, one request at a time; a failed ask is asked again. */
  private async watchChecks(first: SubmissionView): Promise<void> {
    let view = first;
    while (CHECKING_STATES.includes(view.state)) {
      await this.deps.sleep(POLL_MS, this.stopper.signal);
      view = await this.deps.api.submission(view.id).catch((error: unknown) => {
        if (failureOf(error).code === 'signed-out') throw error;
        return view;
      });
      this.set({ submission: view });
    }
    if (view.state === 'checked') {
      const stored = view.listing ?? (view.manifest !== null && view.manifest.uid === this.state.ownListing?.uid ? this.state.ownListing.fields : null);
      this.set({ step: 'listing', ...(this.touched ? {} : { draft: draftFrom(stored, this.deps.collectionSystem) }) });
    }
  }

  private async publishApproved(id: string): Promise<SubmissionView> {
    try {
      return await this.deps.api.publish(id);
    } catch (error) {
      if (failureOf(error).code !== STALE_DEVICE_SESSION) throw error;
      this.set({ reapproving: true });
      const approved = await this.deps.account.signIn(true);
      this.set({ reapproving: false });
      if (approved !== 'signed-in') throw error;
      return this.deps.api.publish(id);
    }
  }

  private async finish(view: SubmissionView): Promise<void> {
    if (view.state !== 'published' && view.state !== 'held') {
      return this.set({ busy: false, submission: view, step: view.state === 'rejected' ? 'checks' : this.state.step });
    }
    let recordFailed: string | null = null;
    try {
      await this.exported?.commit();
      if (this.state.choice !== null) await this.deps.committed(this.state.choice);
    } catch (error) {
      console.error('[Atlas] Recording the published release failed:', error);
      recordFailed = describeError(error);
    }
    const uid = view.manifest?.uid ?? this.state.preview.collection.uid;
    const listing = uid ? await this.deps.api.ownListing(uid) : null;
    this.set({ busy: false, submission: view, step: 'done', published: { slug: listing?.slug ?? null, held: view.state === 'held', recordFailed } });
  }

  private set(change: Partial<ShareSnapshot>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
}

function refusalOf(error: unknown): Refusal {
  const { code, until } = failureOf(error);
  return { code, until };
}
