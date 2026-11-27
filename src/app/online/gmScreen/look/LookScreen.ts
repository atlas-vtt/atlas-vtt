import type { Timers } from '../../gm/companionTimers.ts';
import type { LookMessage } from '../../protocol/index.ts';
import type { GmScreen, GmScreenOutlet } from '../screens.ts';

/**
 * How long Obsidian's announcements of a change of look (`css-change`) must have been quiet before the look is read:
 * a switch of theme or look comes as a few of them, while its stylesheet loads.
 */
export const LOOK_SETTLE_MS = 150;

export interface LookScreenDeps {
  /** The look Obsidian shows now; null where it shows no colour that could be read. */
  read(): LookMessage | null;
  readonly outlet: GmScreenOutlet;
  readonly timers: Timers;
}

/**
 * The colours of the GM's Obsidian on Atlas's side of Sidekick: a device gets the look each time its channel opens,
 * and every connected device gets it again after a change of it, one message once the change settled, and none
 * where nothing a device draws with changed. It reads no message of a device.
 */
export class LookScreen implements GmScreen {
  readonly takes = [] as const;
  /** The look as last read and sent, as JSON; null while it must be read anew. */
  private shown: string | null = null;
  private look: LookMessage | null = null;
  private timer: number | null = null;

  constructor(private readonly deps: LookScreenDeps) {}

  opened(device: string): void {
    const look = this.shown === null ? this.read() : this.look;
    if (look !== null) this.deps.outlet.send(look, device);
  }

  message(): void {
    // A device sends nothing this screen reads (`takes` is empty).
  }

  /** Obsidian announced a change of look: read once its announcements settle. */
  changed(): void {
    this.clearTimer();
    this.timer = this.deps.timers.setTimer(() => {
      this.timer = null;
      this.settled();
    }, LOOK_SETTLE_MS);
  }

  dispose(): void {
    this.clearTimer();
  }

  private settled(): void {
    // Nobody connected: the next device to connect gets the look of that moment.
    if (this.deps.outlet.devices.length === 0) {
      this.shown = null;
      return;
    }
    const before = this.shown;
    const look = this.read();
    if (look !== null && this.shown !== before) this.deps.outlet.send(look);
  }

  private read(): LookMessage | null {
    this.look = this.deps.read();
    this.shown = JSON.stringify(this.look);
    return this.look;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.deps.timers.clearTimer(this.timer);
    this.timer = null;
  }
}
