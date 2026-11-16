import { RenderTexture, type Matrix, type Renderer, type Texture, type WebGLRenderer } from 'pixi.js';
import { showsBelow, type LevelStack } from '../../../levels/levelStack';
import type { TokenEntity } from '../../../types';
import type { BelowPictures, LightingMode } from '../engine/compositeFilter';
import type { BelowLevel, BelowLook, SnapshotDrawn } from './BelowLevel';
import type { BelowTokenLook } from './BelowTokens';
import type { SnapshotGrid } from './belowSnapshot';

/** A render of the view the levels below are shown in: the canvas, the player window's frame, a picture of the scene (a thumbnail). */
export interface BelowPicture {
  key: 'canvas' | 'frame' | 'thumbnail';
  mode: LightingMode;
  /** The render's camera (world pixels to its points) and size in points: nothing below is drawn for it while no opening lies in it. */
  view: { camera: Matrix; width: number; height: number };
}

/** The looks a snapshot is drawn in: the GM's, the players', and a picture of the scene's (the GM's, the roof drawn whole). */
type SnapshotLook = LightingMode | 'picture';

interface Snapshot {
  look: SnapshotLook;
  levelId: string;
  texture: RenderTexture;
  /** What the texture was last drawn at; null before its first draw. */
  drawn: SnapshotDrawn | null;
}

/**
 * The world-space snapshots of the levels below (`BelowLevel.draw`), one for each level and look
 * in use, over the stack's box on the snapshot grid (`snapshotGrid`). A snapshot does not depend
 * on any camera: the canvas, the player window's frame and a thumbnail read the same one in the
 * same look, and panning or zooming draws nothing anew. It is drawn again only when its level
 * changed (`BelowLevel`'s count) or its tokens look otherwise. A look no picture uses any more
 * gives its textures back, and so does a level that goes; `unbind` lets the view's composite go
 * of them first.
 */
export class BelowSnapshots {
  private readonly snapshots = new Map<string, Snapshot>();
  /** The look each picture was last shown in. */
  private readonly looks = new Map<BelowPicture['key'], SnapshotLook>();

  constructor(private readonly renderer: Renderer, private readonly unbind: () => void) {}

  /**
   * Draws, where it changed, the snapshot of each ready level of `levels` that `stack` shows, in
   * the look of `picture`, over `grid`, its tokens as `tokens` says; what the composite reads.
   */
  draw(levels: Iterable<BelowLevel>, stack: LevelStack, grid: SnapshotGrid, picture: BelowPicture, tokens: (token: TokenEntity) => BelowTokenLook): BelowPictures {
    const look: SnapshotLook = picture.key === 'thumbnail' ? 'picture' : picture.mode;
    this.use(picture.key, look);
    const belowLook: BelowLook = { mode: look === 'player' ? 'player' : 'gm', picture: look === 'picture' };
    const shown: [Texture | null, Texture | null] = [null, null];
    for (const level of levels) {
      if (!level.ready() || !showsBelow(stack, level.index)) continue;
      const snapshot = this.snapshotFor(look, level.id, grid);
      snapshot.drawn = level.draw(belowLook, snapshot.texture, tokens, snapshot.drawn);
      if (snapshot.drawn) shown[level.index - 1] = snapshot.texture;
    }
    return { textures: shown, x: grid.x, y: grid.y, sub: grid.sub };
  }

  /** Whether `view` shows any texel of the stack that is not the viewed level. */
  static shows(stack: LevelStack, { camera, width, height }: BelowPicture['view']): boolean {
    const box = stack.box;
    if (!box) return false;
    const inverse = camera.clone().invert();
    const corners = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }, { x: width, y: height }].map((corner) => inverse.apply(corner));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const { texel } = stack.grid;
    return Math.max(...xs) >= box.x * texel && Math.min(...xs) <= (box.x + box.columns) * texel
      && Math.max(...ys) >= box.y * texel && Math.min(...ys) <= (box.y + box.rows) * texel;
  }

  /**
   * PIXI draws a filter that reads the scene beneath it only through the back buffer, also into a
   * texture: without it a level below's composite would be skipped and its map show unlit.
   */
  canBlend(): boolean {
    return this.renderer.name === 'webgl' && (this.renderer as WebGLRenderer).backBuffer.useBackBuffer;
  }

  /** A picture is no longer shown (the player window closed, a thumbnail taken): the look it used goes once no other picture uses it. */
  release(pictureKey: BelowPicture['key']): void {
    const look = this.looks.get(pictureKey);
    this.looks.delete(pictureKey);
    if (look) this.dropUnused(look);
  }

  /** A level's snapshots go with the level. */
  releaseLevel(levelId: string): void {
    for (const [key, snapshot] of [...this.snapshots]) if (snapshot.levelId === levelId) this.drop(key, snapshot);
  }

  destroy(): void {
    this.looks.clear();
    for (const [key, snapshot] of [...this.snapshots]) this.drop(key, snapshot);
  }

  /** `pictureKey` is shown in `look` now: the look it was shown in before goes where nothing else uses it. */
  private use(pictureKey: BelowPicture['key'], look: SnapshotLook): void {
    const before = this.looks.get(pictureKey);
    this.looks.set(pictureKey, look);
    if (before && before !== look) this.dropUnused(before);
  }

  private dropUnused(look: SnapshotLook): void {
    if ([...this.looks.values()].includes(look)) return;
    for (const [key, snapshot] of [...this.snapshots]) if (snapshot.look === look) this.drop(key, snapshot);
  }

  /** The snapshot of level `levelId` in `look`, made anew where the grid's size changed. */
  private snapshotFor(look: SnapshotLook, levelId: string, grid: SnapshotGrid): Snapshot {
    const key = `${look}/${levelId}`;
    const current = this.snapshots.get(key);
    if (current && current.texture.source.pixelWidth === grid.width && current.texture.source.pixelHeight === grid.height) return current;
    if (current) this.drop(key, current);
    const texture = RenderTexture.create({ width: grid.width, height: grid.height, resolution: 1, antialias: false, scaleMode: 'nearest' });
    const made: Snapshot = { look, levelId, texture, drawn: null };
    this.snapshots.set(key, made);
    return made;
  }

  private drop(key: string, snapshot: Snapshot): void {
    this.unbind();
    snapshot.texture.destroy(true);
    this.snapshots.delete(key);
  }
}
