import type { InMemoryApp } from '../../mocks/inMemoryVault';

/** A small, seeded random source, so a failing run can be repeated by its seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isSynced = (path: string): boolean => !path.split('/').some((part) => part.startsWith('.'));

const isEmpty = (vault: InMemoryApp, folder: string): boolean =>
  ![...vault.files.keys(), ...vault.folders].some((path) => path.startsWith(`${folder}/`));

const syncedState = (vault: InMemoryApp): Map<string, string> =>
  new Map([...vault.files].filter(([path]) => isSynced(path)));

/** What one exchange did to a device: the paths it deleted there, as the vault's delete events would report them. */
export interface SyncOutcome {
  changed: boolean;
  deletedOn: [Set<string>, Set<string>];
}

/**
 * A file sync between two vaults as Obsidian Sync and Remotely Save do it:
 * whole files, dot folders skipped, a file changed on one side only goes to
 * the other, and a file changed on both sides since the last exchange keeps
 * one side's version, whichever (last modified wins, and the clocks of two
 * devices say nothing about which edit was last). Folders are carried too,
 * empty ones included, and a folder removed on one side goes on the other
 * once nothing is left in it.
 */
export class FakeSync {
  private base = new Map<string, string>();
  private baseFolders = new Set<string>();

  constructor(private readonly a: InMemoryApp, private readonly b: InMemoryApp, private readonly random: () => number) {}

  /**
   * One exchange. `between`, when given, runs after new and changed files have
   * arrived and before deletions do, as a sync that delivers a rename in
   * halves lets a vault check run in the middle.
   */
  async exchange(between?: () => Promise<void>): Promise<SyncOutcome> {
    const sides = [syncedState(this.a), syncedState(this.b)] as const;
    const paths = new Set([...this.base.keys(), ...sides[0].keys(), ...sides[1].keys()]);
    const deletedOn: [Set<string>, Set<string>] = [new Set(), new Set()];
    const next = new Map<string, string>();
    const outcomes: Array<{ path: string; inA: string | undefined; inB: string | undefined; winner: string | undefined }> = [];
    for (const path of [...paths].sort()) {
      const base = this.base.get(path);
      const [inA, inB] = [sides[0].get(path), sides[1].get(path)];
      const changedA = inA !== base;
      const changedB = inB !== base;
      let winner: string | undefined;
      if (changedA && changedB) winner = inA === inB || this.random() < 0.5 ? inA : inB;
      else winner = changedA ? inA : inB;
      if (winner !== undefined) next.set(path, winner);
      outcomes.push({ path, inA, inB, winner });
    }
    // Files bring their folders along; folders are exchanged once every file has arrived or gone.
    let changed = false;
    for (const deletions of [false, true]) {
      if (deletions && between) await between();
      for (const { path, inA, inB, winner } of outcomes) {
        if ((winner === undefined) !== deletions) continue;
        changed = await this.apply(this.a, path, inA, winner, deletedOn[0]) || changed;
        changed = await this.apply(this.b, path, inB, winner, deletedOn[1]) || changed;
      }
    }
    this.base = next;
    changed = this.exchangeFolders() || changed;
    return { changed, deletedOn };
  }

  /** Folders new on one side reach the other; folders removed on one side go on the other unless something is in them there. */
  private exchangeFolders(): boolean {
    let changed = false;
    const all = new Set([...this.a.folders, ...this.b.folders, ...this.baseFolders].filter(isSynced));
    for (const folder of [...all].sort().reverse()) {
      const [inA, inB, known] = [this.a.folders.has(folder), this.b.folders.has(folder), this.baseFolders.has(folder)];
      if (inA === inB) continue;
      const [has, lacks] = inA ? [this.a, this.b] : [this.b, this.a];
      if (!known) {
        lacks.folders.add(folder);
      } else if (isEmpty(has, folder)) {
        has.folders.delete(folder);
      } else {
        lacks.folders.add(folder);
      }
      changed = true;
    }
    this.baseFolders = new Set([...this.a.folders].filter((folder) => isSynced(folder) && this.b.folders.has(folder)));
    return changed;
  }

  private async apply(vault: InMemoryApp, path: string, current: string | undefined, winner: string | undefined, deleted: Set<string>): Promise<boolean> {
    if (current === winner) return false;
    if (winner === undefined) {
      await vault.app.vault.adapter.remove(path);
      deleted.add(path);
    } else {
      await vault.app.vault.adapter.write(path, winner);
    }
    return true;
  }
}
