import { Container } from 'pixi.js';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { CONDITION_BADGE_RADIUS, createConditionBadge, type ConditionBadgeSpec } from './ConditionBadge';

import type { ActiveCondition } from '../../utils/activeConditions';
export type { ActiveCondition };

/** The badges fan out around the token's upper left, clear of the instance number at the upper right. */
const ARC_CENTRE = -0.75 * Math.PI;
/** The quarter between the rotate handle at the top and the resize handle on the left. */
const ARC_SPAN = Math.PI / 2;
/** Badge diameter including its bezel, in UI units. */
const BADGE_DIAMETER = (CONDITION_BADGE_RADIUS + 1) * 2;
/** Distance between the centres of neighbouring badges, in UI units. */
const BADGE_PITCH = BADGE_DIAMETER + 1.5;
const MAX_SLOTS = 6;
const OVERFLOW_COLOR = 0x3a3a42;
/** A new badge grows from this share of its size while it fades in. */
const ENTRANCE_SCALE = 0.5;

interface PlacedBadge {
  key: string;
  view: Container;
}

/**
 * Condition badges sitting on the token's ring. As many as fit in the arc are shown;
 * when there are more, the last slot counts the rest ("+3"). Badges keep their size
 * and position while conditions come and go; only a new one animates in.
 */
export class ConditionBadgeRing {
  readonly container = new Container({ eventMode: 'none', interactiveChildren: false });
  private badges: PlacedBadge[] = [];
  private entering = new Set<Container>();
  private entrance = new ValueTransition(1, MOTION_NORMAL_MS, () => this.layout());
  private ringRadius = 0;
  private scale = 1;
  private hasRendered = false;

  /**
   * Shows `conditions` on a ring `ringRadius` world units from the token centre, with
   * badges `scale` world units per UI unit. New badges animate in when `animate`.
   */
  update(conditions: ActiveCondition[], ringRadius: number, scale: number, animate: boolean): void {
    this.ringRadius = ringRadius;
    this.scale = scale;
    const shown = this.fitToArc(conditions);
    const previous = new Map(this.badges.map((badge) => [badge.key, badge.view]));

    this.badges = shown.map((spec) => {
      const key = badgeKey(spec);
      const existing = previous.get(key);
      previous.delete(key);
      return { key, view: existing ?? this.addBadge(spec, animate && this.hasRendered) };
    });
    for (const stale of previous.values()) {
      this.entering.delete(stale);
      destroyTree(stale);
    }

    this.hasRendered = true;
    this.container.visible = shown.length > 0;
    this.layout();
  }

  destroy(): void {
    this.entrance.cancel();
    this.entering.clear();
    this.badges = [];
    destroyTree(this.container);
  }

  /** How many badges fit between the handles; on medium tokens that is three. */
  private fitToArc(conditions: ActiveCondition[]): ConditionBadgeSpecWithId[] {
    const step = this.stepAngle();
    const badgeAngle = step * (BADGE_DIAMETER / BADGE_PITCH);
    const slots = Math.max(1, Math.min(MAX_SLOTS, Math.floor((ARC_SPAN - badgeAngle) / step) + 1));
    if (conditions.length <= slots) return conditions;
    const visible = conditions.slice(0, slots - 1);
    const hidden = conditions.length - visible.length;
    return [...visible, { id: 'overflow', color: OVERFLOW_COLOR, glyph: { kind: 'text', text: `+${hidden}` } }];
  }

  private stepAngle(): number {
    return this.ringRadius > 0 ? (BADGE_PITCH * this.scale) / this.ringRadius : ARC_SPAN;
  }

  private addBadge(spec: ConditionBadgeSpec, animate: boolean): Container {
    const view = createConditionBadge(spec);
    this.container.addChild(view);
    if (animate) {
      this.entering.add(view);
      this.entrance.jumpTo(0);
      this.entrance.animateTo(1, () => this.entering.clear());
    }
    return view;
  }

  /** First condition nearest the top, the rest following down the token's left. */
  private layout(): void {
    const step = this.stepAngle();
    const middle = (this.badges.length - 1) / 2;
    const progress = this.entrance.value;
    this.badges.forEach(({ view }, index) => {
      const angle = ARC_CENTRE + (middle - index) * step;
      view.position.set(Math.cos(angle) * this.ringRadius, Math.sin(angle) * this.ringRadius);
      const isEntering = this.entering.has(view);
      view.alpha = isEntering ? progress : 1;
      view.scale.set(this.scale * (isEntering ? ENTRANCE_SCALE + (1 - ENTRANCE_SCALE) * progress : 1));
    });
  }
}

type ConditionBadgeSpecWithId = ConditionBadgeSpec & { id: string };

function badgeKey(spec: ConditionBadgeSpecWithId): string {
  const glyph = spec.glyph.kind === 'icon' ? spec.glyph.icon : spec.glyph.text;
  return `${spec.id}|${spec.color}|${spec.glyph.kind}:${glyph}|${spec.value ?? ''}`;
}
