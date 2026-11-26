import { EXPLORED_INLINE_BYTES, type AssetRef, type GmMessage } from '../protocol/index.ts';
import { Pacer, type PacerClock } from '../marks/index.ts';
import { toBase64 } from './assetServe.ts';
import { ASSET_USES, type AssetStoring } from './assets/assetUses.ts';

/** The shortest time between two explored memories: the GM saves one every few seconds while tokens explore. */
export const EXPLORED_INTERVAL_MS = 5_000;

/** A saved explored memory as players are sent it. */
export interface SavedMemory {
  /** What tells this save from another: a new save has a new key. */
  readonly key: unknown;
  /** The count of removals it goes with (`explored.serial`): players replace their memory where it changed. */
  readonly serial: number;
  /** The memory as a PNG, or null for none. */
  png(): Uint8Array<ArrayBuffer> | null;
}

export interface ExploredSharePorts extends PacerClock {
  send(body: GmMessage, to?: string): void;
  /** The memory the players of this picture remember now; undefined while it cannot be said (the map loads). */
  memory(): SavedMemory | undefined;
  /** How players are handed a memory too large to go inline; without it they get none. */
  stored?: AssetStoring | undefined;
}

/** The memory last handed to players: its key, count of removals and stored reference where it went by one. */
interface Sent {
  readonly key: unknown;
  readonly ref: AssetRef | null;
  readonly serial: number;
}

/**
 * The explored memory of a lit scene as one picture's players are sent it, at most every
 * `EXPLORED_INTERVAL_MS`: inline as a PNG where it is at most `EXPLORED_INLINE_BYTES`, else by the id
 * the store keeps it under (the page fetches it once the upload's progress says it is stored).
 */
export class ExploredShare {
  private scene: { readonly id: string; readonly lit: boolean } | null = null;
  private sent: Sent | null = null;
  /** The message last sent, which a message saying the same does not repeat. */
  private last: { readonly text: string; readonly body: GmMessage } | null = null;
  private readonly pacer: Pacer;

  constructor(private readonly ports: ExploredSharePorts) {
    this.pacer = new Pacer(ports, EXPLORED_INTERVAL_MS, () => void this.flush());
  }

  /** The shared scene the memory belongs to; null sends none. */
  setScene(scene: { readonly id: string; readonly lit: boolean } | null): void {
    if (scene?.id === this.scene?.id) return;
    this.scene = scene;
    this.release();
    this.sent = null;
    this.last = null;
    this.pacer.cancel();
    this.update();
  }

  /** Looks at the memory again: it goes out now, or once the interval has passed, where it changed. */
  update(): void {
    if (this.scene?.lit !== true) return;
    const memory = this.ports.memory();
    if (memory !== undefined && this.changed(memory)) this.pacer.request();
  }

  /** The last memory again, to one player or to all. */
  resend(to?: string): void {
    if (this.last !== null && this.scene !== null) this.ports.send(this.last.body, to);
  }

  /** The store may no longer keep the memory players were sent by its id: it is handed again, or as none. */
  refreshAssets(): void {
    if (this.sent?.ref == null) return;
    this.sent = null;
    this.update();
  }

  stop(): void {
    this.setScene(null);
  }

  private changed(memory: SavedMemory): boolean {
    return this.sent === null || memory.key !== this.sent.key || memory.serial !== this.sent.serial;
  }

  private async flush(): Promise<void> {
    const scene = this.scene;
    const memory = this.ports.memory();
    if (scene?.lit !== true || memory === undefined || !this.changed(memory)) return;
    const bytes = memory.png();
    const inline = bytes !== null && bytes.length <= EXPLORED_INLINE_BYTES;
    const ref = bytes === null || inline ? null : ((await this.ports.stored?.refOf(bytes, 'image/png', ASSET_USES.explored)) ?? null);
    // A newer memory, another scene or a load came meanwhile: this one is not sent.
    if (this.scene !== scene || this.ports.memory()?.key !== memory.key) {
      if (ref !== null) this.ports.stored?.release(ref);
      return;
    }
    // The memory it replaces need not go up any more, nor be told of.
    if (this.sent?.ref?.id !== ref?.id) this.release();
    this.sent = { key: memory.key, ref, serial: memory.serial };
    const body: GmMessage = { t: 'explored', scene: scene.id, ...(inline ? { png: toBase64(bytes) } : ref !== null && { mask: ref }), serial: memory.serial };
    const text = JSON.stringify(body);
    if (this.last?.text === text) return;
    this.last = { text, body };
    this.ports.send(body);
  }

  /** Lets go of the stored memory players were sent last. */
  private release(): void {
    const ref = this.sent?.ref;
    if (ref != null) this.ports.stored?.release(ref);
  }
}
