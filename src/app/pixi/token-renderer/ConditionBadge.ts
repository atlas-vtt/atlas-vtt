import { Container, FillGradient, Graphics, Sprite } from 'pixi.js';
import { darkenColor, lightenColor } from '../../styles/designTokens';
import { isLightBadgeColor, type ConditionGlyph } from '../../utils/conditionGlyph';
import { getConditionGlyphTexture } from './conditionGlyphTexture';
import { CONDITION_BADGE } from './conditionBadgeLayout';

export interface ConditionBadgeSpec {
  /** Badge colour as 0xRRGGBB. */
  color: number;
  glyph: ConditionGlyph;
  /** Number of a valued condition, shown in a pip on the badge's lower right. */
  value?: number;
}

/** Radius of a badge on the token's ring, in UI units (a medium token is 62 wide). */
export const CONDITION_BADGE_RADIUS = CONDITION_BADGE.radius;
/** Dark rim that separates the badge from any token art or map behind it. */
const BEZEL_WIDTH = CONDITION_BADGE.bezelWidth;
const BEZEL_COLOR = CONDITION_BADGE.bezelColor;
/** Glyph edge length as a share of the badge's diameter. */
const GLYPH_SHARE = 0.62;
const DARK_GLYPH_COLOR = 0x16161a;
/** Value pip radius as a share of the badge radius, and where its centre sits. */
const PIP_SHARE = CONDITION_BADGE.pipShare;
const PIP_OFFSET = CONDITION_BADGE.pipOffset;
const PIP_COLOR = CONDITION_BADGE.pipColor;

/** Badge gradients depend only on the colour, so badges of one condition share one. */
const badgeGradients = new Map<number, FillGradient>();

function getBadgeGradient(color: number): FillGradient {
  let gradient = badgeGradients.get(color);
  if (!gradient) {
    gradient = new FillGradient({
      type: 'linear',
      colorStops: [
        { offset: 0, color: lightenColor(color, 0.18) },
        { offset: 0.55, color },
        { offset: 1, color: darkenColor(color, 0.2) },
      ],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    });
    badgeGradients.set(color, gradient);
  }
  return gradient;
}

/**
 * A round condition badge centred on its origin: a softly lit disc in the condition's
 * colour inside a dark bezel, with the condition's glyph in white (or near-black on
 * light colours). Used on the token's ring and in the hover card, so both read as one.
 */
export function createConditionBadge(spec: ConditionBadgeSpec, radius: number = CONDITION_BADGE_RADIUS): Container {
  const badge = new Container({ eventMode: 'none', interactiveChildren: false });
  const disc = new Graphics()
    .circle(0, radius * 0.18, radius + BEZEL_WIDTH + 0.5)
    .fill({ color: 0x000000, alpha: 0.3 })
    .circle(0, 0, radius + BEZEL_WIDTH)
    .fill({ color: BEZEL_COLOR })
    .circle(0, 0, radius)
    .fill(getBadgeGradient(spec.color))
    .circle(0, 0, radius)
    .stroke({ width: radius * 0.08, color: 0xffffff, alpha: 0.18, alignment: 1 });
  badge.addChild(disc);

  const texture = getConditionGlyphTexture(spec.glyph);
  if (texture) {
    const glyph = new Sprite({ texture, anchor: 0.5, eventMode: 'none' });
    glyph.setSize(radius * 2 * GLYPH_SHARE);
    glyph.tint = isLightBadgeColor(spec.color) ? DARK_GLYPH_COLOR : 0xffffff;
    badge.addChild(glyph);
  }
  if (spec.value !== undefined) badge.addChild(createValuePip(spec.value, radius));
  return badge;
}

/** Small dark disc with the condition's number, overlapping the badge's lower right. */
function createValuePip(value: number, radius: number): Container {
  const pipRadius = radius * PIP_SHARE;
  const pip = new Container({ eventMode: 'none', interactiveChildren: false });
  pip.position.set(radius * PIP_OFFSET, radius * PIP_OFFSET);
  pip.addChild(new Graphics()
    .circle(0, 0, pipRadius + BEZEL_WIDTH * 0.75)
    .fill({ color: BEZEL_COLOR })
    .circle(0, 0, pipRadius)
    .fill({ color: PIP_COLOR }));
  const texture = getConditionGlyphTexture({ kind: 'text', text: String(value) });
  if (texture) {
    const digits = new Sprite({ texture, anchor: 0.5, eventMode: 'none' });
    digits.setSize(pipRadius * 2 * 0.78);
    pip.addChild(digits);
  }
  return pip;
}
