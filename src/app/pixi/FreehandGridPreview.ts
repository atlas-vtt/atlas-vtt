/**
 * Screen-space preview of the freehand grid placement: an empty token in the
 * middle of a small patch of grid that fades out in a circle.
 *
 * The preview keeps its size on screen, so zooming the map beneath it is what
 * sets the cell size (see {@link freehandCellSize}).
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { alignmentGridColor } from '../grid/GridSystem';
import type { GridType } from '../grid/GridSystem';
import { gridOffsetCenteredAt } from '../grid/gridPlacement';
import { gridLineSegments } from './spectralEngine/gridTemplate';
import { radialFadeGroups } from './radialFade';
import type { FadeStop } from './radialFade';
import { destroyTree } from './utils/destroyTree';
import { computeTokenPixelSize, computeTokenStrokeWidth } from './token-renderer/tokenSizing';
import { getTokenRingOuterDiameter } from './token-renderer/tokenRingMetrics';
import { loadedTokenRingTexture, loadTokenRingTexture } from './token-renderer/tokenRingTexture';

/** On-screen size of one preview cell, in CSS pixels. */
export const FREEHAND_CELL_SCREEN_SIZE = 80;

const CELL = FREEHAND_CELL_SCREEN_SIZE;
/** Half the side of the drawn patch; the fade has ended inside it. */
const PATCH_HALF_SIDE = 2.5 * CELL;
/** Full strength up to the centre cell's neighbours, gone past the 3×3 block's corners. */
const FADE_STOPS: readonly FadeStop[] = [
  { radius: 0.9 * CELL, alpha: 1 },
  { radius: 1.45 * CELL, alpha: 0.5 },
  { radius: 1.8 * CELL, alpha: 0.15 },
  { radius: 2.1 * CELL, alpha: 0 },
];
/** Length of the pieces the fade is stepped in, and the number of opacity steps. */
const FADE_PIECE_LENGTH = 3;
const FADE_LEVELS = 24;
const LINE_WIDTH = 1.5;
const HALO_WIDTH = 4;
const HALO_ALPHA = 0.45;
const TOKEN_FILL_ALPHA = 0.35;

/** Grid cell size in world units while the preview is shown at a viewport scale of `viewportScale`. */
export function freehandCellSize(viewportScale: number): number {
  return FREEHAND_CELL_SCREEN_SIZE / viewportScale;
}

export class FreehandGridPreview {
  private readonly root = new Container({ label: 'freehandGridPreview', eventMode: 'none', visible: false });
  private readonly lines = new Graphics();
  private readonly token = new Container();
  private gridType: GridType;

  constructor(gridType: GridType) {
    this.gridType = gridType;
    this.root.addChild(this.lines, this.token);
    this.drawLines();
    this.buildToken();
  }

  /** The display object to add above the map, in screen space. */
  get view(): Container {
    return this.root;
  }

  setGridType(gridType: GridType): void {
    if (gridType === this.gridType) return;
    this.gridType = gridType;
    this.drawLines();
  }

  /** Centres the preview on a point in its parent's (screen) space and shows it. */
  showAt(x: number, y: number): void {
    this.root.position.set(x, y);
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }

  destroy(): void {
    destroyTree(this.root);
  }

  /** Grid lines around the origin, fading out in a circle; a dark halo under them keeps them readable on bright maps. */
  private drawLines(): void {
    const bounds = { minX: -PATCH_HALF_SIDE, minY: -PATCH_HALF_SIDE, maxX: PATCH_HALF_SIDE, maxY: PATCH_HALF_SIDE };
    const { offsetX, offsetY } = gridOffsetCenteredAt(this.gridType, CELL, { x: 0, y: 0 });
    const segments = gridLineSegments(this.gridType, CELL, offsetX, offsetY, bounds);
    const groups = radialFadeGroups(segments, FADE_STOPS, FADE_PIECE_LENGTH, FADE_LEVELS);

    this.lines.clear();
    for (const [width, color, strength] of [[HALO_WIDTH, 0x000000, HALO_ALPHA], [LINE_WIDTH, alignmentGridColor(), 1]] as const) {
      for (const { alpha, pieces } of groups) {
        for (const piece of pieces) this.lines.moveTo(piece.x1, piece.y1).lineTo(piece.x2, piece.y2);
        this.lines.stroke({ width, color, alpha: alpha * strength, cap: 'butt' });
      }
    }
  }

  /** An empty token of one cell: a dark disc inside the token ring. */
  private buildToken(): void {
    const strokeWidth = computeTokenStrokeWidth(CELL);
    const tokenSize = computeTokenPixelSize(CELL, 1);
    const disc = new Graphics().circle(0, 0, tokenSize / 2).fill({ color: 0x000000, alpha: TOKEN_FILL_ALPHA });
    this.token.addChild(disc);

    const ringSize = getTokenRingOuterDiameter(tokenSize, strokeWidth);
    const addRing = (texture: Texture | null): void => {
      if (!texture || this.root.destroyed) return;
      const ring = new Sprite({ texture, anchor: 0.5, width: ringSize, height: ringSize });
      this.token.addChild(ring);
    };
    const loaded = loadedTokenRingTexture();
    if (loaded) addRing(loaded);
    else void loadTokenRingTexture().then(addRing);
  }
}
