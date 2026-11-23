import type { Renderer } from 'pixi.js';
import { ExploredEditStack, MAX_STEP_SERIAL, packCoverage, travelledCoverage, unpackCoverage, type ExploredEditMode, type ExploredStep } from '../../lighting/exploredEdits';
import { HISTORY_LIMIT } from '../../stores/history';
import type { ExploredShapes } from '../../vision/exploredShapes';
import type { MapBounds } from '../../vision/visibility';
import { ExploredTexture } from './ExploredTexture';
import { readCoverage, writeCoverage } from './exploredTexels';
import type { TexelRegion } from './StampScratch';

/**
 * The undo steps of the edits made to one explored memory by hand: applies an edit and keeps
 * the texels of its region before and after (`ExploredEditStack`), and takes steps back and
 * forth on the memory's texture (`travelledCoverage`: only the texels a step changed, and never
 * taking away what the party has really seen since).
 *
 * To know that, it keeps a second texture of the memory's size while it holds steps: whatever
 * sight records is stamped there too, at the serial of the newest edit, so a texel reads "last
 * seen while edit n was the newest". It exists only between the first sight record after an
 * edit and the moment the steps go.
 */
export class ExploredSteps {
  private readonly stack = new ExploredEditStack<ExploredStep<TexelRegion>>(HISTORY_LIMIT);
  private seen: ExploredTexture | null = null;
  private serial = 0;

  constructor(private readonly renderer: Renderer) {}

  get size(): number {
    return this.stack.size;
  }

  /** No further edit can be told from the ones before it: the steps have to go before the next. */
  get full(): boolean {
    return this.serial >= MAX_STEP_SERIAL;
  }

  /** Sight recorded `shapes` into the memory of a map of `bounds`. */
  sightRecorded(shapes: ExploredShapes, bounds: MapBounds): void {
    if (this.stack.size === 0) return;
    this.seen ??= new ExploredTexture(this.renderer, bounds);
    this.seen.add(shapes, this.serial / MAX_STEP_SERIAL);
  }

  /** Stamps an edit into `memory` and keeps it as step `revision`. False when it changed nothing: there is no step then. */
  apply(memory: ExploredTexture, shapes: ExploredShapes, mode: ExploredEditMode, revision: number): boolean {
    const region = memory.regionOf(shapes);
    if (!region) return false;
    const before = readCoverage(this.renderer, memory.texture, region);
    if (mode === 'reveal') memory.add(shapes);
    else memory.erase(shapes);
    const after = readCoverage(this.renderer, memory.texture, region);
    if (after.every((value, i) => value === before[i])) return false;
    this.stack.record(revision, { region, before: packCoverage(before), after: packCoverage(after), serial: ++this.serial });
    return true;
  }

  /** Whether undo or redo from `from` edits to `to` has a step to take. */
  leads(from: number, to: number): boolean {
    return this.stack.path(from, to).length > 0;
  }

  /** Takes `memory` from `from` edits to `to`, step by step. */
  travel(memory: ExploredTexture, from: number, to: number): void {
    for (const step of this.stack.path(from, to)) {
      const { region } = step;
      const length = region.width * region.height;
      const texels = { before: unpackCoverage(step.before, length), after: unpackCoverage(step.after, length), serial: step.serial };
      const current = readCoverage(this.renderer, memory.texture, region);
      const seen = this.seen && readCoverage(this.renderer, this.seen.texture, region);
      writeCoverage(this.renderer, memory.texture, region, travelledCoverage(texels, current, seen, to < from));
    }
  }

  /** The steps go, with what was known of sight since. */
  clear(): void {
    this.stack.clear();
    this.seen?.destroy();
    this.seen = null;
    this.serial = 0;
  }
}
