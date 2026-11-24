import { exploredGrid } from '../../../pixi/lighting/ExploredTexture';
import type { SceneLighting } from '../../../types/lightingTypes';
import type { MapBounds } from '../../../vision/visibility';
import { Pacer, type PacerClock } from '../../marks/index.ts';
import type { PartyLighting } from '../eyesSight.ts';
import { EXPLORED_INTERVAL_MS, type SavedMemory } from '../ExploredShare.ts';
import type { Removal } from '../exploredRemovals.ts';
import type { MemoryFloor, MemoryPng, MemoryPorts } from './memoryPorts.ts';
import { afterLoss, lossOf, type Loss, type MemoryGrid } from './memoryRemovals.ts';
import { PlayerMemory } from './PlayerMemory.ts';

/** The shortest time between two stamps of the players' sight, as the GM's own memory stamps during a drag. */
export const MEMORY_STAMP_MS = 100;
/** The shortest time between two writes of a player's memory into the campaign: only a memory that changed is written. */
export const MEMORY_STORE_MS = 30_000;

const ALL: Loss = { kind: 'all' };

export interface FloorMemoriesPorts extends PacerClock {
  readonly memory: MemoryPorts;
  /** The players who see the floor through their own eyes now. */
  players(): readonly string[];
  /** What `player`'s own eyes see of the floor now, with its light; null while it cannot be worked out. */
  seenBy(player: string): PartyLighting | null;
  /** The floor's lighting options, which say whether it remembers at all. */
  lighting(): Pick<SceneLighting, 'exploredMemory'>;
  /** `player`'s memory changed: what they are sent of it is to be looked at again. */
  changed(player: string): void;
}

interface Floor {
  readonly key: MemoryFloor;
  readonly bounds: MapBounds;
  readonly grid: MemoryGrid;
}

const sameFloor = (a: Floor | null, b: Floor | null): boolean => a === b || (a !== null && b !== null
  && a.key.mapPath === b.key.mapPath && a.key.level === b.key.level && a.bounds.width === b.bounds.width && a.bounds.height === b.bounds.height);

/**
 * The explored memories of one floor's players who see it through their own eyes (`PlayerMemory`):
 * each read from the store when the player comes to the floor, stamped from what their eyes see at most
 * every `MEMORY_STAMP_MS`, read back at the GM's explored pace (`EXPLORED_INTERVAL_MS`) and written to
 * the store at most every `MEMORY_STORE_MS` and when the player leaves. What the GM takes from the
 * party's memory each player's memory of the floor loses too, the memories only the store keeps as
 * well. Reads, writes and removals run one after another, in the order they were asked for.
 */
export class FloorMemories {
  private floor: Floor | null = null;
  private readonly memories = new Map<string, PlayerMemory>();
  private queue: Promise<void> = Promise.resolve();
  /** Removals asked for that have not reached every memory: no memory goes out meanwhile. */
  private removing = 0;
  private readonly stamps: Pacer;
  private readonly readings: Pacer;
  private readonly writings: Pacer;

  constructor(private readonly ports: FloorMemoriesPorts) {
    this.stamps = new Pacer(ports, MEMORY_STAMP_MS, () => this.stamp());
    this.readings = new Pacer(ports, EXPLORED_INTERVAL_MS, () => this.run(() => this.readBack()));
    this.writings = new Pacer(ports, MEMORY_STORE_MS, () => this.run(() => this.writeAll()));
  }

  /** The floor shown and its map's size; null while none is. The memories of another floor are written and let go. */
  setFloor(key: MemoryFloor | null, bounds: MapBounds | null): void {
    const next = key === null || bounds === null ? null : { key, bounds, grid: exploredGrid(bounds) };
    if (sameFloor(next, this.floor)) return;
    for (const player of [...this.memories.keys()]) this.retire(player);
    this.floor = next;
    this.update();
  }

  /** Follows who sees the floor through their own eyes, and stamps what they see once its turn comes. */
  update(): void {
    const floor = this.floor;
    if (floor === null) return;
    const players = new Set(this.ports.players());
    for (const player of [...this.memories.keys()]) if (!players.has(player)) this.retire(player);
    for (const player of players) if (!this.memories.has(player)) this.open(floor, player);
    if (this.memories.size > 0) this.stamps.request();
  }

  /** `player`'s memory of the floor with the count of removals `serial`; undefined until it is read, and while a removal is under way. */
  memoryOf(player: string, serial: number): SavedMemory | undefined {
    const memory = this.memories.get(player);
    if (memory?.ready !== true || this.removing > 0) return undefined;
    const png = memory.saved;
    return { key: png, serial, png: () => png };
  }

  /** `player`'s memory of the floor as a data URL; null for none, or until it is read. */
  memoryUrl(player: string): string | null {
    const memory = this.memories.get(player);
    return memory?.ready === true && this.removing === 0 ? memory.dataUrl() : null;
  }

  /** What the GM took from the party's memory (`ExploredRemovals.observe`); `levels`: every level of the scene, which Forget explored areas forgets. */
  removed(removals: readonly Removal[], levels: readonly (string | null)[]): void {
    const floor = this.floor;
    if (floor === null || removals.length === 0) return;
    this.removing++;
    this.run(async () => {
      try {
        for (const removal of removals) {
          if (removal.kind === 'forgotten') await this.forget(floor, levels);
          else await this.lose(floor, await lossOf(removal, this.ports.memory.images, floor.grid));
        }
      } finally {
        this.removing--;
        for (const player of this.memories.keys()) this.ports.changed(player);
        if (this.memories.size > 0) this.stamps.request();
      }
    });
  }

  /** Writes what changed and lets every memory go; settles once that is done. */
  stop(): Promise<void> {
    this.stamps.cancel();
    this.readings.cancel();
    this.writings.cancel();
    this.setFloor(null, null);
    return this.queue;
  }

  private run(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch((error: unknown) => console.error('Atlas: a player\'s explored areas could not be kept', error));
  }

  private open(floor: Floor, player: string): void {
    const memory = new PlayerMemory(this.ports.memory.rasters.create(floor.bounds));
    this.memories.set(player, memory);
    this.run(async () => {
      await memory.load(await this.ports.memory.store.read(floor.key, player).catch(() => null));
      if (this.memories.get(player) === memory) this.ports.changed(player);
    });
  }

  /** Lets `player`'s memory go once what it holds is written. */
  private retire(player: string): void {
    const memory = this.memories.get(player);
    const floor = this.floor;
    this.memories.delete(player);
    if (memory === undefined || floor === null) return;
    this.run(async () => {
      await memory.encode();
      await this.write(floor, player, memory);
      memory.destroy();
    });
  }

  private stamp(): void {
    const lighting = this.ports.lighting();
    let stamped = false;
    for (const [player, memory] of this.memories) {
      const seen = this.ports.seenBy(player);
      if (seen !== null) memory.record(seen, lighting);
      stamped ||= memory.stale;
    }
    if (stamped) this.readings.request();
  }

  private async readBack(): Promise<void> {
    for (const [player, memory] of [...this.memories]) {
      if (!(await memory.encode()) || this.memories.get(player) !== memory) continue;
      this.ports.changed(player);
      this.writings.request();
    }
  }

  private async writeAll(): Promise<void> {
    const floor = this.floor;
    if (floor !== null) for (const [player, memory] of [...this.memories]) await this.write(floor, player, memory);
  }

  private async write(floor: Floor, player: string, memory: PlayerMemory): Promise<void> {
    if (!memory.unwritten) return;
    const png = memory.saved;
    await this.keep(floor.key, player, png);
    memory.wrote(png);
  }

  /** Writes a player's memory into the store, or removes it there where nothing is left. */
  private async keep(floor: MemoryFloor, player: string, png: MemoryPng | null): Promise<void> {
    const { store } = this.ports.memory;
    await (png === null ? store.remove(floor, player) : store.write(floor, player, png));
  }

  /** Every player's memory of `floor` after `loss`: the memories read here, then those only the store keeps. */
  private async lose(floor: Floor, loss: Loss): Promise<void> {
    if (loss.kind === 'none') return;
    const { images, store } = this.ports.memory;
    const change = (png: MemoryPng | null): Promise<MemoryPng | null> => afterLoss(png, loss, images, floor.grid);
    // A memory still to be read takes in what the store keeps once that has lost it.
    const here = this.floor === floor ? [...this.memories].filter(([, memory]) => memory.ready) : [];
    for (const [player, memory] of here) {
      await memory.change(change);
      await this.write(floor, player, memory);
    }
    for (const player of await store.players(floor.key)) {
      if (here.some(([read]) => read === player)) continue;
      const png = await store.read(floor.key, player);
      const left = await change(png);
      if (left !== png) await this.keep(floor.key, player, left);
    }
  }

  /** Forget explored areas: nothing is left of any player's memory of any floor of the scene. */
  private async forget(floor: Floor, levels: readonly (string | null)[]): Promise<void> {
    await this.lose(floor, ALL);
    const { store } = this.ports.memory;
    for (const level of levels) {
      if (level === floor.key.level) continue;
      const other: MemoryFloor = { mapPath: floor.key.mapPath, level };
      for (const player of await store.players(other)) await store.remove(other, player);
    }
  }
}
