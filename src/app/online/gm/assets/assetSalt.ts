import { saltOf, type SaltStore } from '../account/saltStore.ts';
import type { StoreResult } from './storeClient.ts';

/** How long a salt the relay did not hand out is not asked for again (a relay without the store answers 404). */
export const SALT_RETRY_MS = 10 * 60 * 1000;
/** How long building a reference waits for a salt still being fetched before players are handed none. */
export const SALT_WAIT_MS = 5_000;

export interface AssetSaltPorts {
  readonly store: SaltStore;
  /** Asks the relay for the account's salt (`ASSET_ROUTES.salt`). */
  fetch(): Promise<StoreResult<unknown>>;
  /** Whether an account is signed in on this device. */
  signedIn(): boolean;
  /** The relay refused the token: it is forgotten with the salt. */
  signedOutByServer(): void;
  now(): number;
  /** A promise that settles after `ms`. */
  sleep(ms: number): Promise<void>;
}

/**
 * The GM's salt: kept in secret storage, fetched from the relay at sign-in and on first need while
 * signed in, the same for the account on every device (so earlier uploads stay deduplicated), and gone
 * on sign-out and on a 401. A relay that does not hand one out (an older relay, a failure) leaves the
 * GM without ids, quietly: players are then shown no assets.
 */
export class AssetSalt {
  private fetching: Promise<Uint8Array<ArrayBuffer> | null> | null = null;
  private failedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly ports: AssetSaltPorts) {}

  /** The salt kept now, or null. */
  get(): Uint8Array<ArrayBuffer> | null {
    return this.ports.signedIn() ? this.ports.store.get() : null;
  }

  /** The salt: kept, or fetched once while signed in (`force`: even soon after a failure). */
  ensure(force = false): Promise<Uint8Array<ArrayBuffer> | null> {
    const kept = this.get();
    if (kept !== null) return Promise.resolve(kept);
    if (!this.ports.signedIn() || (!force && this.ports.now() - this.failedAt < SALT_RETRY_MS)) return Promise.resolve(null);
    this.fetching ??= this.fetch().finally(() => (this.fetching = null));
    return this.fetching;
  }

  /** The salt, waiting at most `SALT_WAIT_MS` for one being fetched. */
  async soon(): Promise<Uint8Array<ArrayBuffer> | null> {
    const kept = this.get();
    if (kept !== null) return kept;
    return Promise.race([this.ensure(), this.ports.sleep(SALT_WAIT_MS).then(() => null)]);
  }

  clear(): void {
    this.ports.store.clear();
    this.failedAt = Number.NEGATIVE_INFINITY;
  }

  private async fetch(): Promise<Uint8Array<ArrayBuffer> | null> {
    const answer = await this.ports.fetch();
    if (!answer.ok) {
      if (answer.trouble === 'signed-out') this.ports.signedOutByServer();
      else this.failedAt = this.ports.now();
      return null;
    }
    const salt = saltOf(answer.value);
    if (salt === null || !this.ports.signedIn()) {
      this.failedAt = this.ports.now();
      return null;
    }
    this.ports.store.set(salt);
    return salt;
  }
}
