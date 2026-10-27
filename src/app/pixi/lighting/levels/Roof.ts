import type { Matrix } from 'pixi.js';
import { sameStretch, type MapStretch } from '../../../grid/mapStretch';
import { ambientLevelOn, ambientRaster, type AmbientRaster } from '../../../lighting/ambientRaster';
import { stackGrid } from '../../../levels/levelStack';
import { levelImagePlacement, type AlignedScene } from '../../../levels/levelAlignment';
import { levelForeground } from '../../../levels/levelEdits';
import { piecesTransform, piecesUnder, roofDrawnAt, roofPlacement, type PiecesTransform, type RoofCover, type RoofPieces } from '../../../levels/roofs';
import type { TokenEntity } from '../../../types';
import type { SceneLighting } from '../../../types/lightingTypes';
import type { Point } from '../../../types/visionTypes';
import { ambientLevel } from '../../../vision/lightLevels';
import { roofSeenAt, roofViewers, type RoofViewers } from '../../../vision/roofSight';
import type { AmbientZone, Sight } from '../../../vision/sight';
import type { MapBounds } from '../../../vision/visibility';
import type { TileView } from '../../mapImage/levelOfDetail';
import type { BelowMapImage } from './BelowLevel';
import { RoofLayer, type RoofMode } from './RoofLayer';
import type { SnapshotView } from './belowSnapshot';

/** A roof image as read for drawing: its own size and its pieces (`roofPieces`). */
export interface RoofImageRead {
  width: number;
  height: number;
  pieces: RoofPieces;
}

/** What a view gives a roof: a map image to draw it with, and a way to read an image's pieces. */
export interface RoofHost {
  /** A map image through the view's camera, or through `camera` (a level below's snapshot) where given. */
  createMapImage(camera?: SnapshotView): BelowMapImage;
  /** A roof image's size and pieces; rejects where it cannot be read. */
  readRoof(path: string): Promise<RoofImageRead>;
}

/** The scene's light as a lit roof reads it: the scene's ambient light and its zones, over the level's world. */
export interface RoofLighting {
  lighting: Pick<SceneLighting, 'ambient' | 'ambientColor' | 'litThreshold' | 'brightThreshold'>;
  zones: readonly AmbientZone[];
  bounds: MapBounds;
  /** What the players see, and the tokens of whose senses (their cones) it is made, on any level. */
  sight: Sight;
  tokens: Readonly<Record<string, TokenEntity>>;
}

/** What a roof is drawn from. */
export interface RoofScene {
  /** The roof image, a vault path; null for a level without one. */
  foreground: string | null;
  /** How the level's map is placed, and that map's size (null without one): the roof lies on the same world. */
  placement: MapStretch;
  background: { width: number; height: number } | null;
  gridSize: number | undefined;
  /** Where the tokens that fade the players' roof stand (`partyPlaces`), and the GM's selected tokens. */
  party: readonly Point[];
  selected: readonly Point[];
  /** How the scene is lit; null while it is not (the roof is drawn as its image is, and seen everywhere). */
  lit: RoofLighting | null;
  /** The GM hides every roof of the GM's picture. */
  gmHidden: boolean;
}

export interface RoofDeps {
  host: RoofHost;
  requestRender: () => void;
  /** The roof image has been read: the owner updates the roof, which then shows. */
  onReady: () => void;
  /** How long a piece takes to fade; 0 at once. */
  fadeMs: number;
  /** The camera the roof image reads its tiles through, where not the view's (a level below's snapshot). */
  camera?: SnapshotView;
}

const NO_FADED: ReadonlySet<number> = new Set();

/** What a roof reads of its scene's state. */
export type RoofState = AlignedScene & { roofsHidden?: boolean | undefined };

/** What level `levelId` of `state` gives its roof: its image, placed as the level's map, on the scene's grid; and whether the GM hides roofs. */
export function levelRoof(state: RoofState, levelId: string | null): Pick<RoofScene, 'foreground' | 'placement' | 'gridSize' | 'gmHidden'> {
  return { foreground: levelForeground(state, levelId), placement: levelImagePlacement(state, levelId), gridSize: state.grid?.size, gmHidden: state.roofsHidden ?? false };
}

/**
 * A level's roof (its `foreground`): its image, read once into pieces (`roofPieces`) and drawn by a
 * `RoofLayer` over the level's world, as the level's map is placed. The pieces the party stands under
 * fade in the players' picture, those under the GM's selected tokens in the GM's; the players see a
 * roof only where their senses see it from above (`roofSeenAt`), and a token whose centre a drawn
 * roof covers is not seen by them (`coversForPlayers`, the same bytes the picture reads).
 */
export class Roof {
  readonly layer: RoofLayer;
  private readonly image: BelowMapImage;
  private wanted: string | null = null;
  private read: RoofImageRead | null = null;
  private placement: MapStretch | null = null;
  private transform: PiecesTransform | null = null;
  private playerFaded: ReadonlySet<number> = NO_FADED;
  private gmFaded: ReadonlySet<number> = NO_FADED;
  private viewers: { sight: Sight; tokens: object; viewers: RoofViewers } | null = null;
  private light: { key: readonly unknown[]; raster: AmbientRaster | null } | null = null;
  private lit: RoofLighting | null = null;
  /** What the last update was made from. */
  private inputs: readonly unknown[] = [];
  private destroyed = false;

  constructor(private readonly deps: RoofDeps) {
    this.image = deps.host.createMapImage(deps.camera);
    this.layer = new RoofLayer(this.image.layer, deps.fadeMs);
  }

  /** Whether a roof is drawn: its image is read and placed. */
  get shown(): boolean {
    return this.read !== null && this.transform !== null;
  }

  /** Follows `scene`; returns whether anything changed (a render is asked for then). Nothing is worked out while it is as before. */
  update(scene: RoofScene): boolean {
    if (this.destroyed) return false;
    const inputs = inputsOf(scene, this.read);
    if (inputs.length === this.inputs.length && inputs.every((input, i) => sameInput(input, this.inputs[i]))) return false;
    this.inputs = inputs;
    this.follow(scene.foreground, scene.gridSize);
    const read = this.read;
    if (read) {
      this.place(read, scene);
      this.fade(read.pieces, scene);
      this.followLight(scene.lit);
      this.layer.setMode(this.layer.currentMode, scene.gmHidden);
    }
    this.deps.requestRender();
    return true;
  }

  /** Draws the roof for `mode`. */
  setMode(mode: RoofMode): void {
    this.layer.setMode(mode);
  }

  setView(screenToWorld: Matrix): void {
    this.layer.setView(screenToWorld);
  }

  /** Whether a drawn roof covers `point` in the players' picture: a token there is not seen. */
  coversForPlayers(point: Point): boolean {
    const cover = this.cover();
    return !!cover && roofDrawnAt(cover, point);
  }

  /** What decides where the roof covers the players' picture; null without a roof. */
  cover(): RoofCover | null {
    const read = this.read;
    if (!read || !this.transform) return null;
    const lit = this.lit;
    const viewers = this.viewers?.viewers;
    const raster = this.light?.raster ?? null;
    const seen = lit && viewers !== undefined ? (point: Point): boolean => roofSeenAt(point, viewers, ambientLevelOn(raster, lit.lighting, point)) : null;
    return { pieces: read.pieces, transform: this.transform, faded: this.playerFaded, seen };
  }

  /** Moves pieces on their way; asks for a render where the picture changed. */
  animate(now: number): void {
    if (this.layer.animate(now)) this.deps.requestRender();
  }

  /** Draws the roof's tiles of `view` for one render; returns what puts the view's own back. */
  drawFor(view: TileView): () => void {
    return this.image.drawFor(view);
  }

  addDemandRegion(view: TileView): () => void {
    return this.image.addDemandRegion(view);
  }

  destroy(): void {
    this.destroyed = true;
    this.layer.destroy();
    this.image.destroy();
  }

  /** Reads the roof image's pieces when it changed, then shows the image. */
  private follow(foreground: string | null, gridSize: number | undefined): void {
    if (foreground === this.wanted) return;
    this.wanted = foreground;
    this.read = null;
    this.placement = null;
    this.transform = null;
    // A new image's pieces all show until the scene fades some.
    this.playerFaded = NO_FADED;
    this.gmFaded = NO_FADED;
    this.layer.setPieces(null, null);
    if (!foreground) {
      void this.image.load(null, gridSize);
      return;
    }
    this.deps.host.readRoof(foreground).then(
      (read) => {
        if (this.destroyed || this.wanted !== foreground) return;
        // Shown once the pieces are known (`place`): the image alone is never drawn without them.
        this.read = read;
        this.deps.onReady();
      },
      (error: unknown) => console.warn(`[Atlas] The roof ${foreground} could not be read:`, error),
    );
  }

  /** Lays the image and its pieces on the level's world, as the level's map lies. */
  private place(read: RoofImageRead, scene: RoofScene): void {
    const placement = roofPlacement(scene.placement, scene.background, read);
    if (this.placement && sameStretch(this.placement, placement)) return;
    const first = !this.placement;
    this.placement = placement;
    this.transform = piecesTransform(read.pieces, read, placement);
    if (first) {
      void this.image.load(this.wanted, scene.gridSize, placement).then(() => this.deps.requestRender());
      this.layer.setPieces(read.pieces, this.transform);
    } else {
      this.image.setStretch(placement);
      this.layer.setTransform(this.transform);
    }
  }

  private fade(pieces: RoofPieces, scene: RoofScene): void {
    const transform = this.transform!;
    const player = piecesUnder(pieces, transform, scene.party);
    const gm = piecesUnder(pieces, transform, scene.selected);
    if (!sameSet(player, this.playerFaded)) this.layer.setFaded('player', this.playerFaded = player);
    if (!sameSet(gm, this.gmFaded)) this.layer.setFaded('gm', this.gmFaded = gm);
  }

  private followLight(lit: RoofLighting | null): void {
    this.lit = lit;
    if (!lit) {
      this.viewers = null;
      this.layer.setViewers(null);
      this.layer.setLight({ lit: false, ambient: 1, level: 'bright', raster: null });
      this.light = null;
      return;
    }
    if (this.viewers?.sight !== lit.sight || this.viewers.tokens !== lit.tokens) {
      this.viewers = { sight: lit.sight, tokens: lit.tokens, viewers: roofViewers(lit.sight, lit.tokens) };
      this.layer.setViewers(this.viewers.viewers);
    }
    const { lighting, zones, bounds } = lit;
    const key = [lighting.ambient, lighting.ambientColor, lighting.litThreshold, lighting.brightThreshold, zones, bounds.width, bounds.height];
    if (this.light && key.every((value, i) => value === this.light!.key[i])) return;
    const light = { ...lighting, zones };
    const raster = ambientRaster(light, stackGrid(bounds));
    this.light = { key, raster };
    this.layer.setLight({ lit: true, ambient: lighting.ambient, color: lighting.ambientColor, level: ambientLevel(light), raster });
  }
}

/** What a roof is drawn from, to compare with the last: the image read counts too, so a read that arrived updates it. */
function inputsOf(scene: RoofScene, read: RoofImageRead | null): readonly unknown[] {
  const { lit } = scene;
  return [read, scene.foreground, JSON.stringify(scene.placement), scene.background?.width, scene.background?.height, scene.gridSize, scene.party, scene.selected,
    lit?.sight, lit?.tokens, lit?.zones, lit?.lighting, lit?.bounds.width, lit?.bounds.height, scene.gmHidden];
}

/** Inputs compare by identity, except lists of places, which are made anew on every read. */
function sameInput(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((point: Point, i) => point.x === (b[i] as Point).x && point.y === (b[i] as Point).y);
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
