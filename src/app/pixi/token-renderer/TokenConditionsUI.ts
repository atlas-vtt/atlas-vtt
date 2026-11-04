import { Container } from 'pixi.js';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { resolveActiveConditions, type ActiveCondition } from '../../utils/activeConditions';
import type { TokenConditionState } from '../../utils/conditionValues';
import { prefersReducedMotion } from '../../utils/motion';
import { ConditionBadgeRing } from './ConditionBadgeRing';
import { ConditionHoverPanel } from './ConditionHoverPanel';

export interface TokenConditionsLayout {
  /** Radius of the token's ring band, in world units from the token centre. */
  ringRadius: number;
  /** World units per UI unit for the badges on the ring. */
  badgeScale: number;
  /** World units per screen pixel for the hover card. */
  cardScale: number;
}

/**
 * A token's conditions: badges on its ring and, while the token is hovered, a card
 * beside it that names them. Lives in the token's UI container, centred on the token.
 */
export class TokenConditionsUI {
  readonly container = new Container({ eventMode: 'none', interactiveChildren: false });
  private ring = new ConditionBadgeRing();
  private card = new ConditionHoverPanel();
  private conditions: ActiveCondition[] = [];
  private isHovered = false;

  constructor() {
    this.container.addChild(this.ring.container, this.card.container);
  }

  update(token: TokenConditionState, definitions: readonly ConditionDefinition[], layout: TokenConditionsLayout): void {
    this.conditions = resolveActiveConditions(token, definitions);
    this.ring.update(this.conditions, layout.ringRadius, layout.badgeScale, this.canAnimate());
    this.card.place(layout.ringRadius, layout.cardScale);
    if (this.isHovered) this.card.show(this.conditions, false);
  }

  /** Keeps the card at a constant screen size while the viewport zooms. */
  setCardScale(ringRadius: number, cardScale: number): void {
    this.card.place(ringRadius, cardScale);
  }

  setHovered(hovered: boolean): void {
    if (this.isHovered === hovered) return;
    this.isHovered = hovered;
    if (hovered) this.card.show(this.conditions, this.canAnimate());
    else this.card.hide(this.canAnimate());
  }

  /** Hides everything while the token is resized or rotated, when the ring moves under the badges. */
  setHidden(hidden: boolean): void {
    this.container.visible = !hidden;
  }

  destroy(): void {
    this.ring.destroy();
    this.card.destroy();
    this.container.destroy();
  }

  private canAnimate(): boolean {
    return !prefersReducedMotion(document.body);
  }
}
