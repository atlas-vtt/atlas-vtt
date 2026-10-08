/**
 * Atlas's renderers wait for a background sprite: the grid, and with it the token renderer,
 * starts from one. While the scene's map image has no URL, and whenever there is no scene, this
 * puts a transparent placeholder there at the map's size (PIXI's shared white texture, never
 * unloaded), and starts the grid once. `BackgroundSprite` replaces the placeholder when the image
 * shows; the renderer destroys the sprite it replaces, so the background is never left empty.
 */
import { Sprite, Texture } from 'pixi.js';
import type { GridOptions } from '../grid/GridSystem';
import { toGridOptions } from '../grid/gridStateOptions';
import type { GridState } from '../types/gridTypes';

export interface BackdropRenderer {
  setBackgroundSprite(sprite: Sprite): void;
  initGrid(options: GridOptions, sprite: Sprite): void;
  getGridSystem(): unknown;
}

/** Cells each way of a map without a size: Atlas's placeholder for maps without a background. */
export const PLACEHOLDER_CELLS = 20;
const DEFAULT_CELL = 70;

/** An invisible placeholder at the map's size: PIXI's 1 px white texture, scaled. */
export function placeholderSprite(width: number, height: number): Sprite {
  const sprite = new Sprite(Texture.WHITE);
  sprite.alpha = 0;
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

export class RemoteMapBackdrop {
  private placeholder: Sprite | null = null;

  constructor(
    private readonly renderer: BackdropRenderer,
    private readonly createSprite: (width: number, height: number) => Sprite = placeholderSprite,
  ) {}

  /** After the store took a scene: `background` is the scene's (null for none), `grid` what the store now holds. */
  show(background: { url: string | null; width: number; height: number } | null, grid: GridState | null): void {
    if (background?.url) {
      // BackgroundSprite shows the image and replaces this placeholder.
      this.placeholder = null;
      return;
    }
    const cell = grid && grid.size > 0 ? grid.size : DEFAULT_CELL;
    const sized = background !== null && background.width > 0 && background.height > 0;
    const width = sized ? background.width : cell * PLACEHOLDER_CELLS;
    const height = sized ? background.height : cell * PLACEHOLDER_CELLS;
    const shown = this.placeholder;
    if (shown && !shown.destroyed && shown.width === width && shown.height === height) return;
    const sprite = this.createSprite(width, height);
    this.placeholder = sprite;
    this.renderer.setBackgroundSprite(sprite);
    if (!this.renderer.getGridSystem() && grid) this.renderer.initGrid(toGridOptions(grid), sprite);
  }

  dispose(): void {
    this.placeholder = null;
  }
}
