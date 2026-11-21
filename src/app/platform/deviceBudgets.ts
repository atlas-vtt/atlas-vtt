import type { LightingQualityLevel } from '../lighting/lightingQuality';

/**
 * What Atlas may hold at once on a device. Pure numbers without Obsidian, so the workers that
 * are handed them, and their defaults, read the same table as the window.
 */

/** `desktop`: a renderer process with gigabytes to itself. `mobile`: a web view the system ends without a word once it holds too much (about 2 GB on a base iPad). */
export type MemoryClass = 'desktop' | 'mobile';

export interface DeviceBudgets {
  /** Image workers at most; beyond the desktop's six they add little for batches of token art and cost memory. */
  readonly imageWorkers: number;
  /**
   * Decoded pixels all running image jobs may hold together, in bytes. Token art runs in parallel;
   * a job larger than the budget runs alone.
   */
  readonly imageWorkerBudget: number;
  /** Decoded pyramid levels all builds of the tessera worker may hold together, in bytes. */
  readonly decodedLevelsBudget: number;
  /** The map tile cache never grows past this many bytes, whatever the quota. */
  readonly tileCacheMax: number;
  /** Share of the origin's storage quota the map tile cache may take. */
  readonly tileCacheQuotaShare: number;
  /** Graphics memory the tile textures of one renderer may take beyond the pinned ones, in bytes. */
  readonly tileTextureBudget: number;
  /** The finest lighting quality Atlas picks for the device by itself; the GM's own choice always wins. */
  readonly lightingQualityDefault: LightingQualityLevel;
  /** Dice stages a document builds ahead of the first roll. */
  readonly diceWarmStages: number;
  /** Texels along a side of the dice's shadow map; its blur's reach and taps follow it (`stageShadow.ts`). */
  readonly diceShadowMap: number;
  /**
   * Decoded bytes (four a pixel) of the largest image an import decodes whole. A larger source is
   * refused: the job would run alone and past every budget, since nothing decodes a part of it.
   */
  readonly imageSourceBytes: number;
  /** Bytes of the largest Universal VTT file read: its text, its JSON and its image are held together. */
  readonly uvttFileBytes: number;
  /** Bytes of all Universal VTT files read together as the floors of one scene. */
  readonly uvttFloorsBytes: number;
  /** Pixels of the largest map the dungeon generator draws, on one canvas of its worker. */
  readonly generatedMapPixels: number;
  /** The longest side of a map the dungeon generator draws. */
  readonly generatedMapSide: number;
  /** Bytes of the largest video an import takes as an animated map: the whole file is held to be played. */
  readonly videoMapBytes: number;
  /** The longest side of the canvas the fog is composed on; a larger map's fog is drawn coarser (`fogCanvasScale`). */
  readonly fogCanvasSide: number;
}

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

/** The desktop app: what Atlas always used. */
export const DESKTOP_BUDGETS: DeviceBudgets = {
  imageWorkers: 6,
  // A huge map (150 megapixels hold 1.2 GB while converting, the largest 2.1 GB) runs alone.
  imageWorkerBudget: GIB,
  decodedLevelsBudget: GIB,
  // Room for a few gigapixel maps' lossless tesserae (about 1.3 GB each).
  tileCacheMax: 4 * GIB,
  tileCacheQuotaShare: 0.1,
  tileTextureBudget: 160 * MIB,
  lightingQualityDefault: 'high',
  // As many as rolls stand at once and one for the roll that fades out as the next arrives.
  diceWarmStages: 4,
  diceShadowMap: 1024,
  // Whatever the browser decodes (`decodeLimits.ts`).
  imageSourceBytes: Infinity,
  // Exports with a large JPEG reach 30 MB; the same map as PNG is several times that.
  uvttFileBytes: 150 * MIB,
  uvttFloorsBytes: 400 * MIB,
  // The generator's own limits (`layoutSize.ts`).
  generatedMapPixels: Infinity,
  generatedMapSide: Infinity,
  videoMapBytes: 500 * MIB,
  // Half the map's own pixels, whatever its size.
  fogCanvasSide: Infinity,
};

/**
 * Tablets: together well under the smallest web content limit, with room for the canvases and the
 * page itself. They start low on purpose; a tablet that runs out of memory reloads blank.
 */
export const MOBILE_BUDGETS: DeviceBudgets = {
  imageWorkers: 2,
  imageWorkerBudget: 256 * MIB,
  decodedLevelsBudget: 256 * MIB,
  tileCacheMax: 512 * MIB,
  tileCacheQuotaShare: 0.05,
  tileTextureBudget: 96 * MIB,
  lightingQualityDefault: 'balanced',
  diceWarmStages: 1,
  diceShadowMap: 512,
  // What the image workers may hold: a map of 8192 × 8192 pixels, the largest canvas of iPadOS 18.
  imageSourceBytes: 256 * MIB,
  uvttFileBytes: 64 * MIB,
  uvttFloorsBytes: 128 * MIB,
  // One canvas every iPadOS draws on (4096 × 4096), in any shape its web view takes.
  generatedMapPixels: 4096 * 4096,
  generatedMapSide: 8192,
  videoMapBytes: 128 * MIB,
  // With the room its blurred copy takes around it, within the canvas every iPadOS draws on (4096 × 4096).
  fogCanvasSide: 3072,
};

export function budgetsFor(memoryClass: MemoryClass): DeviceBudgets {
  return memoryClass === 'mobile' ? MOBILE_BUDGETS : DESKTOP_BUDGETS;
}

/** Image workers on a device with `cores` logical processors: one core stays free for Obsidian itself. */
export function imageWorkerCount(budgets: DeviceBudgets, cores: number): number {
  return Math.min(budgets.imageWorkers, Math.max(1, cores - 1));
}
