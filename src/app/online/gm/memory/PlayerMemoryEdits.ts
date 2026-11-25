import { ExploredEditStack } from '../../../lighting/exploredEdits';
import { viewedLevelId, type LevelView } from '../../../levels/sceneLevels';
import { exploredGrid } from '../../../pixi/lighting/ExploredTexture';
import type { ErasedArea, PlayersMemoryEdits } from '../../../pixi/lighting/ForgottenFloors';
import { HISTORY_LIMIT } from '../../../stores/history';
import type { Polygon } from '../../../vision/visibility';
import type { KeptMemories, TakenMemories } from './KeptMemories.ts';
import type { MemoryFloor, MemoryGrid } from './memoryPorts.ts';

/** The floor a view shows, whose memory each player keeps apart; null without a map. */
export const memoryFloorOf = (state: LevelView & { readonly mapPath: string | null }): MemoryFloor | null =>
  (state.mapPath === null ? null : { mapPath: state.mapPath, level: viewedLevelId(state) });

/** A change an edit by hand made to every player's memory, which redo makes again: an erased area of one floor, or every floor forgotten. */
type PlayersRemoval =
  | { readonly kind: 'erase'; readonly floor: MemoryFloor; readonly polygons: readonly Polygon[]; readonly grid: MemoryGrid }
  | { readonly kind: 'forget'; readonly mapPath: string };

interface Made {
  readonly removal: PlayersRemoval;
  readonly taken: Promise<TakenMemories>;
}

/** What one edit did to players' memories, in order. */
interface Step {
  made: Made[];
}

const mapPathOf = (removal: PlayersRemoval): string => (removal.kind === 'erase' ? removal.floor.mapPath : removal.mapPath);

/**
 * Each player's own memory as one view's edits by hand reach it (`KeptMemories`), with the view's undo steps of
 * the party's memory (numbered as `ExploredSteps` numbers them, every edit a step, most taking nothing): undo
 * gives back what the step's changes took, redo makes them again. No undo history of its own: the steps go
 * where the party's go (`clear`).
 */
export class PlayerMemoryEdits implements PlayersMemoryEdits {
  private readonly steps = new ExploredEditStack<Step>(HISTORY_LIMIT);

  /** `floor`: the floor the view shows now, which its edits are made on. */
  constructor(private readonly kept: KeptMemories, private readonly floor: () => MemoryFloor | null) {}

  edited(step: number, erased: ErasedArea | null): void {
    const floor = this.floor();
    const made = erased === null || floor === null ? [] : [this.make({ kind: 'erase', floor, polygons: erased.shapes.polygons, grid: exploredGrid(erased.bounds) })];
    this.steps.record(step, { made });
  }

  forgot(step: number | null): void {
    const mapPath = this.floor()?.mapPath;
    if (mapPath === undefined) return;
    const made = this.make({ kind: 'forget', mapPath });
    if (step !== null) this.steps.path(step - 1, step)[0]?.made.push(made);
  }

  travel(from: number, to: number): void {
    for (const step of this.steps.path(from, to)) {
      if (to < from) for (const { removal, taken } of [...step.made].reverse()) void this.kept.restore(mapPathOf(removal), taken);
      else step.made = step.made.map(({ removal }) => this.make(removal));
    }
  }

  clear(): void {
    this.steps.clear();
  }

  private make(removal: PlayersRemoval): Made {
    const taken = removal.kind === 'erase'
      ? this.kept.erase(removal.floor.mapPath, removal.floor.level, removal.polygons, removal.grid)
      : this.kept.forget(removal.mapPath);
    return { removal, taken };
  }
}
