import { MAX_SEAL_COUNTER, type SealedFrame } from '../../protocol/index.ts';
import { fromBase64, toBase64 } from '../../../utils/base64';
import { labelBytes, openBytes, sealBytes, type ChannelCrypto, type Direction } from './channelKeys';

/**
 * The most 16-byte blocks one key seals, its messages and their associated data together: 2^32, so an
 * attacker's advantage against its confidentiality stays below 2^-65 (the CFRG's AEAD limits for AES-GCM,
 * `(s + q + 1)^2 / 2^129`). A channel opens again long before.
 */
const BLOCK_BUDGET = 2 ** 32;

/** The sending side of one direction of one exchange: its counter rises by one with every frame and never goes back. */
export class Sealing {
  private readonly crypto: ChannelCrypto;
  private readonly key: CryptoKey;
  private readonly direction: Direction;
  private counter = 0;
  private blocks = 0;

  constructor(crypto: ChannelCrypto, key: CryptoKey, direction: Direction) {
    this.crypto = crypto;
    this.key = key;
    this.direction = direction;
  }

  /** The bytes sealed as the next frame; null once this key has sealed all it may. */
  async seal(bytes: Uint8Array<ArrayBuffer>): Promise<SealedFrame | null> {
    const blocks = Math.ceil((bytes.length + labelBytes(this.direction)) / 16) + 1;
    if (this.counter >= MAX_SEAL_COUNTER || this.blocks + blocks > BLOCK_BUDGET) return null;
    this.counter += 1;
    this.blocks += blocks;
    const n = this.counter;
    return { t: 'sealed', n, d: toBase64(await sealBytes(this.crypto, this.key, this.direction, n, bytes)) };
  }
}

/** A frame's bytes once its seal is opened; `gap` when frames before it never arrived. */
export interface Opened {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly gap: boolean;
}

/** A frame that was not opened: one whose counter is not above the last frame's (`late`), or whose seal does not open here (`refused`). */
export type NotOpened = 'late' | 'refused';

/**
 * The receiving side: a frame opens only under this direction's key with its tag intact, and only with a
 * counter above the last frame's. The relay delivers in order, so a replayed or older frame is refused; a
 * frame the room dropped leaves a gap, which is no attack.
 */
export class Opening {
  private readonly crypto: ChannelCrypto;
  private readonly key: CryptoKey;
  private readonly direction: Direction;
  private last = 0;

  constructor(crypto: ChannelCrypto, key: CryptoKey, direction: Direction) {
    this.crypto = crypto;
    this.key = key;
    this.direction = direction;
  }

  /** The frame's bytes, or why it was not opened. Called one frame at a time. */
  async open(frame: SealedFrame): Promise<Opened | NotOpened> {
    if (frame.n <= this.last) return 'late';
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await openBytes(this.crypto, this.key, this.direction, frame.n, fromBase64(frame.d));
    } catch {
      return 'refused';
    }
    // Only a frame that opened moves the counter on: a forged one with a high counter stops nothing.
    const gap = frame.n > this.last + 1;
    this.last = frame.n;
    return { bytes, gap };
  }
}
