/**
 * The players' darkness of one view over time: worked out from the view's own lighting (the
 * sight, light and spots the GM's player window is drawn by, `PlayerLighting`), with the
 * explored memory decoded from the scene's saved mask, and rebuilt at most every interval.
 */
import type { PlayerLighting } from '../playerLightingLayers';
import type { MapSize } from '../../../services/viewMapSize';
import { darknessRaster, MAX_DARKNESS_CELLS_PER_SIDE, type DarknessRaster } from './darknessRaster';
import { ExploredImages, type ExploredDecoder } from './exploredImage';

/**
 * The darkness is worked out anew at most this often: whoever sends it to players repaints a fog
 * with each new one, and a drag with live sight would otherwise change it twenty times a second.
 * Every change to sight and light waits, also one that hides more (a light put out, a door closed):
 * only a view whose sight stops or starts being the scene's darkens or lights at once, and so does
 * any change to the explored memory shown (saved, cleared or switched off), which comes rarely. A darkness that lags shows, for up to this long, map art the window
 * showed that long ago; never another scene's, since the view's owner restarts it on every load.
 */
export const DARKNESS_INTERVAL_MS = 200;

/** Rasters kept at once, one per cell count asked for; callers rarely ask for more than one or two. */
const KEPT_CELL_COUNTS = 4;
/** Where the decoded explored memory sits in a raster's inputs. */
const EXPLORED_INPUT = 5;

interface Built {
  inputs: readonly unknown[];
  raster: DarknessRaster;
  at: number;
}

export interface SightFrame {
  raster: DarknessRaster;
  /** The window shows explored memory whose mask is still decoding, with nothing to stand in: the raster is all dark. */
  exploredPending: boolean;
}

/**
 * One view's darkness rasters: memoised by their inputs, throttled to `DARKNESS_INTERVAL_MS`, with
 * the explored memory decoded once per mask. `onDue` is called when the raster should be asked for
 * again: a mask was decoded, or a deferred raster is due.
 */
export class SightFrames {
  private readonly explored: ExploredImages;
  /** The last raster by the cell count it was asked for: callers asking for different ones do not undo each other. */
  private readonly built = new Map<number, Built>();
  /** The store's count of explored edits the decoded mask was taken under; null until a raster is asked for. */
  private editsSeen: number | null = null;
  /** The timer of each cell count whose raster is deferred. */
  private readonly timers = new Map<number, number>();

  constructor(private readonly onDue: () => void, decode?: ExploredDecoder) {
    this.explored = new ExploredImages(onDue, decode);
  }

  raster(
    lighting: PlayerLighting,
    exploredMask: string | null,
    map: MapSize,
    maxCellsPerSide = MAX_DARKNESS_CELLS_PER_SIDE,
    now = Date.now(),
  ): SightFrame {
    const explored = lighting.showsExplored ? this.explored.of(exploredMask) : null;
    if (lighting.showsExplored && this.explored.pending()) {
      // Not kept: the first raster once the memory is known comes at once.
      return { raster: darknessRaster({ ...lighting, ready: false }, null, map, maxCellsPerSide), exploredPending: true };
    }
    const inputs = [lighting.ready, lighting.sight, lighting.ambient, lighting.reaches, lighting.spots, explored, map.width, map.height];
    return { raster: this.memo(maxCellsPerSide, inputs, now, () => darknessRaster(lighting, explored, map, maxCellsPerSide)), exploredPending: false };
  }

  /** The store holds a scene anew (a map loaded, or reloaded in place): nothing worked out or decoded before stands in. */
  restart(): void {
    this.built.clear();
    this.explored.reset();
    this.editsSeen = null;
  }

  /**
   * The store's count of explored edits, read by whoever asks before anything else: once it moved, no mask decoded
   * before stands in again, whichever store subscriber (the memory's, the caller's) runs first.
   */
  followEdits(edits: number): void {
    if (this.editsSeen !== null && edits !== this.editsSeen) this.forgetExplored();
    this.editsSeen = edits;
  }

  /** The explored memory was edited and may have lost area: no mask decoded before stands in for the next one. */
  forgetExplored(): void {
    this.explored.reset();
  }

  dispose(): void {
    this.explored.dispose();
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.built.clear();
  }

  /** The raster of `inputs`; while the last one is younger than the interval, it stays and the new one is due later. */
  private memo(cells: number, inputs: readonly unknown[], now: number, build: () => DarknessRaster): DarknessRaster {
    const last = this.built.get(cells);
    if (last && inputs.length === last.inputs.length && inputs.every((input, i) => input === last.inputs[i])) return last.raster;
    // A first raster comes at once, and so do the raster of a view whose sight is not the scene's (yet, or any more)
    // and one whose explored memory changed (`EXPLORED_INPUT`).
    const waits = last && inputs[0] === true && last.inputs[0] === true && inputs[EXPLORED_INPUT] === last.inputs[EXPLORED_INPUT];
    const wait = last && waits ? last.at + DARKNESS_INTERVAL_MS - now : 0;
    if (last && wait > 0) {
      if (!this.timers.has(cells)) {
        this.timers.set(cells, window.setTimeout(() => {
          this.timers.delete(cells);
          this.onDue();
        }, wait));
      }
      return last.raster;
    }
    const built = { inputs, raster: build(), at: now };
    this.built.delete(cells);
    this.built.set(cells, built);
    if (this.built.size > KEPT_CELL_COUNTS) this.built.delete(this.built.keys().next().value!);
    return built.raster;
  }
}
