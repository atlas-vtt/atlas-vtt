import { TurnBannerDisplay, withFightBannerMotion, type PortraitSource, type TurnBannerMotion } from './turnBannerElement';
import type { TurnBanner } from './turnBanner';
import { prefersReducedMotion } from '../../utils/motion';
import { bannerAnchor, listBox, type BannerAnchor, type Box } from '../../services/turnBannerAnchors';
import type { PlayersListEdge } from '../initiativeLayout';
import { FIGHT_INTRO_HOLD_MS } from '../../services/playerInitiativeList';
import { LIST_ENTER_EASING, LIST_ENTER_MS, LIST_EXIT_EASING, LIST_EXIT_MS } from '../motion/listPresence';

/**
 * How the players' turn banner comes and goes (a fight's keeps its own, `withFightBannerMotion`): it springs out of a blur and dims the table behind
 * it (`turn-banner.scss`, until it is `--leaving`), its border pulsing fainter as long as it stands
 * (`--atlas-turn-banner-stand`), then swells as it fades away. It grows to its size and stays there.
 */
const TV_MOTION: TurnBannerMotion = withFightBannerMotion({
  enter(element, standMs) {
    element.style.setProperty('--atlas-turn-banner-stand', `${standMs}ms`);
    const still = prefersReducedMotion(element);
    element.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
          // No overshoot: a swell past its size read as the words shrinking once they had slid in
          { opacity: 0, transform: 'scale(0.5)', filter: 'blur(8px)' },
          { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
        ],
      { duration: still ? 200 : 650, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  },
  leave(element) {
    element.classList.add('atlas-turn-banner--leaving');
    const still = prefersReducedMotion(element);
    const animation = element.animate(
      [{ opacity: 1 }, still ? { opacity: 0 } : { opacity: 0, transform: 'scale(1.1)', filter: 'blur(6px)' }],
      { duration: still ? 200 : 450, easing: 'ease-in', fill: 'forwards' },
    );
    const remove = (): void => element.remove();
    animation.finished.then(remove, remove);
  },
});

/** How long a turn's banner (or its dim) stands for the players: long enough to read from across a table. */
const PLAYER_TURN_BANNER_MS = 4000;

/** How long the table's dim takes to fade (its `transition` in `turn-banner.scss`). */
const DIM_FADE_MS = 450;

/** The banner's gap to its anchor (`$spacing-l` in `turn-banner.scss`). */
const ANCHOR_GAP_PX = 16;

/** A fight's start or end stands at least this long: a moment alone, while the lists slide, then a while after. */
const FIGHT_BANNER_STAND_MS = FIGHT_INTRO_HOLD_MS + LIST_EXIT_MS + 1200;

/** How long a fight's start or end stands for the players, before the banner after it (its first turn) follows. */
export const FIGHT_BANNER_SHOWN_MS = Math.max(PLAYER_TURN_BANNER_MS, FIGHT_BANNER_STAND_MS);

/** The edges a list lies along as a row: a fight's banner stands only at those. */
const ROW_EDGES: ReadonlySet<string> = new Set<PlayersListEdge>(['top', 'bottom']);

/** Whether a fight starts or ends: its banner stands at the lists that are rows. */
export type FightMove = 'start' | 'end';

/**
 * A fight's start or end at a list that slides. As it starts, the banner first stands in the middle of where the
 * list will be, then rises to its place above it as the list slides in beneath (`PlayerInitiativePanel`); as it ends, it
 * first stands above the list, then settles where the list was as the list slides out. The anchor moves by `lift`, in
 * the overlays' frame, between the list's middle and its own point; the banner by half its height and its gap, in its own.
 */
function fightMotion(move: FightMove, lift: { x: number; y: number }, at: BannerAnchor): TurnBannerMotion {
  return {
    enter(element, standMs) {
      TV_MOTION.enter(element, standMs);
      const anchor = element.parentElement;
      const kind = move === 'start' ? 'atlas-turn-banner--fight-start' : 'atlas-turn-banner--fight-end';
      if (!anchor || !element.classList.contains(kind) || prefersReducedMotion(element)) return;
      const timing: KeyframeAnimationOptions = move === 'start'
        ? { duration: LIST_ENTER_MS, delay: FIGHT_INTRO_HOLD_MS, easing: LIST_ENTER_EASING, fill: 'backwards' }
        : { duration: LIST_EXIT_MS, delay: FIGHT_INTRO_HOLD_MS, easing: LIST_EXIT_EASING, fill: 'forwards' };
      // Where the banner rests beside its anchor (`turn-banner.scss`), and where it stands centred on the list's middle
      const beside = at.side === 'left';
      const rest = beside ? '0 -50%' : '-50% 0';
      const onList = beside
        ? `calc(50% + ${ANCHOR_GAP_PX}px) -50%`
        : `-50% ${at.side === 'above' ? `calc(50% + ${ANCHOR_GAP_PX}px)` : `calc(-50% - ${ANCHOR_GAP_PX}px)`}`;
      const inList = [[{ translate: `${lift.x}px ${lift.y}px` }, { translate: onList }], [{ translate: '0 0' }, { translate: rest }]] as const;
      const [from, to] = move === 'start' ? inList : [inList[1], inList[0]];
      anchor.animate([from[0], to[0]], timing);
      element.animate([from[1], to[1]], timing);
    },
    leave: (element) => TV_MOTION.leave(element),
  };
}

/** From the anchor to the middle of its list: straight into the list, across a column, or up or down to a row. */
function liftOf(box: Box, at: BannerAnchor): { x: number; y: number } {
  return { x: (box.left + box.right) / 2 - at.x, y: (box.top + box.bottom) / 2 - at.y };
}

/** Where the banners stand: at every list drawn (`atLists`, and always for a fight's start or end), else in the one place. */
export interface BannerPlacement {
  readonly fight?: FightMove;
  readonly atLists: boolean;
  /** The lists turn to face the players at their edges (`initiativeLayout().facesPlayers`). */
  readonly facesPlayers: boolean;
}

/**
 * The players' turn banners as they stand, wherever they are shown (Atlas's player window, the online player page):
 * one in the middle of `host`, or one at each players' list, turned with it; a fight's start or end at the lists that
 * are rows as they slide in and out (`PlayerInitiativeStage`), in the middle where none is; a turn may dim the table instead of naming itself. Imports nothing
 * of Obsidian's or of a store's: what to announce is the caller's.
 */
export class TurnBannerStage {
  private host: HTMLElement | undefined;
  private display: TurnBannerDisplay | undefined;
  /** The banners standing at the lists, each in its anchor. */
  private attached: TurnBannerDisplay[] = [];
  /** Ends the table's dim of a turn (`dim`). */
  private dimTimer: number | null = null;
  /** Lowers the lists again once the dim has faded. */
  private litTimer: number | null = null;

  constructor(private readonly portraitSrc: PortraitSource) {}

  mount(parent: HTMLElement): void {
    this.destroy();
    const host = parent.createDiv({ cls: 'atlas-player-turn-banner', attr: { 'aria-live': 'polite' } });
    this.host = host;
    this.display = this.displayIn(host);
  }

  private displayIn(host: HTMLElement, motion = TV_MOTION): TurnBannerDisplay {
    return new TurnBannerDisplay(
      host,
      this.portraitSrc,
      (banner) => (banner.kind ? FIGHT_BANNER_SHOWN_MS : PLAYER_TURN_BANNER_MS),
      motion,
    );
  }

  private displays(): TurnBannerDisplay[] {
    return [...(this.display ? [this.display] : []), ...this.attached];
  }

  /** Whether a banner stands now, and whether one standing says the fight ended (one that outlives the fight on purpose). */
  get showing(): boolean {
    return this.displays().some((display) => display.showing);
  }

  get showsFightEnd(): boolean {
    return this.displays().some((display) => display.showsFightEnd);
  }

  /**
   * Shows the banners where `placement` puts them: at every list drawn, else in the one place. The lists have been
   * drawn for the state these banners announce.
   */
  show(banners: TurnBanner[], placement: BannerPlacement): void {
    this.dropAttached();
    const host = this.host;
    const { fight, facesPlayers } = placement;
    // A fight starts and ends at the lists, as they slide in and out: its end at those leaving, every other banner at those staying
    const leaving = fight === 'end' ? '.atlas-player-initiative--leaving' : ':not(.atlas-player-initiative--leaving)';
    const found = host && (placement.atLists || fight)
      ? [...host.ownerDocument.querySelectorAll<HTMLElement>(`.atlas-player-initiative[data-edge]${leaving}`)]
      : [];
    // A fight rises and settles with a row across the table; beside a column it stood off at one side of the screen, so
    // without a row it stands in the middle
    const lists = fight ? found.filter((list) => ROW_EDGES.has(list.dataset.edge ?? '')) : found;
    if (!host || lists.length === 0) {
      this.display?.show(...banners);
      return;
    }
    this.display?.hide();
    lists.forEach((list, index) => {
      const edge = list.dataset.edge as PlayersListEdge;
      // Measured in the overlays' own frame, which a table TV turns
      const box = listBox(list, host, facesPlayers && edge === 'right');
      const at = bannerAnchor(box, edge, facesPlayers);
      const motion = fight ? fightMotion(fight, liftOf(box, at), at) : TV_MOTION;
      const anchor = host.createDiv({ cls: 'atlas-player-turn-banner__anchor', attr: { 'data-side': at.side, 'data-align': at.align } });
      // One announcement is enough
      if (index > 0) anchor.setAttribute('aria-hidden', 'true');
      anchor.style.setProperty('--atlas-anchor-x', `${at.x}px`);
      anchor.style.setProperty('--atlas-anchor-y', `${at.y}px`);
      anchor.style.setProperty('--atlas-anchor-turn', `${at.turn}deg`);
      const display = this.displayIn(anchor, motion);
      this.attached.push(display);
      display.show(...banners);
    });
  }

  hide(): void {
    this.undim();
    for (const display of this.displays()) display.hide();
  }

  /**
   * A turn dims the table instead of naming itself (`turnDim`), for as long as its banner would stand: the lists
   * stay lit above the dim (`turn-banner.scss`), so the cards moving on to the turn stand out.
   */
  dim(): void {
    const host = this.host;
    if (!host) return;
    this.undim();
    const view = host.ownerDocument.defaultView ?? window;
    if (this.litTimer !== null) view.clearTimeout(this.litTimer);
    this.litTimer = null;
    host.classList.add('atlas-player-turn-banner--dim', 'atlas-player-turn-banner--lists-lit');
    this.dimTimer = view.setTimeout(() => this.undim(), PLAYER_TURN_BANNER_MS);
  }

  /** The dim fades; the lists stay above it until it has, or they would be dimmed for the fade's length. */
  private undim(): void {
    const host = this.host;
    const view = host?.ownerDocument.defaultView ?? window;
    if (this.dimTimer !== null) view.clearTimeout(this.dimTimer);
    this.dimTimer = null;
    if (!host?.classList.contains('atlas-player-turn-banner--dim')) return;
    host.classList.remove('atlas-player-turn-banner--dim');
    this.litTimer = view.setTimeout(() => {
      this.litTimer = null;
      host.classList.remove('atlas-player-turn-banner--lists-lit');
    }, DIM_FADE_MS);
  }

  private dropAttached(): void {
    for (const display of this.attached) display.destroy();
    this.attached = [];
    this.host?.querySelectorAll('.atlas-player-turn-banner__anchor').forEach((anchor) => anchor.remove());
  }

  destroy(): void {
    this.undim();
    this.dropAttached();
    this.display?.destroy();
    this.display = undefined;
    this.host?.remove();
    this.host = undefined;
  }
}
