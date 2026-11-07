import { AUDIO_MIME_TYPE, type AssetRef } from '../../protocol/index.ts';
import type { GrowingCopy } from '../../../sound/codec/growingCopy';
import { CODEC_VERSION } from '../../../sound/codec/opusCache';
import { LiveSegments } from './liveSegments.ts';
import { randomHex } from '../../../utils/randomHex';
import type { SoundBytes } from '../../../sound/soundTypes';
import type { AssetUse } from '../assets/assetUses.ts';
import { sha256Hex } from '../assetServe.ts';

export interface SoundRefsPorts {
  /** The stored copy of a key, as the cache keeps it. */
  bytes(key: string): Promise<SoundBytes>;
  /** The copy of a key while it is made, if it is. */
  growing(key: string): GrowingCopy | null;
  copyRef(copy: Pick<AssetRef, 'hash' | 'size' | 'mime'>, read: () => Promise<Uint8Array<ArrayBuffer> | null>, use: AssetUse, handed: boolean): Promise<AssetRef | null>;
  segmentsRef(key: string, codecVersion: number, segments: LiveSegments, use: AssetUse, handed: boolean): Promise<AssetRef | null>;
  /** Whether the store takes sounds in segments; where it does not, a long sound goes whole once its copy is stored. */
  segmentsTaken?(): boolean;
}

/**
 * A copy up to this size goes up whole, as a page fetches it whole; a longer one, or one still being made,
 * goes in segments, which a page can play from as soon as the first is stored.
 */
export const WHOLE_COPY_BYTES = 4 * 1024 * 1024;

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
  /** Keys whose reference players were handed: a sound only staged ahead is offered again when it is, so its progress reaches them. */
  private readonly handedKeys = new Set<string>();
  /** The segments of each long sound, made once while the table runs: from its copy as it is made, else from the stored copy. */
  private readonly segments = new Map<string, Promise<LiveSegments>>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly ports: SoundRefsPorts) {}

  /** The reference last made of a key: undefined before there was one, null where the store will not keep it. */
  known(key: string): AssetRef | null | undefined {
    return this.refs.get(key);
  }

  /** Whether players were handed the reference of a key; one only staged ahead was not. */
  handed(key: string): boolean {
    return this.handedKeys.has(key);
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

  /** Offers a copy; resolves with what the store says of it. A long one, or one still being made, goes in segments. */
  async ensure(key: string, use: AssetUse, handed: boolean): Promise<AssetRef | null> {
    // A store before segments takes a long sound only whole, which a copy still being made is not yet: players
    // wait for it (as for a sound with no reference), and it is offered again once its copy is stored.
    const growing = this.ports.growing(key);
    if (growing && this.ports.segmentsTaken?.() === false) {
      this.refs.set(key, null);
      void growing.reach(Number.POSITIVE_INFINITY).catch(() => undefined).then(() => this.refs.delete(key));
      return null;
    }
    try {
      const segments = await this.segmentsOf(key);
      if (segments !== null) {
        const ref = await this.ports.segmentsRef(key, CODEC_VERSION, segments, { ...use, kind: 'segments' }, handed);
        return this.noted(key, ref, handed);
      }
      const { hash, size } = await this.hashOf(key);
      const ref = await this.ports.copyRef({ hash, size, mime: AUDIO_MIME_TYPE }, () => this.ports.bytes(key).then(whole), use, handed);
      return this.noted(key, ref, handed);
    } catch (error) {
      this.hashes.delete(key);
      console.error('[Atlas] Could not read a sound for players', error);
      this.refs.set(key, null);
      return null;
    }
  }

  private noted(key: string, ref: AssetRef | null, handed: boolean): AssetRef | null {
    if (handed || ref === null || !this.refs.get(key)) this.refs.set(key, ref);
    if (handed && ref !== null) this.handedKeys.add(key);
    return ref;
  }

  /** The segments a key goes up in, or null where its stored copy is small enough to go whole. */
  private segmentsOf(key: string): Promise<LiveSegments | null> {
    if (this.ports.segmentsTaken?.() === false) return Promise.resolve(null);
    const made = this.segments.get(key);
    if (made) return made;
    const growing = this.ports.growing(key);
    if (growing) return this.keep(key, LiveSegments.ofGrowing(growing));
    return this.ports.bytes(key).then((bytes) => (bytes.byteLength > WHOLE_COPY_BYTES ? this.keep(key, LiveSegments.ofStored(bytes)) : null));
  }

  private keep(key: string, made: Promise<LiveSegments>): Promise<LiveSegments> {
    this.segments.set(key, made);
    made.catch(() => this.segments.delete(key));
    return made;
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
