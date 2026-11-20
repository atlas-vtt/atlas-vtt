import type { AtlasAccount } from '../../account/AtlasAccount';
import { describeError } from '../../utils/errors';
import { ArmariumError, failureOf, type ArmariumApi } from './armariumApi';
import { BundleUpload, UploadCancelled } from './BundleUpload';
import { fieldsOfDraft, listingProblems, rightsProblems, toggledTags, type ListingDraft } from './listingDraft';
import { abandonSubmission, type AbandonOutcome } from './shareCleanup';
import { CHECKING_STATES, type PackedBundle, type Refusal, type ShareCommon } from './shareState';
import { STALE_DEVICE_SESSION, type ListingFields, type OwnListing, type SubmissionView, type TagId } from './uploadContract';

/** How often the session asks how far the checks are. */
export const POLL_MS = 2000;
/** Fields of the listing step; a problem with one of them opens that step again. */
const LISTING_FIELDS = ['kind', 'system', 'description', 'tags'];

export interface ShareFlowDeps {
  readonly account: Pick<AtlasAccount, 'state' | 'token' | 'signIn' | 'onChange'>;
  readonly api: Pick<ArmariumApi, 'eligibility' | 'ownListing' | 'ticket' | 'putPart' | 'complete' | 'submission' | 'discard' | 'putListing' | 'publish'>;
  readonly sha256: (bytes: ArrayBuffer) => Promise<string>;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** The parts of a snapshot every share starts with, before anything was asked. */
export function freshShare(draft: ListingDraft): ShareCommon {
  return {
    step: 'account', gate: null, ownListing: null, packing: null, bundle: null, upload: null, submission: null, draft,
    problems: {}, declared: false, busy: false, reapproving: false, refusal: null, published: null,
  };
}

/**
 * The steps every "Share in the Armarium" has in common, whatever it shares: the account and whether it may share,
 * the upload, the checks, the listing, the declaration and the publish. What is shared, how it is packed and what is
 * recorded once it is published are the subclass's (`ShareSession` for a collection, `ItemShareSession` for one file).
 * The dialog reads `snapshot()` and calls the actions; nothing here knows React.
 */
export abstract class ShareFlow<S extends ShareCommon> {
  protected state: S;
  protected readonly stopper = new AbortController();
  protected upload: BundleUpload | null = null;
  /** The GM changed the listing's form: what the Armarium holds no longer replaces it. */
  protected touched = false;
  private readonly listeners = new Set<() => void>();
  private stopAccount: () => void = () => undefined;

  protected constructor(private readonly flow: ShareFlowDeps, initial: S) {
    this.state = initial;
  }

  /** The uid of the listing this share continues, read once the account is known; null where it has none yet. */
  protected abstract listingUid(): Promise<string | null>;
  /** What the snapshot takes once the account may share, beside the step and the listing. */
  protected abstract opened(ownListing: OwnListing | null): Partial<S>;
  /** The listing's form, from what the Armarium already holds of it. */
  protected abstract draftOf(stored: ListingFields | null): ListingDraft;
  /** Packs again after packing failed, and uploads. */
  protected abstract repack(): void;
  /** Records the publish in the vault, where the subject keeps a record of it. */
  protected abstract recordPublished(): Promise<void>;

  snapshot(): S {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begins at the account: signed in, it asks whether the account may share; otherwise it waits for a sign-in. */
  start(): void {
    this.stopAccount = this.flow.account.onChange(() => this.followAccount());
    this.followAccount();
  }

  /** Asks again whether the account may share (after the GM saw to it on the account page). */
  recheck(): void {
    if (this.state.step === 'account' && this.flow.account.token() !== null) void this.checkGate();
  }

  /** Sends what is missing of the upload after it stopped, or packs again where packing failed. */
  retryUpload(): void {
    if (this.state.step !== 'upload' || this.state.busy) return;
    if (this.upload === null) return this.repack();
    void this.runUpload((upload) => upload.retry());
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

  /** After a refused or failed check: the upload is discarded, and the GM fixes what was shared and shares again. */
  startOver(): void {
    const id = this.state.submission?.id;
    if (id !== undefined) void this.flow.api.discard(id).catch(() => undefined);
    this.upload = null;
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
      await this.flow.api.putListing(submission.id, fields);
      await this.finish(await this.publishApproved(submission.id));
    } catch (error) {
      const problemsOf = error instanceof ArmariumError ? error.problems ?? {} : {};
      const back = LISTING_FIELDS.some((field) => Object.hasOwn(problemsOf, field));
      this.set({ busy: false, reapproving: false, problems: problemsOf, refusal: refusalOf(error), ...(back ? { step: 'listing' as const } : {}) });
    }
  }

  /**
   * The GM closes the dialog before it was published: the upload stops and the submission is discarded, or discarded
   * once its check is done where it is under one. Nothing was recorded in the vault.
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
    return abandonSubmission(this.flow.api, submission.id, submission.state, this.flow.sleep);
  }

  dispose(): void {
    this.stopAccount();
    this.stopper.abort(new UploadCancelled());
  }

  /** Uploads what was packed, then follows its checks. */
  protected async sendBundle(blob: Blob, bundle: PackedBundle): Promise<void> {
    this.set({ packing: null, bundle });
    this.upload = new BundleUpload(blob, bundle.fileName, { api: this.flow.api, sha256: this.flow.sha256, sleep: this.flow.sleep }, (upload) => this.set({ upload }));
    await this.runUpload((upload) => upload.start());
  }

  protected set(change: Partial<ShareCommon> | Partial<S>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  private followAccount(): void {
    const account = this.flow.account.state();
    if (account.kind !== 'signed-in') {
      if (this.state.step === 'account') this.set({ gate: null });
      return;
    }
    if (this.state.step === 'account' && this.state.gate === null) void this.checkGate();
  }

  private async checkGate(): Promise<void> {
    this.set({ gate: { status: 'checking' }, refusal: null });
    try {
      const listing = this.listingUid().then((uid) => (uid ? this.flow.api.ownListing(uid) : null));
      const [gate, ownListing] = await Promise.all([this.flow.api.eligibility(), listing]);
      if (gate.may) {
        this.set({ ...this.opened(ownListing), gate: { status: 'open' }, ownListing, step: 'bundle' });
        if (!this.touched) this.set({ draft: this.draftOf(ownListing?.fields ?? null) });
      } else {
        this.set({ gate: { status: 'refused', refusal: { code: gate.reason, until: gate.until } } });
      }
    } catch (error) {
      // Signed out by the server: the account step asks for a sign-in again.
      this.set({ gate: this.flow.account.token() === null ? null : { status: 'refused', refusal: refusalOf(error) } });
    }
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
      await this.flow.sleep(POLL_MS, this.stopper.signal);
      view = await this.flow.api.submission(view.id).catch((error: unknown) => {
        if (failureOf(error).code === 'signed-out') throw error;
        return view;
      });
      this.set({ submission: view });
    }
    if (view.state === 'checked') {
      const own = this.state.ownListing;
      const stored = view.listing ?? (view.manifest !== null && view.manifest.uid === own?.uid ? own.fields : null);
      this.set({ step: 'listing', ...(this.touched ? {} : { draft: this.draftOf(stored) }) });
    }
  }

  private async publishApproved(id: string): Promise<SubmissionView> {
    try {
      return await this.flow.api.publish(id);
    } catch (error) {
      if (failureOf(error).code !== STALE_DEVICE_SESSION) throw error;
      this.set({ reapproving: true });
      const approved = await this.flow.account.signIn(true);
      this.set({ reapproving: false });
      if (approved !== 'signed-in') throw error;
      return this.flow.api.publish(id);
    }
  }

  private async finish(view: SubmissionView): Promise<void> {
    if (view.state !== 'published' && view.state !== 'held') {
      return this.set({ busy: false, submission: view, step: view.state === 'rejected' ? 'checks' : this.state.step });
    }
    let recordFailed: string | null = null;
    try {
      await this.recordPublished();
    } catch (error) {
      console.error('[Atlas] Recording the published release failed:', error);
      recordFailed = describeError(error);
    }
    this.set({ busy: false, submission: view, step: 'done', published: { held: view.state === 'held', recordFailed } });
  }
}

export function refusalOf(error: unknown): Refusal {
  const { code, until } = failureOf(error);
  return { code, until };
}
