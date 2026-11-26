import {
  GM_SCREEN_VERSION, MAX_GM_SCREEN_MESSAGE, parseDeviceMessage, parseDeviceWire, type DeviceMessage, type GmScreenMessage, type GmScreenWire, type SealAnswer, type SealedFrame,
} from '../../protocol/index.ts';
import { fromBase64, toBase64 } from '../../../utils/base64';
import { SerialLock } from '../../../utils/serialLock';
import { directionKey, newOpening, type ChannelCrypto } from './channelKeys';
import { decodeMessage, encodeMessage, type ChannelEvents, type ChannelKeys } from './channelCodec';
import { Opening, Sealing } from './seal';

/**
 * Atlas's end of the channel to one device. Atlas opens it (`open`) on every welcome from the relay and
 * every time the device joins, and again when the device asks; until the device answers, nothing is
 * sealed and nothing it sent is opened. Everything happens in turn, so frames leave in the order of
 * their counters.
 */
export class GmChannel {
  private readonly crypto: ChannelCrypto;
  private readonly link: CryptoKey;
  private readonly transport: (body: GmScreenWire) => void;
  private readonly events: ChannelEvents<DeviceMessage>;
  private readonly turns = new SerialLock();
  private keys: ChannelKeys | null = null;
  /** Atlas's opening value of the exchange under way, until the device answers it. */
  private pending: { readonly value: Uint8Array<ArrayBuffer>; readonly text: string } | null = null;

  /** `link`: the link's key (`linkKey`); `transport` hands a body to the relay for this device. */
  constructor(crypto: ChannelCrypto, link: CryptoKey, transport: (body: GmScreenWire) => void, events: ChannelEvents<DeviceMessage>) {
    this.crypto = crypto;
    this.link = link;
    this.transport = transport;
    this.events = events;
  }

  /** Whether messages pass now. */
  get isOpen(): boolean {
    return this.keys !== null;
  }

  /** Begins a new exchange: the keys in force are dropped, and a new opening value goes to the device. */
  open(): Promise<void> {
    return this.turns.run(() => Promise.resolve(this.begin()));
  }

  /** A body the device sent. */
  receive(body: unknown): Promise<void> {
    const wire = parseDeviceWire(body);
    if (wire === null) return Promise.resolve();
    return this.turns.run(async () => {
      if (wire.t === 'sealed') return this.sealed(wire);
      if (wire.v !== GM_SCREEN_VERSION) return this.events.otherVersion?.(wire.v);
      if (wire.t === 'seal-answer') return this.answered(wire);
      // An exchange under way is the answer to an ask: a device that asks again and again opens nothing new.
      if (this.pending === null) this.begin();
    });
  }

  /** Seals a message for the device; false while the channel is not open, or for a message larger than one may be. */
  send(message: GmScreenMessage): Promise<boolean> {
    return this.turns.run(async () => {
      const bytes = encodeMessage(message, MAX_GM_SCREEN_MESSAGE);
      if (this.keys === null || bytes === null) return false;
      const frame = await this.keys.sealing.seal(bytes);
      if (frame === null) {
        // This key sealed all it may: a new exchange makes new keys.
        this.begin();
        return false;
      }
      this.transport(frame);
      return true;
    });
  }

  private begin(): void {
    const value = newOpening(this.crypto);
    const text = toBase64(value);
    this.keys = null;
    this.pending = { value, text };
    this.transport({ t: 'seal-open', v: GM_SCREEN_VERSION, r: text });
  }

  private async answered(answer: SealAnswer): Promise<void> {
    const { pending } = this;
    // An answer to an earlier opening: its keys are not the ones the device holds now.
    if (pending === null || answer.to !== pending.text) return;
    const device = fromBase64(answer.r);
    const [sealKey, openKey] = await Promise.all([
      directionKey(this.crypto, this.link, pending.value, device, 'gm', 'encrypt'),
      directionKey(this.crypto, this.link, pending.value, device, 'device', 'decrypt'),
    ]);
    this.pending = null;
    this.keys = { sealing: new Sealing(this.crypto, sealKey, 'gm'), opening: new Opening(this.crypto, openKey, 'device') };
    this.events.opened();
  }

  private async sealed(frame: SealedFrame): Promise<void> {
    const opened = this.keys === null ? 'refused' : await this.keys.opening.open(frame);
    // A gap needs nothing here: what the device sends stands on its own.
    const message = typeof opened === 'string' ? null : decodeMessage(opened.bytes, parseDeviceMessage);
    if (message !== null) this.events.message(message);
  }
}
