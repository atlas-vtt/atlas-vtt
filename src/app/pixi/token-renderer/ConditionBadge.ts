import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { isLightBadgeColor, type ConditionGlyph } from '../../utils/conditionGlyph';
import {
  BEZEL_FILL, GLINT_FILL, INK, VIGNETTE_FILL, causticFill, gemFill, shadowFill,
} from './conditionBadgeMaterials';
import { getConditionGlyphTexture } from './conditionGlyphTexture';

export interface ConditionBadgeSpec {
  /** Badge colour as 0xRRGGBB. */
  color: number;
  glyph: ConditionGlyph;
  /** Number of a valued condition, shown in a pip on the badge's lower right. */
  value?: number;
}

/** Radius of a badge on the token's ring, in UI units (a medium token is 62 wide). */
export const CONDITION_BADGE_RADIUS = 6;
/** The badge reaches `radius + RIM_WIDTH`: its setting lies in that band, the gem a little past `radius`. */
const RIM_WIDTH = 1;
/**
 * The setting from the outside in, in UI units: a dark keyline that keeps the badge's edge on
 * light art, the silver bezel, and a groove that sets the gem below the bezel's lip.
 */
const KEYLINE = 0.16;
const BEZEL = 0.46;
const GROOVE = 0.14;
/**
 * Badges are a few UI units wide and PIXI builds a circle from as many pieces as its
 * local radius asks for, so they are drawn this many times larger and scaled down:
 * drawn at their own size, a zoomed-in badge shows corners.
 */
const DRAW_SCALE = 16;
const WHITE = 0xffffff;
/** The soft shadow under the badge reaches this far past it, and sits a little below it. */
const SHADOW_REACH = 1.6;
const SHADOW_DROP = 0.1;
const SHADOW_ALPHA = 0.5;
/** The glint, an ellipse turned along the gem's curve, by shares of the gem's radius. */
const GLINT = { x: -0.34, y: -0.46, rx: 0.42, ry: 0.22, turn: -0.55 };
/** Glyph edge length as a share of the gem's diameter: icons fill less than letters, whose ink is narrower. */
const ICON_SHARE = 0.56;
const TEXT_SHARE = 0.6;
const DARK_GLYPH_COLOR = 0x16161a;
/** The glyph's own shadow (a light lip under a dark glyph), as a share of the radius. */
const GLYPH_SHADOW_DROP = 0.07;
/** Value pip radius as a share of the badge radius, and where its centre sits. */
const PIP_SHARE = 0.6;
const PIP_OFFSET = 0.72;
/** The pip's setting is this share of the badge's. */
const PIP_SETTING = 0.75;
const PIP_COLOR = 0x2a2a31;
const PIP_DIGIT_SHARE = 0.78;

/**
 * A round condition badge centred on its origin: a gem in the condition's colour set in a
 * silver bezel, resting on a soft shadow, with the condition's glyph in white (or near-black
 * on light colours). Used on the token's ring and in the hover card, so both read as one.
 */
export function createConditionBadge(spec: ConditionBadgeSpec, radius: number = CONDITION_BADGE_RADIUS): Container {
  const badge = new Container({ eventMode: 'none', interactiveChildren: false });
  const outer = radius + RIM_WIDTH;
  const shadowRadius = outer + SHADOW_REACH;
  const shadow = new Graphics()
    .circle(0, radius * SHADOW_DROP * DRAW_SCALE, shadowRadius * DRAW_SCALE)
    .fill(shadowFill((outer - RIM_WIDTH * 0.5) / shadowRadius, SHADOW_ALPHA));
  shadow.scale.set(1 / DRAW_SCALE);
  const gem = outer - KEYLINE - BEZEL - GROOVE;
  badge.addChild(shadow, drawGem(spec.color, outer, 1), drawGlint(gem));

  const texture = getConditionGlyphTexture(spec.glyph);
  if (texture) {
    const size = gem * 2 * (spec.glyph.kind === 'icon' ? ICON_SHARE : TEXT_SHARE);
    const light = isLightBadgeColor(spec.color);
    // A dark glyph is pressed in (a light lip below it), a white one stands out (a soft shadow below it)
    badge.addChild(glyphSprite(texture, size, light ? WHITE : INK, light ? 0.35 : 0.4, radius * GLYPH_SHADOW_DROP));
    badge.addChild(glyphSprite(texture, size, light ? DARK_GLYPH_COLOR : WHITE, 1, 0));
  }
  if (spec.value !== undefined) badge.addChild(createValuePip(spec.value, radius));
  return badge;
}

/**
 * A gem of `color` in its setting, reaching `outer` UI units, the setting's widths scaled by
 * `setting`; drawn `DRAW_SCALE` times larger.
 */
function drawGem(color: number, outer: number, setting: number): Graphics {
  const s = DRAW_SCALE;
  const bezelOuter = outer - KEYLINE * setting;
  const grooveOuter = bezelOuter - BEZEL * setting;
  const gem = (grooveOuter - GROOVE * setting) * s;
  const drawn = new Graphics()
    .circle(0, 0, outer * s)
    .fill({ color: INK, alpha: 0.85 })
    .circle(0, 0, bezelOuter * s)
    .fill(BEZEL_FILL)
    .circle(0, 0, grooveOuter * s)
    .fill({ color: INK, alpha: 0.78 })
    .circle(0, 0, gem)
    .fill(gemFill(color))
    .circle(0, 0, gem)
    .fill(causticFill(color))
    .circle(0, 0, gem)
    .fill(VIGNETTE_FILL);
  drawn.scale.set(1 / s);
  return drawn;
}

/** The light's reflection on a gem of `gem` UI units. */
function drawGlint(gem: number): Graphics {
  const s = DRAW_SCALE;
  const glint = new Graphics()
    .ellipse(0, 0, GLINT.rx * gem * s, GLINT.ry * gem * s)
    .fill(GLINT_FILL);
  glint.position.set(GLINT.x * gem, GLINT.y * gem);
  glint.rotation = GLINT.turn;
  glint.scale.set(1 / s);
  return glint;
}

function glyphSprite(texture: Texture, size: number, tint: number, alpha: number, drop: number): Sprite {
  const sprite = new Sprite({ texture, anchor: 0.5, eventMode: 'none', tint, alpha });
  sprite.setSize(size);
  sprite.y = drop;
  return sprite;
}

/** A small graphite gem with the condition's number over the badge's lower right, in a setting like the badge's. */
function createValuePip(value: number, radius: number): Container {
  const pipRadius = radius * PIP_SHARE;
  const pip = new Container({ eventMode: 'none', interactiveChildren: false });
  pip.position.set(radius * PIP_OFFSET, radius * PIP_OFFSET);
  pip.addChild(drawGem(PIP_COLOR, pipRadius + RIM_WIDTH * PIP_SETTING, PIP_SETTING));
  const texture = getConditionGlyphTexture({ kind: 'text', text: String(value) });
  if (texture) pip.addChild(glyphSprite(texture, pipRadius * 2 * PIP_DIGIT_SHARE, WHITE, 1, 0));
  return pip;
}
