import { Text, type Container } from 'pixi.js';

/** The badge in a token's group: its disc, the GM's number and, where the players' differs, theirs. */
export const INSTANCE_BADGE_LABEL = 'instanceBadge';
export const BADGE_DISC_LABEL = 'badgeBg';
export const BADGE_TEXT_LABEL = 'badgeText';
export const PLAYER_BADGE_TEXT_LABEL = 'playerBadgeText';

export interface InstanceBadgeParts {
  readonly badge: Container;
  readonly disc: Container;
  /** The GM's number. */
  readonly text: Text;
  /** The players' number, made only for a token whose number differs in their picture. */
  readonly playerText: Text | null;
}

/** The parts of a token's badge, found by their labels in one look at its children; null while the token has no badge. */
export function badgeParts(tokenGroup: Container): InstanceBadgeParts | null {
  const badge = tokenGroup.getChildByLabel(INSTANCE_BADGE_LABEL);
  if (!badge) return null;
  let disc: Container | null = null;
  let text: Text | null = null;
  let playerText: Text | null = null;
  for (const child of badge.children) {
    if (child.label === BADGE_DISC_LABEL) disc ??= child;
    else if (child.label === BADGE_TEXT_LABEL && child instanceof Text) text ??= child;
    else if (child.label === PLAYER_BADGE_TEXT_LABEL && child instanceof Text) playerText ??= child;
  }
  return disc && text ? { badge, disc, text, playerText } : null;
}
