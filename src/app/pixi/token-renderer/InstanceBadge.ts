import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { getTokenRingCenterRadius } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';
import { destroyTree } from '../utils/destroyTree';
import { BADGE_DISC_LABEL, BADGE_TEXT_LABEL, INSTANCE_BADGE_LABEL } from './instanceBadgeParts';

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
  const badgeRadius = Math.max(8, tokenSize * 0.14);
  const fontSize = Math.max(10, badgeRadius * 1.3);

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
    badge.addChild(bg);

    const text = new Text({
      text: String(instanceNumber),
      style: new TextStyle({
        fill: 0xffffff,
        fontSize,
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
      resolution: 8,
    });
    text.label = BADGE_TEXT_LABEL;
    text.anchor.set(0.5, 0.5);
    text.position.set(0, 0);
    badge.addChild(text);

    tokenGroup.addChild(badge);
  }

  // Update position
  badge.position.set(posX, posY);

  // Update background — fully opaque
  const bg = badge.getChildByLabel(BADGE_DISC_LABEL) as Graphics;
  bg.clear();
  bg.circle(0, 0, badgeRadius);
  bg.fill({ color: 0x000000 });
  bg.circle(0, 0, badgeRadius);
  bg.stroke({ color: 0x555555, width: 1.5 });

  // Update text — ensure centered
  const text = badge.getChildByLabel(BADGE_TEXT_LABEL) as Text;
  text.text = String(instanceNumber);
  text.style.fontSize = fontSize;
  text.position.set(0, 0);

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
