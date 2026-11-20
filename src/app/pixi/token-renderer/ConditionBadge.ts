import { Container, Sprite, type Texture } from 'pixi.js';
import { isLightBadgeColor, type ConditionGlyph } from '../../utils/conditionGlyph';
import { getConditionGlyphTexture } from './conditionGlyphTexture';
import { BADGE_KEYLINE, GRAPHITE, drawFlatDisc } from './flatBadge';

export interface ConditionBadgeSpec {
  /** Badge colour as 0xRRGGBB. */
  color: number;
  glyph: ConditionGlyph;
  /** Number of a valued condition, shown in a pip on the badge's lower right. */
  value?: number;
}

/** Radius of a badge on the token's ring, in UI units (a medium token is 62 wide). */
export const CONDITION_BADGE_RADIUS = 6;
/** The badge reaches `radius + RIM_WIDTH`, its dark keyline included. */
const RIM_WIDTH = 1;
/** How far a badge on the ring reaches from its centre, in UI units; the instance number is as large. */
export const CONDITION_BADGE_REACH = CONDITION_BADGE_RADIUS + RIM_WIDTH;
const WHITE = 0xffffff;
/** Glyph edge length as a share of the disc's diameter: icons fill less than letters, whose ink is narrower. */
const ICON_SHARE = 0.54;
const TEXT_SHARE = 0.58;
const DARK_GLYPH_COLOR = 0x16161a;
/** Value pip radius as a share of the badge radius, and where its centre sits. */
const PIP_SHARE = 0.6;
const PIP_OFFSET = 0.72;
const PIP_DIGIT_SHARE = 0.78;

/**
 * A round condition badge centred on its origin: a flat disc in the condition's colour
 * with a fine ring inside its edge, a dark keyline around it and a faint shadow under it,
 * and the condition's glyph in white (or near-black on light colours). Used on the token's
 * ring and in the hover card, so both read as one.
 */
export function createConditionBadge(spec: ConditionBadgeSpec, radius: number = CONDITION_BADGE_RADIUS): Container {
  const badge = new Container({ eventMode: 'none', interactiveChildren: false });
  const light = isLightBadgeColor(spec.color);
  badge.addChild(drawFlatDisc(spec.color, radius + RIM_WIDTH, light, true));

  const texture = getConditionGlyphTexture(spec.glyph);
  if (texture) {
    const disc = radius + RIM_WIDTH - BADGE_KEYLINE;
    const size = disc * 2 * (spec.glyph.kind === 'icon' ? ICON_SHARE : TEXT_SHARE);
    badge.addChild(glyphSprite(texture, size, light ? DARK_GLYPH_COLOR : WHITE));
  }
  if (spec.value !== undefined) badge.addChild(createValuePip(spec.value, radius));
  return badge;
}

function glyphSprite(texture: Texture, size: number, tint: number): Sprite {
  const sprite = new Sprite({ texture, anchor: 0.5, eventMode: 'none', tint });
  sprite.setSize(size);
  return sprite;
}

/** A small dark disc with the condition's number over the badge's lower right, keylined like the badge. */
function createValuePip(value: number, radius: number): Container {
  const pipRadius = radius * PIP_SHARE;
  const pip = new Container({ eventMode: 'none', interactiveChildren: false });
  pip.position.set(radius * PIP_OFFSET, radius * PIP_OFFSET);
  pip.addChild(drawFlatDisc(GRAPHITE, pipRadius + BADGE_KEYLINE, false, false));
  const texture = getConditionGlyphTexture({ kind: 'text', text: String(value) });
  if (texture) pip.addChild(glyphSprite(texture, pipRadius * 2 * PIP_DIGIT_SHARE, WHITE));
  return pip;
}
