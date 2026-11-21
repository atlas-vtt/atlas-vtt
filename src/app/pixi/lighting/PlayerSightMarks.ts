import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { EYE_OFF_SVG } from '../token-renderer/HiddenTokenIcon';
import { canvasBadgeColors, type CanvasBadgeColors } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { createLucideIconTexture } from '../utils/lucideIconTexture';
import type { SightMark } from './sightMarks';

/** UI units (a medium token on a 70 px grid is 62 across): a small badge on the token's edge. */
const SIGHT_MARK_RADIUS = 11;
const GLYPH_SIZE = 15;
/**
 * PIXI builds a circle from a number of straight pieces that follows its radius in local
 * units, so a badge drawn at its own size and scaled up on screen shows corners. It is drawn
 * this many times larger and scaled down again, like the resource wheels (`ResourceWheelView`).
 */
const DRAW_SCALE = 16;
/** The eye is rasterised large enough to stay sharp at any zoom and on high-density screens, as on hidden tokens (`HiddenTokenIcon`). */
const EYE_TEXTURE_SIZE = 192;

interface Badge {
  view: Container;
  kind: SightMark['kind'];
  /** The colour of the theme it was drawn in. */
  background: number;
}

/**
 * The GM's marks on tokens the players do not see now: a small badge in the pins' language on
 * the token's edge, an eye struck through for a token they do not perceive, a dashed circle for
 * one they only sense (its outline is all they get). The badges take the theme's colours and
 * grow with their token, like its resize and rotate buttons. Every eye is a sprite of one white
 * texture, tinted in the theme's ink, made on first use and destroyed with the marks. Part of
 * the GM's sight aids (`GmSightAids`).
 */
export class PlayerSightMarks {
  readonly view = new Container({ label: 'player-sight-marks', eventMode: 'none', interactiveChildren: false });
  private readonly badges = new Map<string, Badge>();
  private eye: Promise<Texture> | null = null;

  /** Shows exactly `marks`, each badge at its mark's scale. */
  sync(marks: readonly SightMark[]): void {
    const colors = canvasBadgeColors();
    const wanted = new Set(marks.map((mark) => mark.tokenId));
    for (const [id, badge] of this.badges) {
      if (wanted.has(id)) continue;
      destroyTree(badge.view);
      this.badges.delete(id);
    }
    for (const mark of marks) {
      let badge = this.badges.get(mark.tokenId);
      // A badge of the other kind or drawn in the other theme is drawn anew.
      if (badge && (badge.kind !== mark.kind || badge.background !== colors.background)) {
        destroyTree(badge.view);
        badge = undefined;
      }
      if (!badge) {
        badge = { view: this.view.addChild(this.drawBadge(mark.kind, colors)), kind: mark.kind, background: colors.background };
        this.badges.set(mark.tokenId, badge);
      }
      badge.view.position.set(mark.x, mark.y);
      badge.view.scale.set(mark.scale);
    }
    this.view.visible = marks.length > 0;
  }

  /** The tokens marked now, with the kind of each mark. */
  shown(): Array<[string, SightMark['kind']]> {
    return [...this.badges].map(([id, badge]) => [id, badge.kind]);
  }

  destroy(): void {
    this.badges.clear();
    this.eye?.then((texture) => texture.destroy(true), () => undefined);
    this.eye = null;
    destroyTree(this.view);
  }

  private drawBadge(kind: SightMark['kind'], colors: CanvasBadgeColors): Container {
    const view = new Container();
    const badge = view.addChild(new Graphics());
    badge.scale.set(1 / DRAW_SCALE);
    const radius = SIGHT_MARK_RADIUS * DRAW_SCALE;
    // A dark hairline keeps the badge's edge on a map as light as the badge.
    badge.circle(0, 0, radius + 0.5 * DRAW_SCALE).stroke({ width: DRAW_SCALE, color: 0x000000, alpha: 0.35 });
    badge.circle(0, 0, radius).fill({ color: colors.background, alpha: 0.95 });
    badge.circle(0, 0, radius - DRAW_SCALE).stroke({ width: DRAW_SCALE, color: colors.stroke, alpha: 0.35 });
    if (kind === 'sensed') drawOutlineGlyph(badge, colors.stroke);
    else this.addEyeOff(view, colors.stroke);
    return view;
  }

  /** Lucide's `eye-off`, as on a token hidden from the players, in the badge's ink; it joins the badge once its texture is there. */
  private addEyeOff(badge: Container, ink: number): void {
    this.eye ??= eyeTexture();
    this.eye.then(
      (texture) => {
        if (badge.destroyed) return;
        const eye = badge.addChild(new Sprite({ texture, anchor: 0.5, tint: ink }));
        eye.setSize(GLYPH_SIZE);
      },
      (error: unknown) => console.error('[PlayerSightMarks] Failed to load the eye-off icon:', error),
    );
  }
}

/** The eye in white, for every badge to tint; mipmaps keep it clean on a badge a few pixels wide, as on the condition badges. */
async function eyeTexture(): Promise<Texture> {
  const texture = await createLucideIconTexture(EYE_OFF_SVG, 'white', EYE_TEXTURE_SIZE);
  texture.source.autoGenerateMipmaps = true;
  texture.source.update();
  return texture;
}

/** The outline the players see of a sensed token, in small: a dashed circle around a dot. Drawn `DRAW_SCALE` times larger, like its badge. */
function drawOutlineGlyph(g: Graphics, color: number): void {
  const radius = (GLYPH_SIZE / 2 - 0.5) * DRAW_SCALE;
  const dashes = 6;
  for (let i = 0; i < dashes; i++) {
    const from = (i / dashes) * 2 * Math.PI;
    g.moveTo(Math.cos(from) * radius, Math.sin(from) * radius);
    g.arc(0, 0, radius, from, from + (Math.PI / dashes) * 1.1);
  }
  g.stroke({ width: 1.5 * DRAW_SCALE, color, cap: 'round' });
  g.circle(0, 0, 1.4 * DRAW_SCALE).fill({ color });
}
