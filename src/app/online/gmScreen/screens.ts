import type { DeviceMessage, GmScreenMessage } from '../protocol/index.ts';

/** The kinds of message a device sends. */
export type DeviceMessageType = DeviceMessage['t'];

/**
 * One screen of the GM screen on Atlas's side (Keys, Sound, Statblocks): it reads the messages of its
 * kinds from allowed devices, already opened and parsed, and hands each device what it shows.
 */
export interface GmScreen {
  /** The kinds of device message this screen reads; no two plugged screens share one. */
  readonly takes: readonly DeviceMessageType[];
  /** A device's channel opened, the first time or again: everything this screen shows goes to it anew. */
  opened(device: string): void;
  /** A message of one of `takes` from an allowed device whose channel is open. */
  message(device: string, message: DeviceMessage): void;
  /** The device left, or was removed: nothing more goes to it. */
  closed?(device: string): void;
}

/** What a screen sends through: sealed for each device under its own keys, only while its channel is open. */
export interface GmScreenOutlet {
  /** Sends to one device, or to every device whose channel is open. */
  send(message: GmScreenMessage, to?: string): void;
  /** The devices whose channel is open now. */
  readonly devices: readonly string[];
}

/** The plugged screens, found by the kind of message they read. */
export class ScreenRouter {
  private readonly screens: GmScreen[] = [];

  /** Plugs a screen in; returns what unplugs it. */
  plug(screen: GmScreen): () => void {
    const taken = screen.takes.filter((type) => this.screens.some((other) => other.takes.includes(type)));
    if (taken.length > 0) throw new Error(`A screen already reads ${taken.join(', ')}`);
    this.screens.push(screen);
    return () => {
      const at = this.screens.indexOf(screen);
      if (at !== -1) this.screens.splice(at, 1);
    };
  }

  opened(device: string): void {
    for (const screen of [...this.screens]) screen.opened(device);
  }

  message(device: string, message: DeviceMessage): void {
    this.screens.find((screen) => screen.takes.includes(message.t))?.message(device, message);
  }

  closed(device: string): void {
    for (const screen of [...this.screens]) screen.closed?.(device);
  }
}
