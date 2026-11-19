import { ArmariumError, type ArmariumApi } from '../../../src/app/armarium/upload/armariumApi';
import type { ListingFields, OwnListing, SubmissionView, UploadEligibility, UploadTicket } from '../../../src/app/armarium/upload/uploadContract';

export type FakeApi = Pick<ArmariumApi, 'eligibility' | 'ownListing' | 'ticket' | 'putPart' | 'complete' | 'submission' | 'discard' | 'putListing' | 'publish'>;

/** A failure a call answers with once: the code, and the status it came with. */
type Failure = { status: number; code: string };

/**
 * The Armarium as a share meets it, in memory: tickets, parts with their hashes, a check that takes a few asks, the
 * listing and the publish. Every call is logged; `fail` makes the next calls of a name fail in turn.
 */
export class FakeArmarium implements FakeApi {
  readonly calls: string[] = [];
  readonly parts = new Map<number, { bytes: number; sha256: string }>();
  readonly discarded: string[] = [];
  gate: UploadEligibility = { may: true };
  own: OwnListing | null = null;
  partBytes = 4;
  /** How many asks the check stays `checking` before it ends in `checkedAs`. */
  checkAsks = 2;
  checkedAs: SubmissionView['state'] = 'checked';
  findings: SubmissionView['findings'] = [];
  storedListing: ListingFields | null = null;
  state: SubmissionView['state'] = 'uploading';
  publishedAs: SubmissionView['state'] = 'published';
  private tickets = 0;
  private readonly failures = new Map<string, Failure[]>();

  fail(name: string, ...failures: Failure[]): void {
    this.failures.set(name, [...(this.failures.get(name) ?? []), ...failures]);
  }

  private async answer<T>(name: string, value: () => T): Promise<T> {
    this.calls.push(name);
    await Promise.resolve();
    const failure = this.failures.get(name)?.shift();
    if (failure) throw new ArmariumError(failure.status, failure.code);
    return value();
  }

  view(): SubmissionView {
    return {
      id: `sub-${this.tickets}`,
      state: this.state,
      bytes: 10,
      parts: [...this.parts].map(([n, part]) => ({ n, sha256: part.sha256 })),
      progress: this.state === 'checking' ? { stage: 'images', done: 3, total: 10 } : null,
      findings: this.state === 'checking' ? [] : this.findings,
      manifest: this.state === 'uploading' ? null : { uid: 'col-uid', version: 3, name: 'Blue Mouth Caves', notes: null },
      listing: this.storedListing,
    };
  }

  eligibility(): Promise<UploadEligibility> {
    return this.answer('eligibility', () => this.gate);
  }

  ownListing(uid: string): Promise<OwnListing | null> {
    this.calls.push('ownListing');
    return Promise.resolve(this.own?.uid === uid ? this.own : null);
  }

  ticket(_fileName: string, bytes: number): Promise<UploadTicket> {
    return this.answer('ticket', () => {
      this.tickets += 1;
      this.parts.clear();
      this.state = 'uploading';
      return { id: `sub-${this.tickets}`, partBytes: this.partBytes, parts: Math.ceil(bytes / this.partBytes), expiresAt: '2030-01-01T00:00:00.000Z' };
    });
  }

  putPart(_id: string, n: number, bytes: ArrayBuffer, sha256: string): Promise<void> {
    return this.answer(`part ${n}`, () => void this.parts.set(n, { bytes: bytes.byteLength, sha256 }));
  }

  complete(): Promise<SubmissionView> {
    return this.answer('complete', () => {
      this.state = 'checking';
      return this.view();
    });
  }

  submission(): Promise<SubmissionView> {
    return this.answer('submission', () => {
      if (this.state === 'checking' && --this.checkAsks <= 0) this.state = this.checkedAs;
      return this.view();
    });
  }

  discard(id: string): Promise<void> {
    return this.answer('discard', () => {
      this.discarded.push(id);
      this.state = 'expired';
    });
  }

  putListing(_id: string, fields: ListingFields): Promise<SubmissionView> {
    return this.answer('putListing', () => {
      this.storedListing = fields;
      return this.view();
    });
  }

  publish(): Promise<SubmissionView> {
    return this.answer('publish', () => {
      this.state = this.publishedAs;
      return this.view();
    });
  }
}

/** A sleep that waits no time, and still stops on its signal. */
export function noSleep(_ms: number, signal: AbortSignal): Promise<void> {
  return signal.aborted ? Promise.reject(new Error('aborted')) : Promise.resolve();
}

/** Lets every promise that waits only on others settle. */
export async function settle(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
