import type { DeviceStorage } from '../soundDirector/deviceFacts';
import { isFiniteNumber, isRecord } from '../utils/guards';

/**
 * Whether this computer listens for a remote, and the controller it trusts. A device fact, never synced:
 * a port opened on one computer must not open on another, and a token is this computer's alone.
 */
export interface RemoteSettings {
  enabled: boolean;
  /** SHA-256 of the paired controller's token; the token itself is never stored. */
  tokenHash: string | null;
  client: string | null;
  pairedAt: number | null;
}

const KEY = 'atlas-vtt:sound-remote';
const OFF: RemoteSettings = { enabled: false, tokenHash: null, client: null, pairedAt: null };

function read(value: unknown): RemoteSettings {
  if (!isRecord(value)) return OFF;
  const tokenHash = typeof value.tokenHash === 'string' && /^[0-9a-f]{64}$/.test(value.tokenHash) ? value.tokenHash : null;
  return {
    enabled: value.enabled === true,
    tokenHash,
    client: tokenHash && typeof value.client === 'string' ? value.client : null,
    pairedAt: tokenHash && isFiniteNumber(value.pairedAt) ? value.pairedAt : null,
  };
}

/** The remote's device settings, and who listens for their changes (the server, the settings tab). */
export class RemoteSettingsStore {
  private current: RemoteSettings;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: DeviceStorage) {
    let stored: unknown = null;
    try {
      stored = storage.loadLocalStorage(KEY);
    } catch (error) {
      console.warn('[Atlas] Reading the sound remote settings failed', error);
    }
    this.current = read(stored);
  }

  get(): RemoteSettings { return this.current; }

  setEnabled(enabled: boolean): void { this.write({ ...this.current, enabled }); }

  pair(tokenHash: string, client: string): void { this.write({ ...this.current, tokenHash, client, pairedAt: Date.now() }); }

  revoke(): void { this.write({ ...this.current, tokenHash: null, client: null, pairedAt: null }); }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private write(next: RemoteSettings): void {
    this.current = next;
    this.storage.saveLocalStorage(KEY, next);
    for (const listener of [...this.listeners]) listener();
  }
}
