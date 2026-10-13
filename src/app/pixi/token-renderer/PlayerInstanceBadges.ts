import { Text, type Container } from 'pixi.js';
import type { ViewState } from '../../types/viewState';
import { NO_INSTANCE_NUMBERS, badgeNumberInView, numberTokensInView, type InstanceNumbers, type TokenInView } from '../../vision/instanceNumbers';
import type { TokenSeen } from '../../vision/measureOrigin';
import { setLayerVisibility, type LayerVisibility } from '../playerSafeFrame';
import { PLAYER_BADGE_TEXT_LABEL, badgeParts, type InstanceBadgeParts } from './instanceBadgeParts';

/** What the players' instance badges read of the view's state: its tokens, its map and whether it shows badges. */
export type PlayerBadgeState = Pick<ViewState, 'mapPath'> & {
  readonly objects: Pick<ViewState['objects'], 'tokens'>;
  readonly tokenSettings?: Partial<Pick<ViewState['tokenSettings'], 'showInstanceBadges'>>;
};

/** What the players' instance badges need to know of the token renderer. */
export interface PlayerBadgeHost {
  state: () => PlayerBadgeState;
  sprites: () => Readonly<Record<string, Container | null>>;
}

/** What a token's badge shows the players: nothing, their own number, or the GM's (the same number). */
type BadgeLook = 'none' | 'players' | 'gm';

interface PassedBadge {
  readonly parts: InstanceBadgeParts;
  readonly look: BadgeLook;
}

/** The badge's disc and texts as `look` shows them. */
function leaves({ disc, text, playerText }: InstanceBadgeParts, look: BadgeLook): LayerVisibility[] {
  const entries: LayerVisibility[] = [{ layer: disc, visible: look !== 'none' }, { layer: text, visible: look === 'gm' }];
  if (playerText) entries.push({ layer: playerText, visible: look === 'players' });
  return entries;
}

/** Whether the canvas holds `now` already: the same look on the very same disc and texts. */
function holds(before: PassedBadge | undefined, now: PassedBadge): boolean {
  return !!before && before.look === now.look && before.parts.disc === now.parts.disc
    && before.parts.text === now.parts.text && before.parts.playerText === now.parts.playerText;
}

/** The badge with the players' number `shown` in its second text, made hidden on first use in the GM text's style and place. */
function withPlayersNumber(parts: InstanceBadgeParts, shown: string): InstanceBadgeParts {
  const gm = parts.text;
  let text = parts.playerText;
  if (!text) {
    text = new Text({ text: shown, style: gm.style, resolution: gm.resolution });
    text.label = PLAYER_BADGE_TEXT_LABEL;
    text.eventMode = 'none';
    text.visible = false;
    parts.badge.addChild(text);
  }
  text.text = shown;
  text.anchor.copyFrom(gm.anchor);
  text.position.copyFrom(gm.position);
  return { ...parts, playerText: text };
}

/**
 * Instance badges as the players' picture shows them: counted and numbered among the tokens the
 * players see (`numberTokensInView`), so a look-alike they do not see neither counts nor takes a
 * number. Their number is a second text in the token's own badge, and the disc and both texts are
 * swapped by `visible`: for one capture (`layers`), and held on the canvas while it shows the players'
 * view (`syncCanvas`). The GM's drawing writes only the badge itself, never these three.
 */
export class PlayerInstanceBadges {
  private numbers: InstanceNumbers = NO_INSTANCE_NUMBERS;
  private numberedMap: string | null = null;
  /** Every badge as the last pass found it. */
  private passed: ReadonlyMap<string, PassedBadge> = new Map();
  /** The badges the canvas holds off the GM's look, as it holds them. */
  private held: ReadonlyMap<string, PassedBadge> = new Map();

  constructor(private readonly host: PlayerBadgeHost) {}

  /** Numbers the tokens `seen` answers for and works out what each badge shows; writes only a players' number that changed. */
  pass(seen: TokenSeen): void {
    const { mapPath, objects, tokenSettings } = this.host.state();
    if (mapPath !== this.numberedMap) {
      this.numbers = NO_INSTANCE_NUMBERS;
      this.numberedMap = mapPath;
    }
    const inView: TokenInView[] = [];
    for (const [id, token] of Object.entries(objects.tokens)) {
      if (seen(id)) inView.push({ id, art: token.imagePath, rank: token.instanceNumber ?? 1 });
    }
    this.numbers = numberTokensInView(this.numbers, inView);
    const badgesOn = tokenSettings?.showInstanceBadges ?? true;
    const passed = new Map<string, PassedBadge>();
    for (const [id, group] of Object.entries(this.host.sprites())) {
      const parts = group && badgeParts(group);
      if (parts) passed.set(id, this.passedBadge(parts, badgeNumberInView(this.numbers, id, badgesOn)));
    }
    this.passed = passed;
  }

  /** Fewer badges than the GM's, never more: none where the GM's drawing shows none. */
  private passedBadge(parts: InstanceBadgeParts, number: number | null): PassedBadge {
    if (number === null || !parts.badge.visible) return { parts, look: 'none' };
    const shown = String(number);
    return parts.text.text === shown ? { parts, look: 'gm' } : { parts: withPlayersNumber(parts, shown), look: 'players' };
  }

  /**
   * What a capture changes for the last pass: the disc and texts of every badge that shows something
   * other than the GM's, and of every badge the canvas holds, one entry each. A badge the GM's drawing
   * leaves off shows nothing whatever its leaves, so it needs none.
   */
  layers(): LayerVisibility[] {
    const entries: LayerVisibility[] = [];
    for (const [id, { parts, look }] of this.passed) {
      if (parts.badge.visible && (look !== 'gm' || this.held.has(id))) entries.push(...leaves(parts, look));
    }
    return entries;
  }

  /** The badges the canvas holds, as the GM view shows them: for a picture of the scene, and for leaving the players' view. */
  gmLayers(): LayerVisibility[] {
    const sprites = this.host.sprites();
    return [...this.held.keys()].flatMap((id) => {
      const group = sprites[id];
      const parts = group && badgeParts(group);
      return parts ? leaves(parts, 'gm') : [];
    });
  }

  /**
   * Holds the players' badges on the canvas while it shows their view (`seen`), and the GM's again
   * once it does not (null). Nothing else sets the visibility of these parts on the canvas (a capture
   * puts back what it changed, and a badge drawn anew shows the GM's look), so the canvas holds exactly
   * what `held` says, and a pass writes only the badges whose look changed: the GM's look back for
   * those that left `held`, the pass's look for the others.
   */
  syncCanvas(seen: TokenSeen | null): void {
    if (!seen) {
      setLayerVisibility(this.gmLayers());
      this.held = new Map();
      return;
    }
    this.pass(seen);
    const changes: LayerVisibility[] = [];
    const held = new Map<string, PassedBadge>();
    for (const [id, before] of this.held) {
      const now = this.passed.get(id);
      if (now?.look === 'gm' && now.parts.disc === before.parts.disc) changes.push(...leaves(now.parts, 'gm'));
    }
    for (const [id, now] of this.passed) {
      if (now.look === 'gm') continue;
      if (!holds(this.held.get(id), now)) changes.push(...leaves(now.parts, now.look));
      held.set(id, now);
    }
    setLayerVisibility(changes);
    this.held = held;
  }

  /** Starts anew, for a map whose token groups were all made anew. */
  reset(): void {
    this.numbers = NO_INSTANCE_NUMBERS;
    this.numberedMap = null;
    this.passed = new Map();
    this.held = new Map();
  }
}
