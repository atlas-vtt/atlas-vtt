import { ArmariumError, failureOf, type ArmariumApi } from './armariumApi';
import { UPLOAD_LIMITS, type SubmissionView, type UploadTicket } from './uploadContract';
import { failurePlan, partRanges, ticketEnded, type PartRange } from './uploadParts';

export type PartStatus = 'waiting' | 'sending' | 'sent' | 'failed';

/** Where an upload stands, part by part. `failure` is what stopped it; Retry goes on from there. */
export interface UploadProgress {
  readonly parts: readonly PartStatus[];
  readonly sentBytes: number;
  readonly totalBytes: number;
  readonly failure: { readonly code: string; readonly until: string | null } | null;
}

export interface BundleUploadDeps {
  readonly api: Pick<ArmariumApi, 'ticket' | 'putPart' | 'complete' | 'submission' | 'discard'>;
  readonly sha256: (bytes: ArrayBuffer) => Promise<string>;
  /** Waits `ms`; rejects when `signal` aborts. */
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** The upload was cancelled by the GM: nothing more is sent, and the submission is discarded. */
export class UploadCancelled extends Error {
  constructor() {
    super('The upload was cancelled.');
    this.name = 'UploadCancelled';
  }
}

/**
 * One bundle's upload within a share: asks for a ticket, sends the parts a few at a time with their SHA-256 (each part
 * sent again twice after a failure of the way), and completes the upload, which starts the check. A failure that
 * outlasts the retries stops it with the part marked; `retry` asks the API which parts it has and sends the rest
 * under the same ticket, or under a new one where the ticket ended. `cancel` stops and discards the submission.
 */
export class BundleUpload {
  private ticket: UploadTicket | null = null;
  private ranges: PartRange[] = [];
  private statuses: PartStatus[] = [];
  private failure: UploadProgress['failure'] = null;
  private stopper = new AbortController();
  private running: Promise<SubmissionView> | null = null;
  private cancelled = false;

  constructor(
    private readonly blob: Blob,
    private readonly fileName: string,
    private readonly deps: BundleUploadDeps,
    private readonly onChange: (progress: UploadProgress) => void = () => undefined,
  ) {}

  /** The submission's id once a ticket was given; it is what Cancel discards. */
  get submissionId(): string | null {
    return this.ticket?.id ?? null;
  }

  progress(): UploadProgress {
    const sentBytes = this.ranges.reduce((sum, range, index) => (this.statuses[index] === 'sent' ? sum + range.end - range.start : sum), 0);
    return { parts: [...this.statuses], sentBytes, totalBytes: this.blob.size, failure: this.failure };
  }

  /** Uploads the bundle and answers with the submission once its check is asked for. */
  start(): Promise<SubmissionView> {
    return this.begin(false);
  }

  /** Goes on after a failure: the parts the API has are kept, the others sent again. */
  retry(): Promise<SubmissionView> {
    return this.begin(true);
  }

  /** Stops sending and discards the submission; a part on its way is let go and its answer ignored. */
  async cancel(): Promise<void> {
    this.cancelled = true;
    this.stopper.abort(new UploadCancelled());
    const id = this.submissionId;
    if (id !== null) await this.deps.api.discard(id).catch(() => undefined);
  }

  /** One run at a time: a call while one runs answers with that run. */
  private begin(resume: boolean): Promise<SubmissionView> {
    this.running ??= this.run(resume).finally(() => (this.running = null));
    return this.running;
  }

  private async run(resume: boolean): Promise<SubmissionView> {
    if (this.cancelled) throw new UploadCancelled();
    if (this.blob.size < 1 || this.blob.size > UPLOAD_LIMITS.maxBytes) throw new ArmariumError(0, this.blob.size < 1 ? 'empty-file' : 'too-large');
    this.stopper = new AbortController();
    this.failure = null;
    try {
      if (this.ticket === null) await this.newTicket();
      else if (resume) await this.markReceived();
      return await this.sendAndComplete();
    } catch (error) {
      if (this.cancelled) throw new UploadCancelled();
      const failure = failureOf(error);
      // A ticket that ended takes nothing more: Retry asks for a new one.
      if (ticketEnded(failure)) this.ticket = null;
      this.failure = { code: failure.code, until: failure.until };
      this.statuses = this.statuses.map((status) => (status === 'sending' ? 'failed' : status));
      this.changed();
      throw error;
    }
  }

  private async newTicket(): Promise<void> {
    const ticket = await this.deps.api.ticket(this.fileName, this.blob.size);
    this.ticket = ticket;
    this.ranges = partRanges(this.blob.size, ticket.partBytes);
    this.statuses = this.ranges.map(() => 'waiting');
    this.changed();
  }

  /** What the API has of this ticket's parts, so only the rest is sent. */
  private async markReceived(): Promise<void> {
    const ticket = this.ticket;
    if (ticket === null) return;
    const view = await this.deps.api.submission(ticket.id);
    const received = new Set(view.parts.map((part) => part.n));
    this.statuses = this.ranges.map((range) => (received.has(range.n) ? 'sent' : 'waiting'));
    this.changed();
  }

  private async sendAndComplete(): Promise<SubmissionView> {
    await this.sendMissing();
    const ticket = this.ticket;
    if (ticket === null) throw new ArmariumError(0, 'internal');
    try {
      return await this.withRetries(() => this.deps.api.complete(ticket.id));
    } catch (error) {
      // A completion that finds a part missing says so: the part is sent and the completion asked for again, once.
      if (failureOf(error).code !== 'upload-incomplete') throw error;
      await this.markReceived();
      await this.sendMissing();
      return this.withRetries(() => this.deps.api.complete(ticket.id));
    }
  }

  /** Sends every part not sent yet, a few at a time; the first part that fails for good stops the others. */
  private async sendMissing(): Promise<void> {
    const queue = this.ranges.filter((_, index) => this.statuses[index] !== 'sent');
    const stop = this.stopper.signal;
    const worker = async (): Promise<void> => {
      for (let range = queue.shift(); range !== undefined; range = queue.shift()) {
        stop.throwIfAborted();
        await this.sendPart(range);
      }
    };
    const workers = Array.from({ length: Math.min(UPLOAD_LIMITS.partsInFlight, queue.length) }, () => worker().catch((error: unknown) => {
      queue.length = 0;
      throw error;
    }));
    const results = await Promise.allSettled(workers);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
  }

  private async sendPart(range: PartRange): Promise<void> {
    const ticket = this.ticket;
    if (ticket === null) return;
    const index = range.n - 1;
    this.statuses[index] = 'sending';
    this.changed();
    await this.withRetries(async () => {
      const bytes = await this.blob.slice(range.start, range.end).arrayBuffer();
      await this.deps.api.putPart(ticket.id, range.n, bytes, await this.deps.sha256(bytes));
    });
    if (this.cancelled) return;
    this.statuses[index] = 'sent';
    this.changed();
  }

  /** Runs `step` until it succeeds or `failurePlan` says to stop; the failure that stopped it is thrown as it came. */
  private async withRetries<T>(step: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await step();
      } catch (error) {
        if (this.cancelled) throw new UploadCancelled();
        const plan = failurePlan(failureOf(error), attempt);
        if (plan.action === 'stop') throw error;
        await this.deps.sleep(plan.delayMs, this.stopper.signal);
      }
    }
  }

  private changed(): void {
    this.onChange(this.progress());
  }
}
