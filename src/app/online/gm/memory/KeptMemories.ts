import type { Polygon } from '../../../vision/visibility';
import type { LiveMemories, MemoryGrid, MemoryHolder, MemoryImages, MemoryPng } from './memoryPorts.ts';
import { afterLoss, mergedMemory } from './memoryRemovals.ts';

/** Players' memory files of every campaign, by path: what the GM's edits by hand change, whether or not a table runs. */
export interface MemoryFiles {
  /** The files of every player's memory of the map at `mapPath` in every campaign: of the floor `level` where it is given, else of every floor. */
  list(mapPath: string, level?: string | null): Promise<readonly string[]>;
  read(path: string): Promise<MemoryPng | null>;
  write(path: string, png: MemoryPng): Promise<void>;
  remove(path: string): Promise<void>;
}

/** What a change of players' memories took: each file it changed, with what the file held before. */
export type TakenMemories = readonly { readonly path: string; readonly before: MemoryPng }[];

const NOTHING_TAKEN: TakenMemories = Object.freeze([]);

/**
 * Every player's explored memory of every map, in every campaign's files, as the GM's edits by hand change it:
 * each player's memory of a floor loses what an edit erased from the party's, wherever it lies (a player may
 * remember what the party does not: a floor the GM was not looking at), Forget explored areas takes every floor
 * of the map, and undo gives back what a change took. One change runs at a time, in the order asked; meanwhile
 * the memories running tables hold of that map are written to the files first, read from them again after, and
 * sent to nobody (`MemoryHolder`).
 */
export class KeptMemories implements LiveMemories {
  private readonly holders = new Set<MemoryHolder>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly files: MemoryFiles, private readonly images: MemoryImages) {}

  hold(holder: MemoryHolder): () => void {
    this.holders.add(holder);
    return () => this.holders.delete(holder);
  }

  /** Every player's memory of one floor loses what `polygons` cover on a memory of `grid`; what was taken. */
  erase(mapPath: string, level: string | null, polygons: readonly Polygon[], grid: MemoryGrid): Promise<TakenMemories> {
    return this.change(mapPath, async () => {
      const paths = await this.files.list(mapPath, level);
      if (paths.length === 0) return NOTHING_TAKEN;
      const loss = { kind: 'part' as const, lost: await this.images.drawn(polygons, grid) };
      const taken: { path: string; before: MemoryPng }[] = [];
      for (const path of paths) {
        const before = await this.files.read(path);
        const after = await afterLoss(before, loss, this.images, grid);
        if (before === null || after === before) continue;
        await (after === null ? this.files.remove(path) : this.files.write(path, after));
        taken.push({ path, before });
      }
      return taken;
    });
  }

  /** Every player's memory of every floor of the map goes; what was taken. */
  forget(mapPath: string): Promise<TakenMemories> {
    return this.change(mapPath, async () => {
      const taken: { path: string; before: MemoryPng }[] = [];
      for (const path of await this.files.list(mapPath)) {
        const before = await this.files.read(path);
        await this.files.remove(path);
        if (before !== null) taken.push({ path, before });
      }
      return taken;
    });
  }

  /** Gives back what a change took: each texel the larger of what it holds now and what it held before. */
  restore(mapPath: string, taken: Promise<TakenMemories>): Promise<TakenMemories> {
    return this.change(mapPath, async () => {
      for (const { path, before } of await taken) {
        const now = await this.files.read(path);
        await this.files.write(path, now === null ? before : await mergedMemory(now, before, this.images));
      }
      return NOTHING_TAKEN;
    });
  }

  /**
   * Runs `job` once the changes asked for before are done, the memories held of `mapPath` written and set aside
   * from now until it is; a job that fails is told of and took nothing.
   */
  private change(mapPath: string, job: () => Promise<TakenMemories>): Promise<TakenMemories> {
    let release = (): void => undefined;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const written = [...this.holders].filter((holder) => holder.mapPath() === mapPath).map((holder) => holder.yieldTo(done));
    const run = this.queue.then(async () => {
      try {
        await Promise.all(written);
        return await job();
      } catch (error: unknown) {
        console.error('Atlas: could not change what players explored', error);
        return NOTHING_TAKEN;
      } finally {
        release();
      }
    });
    this.queue = run;
    return run;
  }
}
