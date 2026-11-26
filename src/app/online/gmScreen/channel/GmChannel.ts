import {
  GM_SCREEN_VERSION, MAX_GM_SCREEN_MESSAGE, parseDeviceMessage, parseDeviceWire, type DeviceMessage, type GmScreenMessage, type GmScreenWire, type SealAnswer, type SealedFrame,
} from '../../protocol/index.ts';
import { fromBase64, toBase64 } from '../../../utils/base64';
import { SerialLock } from '../../../utils/serialLock';
import { directionKey, newOpening, type ChannelCrypto } from './channelKeys';
import { decodeMessage, encodeMessage, type ChannelEvents, type ChannelKeys } from './channelCodec';
import { OPENING_SENDS, OpeningPace, RESEND_MS, type ChannelTimers } from './openingPace';
import { Opening, Sealing } from './seal';

/** Atlas's opening value of the exchange under way, and how often it went to the device. */
interface Pending {
  readonly value: Uint8Array<ArrayBuffer>;
  readonly text: string;
  sends: number;
}

/**
 * Atlas's end of the channel to one device. Atlas opens it (`open`) on every welcome from the relay and
 * every time the device joins, and again when the device asks or sends what does not open here. Until
 * the device answers, nothing is sealed; what it sealed under the exchange before still opens, and the
 * opening goes again while no answer comes (`OPENING_SENDS`), then anew whenever the device is heard.
 * Everything happens in turn, so frames leave in the order of their counters.
 */
export class GmChannel {
  private readonly turns = new SerialLock();
  private readonly pace = new OpeningPace();
  /** The keys of the last exchange that finished. */
  private keys: ChannelKeys | null = null;
  private pending: Pending | null = null;
  private timer: { readonly id: number; readonly at: number } | null = null;
  private closed = false;

  /** `link`: the link's key (`linkKey`); `transport` hands a body to the relay for this device. */
  constructor(
    private readonly crypto: ChannelCrypto,
    private readonly link: CryptoKey,
    private readonly timers: ChannelTimers,
    private readonly transport: (body: GmScreenWire) => void,
    private readonly events: ChannelEvents<DeviceMessage>,
  ) {}

  /** Whether messages pass now. */
  get isOpen(): boolean {
    return this.keys !== null && this.pending === null;
  }

  /** Begins a new exchange: nothing is sealed until the device answers the new opening value. */
  open(): Promise<void> {
    return this.turns.run(() => Promise.resolve(this.begin()));
  }

  /** The device is gone: nothing more goes to it. */
  close(): void {
    this.closed = true;
    this.rest();
  }

  /** A body the device sent. */
  receive(body: unknown): Promise<void> {
    const wire = parseDeviceWire(body);
    if (wire === null) return Promise.resolve();
    return this.turns.run(async () => {
      if (wire.t === 'sealed') return this.sealed(wire);
      if (wire.v !== GM_SCREEN_VERSION) return this.events.otherVersion?.(wire.v);
      if (wire.t === 'seal-answer') return this.answered(wire);
      this.trouble();
    });
  }

  /** Seals a message for the device; false while the channel is not open, or for a message larger than one may be. */
  send(message: GmScreenMessage): Promise<boolean> {
    return this.turns.run(async () => {
      const bytes = encodeMessage(message, MAX_GM_SCREEN_MESSAGE);
      if (!this.isOpen || this.keys === null || bytes === null) return false;
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
    if (this.closed) return;
    const value = newOpening(this.crypto);
    this.pending = { value, text: toBase64(value), sends: 0 };
    this.sendOpening(this.pending);
  }

  /** Sends the opening (again); unanswered, it goes once more after `RESEND_MS`, twice as long each time, or later where the pace says so. */
  private sendOpening(pending: Pending): void {
    const now = this.timers.now();
    pending.sends += 1;
    this.pace.sent(now);
    this.transport({ t: 'seal-open', v: GM_SCREEN_VERSION, r: pending.text });
    this.rest();
    if (pending.sends < OPENING_SENDS) this.wake(Math.max(now + RESEND_MS * 2 ** (pending.sends - 1), this.pace.next(now)));
  }

  /**
   * The device asked for an exchange, sent a frame that does not open here, or was heard while an
   * exchange waits: its keys are not Atlas's. An opening on its way answers that while it may still go
   * again; otherwise a new exchange begins, at the pace's time.
   */
  private trouble(): void {
    if (this.pending !== null && this.pending.sends < OPENING_SENDS) return;
    this.wake(this.pace.next(this.timers.now()));
  }

  /** What is due at the timer: the opening once more while it may go, otherwise a new exchange. */
  private due(): void {
    if (this.pending !== null && this.pending.sends < OPENING_SENDS) this.sendOpening(this.pending);
    else this.begin();
  }

  /** Makes `due` happen at `at`, unless it happens sooner already; at once when `at` has come. */
  private wake(at: number): void {
    if (this.closed || (this.timer !== null && this.timer.at <= at)) return;
    this.rest();
    const now = this.timers.now();
    if (at <= now) return this.due();
    const id = this.timers.setTimer(() => {
      void this.turns.run(async () => {
        if (this.timer?.id !== id) return;
        this.timer = null;
        this.due();
      });
    }, at - now);
    this.timer = { id, at };
  }

  private rest(): void {
    if (this.timer !== null) this.timers.clearTimer(this.timer.id);
    this.timer = null;
  }

  private async answered(answer: SealAnswer): Promise<void> {
    const { pending } = this;
    // An answer to an earlier opening, or a repeat of one taken: its keys are not the ones the device holds now.
    if (pending === null || answer.to !== pending.text) return;
    const device = fromBase64(answer.r);
    const [sealKey, openKey] = await Promise.all([
      directionKey(this.crypto, this.link, pending.value, device, 'gm', 'encrypt'),
      directionKey(this.crypto, this.link, pending.value, device, 'device', 'decrypt'),
    ]);
    this.rest();
    this.pending = null;
    this.keys = { sealing: new Sealing(this.crypto, sealKey, 'gm'), opening: new Opening(this.crypto, openKey, 'device') };
    this.events.opened();
  }

  private async sealed(frame: SealedFrame): Promise<void> {
    const opened = this.keys === null ? 'refused' : await this.keys.opening.open(frame);
    if (opened === 'refused') return this.trouble();
    // A gap needs nothing here: what the device sends stands on its own.
    const message = opened === 'late' ? null : decodeMessage(opened.bytes, parseDeviceMessage);
    if (message !== null) this.events.message(message);
    // The device is there and holds the earlier keys: an opening that went unanswered all its times goes anew.
    if (this.pending !== null) this.trouble();
  }
}
