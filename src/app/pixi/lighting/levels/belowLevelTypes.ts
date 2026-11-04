import type { Container, Renderer } from 'pixi.js';
import type { MapStretch } from '../../../grid/mapStretch';
import type { LightingQuality } from '../../../lighting/lightingQuality';
import type { PixelRect } from '../../mosaicCanvas/pyramid';
import type { TesseraView } from '../../mosaicCanvas/levelOfDetail';
import type { LightingMode } from '../engine/compositeFilter';
import type { LightingStore } from '../LightingRenderer';
import type { SnapshotView } from './belowSnapshot';
import type { TokenArt } from './BelowTokens';
import type { RoofHost } from './Roof';

/** What a level below (`BelowLevel`) is made with, and what its snapshots are drawn at. */

/** What a level below needs of its map image: a `MosaicCanvas` the view's host loads its backgrounds into. */
export interface BelowMapImage {
  readonly layer: Container;
  readonly worldRect: PixelRect | null;
  /** The image's own size in pixels, once it has loaded. */
  readonly imageSize: { width: number; height: number } | null;
  readonly mapStretch: MapStretch;
  /** Shows the level's `background` (a map file's path; null, none), placed by `stretch`. */
  load(background: string | null, gridSize: number | undefined, stretch?: MapStretch): Promise<void>;
  setStretch(stretch: MapStretch): void;
  /** Draws the tesserae of `view` for one render (the view's roof in the player window's frame); returns what puts its own back. */
  drawFor(view: TesseraView): () => void;
  addDemandRegion(view: TesseraView): () => void;
  destroy(): void;
}

/** The water, lava and acid of a level below, held still: the view's host makes them (`BelowLevelsHost.createLiquids`). */
export interface BelowLiquids {
  readonly container: Container;
  destroy(): void;
}

export interface BelowLevelDeps {
  id: string;
  /** The level's index in the view's stack: 1 the nearest level below drawn, 2 the next. */
  index: number;
  renderer: Renderer;
  store: LightingStore;
  quality: LightingQuality;
  /** Makes the level's map image, read through the snapshot's camera. */
  image: (camera: SnapshotView) => BelowMapImage;
  art: TokenArt;
  /** What the level's roof is made with. */
  roofs: RoofHost;
  /** Makes the level's liquids, which ask for the snapshot to be drawn again (`changed`); without it none are drawn. */
  liquids?: (changed: () => void) => BelowLiquids;
  /** How long a piece of the roof takes to fade. */
  fadeMs: number;
  requestRender: () => void;
  /** The level's picture became ready, or stopped being: the stack must be worked out again. */
  onReady: () => void;
  guard: (work: () => void) => void;
}

/** How a level below's snapshot looks: as the GM or the players see it, or as a picture of the scene (a thumbnail: the roof drawn whole, the GM's look). */
export interface BelowLook {
  mode: LightingMode;
  picture: boolean;
}

/** What a snapshot was last drawn at (`BelowLevel.draw`): the level's count of changes, and how its tokens looked. */
export interface SnapshotDrawn {
  revision: number;
  tokens: string;
}
