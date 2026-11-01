import { AUDIO_MIME_TYPE, type AssetRef } from '../../protocol/index.ts';
import { randomHex } from '../../../utils/randomHex';
import type { SoundBytes } from '../../../sound/soundTypes';
import type { AssetUse } from '../assets/assetUses.ts';
import { sha256Hex } from '../assetServe.ts';

export interface SoundRefsPorts {
  /** The copy of a key, as the cache keeps it. */
  bytes(key: string): Promise<SoundBytes>;
  copyRef(copy: Pick<AssetRef, 'hash' | 'size' | 'mime'>, read: () => Promise<Uint8Array<ArrayBuffer> | null>, use: AssetUse, handed: boolean): Promise<AssetRef | null>;
}

const whole = async (bytes: SoundBytes): Promise<Uint8Array<ArrayBuffer>> => (await bytes.read(0, bytes.byteLength)) as Uint8Array<ArrayBuffer>;

/**
 * The references of a device's sounds: each copy hashed once while the table runs, one at a time, for
 * a read off the main thread still costs the memory of the copy; offered as often as it is asked for,
 * which is what brings back one the store let go. A key on the wire is the id a sound is stored under,
 * and a stand-in that says nothing where it is not stored: the key this device knows it by is the
 * hash of the GM's own file.
 */
export class SoundRefs {
  private readonly hashes = new Map<string, Promise<{ readonly hash: string; readonly size: number }>>();
  private readonly refs = new Map<string, AssetRef | null>();
  private readonly standIns = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly ports: SoundRefsPorts) {}

  /** The reference last made of a key: undefined before there was one, null where the store will not keep it. */
  known(key: string): AssetRef | null | undefined {
    return this.refs.get(key);
  }

  keys(): string[] {
    return [...this.refs.keys()];
  }

  wireKey(key: string): string {
    const id = this.refs.get(key)?.id;
    if (id !== undefined) return id;
    let standIn = this.standIns.get(key);
    if (standIn === undefined) {
      standIn = randomHex(32);
      this.standIns.set(key, standIn);
    }
    return standIn;
  }

  /** Offers a copy; resolves with what the store says of it. */
  async ensure(key: string, use: AssetUse, handed: boolean): Promise<AssetRef | null> {
    try {
      const { hash, size } = await this.hashOf(key);
      const ref = await this.ports.copyRef({ hash, size, mime: AUDIO_MIME_TYPE }, () => this.ports.bytes(key).then(whole), use, handed);
      if (handed || ref === null || !this.refs.get(key)) this.refs.set(key, ref);
      return ref;
    } catch (error) {
      this.hashes.delete(key);
      console.error('[Atlas] Could not read a sound for players', error);
      this.refs.set(key, null);
      return null;
    }
  }

  /** What the store said may have changed: what is not kept is asked for anew. */
  forgetRefused(): void {
    for (const [key, ref] of this.refs) if (ref === null) this.refs.delete(key);
  }

  private hashOf(key: string): Promise<{ readonly hash: string; readonly size: number }> {
    let known = this.hashes.get(key);
    if (known === undefined) {
      known = this.queue.then(async () => {
        const bytes = await this.ports.bytes(key);
        return { hash: await sha256Hex(await whole(bytes)), size: bytes.byteLength };
      });
      this.queue = known.catch(() => undefined);
      this.hashes.set(key, known);
    }
    return known;
  }
}
