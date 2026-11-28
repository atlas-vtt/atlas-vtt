import type { BackdropMessage, BackdropPicture, DeviceMessage } from '../../protocol/index.ts';
import type { GmScreen, GmScreenOutlet } from '../screens.ts';

export interface BackdropPorts {
  /** The image of the played campaign's world map; null where no campaign is played or its world map cannot be shown. */
  art(): Promise<string | null>;
  /** That image cut to a screen of this many device pixels; null where it cannot be. */
  cut(path: string, width: number, height: number): Promise<BackdropPicture | null>;
  readonly outlet: GmScreenOutlet;
}

/** How many cuts are kept, by image and screen: a GM's few devices, and one size more for a tablet turned. */
const KEPT_CUTS = 6;

/**
 * The picture behind Sidekick's screens on Atlas's side: the played campaign's world map, cut to each device's screen
 * (`backdrop-ask` says its size). A device gets it when it asks and each time its channel opens; every device whose
 * size is known gets it again when the played campaign or its world map changes (`changed`). Cuts are made one at a
 * time and kept by image and size, so a device coming back, or two of a size, cost nothing more; a device is sent a
 * picture only where it is another than the one it has.
 */
export class BackdropScreen implements GmScreen {
  readonly takes = ['backdrop-ask'] as const;
  private readonly sizes = new Map<string, { readonly width: number; readonly height: number }>();
  /** What each device was sent last, as its image and size; '' for no picture. */
  private readonly sent = new Map<string, string>();
  private readonly cuts = new Map<string, Promise<BackdropPicture | null>>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(private readonly ports: BackdropPorts) {}

  opened(device: string): void {
    this.sent.delete(device);
    if (this.sizes.has(device)) void this.send(device);
  }

  message(device: string, message: DeviceMessage): void {
    if (message.t !== 'backdrop-ask') return;
    this.sizes.set(device, { width: message.width, height: message.height });
    void this.send(device);
  }

  closed(device: string): void {
    this.sent.delete(device);
  }

  forgotten(device?: string): void {
    if (device === undefined) {
      this.sizes.clear();
      this.sent.clear();
    } else {
      this.sizes.delete(device);
      this.sent.delete(device);
    }
  }

  /**
   * The played campaign, or what it holds, may be another: every device whose size is known is sent its picture where
   * it is now another. Campaigns change often in play (their players, their notes): a world map cut before is kept.
   */
  changed(): void {
    for (const device of this.ports.outlet.devices) if (this.sizes.has(device)) void this.send(device);
  }

  dispose(): void {
    this.disposed = true;
    this.cuts.clear();
  }

  private send(device: string): Promise<void> {
    const run = this.queue.then(async () => {
      const size = this.sizes.get(device);
      if (this.disposed || size === undefined || !this.ports.outlet.devices.includes(device)) return;
      const art = await this.ports.art();
      const key = art === null ? '' : `${art}|${size.width}x${size.height}`;
      const picture = art === null ? null : await this.cutOf(key, art, size.width, size.height);
      const shown = picture === null ? '' : key;
      if (this.disposed || this.sent.get(device) === shown || this.sizes.get(device) !== size) return;
      this.sent.set(device, shown);
      const message: BackdropMessage = { t: 'backdrop', picture };
      this.ports.outlet.send(message, device);
    }).catch(() => undefined);
    this.queue = run;
    return run;
  }

  private cutOf(key: string, art: string, width: number, height: number): Promise<BackdropPicture | null> {
    let cut = this.cuts.get(key);
    if (!cut) {
      cut = this.ports.cut(art, width, height).catch(() => null);
      this.cuts.set(key, cut);
      const [oldest] = this.cuts.keys();
      if (this.cuts.size > KEPT_CUTS && oldest !== undefined) this.cuts.delete(oldest);
    }
    return cut;
  }
}
