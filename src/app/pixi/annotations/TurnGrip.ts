import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { paintRotateHandle, rotateIconTexture, ROTATE_ICON_SHARE } from '../rotateHandleLook';
import { isDarkTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';

/**
 * The disc of a turn handle with the map's rotate glyph, in screen pixels: whoever owns it places
 * it and scales it back to the world. The glyph is rasterised once for the theme it is shown in.
 */
export class TurnGrip {
  readonly view = new Container({ label: 'annotation-turn-handle', visible: false });
  private readonly disc = new Graphics();
  private readonly glyph = new Sprite({ anchor: 0.5 });
  private drawn = '';
  private glyphDark: boolean | null = null;
  private destroyed = false;

  /** `changed` is told once the glyph is in: nothing else tells that the picture is another. */
  constructor(private readonly radius: number, private readonly changed: () => void) {
    this.view.addChild(this.disc, this.glyph);
  }

  /** Shows the disc, stronger while `emphasised` (hovered or held), in the theme as it is now. */
  show(emphasised: boolean): void {
    this.view.visible = true;
    const dark = isDarkTheme();
    const key = `${emphasised}|${dark}`;
    if (key === this.drawn) return;
    this.drawn = key;
    paintRotateHandle(this.disc, this.radius, emphasised);
    if (dark !== this.glyphDark) {
      this.glyphDark = dark;
      void this.loadGlyph(dark);
    }
  }

  hide(): void {
    this.view.visible = false;
  }

  destroy(): void {
    this.destroyed = true;
    const texture = this.glyph.texture;
    destroyTree(this.view);
    if (texture !== Texture.EMPTY && !texture.destroyed) texture.destroy(true);
  }

  private async loadGlyph(dark: boolean): Promise<void> {
    try {
      const texture = await rotateIconTexture(dark);
      if (this.destroyed || this.glyphDark !== dark) {
        texture.destroy(true);
        return;
      }
      const previous = this.glyph.texture;
      this.glyph.texture = texture;
      this.glyph.scale.set((2 * this.radius * ROTATE_ICON_SHARE) / texture.width);
      if (previous !== Texture.EMPTY && !previous.destroyed) previous.destroy(true);
      this.changed();
    } catch (error) {
      console.error('[TurnGrip] Could not draw the rotate glyph:', error);
    }
  }
}
