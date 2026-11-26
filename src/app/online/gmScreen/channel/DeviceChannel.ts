import {
  GM_SCREEN_VERSION, MAX_DEVICE_MESSAGE, parseGmScreenMessage, parseGmScreenWire, type DeviceMessage, type DeviceWire, type GmScreenMessage, type SealedFrame, type SealOpen,
} from '../../protocol/index.ts';
import { fromBase64, toBase64 } from '../../../utils/base64';
import { SerialLock } from '../../../utils/serialLock';
import { directionKey, newOpening, type ChannelCrypto } from './channelKeys';
import { decodeMessage, encodeMessage, type ChannelEvents, type ChannelKeys } from './channelCodec';
import { Opening, Sealing } from './seal';

/**
 * A device's end of its channel to Atlas. It answers every opening of Atlas with a value of its own,
 * and asks for a new exchange, once per exchange, when a frame does not open or frames before one went
 * missing: Atlas then opens again and sends what the device should hold. Everything happens in turn.
 */
export class DeviceChannel {
  private readonly crypto: ChannelCrypto;
  private readonly link: CryptoKey;
  private readonly transport: (body: DeviceWire) => void;
  private readonly events: ChannelEvents<GmScreenMessage>;
  private readonly turns = new SerialLock();
  private keys: ChannelKeys | null = null;
  /** The device asked for a new exchange since the last one began. */
  private asked = false;

  /** `link`: the link's key (`linkKey`); `transport` hands a body to the relay for Atlas. */
  constructor(crypto: ChannelCrypto, link: CryptoKey, transport: (body: DeviceWire) => void, events: ChannelEvents<GmScreenMessage>) {
    this.crypto = crypto;
    this.link = link;
    this.transport = transport;
    this.events = events;
  }

  /** Whether messages pass now. */
  get isOpen(): boolean {
    return this.keys !== null;
  }

  /** A body Atlas sent, a large one put together from its parts first. */
  receive(body: unknown): Promise<void> {
    const wire = parseGmScreenWire(body);
    if (wire === null) return Promise.resolve();
    return this.turns.run(() => (wire.t === 'seal-open' ? this.answer(wire) : this.sealed(wire)));
  }

  /** Seals a message for Atlas; false while the channel is not open, or for a message larger than one may be. */
  send(message: DeviceMessage): Promise<boolean> {
    return this.turns.run(async () => {
      const bytes = encodeMessage(message, MAX_DEVICE_MESSAGE);
      if (this.keys === null || bytes === null) return false;
      const frame = await this.keys.sealing.seal(bytes);
      if (frame === null) {
        this.ask();
        return false;
      }
      this.transport(frame);
      return true;
    });
  }

  private async answer(open: SealOpen): Promise<void> {
    if (open.v !== GM_SCREEN_VERSION) return this.events.otherVersion?.(open.v);
    const gm = fromBase64(open.r);
    const own = newOpening(this.crypto);
    const [openKey, sealKey] = await Promise.all([
      directionKey(this.crypto, this.link, gm, own, 'gm', 'decrypt'),
      directionKey(this.crypto, this.link, gm, own, 'device', 'encrypt'),
    ]);
    this.keys = { sealing: new Sealing(this.crypto, sealKey, 'device'), opening: new Opening(this.crypto, openKey, 'gm') };
    this.asked = false;
    this.transport({ t: 'seal-answer', v: GM_SCREEN_VERSION, to: open.r, r: toBase64(own) });
    this.events.opened();
  }

  private async sealed(frame: SealedFrame): Promise<void> {
    const opened = this.keys === null ? 'refused' : await this.keys.opening.open(frame);
    // A late frame is a repeat of one taken already, and asks for nothing.
    if (opened === 'late') return;
    if (opened === 'refused' || opened.gap) this.ask();
    const message = opened === 'refused' ? null : decodeMessage(opened.bytes, parseGmScreenMessage);
    if (message !== null) this.events.message(message);
  }

  private ask(): void {
    if (this.asked) return;
    this.asked = true;
    this.transport({ t: 'seal-ask', v: GM_SCREEN_VERSION });
  }
}
