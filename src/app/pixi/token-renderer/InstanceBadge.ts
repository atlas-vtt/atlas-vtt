import { Container, Text, TextStyle } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import { CONDITION_BADGE_REACH } from './ConditionBadge';
import { GLYPH_FONT_FAMILY } from './conditionGlyphTexture';
import { BADGE_KEYLINE, GRAPHITE, drawFlatDisc } from './flatBadge';
import { getTokenRingCenterRadius } from './tokenRingMetrics';
import { tokenUIScale } from './tokenSizing';
import type { TokenGroupContainer } from './types';

/** The badge in a token's group, its disc and its number. */
const INSTANCE_BADGE_LABEL = 'instanceBadge';
const BADGE_DISC_LABEL = 'badgeBg';
const BADGE_TEXT_LABEL = 'badgeText';

/** Where on the token's ring the badge sits: its upper right, clear of the conditions on its upper left. */
const RING_ANGLE = -Math.PI / 4;
/** The number's font size as a share of the disc's radius, and the widest it may be (several digits shrink to it). */
const FONT_SHARE = 1.3;
const MAX_WIDTH_SHARE = 1.2;
/**
 * The number is set this many times larger than it shows and scaled down, so it stays sharp
 * on a badge at the map's highest zoom; badges are a few UI units wide.
 */
const TEXT_DRAW_SCALE = 8;
const TEXT_RESOLUTION = 2;
/** System faces set digits a little above the middle of their line; this brings them down, as a share of the font size. */
const DIGIT_DROP = 0.04;

const DISC_RADIUS = CONDITION_BADGE_REACH - BADGE_KEYLINE;
const NUMBER_STYLE = new TextStyle({
  fill: 0xffffff,
  fontSize: DISC_RADIUS * FONT_SHARE * TEXT_DRAW_SCALE,
  fontWeight: '700',
  fontFamily: GLYPH_FONT_FAMILY,
});

/**
 * Create or update the instance badge on a token container: a flat graphite disc on the
 * token's ring with the token's number, in the look and at the size of its condition badges.
 */
export function updateInstanceBadge(
  tokenGroup: TokenGroupContainer,
  instanceNumber: number,
  tokenSize: number,
  visible: boolean,
): void {
  const baseTokenSize = tokenGroup.tokenSize || tokenSize;
  const strokeWidth = tokenGroup.strokeWidth || 4;
  const ringScale = baseTokenSize > 0 ? tokenSize / baseTokenSize : 1;
  const ringRadius = getTokenRingCenterRadius(tokenSize, strokeWidth, ringScale);

  const badge = tokenGroup.getChildByLabel(INSTANCE_BADGE_LABEL) ?? createBadge(tokenGroup);
  badge.position.set(ringRadius * Math.cos(RING_ANGLE), ringRadius * Math.sin(RING_ANGLE));
  badge.scale.set(tokenUIScale(tokenSize));

  const text = badge.getChildByLabel(BADGE_TEXT_LABEL) as Text;
  const label = String(instanceNumber);
  if (text.text !== label) {
    text.text = label;
    fitNumber(text);
  }
  badge.visible = visible;
}

function createBadge(tokenGroup: TokenGroupContainer): Container {
  const badge = new Container({ label: INSTANCE_BADGE_LABEL, zIndex: 50, eventMode: 'none', interactiveChildren: false });
  const disc = drawFlatDisc(GRAPHITE, CONDITION_BADGE_REACH, false, true);
  disc.label = BADGE_DISC_LABEL;
  const text = new Text({
    text: '',
    style: NUMBER_STYLE,
    resolution: TEXT_RESOLUTION,
    anchor: 0.5,
    label: BADGE_TEXT_LABEL,
  });
  badge.addChild(disc, text);
  tokenGroup.addChild(badge);
  return badge;
}

/** Shows the number at its size, shrunk to fit the disc where it has several digits. */
function fitNumber(text: Text): void {
  const drawnWidth = text.width / text.scale.x;
  const fit = Math.min(1, (DISC_RADIUS * MAX_WIDTH_SHARE * TEXT_DRAW_SCALE) / drawnWidth);
  text.scale.set(fit / TEXT_DRAW_SCALE);
  text.y = DISC_RADIUS * FONT_SHARE * DIGIT_DROP;
}

/**
 * Remove the instance badge from a token container entirely.
 */
export function removeInstanceBadge(tokenGroup: Container): void {
  const badge = tokenGroup.getChildByLabel(INSTANCE_BADGE_LABEL);
  if (badge) {
    tokenGroup.removeChild(badge);
    destroyTree(badge);
  }
}
