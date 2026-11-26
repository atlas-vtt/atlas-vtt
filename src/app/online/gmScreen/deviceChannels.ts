import type { DeviceMessage, GmScreenMessage, GmScreenWire } from '../protocol/index.ts';
import { GmChannel, type ChannelCrypto, type ChannelTimers } from './channel/index.ts';

/** What the channels tell the session. */
export interface DeviceChannelEvents {
  /** A device's channel opened (the first time, or again after an exchange). */
  opened(device: string): void;
  message(device: string, message: DeviceMessage): void;
}

/**
 * Atlas's end of one channel per connected device, all under the link's key. A device's channel is made
 * when it connects and dropped when it leaves; what it still sends after that, or what a device without
 * one sends, is never opened.
 */
export class DeviceChannels {
  private readonly channels = new Map<string, GmChannel>();

  constructor(
    private readonly crypto: ChannelCrypto,
    private readonly link: CryptoKey,
    private readonly timers: ChannelTimers,
    private readonly transport: (device: string, body: GmScreenWire) => void,
    private readonly events: DeviceChannelEvents,
  ) {}

  /** The devices whose channel is open now. */
  get devices(): readonly string[] {
    return [...this.channels].filter(([, channel]) => channel.isOpen).map(([device]) => device);
  }

  /** Begins an exchange with a device that connected, or connected again: what it held before is void. */
  connect(device: string): void {
    let channel = this.channels.get(device);
    if (channel === undefined) {
      const made = new GmChannel(this.crypto, this.link, this.timers, (body) => this.transport(device, body), {
        opened: () => {
          if (this.channels.get(device) === made) this.events.opened(device);
        },
        message: (message) => {
          if (this.channels.get(device) === made) this.events.message(device, message);
        },
      });
      channel = made;
      this.channels.set(device, channel);
    }
    void channel.open();
  }

  drop(device: string): void {
    this.channels.get(device)?.close();
    this.channels.delete(device);
  }

  clear(): void {
    for (const channel of this.channels.values()) channel.close();
    this.channels.clear();
  }

  receive(device: string, body: unknown): void {
    void this.channels.get(device)?.receive(body);
  }

  /** Seals the message for one device or every open one; a device whose channel is not open gets nothing. */
  send(message: GmScreenMessage, to?: string): void {
    for (const device of to === undefined ? this.devices : [to]) void this.channels.get(device)?.send(message);
  }
}
