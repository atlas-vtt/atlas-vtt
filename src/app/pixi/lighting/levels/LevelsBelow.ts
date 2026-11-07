import { Matrix, type Application, type Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { belowQuality, type LightingQuality } from '../../../lighting/lightingQuality';
import { showsBelow, withDrawn, type LevelStack } from '../../../levels/levelStack';
import type { ArtFloors } from '../../../levels/levelSurfaces';
import type { Sight } from '../../../vision/sight';
import type { SightRules } from '../../../vision/sightRules';
import type { FogCover } from '../../../vision/throughSight';
import type { TokenPerception } from '../../../vision/tokenPerception';
import type { MapBounds } from '../../../vision/visibility';
import { addBeforeRender, BEFORE_RENDER_ORDER } from '../../RenderScheduler';
import { NO_BELOW, type BelowPictures as ShownPictures, type LightingMode } from '../engine/compositeFilter';
import type { BelowShown, LightingEngine } from '../engine/LightingEngine';
import type { LightingState, LightingStore } from '../LightingRenderer';
import { BelowLayout, type LevelArtSource } from './belowLayout';
import { BelowPerception } from './belowPerception';
import { BelowLevel, type BelowLiquids, type BelowMapImage } from './BelowLevel';
import { BelowSnapshots, type BelowPicture } from './BelowSnapshots';
import { sameSnapshotGrid, snapshotGrid, type SnapshotGrid, type SnapshotView } from './belowSnapshot';
import { tokenLook, type TokenArt } from './BelowTokens';
import { LevelStackTexture } from './LevelStackTexture';
import type { RoofHost } from './Roof';
import type { Point } from '../../../types/visionTypes';
import type { Box } from '../../../vision/polygonBounds';

export type { BelowPicture } from './BelowSnapshots';
export type { BelowLiquids } from './BelowLevel';

/** A render of the view through the viewport's camera now (the player window's frame): its picture, and its size in points. */
export type BelowRender = Omit<BelowPicture, 'view'> & { width: number; height: number };

/** How dark the GM sees a level below through an opening, once per level down: never mistaken for the floor the view shows. */
export const BELOW_GM_DIM = 0.6;
/** How dark the players see it, once per level down: a depth cue, never brighter than the level itself. */
export const BELOW_PLAYER_DIM = 0.85;
/** How often a drag records what the view sees through the openings into the memories below. */
const RECORD_WHILE_DRAGGING_MS = 100;

/** What a view gives its levels below that the lighting cannot make itself; their roofs are made with it too (`RoofHost`). */
export interface BelowLevelsHost extends RoofHost {
  /** A map image for a level below, read through its snapshot's camera and never changing the view's world (`belowMapImage`). */
  createMapImage(camera?: SnapshotView): BelowMapImage;
  /** The liquids of a level below, held still, asking for its snapshot anew through `changed`; without it none are drawn below. */
  createLiquids?(level: string, changed: () => void): BelowLiquids;
  /** Token art for the tokens of a level below. */
  createArt(): TokenArt;
  /** A level's map as the level stack reads it: its size and its transparent parts (a video's poster's). */
  levelArt: LevelArtSource;
  /** The committed fog of the level the view shows (null: unreadable, which hides all). */
  viewedFog(): FogCover;
  /** Whether the roof of the level the view shows covers a point in the players' picture; null without one. */
  viewedRoof(): ((point: Point) => boolean) | null;
  /** Puts the openings' eraser into the view's stage, between its grid and its tokens. */
  placeEraser(eraser: Container): void;
}

export interface LevelsBelowDeps {
  app: Application;
  /** The view's camera: no snapshot is drawn while no opening lies in the canvas's picture. */
  viewport: Viewport;
  store: LightingStore;
  host: BelowLevelsHost;
  /** The quality the view itself is lit at; levels below take one a tier lower (`belowQuality`). */
  quality: () => LightingQuality;
  measurement: () => MeasurementSettings;
  rules?: () => SightRules;
  /** The view's own engine: its composite shows the levels below through the openings. */
  view: LightingEngine;
  /** Which view the canvas shows now: the players' (session view, the peek) or the GM's. */
  mode: () => LightingMode;
  requestRender: () => void;
  /** How long a piece of a roof below takes to fade; at once without. */
  fadeMs?: number;
  /** Something the stack depends on came in (a level's image or map): the view's lighting updates. */
  onReady: () => void;
  guard: (work: () => void) => void;
}

/**
 * The levels below a view seen through its openings (the transparent parts of its map and the
 * openings drawn on it): the level stack the rules and the picture read (`BelowLayout`), the eraser
 * that opens the view's map, and one `BelowLevel` for each level below drawn where the stack shows
 * it, at most two. Each level is drawn into a world-space snapshot over the stack's box
 * (`BelowSnapshots`), in the look the picture shows (the GM's, the players', a thumbnail's), only
 * when the level changed; the view's composite reads it where the stack shows that level. The
 * canvas's snapshots are brought up to date in a before-render hook that runs after the player
 * window's frame took its own (`BEFORE_RENDER_ORDER`), the frame's through `prepare`, a picture of
 * the scene's through `drawFor`. Nothing is drawn while no opening is in the picture, and a level
 * shows nothing until its snapshot is drawn.
 */
export class LevelsBelow {
  private readonly levels = new Map<string, BelowLevel>();
  private readonly stackTexture = new LevelStackTexture();
  private readonly layout: BelowLayout;
  private readonly snapshots: BelowSnapshots;
  /** Where the snapshots lie: over the drawn stack's box. */
  private grid: SnapshotGrid | null = null;
  private readonly perception = new BelowPerception();
  private readonly stopPreparing: () => void;
  /** The stack as the view draws it: only levels whose picture is ready show. */
  private stack: LevelStack | null = null;
  /** What `stack` was made from: the layout's stack and which of its levels were ready. */
  private drawn: { layout: LevelStack; ready: readonly boolean[]; stack: LevelStack } | null = null;
  private eraserPlaced = false;
  /** When what the view sees through the openings was last recorded. */
  private recordedAt = -Infinity;

  constructor(private readonly deps: LevelsBelowDeps) {
    this.layout = new BelowLayout(deps.host.levelArt, deps.onReady);
    this.snapshots = new BelowSnapshots(deps.app.renderer, () => deps.view.setBelow(NO_BELOW, 1));
    this.stopPreparing = addBeforeRender(deps.app, () => deps.guard(() => this.prepareCanvas()), BEFORE_RENDER_ORDER.levelsBelow);
  }

  /** Whether the lighting of a level below stopped on this graphics device: the view's stops with it. */
  failed(): boolean {
    for (const level of this.levels.values()) if (level.engine.failed) return true;
    return false;
  }

  /** Whether a level's map holds floor at a point as the view lays the levels out (`BelowLayout.artFloorAt`): a token dropped where it does not falls. */
  readonly artFloors: ArtFloors = (id, point) => this.layout.artFloorAt(id, point);

  /** The level stack of the view as it draws it, or null while it shows only its own level. */
  currentStack(): LevelStack | null {
    return this.stack;
  }

  /**
   * Lets go of the levels the view does not draw, saving what their memories hold first: before
   * the view's own memory takes up one of them (the view went down a level), which would otherwise
   * write the same level twice.
   */
  drop(state: LightingState): void {
    const keep = new Set(this.layout.shownBelow(state));
    for (const [id, level] of [...this.levels]) {
      if (!keep.has(id)) this.remove(id, level, true);
    }
  }

  /**
   * Lays the view over the levels below (`BelowLayout`): the world it looks over, its own map and
   * those of the levels below it draws, while anything below shows; null otherwise.
   */
  reach(state: LightingState, viewBounds: MapBounds): MapBounds | null {
    return this.layout.update(state, viewBounds).reach;
  }

  /** Follows the scene: the levels drawn below, their lighting from the view's sight, and the stack. */
  update(state: LightingState, viewBounds: MapBounds, viewed: { sight: Sight; gmSight: Sight }): void {
    this.drop(state);
    const { stack, shown } = this.layout.update(state, viewBounds);
    // A level is drawn only where the stack shows it: no world is built for one hidden behind floor.
    const wanted = new Map(shown.flatMap((id, i) => (stack && showsBelow(stack, i + 1) ? [[id, i + 1] as const] : [])));
    for (const [id, level] of [...this.levels]) {
      if (wanted.get(id) !== level.index) this.remove(id, level, true);
    }
    for (const [id, index] of wanted) {
      const level = this.levels.get(id) ?? this.add(id, index);
      level.followImage(state);
      level.update(state, viewed, this.deps.measurement, this.deps.rules);
    }
    // Once the levels are lit: a level shows from the update that gave it its world.
    this.stack = this.drawnOf(stack);
    this.bind(this.stack);
    this.aim(snapshotGrid(this.stack));
    if (this.stack && this.mayRecord(state)) {
      for (const level of this.levels.values()) if (level.ready()) level.recordThrough(viewed.sight, this.stack, state);
    }
  }

  /**
   * Whether what the view sees through the openings is recorded now: always, except while the
   * pointer drags tokens, then at most every `RECORD_WHILE_DRAGGING_MS` (a stamp costs about as much
   * as the rest of a drag step); the drop records where they came to stand.
   */
  private mayRecord(state: LightingState): boolean {
    const now = performance.now();
    if (Object.keys(state.heldTokens).length > 0 && now - this.recordedAt < RECORD_WHILE_DRAGGING_MS) return false;
    this.recordedAt = now;
    return true;
  }

  /** How the players perceive the tokens of the levels below drawn, from the view above; everything else unseen. */
  tokenPerception(state: LightingState): TokenPerception {
    return this.perception.of(state, this.levels.values(), this.stack, { fog: this.deps.host.viewedFog(), roof: this.deps.host.viewedRoof() }, this.deps.rules?.());
  }

  /**
   * Hands the view's composite the snapshots of the levels below for a render about to be drawn
   * through the camera the viewport holds now (the player window's frame; without `picture`, the
   * canvas's own), drawing those that changed; where no opening shows a ready level in it, none,
   * and its texels show nothing.
   */
  prepare(picture?: BelowRender): void {
    if (picture) this.deps.view.setBelow(...this.shownFor({ key: picture.key, mode: picture.mode, view: this.viewOf(picture) }));
    else this.prepareCanvas();
  }

  /** The snapshots of the levels below for a picture of the scene (a thumbnail), drawn where they changed, without touching the canvas's. */
  drawFor(picture: BelowPicture): BelowShown {
    const [pictures, dim] = this.shownFor(picture);
    return { pictures, dim };
  }

  /** Flicker below and changes on the levels' stages ask for a render while an opening shows them. */
  animate(now: number, view?: Box): void {
    if (!this.stack?.box) return;
    let changed = false;
    for (const level of this.levels.values()) {
      if (level.animate(now, view) || level.stage.hasChanges()) changed = true;
    }
    if (changed) this.deps.requestRender();
  }

  /** A picture is no longer drawn (the player window closed, a thumbnail taken): the snapshots only it used go. */
  releasePicture(key: BelowPicture['key']): void {
    this.snapshots.release(key);
  }

  /** The graphics context is lost: what the memories below hold from now on is not their memory. */
  holdSaves(): void {
    for (const level of this.levels.values()) level.holdSaves();
  }

  /**
   * Every level below goes, its memory saved first where `flush` (the map unloads) and dropped
   * otherwise (a restored context, a stop). The maps read are forgotten too: the next scene's may differ.
   */
  reset(flush: boolean): void {
    this.stack = this.drawnOf(null);
    this.bind(null);
    this.grid = null;
    for (const [id, level] of [...this.levels]) this.remove(id, level, flush);
    this.layout.reset();
  }

  destroy(): void {
    this.stopPreparing();
    this.reset(false);
    this.snapshots.destroy();
    this.stackTexture.destroy();
  }

  /** The canvas's own render, in the view it shows now. */
  private prepareCanvas(): void {
    this.deps.view.setBelow(...this.shownFor({ key: 'canvas', mode: this.deps.mode(), view: this.viewOf(this.deps.app.renderer.screen) }));
  }

  /** The viewport's camera now, over a render of `size` points. */
  private viewOf(size: { width: number; height: number }): BelowPicture['view'] {
    return { camera: this.camera(), width: size.width, height: size.height };
  }

  /** Draws the snapshots `picture` shows that changed; the snapshots for the view's composite and their dimming. */
  private shownFor(picture: BelowPicture): [ShownPictures, number] {
    const dim = picture.mode === 'player' ? BELOW_PLAYER_DIM : BELOW_GM_DIM;
    const { stack, grid } = this;
    if (!stack || !grid || !BelowSnapshots.shows(stack, picture.view) || !this.snapshots.canBlend()) return [NO_BELOW, dim];
    const look = tokenLook(picture.mode === 'player' ? this.tokenPerception(this.deps.store.getState()) : null);
    return [this.snapshots.draw(this.levels.values(), stack, grid, picture, look), dim];
  }

  /** The snapshots lie over `grid` (the drawn stack's box) from now on. */
  private aim(grid: SnapshotGrid | null): void {
    if (sameSnapshotGrid(grid, this.grid)) return;
    this.grid = grid;
    for (const level of this.levels.values()) level.setSnapshot(this.grid);
  }

  /**
   * `stack` with the levels whose picture is not ready showing nothing (`withDrawn`): the same object
   * while the stack and the levels ready stay, so the composites and the memories below find it unchanged.
   */
  private drawnOf(stack: LevelStack | null): LevelStack | null {
    if (!stack) return (this.drawn = null);
    const ready = stack.levels.map((_, index) => index === 0 || !!this.levelAt(index)?.ready());
    const kept = this.drawn;
    if (kept?.layout === stack && kept.ready.every((value, i) => value === ready[i])) return kept.stack;
    this.drawn = { layout: stack, ready, stack: withDrawn(stack, (index) => ready[index]!) };
    return this.drawn.stack;
  }

  /** The level below drawn at index `index` of the stack. */
  private levelAt(index: number): BelowLevel | undefined {
    for (const level of this.levels.values()) if (level.index === index) return level;
    return undefined;
  }

  /** World pixels to the points of the render about to be drawn: the viewport's transform now (the player window's frame's, while it is taken). */
  private camera(): Matrix {
    const { viewport } = this.deps;
    return new Matrix(viewport.scale.x, 0, 0, viewport.scale.y, viewport.x, viewport.y);
  }

  private add(id: string, index: number): BelowLevel {
    const { deps } = this;
    const level = new BelowLevel({
      id,
      index,
      renderer: deps.app.renderer,
      store: deps.store,
      quality: belowQuality(deps.quality()),
      image: (camera) => deps.host.createMapImage(camera),
      art: deps.host.createArt(),
      roofs: deps.host,
      ...(deps.host.createLiquids && { liquids: (changed: () => void) => deps.host.createLiquids!(id, changed) }),
      fadeMs: deps.fadeMs ?? 0,
      requestRender: deps.requestRender,
      onReady: deps.onReady,
      guard: deps.guard,
    });
    level.setStack(this.stackTexture.composite);
    level.setSnapshot(this.grid);
    this.levels.set(id, level);
    return level;
  }

  /**
   * Lets go of a level below. Saving its memory writes the store, whose listeners may update the
   * view and let go of the other levels meanwhile: a level gone already is left alone.
   */
  private remove(id: string, level: BelowLevel, flush: boolean): void {
    if (this.levels.get(id) !== level) return;
    this.levels.delete(id);
    this.perception.forget(id);
    // The view's composite lets go of the level's snapshots before they go.
    this.snapshots.releaseLevel(id);
    level.destroy(flush);
  }

  /** Hands the stack to every composite, then places the eraser in the view's stage the first time there is one. */
  private bind(stack: LevelStack | null): void {
    this.stackTexture.update(stack, (bound) => {
      this.deps.view.setStack(bound);
      for (const level of this.levels.values()) level.setStack(bound);
    });
    if (stack?.box && !this.eraserPlaced) {
      this.deps.host.placeEraser(this.stackTexture.eraser);
      this.eraserPlaced = true;
    }
  }
}
