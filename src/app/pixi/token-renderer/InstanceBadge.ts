import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { getTokenRingCenterRadius } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';
import { destroyTree } from '../utils/destroyTree';

/** The badge in a token's group, its disc and its number. */
const INSTANCE_BADGE_LABEL = 'instanceBadge';
const BADGE_DISC_LABEL = 'badgeBg';
const BADGE_TEXT_LABEL = 'badgeText';

/** The badge's radius as a share of the token's size, on any grid. */
const BADGE_SIZE_SHARE = 0.14;
/**
 * The badge is drawn once at this radius and scaled to its token, so a curve and a number stay
 * smooth at any size. The text's resolution holds about as many pixels per glyph as a medium
 * token's badge needs at the map's highest zoom.
 */
const DRAW_RADIUS = 32;
const DRAW_FONT_SIZE = DRAW_RADIUS * 1.3;
const DRAW_STROKE = DRAW_RADIUS * 0.17;
const TEXT_RESOLUTION = 2;

/**
 * Create or update the instance badge on a token container.
 * If the badge already exists, updates the number and visibility.
 * If it doesn't exist, creates it.
 */
export function updateInstanceBadge(
  tokenGroup: TokenGroupContainer,
  instanceNumber: number,
  tokenSize: number,
  visible: boolean,
): void {
  // Position badge centered on the token ring band
  const baseTokenSize = tokenGroup.tokenSize || tokenSize;
  const strokeWidth = tokenGroup.strokeWidth || 4;
  const ringScale = baseTokenSize > 0 ? tokenSize / baseTokenSize : 1;
  const ringRadius = getTokenRingCenterRadius(tokenSize, strokeWidth, ringScale);
  const angle = (-45 * Math.PI) / 180;
  const posX = ringRadius * Math.cos(angle);
  const posY = ringRadius * Math.sin(angle);

  let badge = tokenGroup.getChildByLabel(INSTANCE_BADGE_LABEL);

  if (!badge) {
    badge = new Container();
    badge.label = INSTANCE_BADGE_LABEL;
    badge.zIndex = 50;
    badge.eventMode = 'none';
    badge.interactive = false;

    const bg = new Graphics();
    bg.label = BADGE_DISC_LABEL;
    bg.eventMode = 'none';
    bg.circle(0, 0, DRAW_RADIUS);
    bg.fill({ color: 0x000000 });
    bg.circle(0, 0, DRAW_RADIUS);
    bg.stroke({ color: 0x555555, width: DRAW_STROKE });
    badge.addChild(bg);

    const text = new Text({
      text: String(instanceNumber),
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: DRAW_FONT_SIZE,
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
      resolution: TEXT_RESOLUTION,
    });
    text.label = BADGE_TEXT_LABEL;
    text.anchor.set(0.5, 0.5);
    badge.addChild(text);

    tokenGroup.addChild(badge);
  }

  badge.position.set(posX, posY);
  badge.scale.set((tokenSize * BADGE_SIZE_SHARE) / DRAW_RADIUS);

  const text = badge.getChildByLabel(BADGE_TEXT_LABEL) as Text;
  text.text = String(instanceNumber);

  badge.visible = visible;
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
