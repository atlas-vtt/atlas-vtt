import { Container } from 'pixi.js';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';
import { createConditionBadge, type ConditionBadgeSpec } from './ConditionBadge';
import { badgePositions, CONDITION_BADGE, fitBadges } from './conditionBadgeLayout';

/** A condition active on a token, resolved from its collection's definitions. */
export interface ActiveCondition extends ConditionBadgeSpec {
  id: string;
  name: string;
}

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

  /** As many badges as fit between the handles; on medium tokens that is three. */
  private fitToArc(conditions: ActiveCondition[]): ConditionBadgeSpecWithId[] {
    const { shown, overflow } = fitBadges(conditions, this.ringRadius, this.scale);
    if (overflow === 0) return shown;
    return [...shown, { id: 'overflow', color: CONDITION_BADGE.overflowColor, glyph: { kind: 'text', text: `+${overflow}` } }];
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
    const positions = badgePositions(this.badges.length, this.ringRadius, this.scale);
    const progress = this.entrance.value;
    this.badges.forEach(({ view }, index) => {
      const position = positions[index];
      if (position) view.position.set(position.x, position.y);
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
