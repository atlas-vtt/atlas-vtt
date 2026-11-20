import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { TurnWatch, type TurnBanner } from '../initiative/banner/turnBanner';
import { FightWatch, fightBanner } from '../initiative/banner/fightWatch';
import { TurnBannerDisplay, type TurnBannerMotion } from '../initiative/banner/turnBannerElement';
import { prefersReducedMotion } from '../utils/motion';
import { portraitSrc } from '../utils/portraitSrc';
import { bannerAnchor, listBox, type BannerAnchor, type Box } from './turnBannerAnchors';
import type { PlayersListEdge } from '../initiative/initiativeLayout';
import { FIGHT_INTRO_HOLD_MS, LIST_LEAVE_EASING, LIST_LEAVE_MS, LIST_SLIDE_MS } from './playerInitiativeList';
import type { PlayerOverlay } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';

/**
 * How the players' banner comes and goes: it springs out of a blur and dims the table behind
 * it (`turn-banner.scss`, until it is `--leaving`), its border pulsing fainter as long as it stands
 * (`--atlas-turn-banner-stand`), then swells as it fades away. It grows to its size and stays there.
 */
const TV_MOTION: TurnBannerMotion = {
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
    element.addClass('atlas-turn-banner--leaving');
    const still = prefersReducedMotion(element);
    const animation = element.animate(
      [{ opacity: 1 }, still ? { opacity: 0 } : { opacity: 0, transform: 'scale(1.1)', filter: 'blur(6px)' }],
      { duration: still ? 200 : 450, easing: 'ease-in', fill: 'forwards' },
    );
    const remove = (): void => element.remove();
    animation.finished.then(remove, remove);
  },
};

/** How long the table's dim takes to fade (its `transition` in `turn-banner.scss`). */
const DIM_FADE_MS = 450;

/** The banner's gap to its anchor (`$spacing-l` in `turn-banner.scss`). */
const ANCHOR_GAP_PX = 16;

/** A fight's start or end stands at least this long: a moment alone, while the lists slide, then a while after. */
const FIGHT_BANNER_STAND_MS = FIGHT_INTRO_HOLD_MS + LIST_LEAVE_MS + 1200;

/** Whether a fight starts or ends: its banner stands at the lists. */
type FightMove = 'start' | 'end';

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
      if (!anchor || !element.hasClass(kind) || prefersReducedMotion(element)) return;
      const timing: KeyframeAnimationOptions = move === 'start'
        ? { duration: LIST_SLIDE_MS, delay: FIGHT_INTRO_HOLD_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }
        : { duration: LIST_LEAVE_MS, delay: FIGHT_INTRO_HOLD_MS, easing: LIST_LEAVE_EASING, fill: 'forwards' };
      // Where the banner rests beside its anchor (`turn-banner.scss`), and where it stands centred on the list's middle
      const beside = at.side === 'right' || at.side === 'left';
      const rest = beside ? '0 -50%' : '-50% 0';
      const onList = beside
        ? `${at.side === 'right' ? `calc(-50% - ${ANCHOR_GAP_PX}px)` : `calc(50% + ${ANCHOR_GAP_PX}px)`} -50%`
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

/**
 * The turn banner in the player window: the players' version of the GM's, shown when the turn of
 * the presented scene's fight moves on. It follows their initiative list: none while the list is
 * not shown (the player view's switch, the GM's tracker closed), none where the list marks no
 * turn (a hidden turn holder), names as the list shows them, and none once the GM
 * switched the banner off. A scene bound anew, or one that loads, starts without a banner. With `turnBannerAtLists`
 * a banner stands just above each list instead, turned with it.
 */
export class PlayerTurnBanner implements PlayerOverlay {
  private host: HTMLElement | undefined;
  private display: TurnBannerDisplay | undefined;
  /** The banners standing at the lists, each in its anchor. */
  private attached: TurnBannerDisplay[] = [];
  private readonly watch = new TurnWatch();
  private readonly fights = new FightWatch();
  private unsubscribe: (() => void) | undefined;
  /** Ends the table's dim of a turn (`turnDim`). */
  private dimTimer: number | null = null;
  /** Lowers the lists again once the dim has faded. */
  private litTimer: number | null = null;

  constructor(private readonly app: App, private readonly settings: SettingsService) {}

  mount(parent: HTMLElement): void {
    this.destroyDisplays();
    this.host = parent.createDiv({ cls: 'atlas-player-turn-banner', attr: { 'aria-live': 'polite' } });
    this.display = this.displayIn(this.host);
  }

  private displayIn(host: HTMLElement, motion = TV_MOTION): TurnBannerDisplay {
    return new TurnBannerDisplay(
      host,
      (imagePath) => portraitSrc(this.app, imagePath),
      (banner) => {
        const standMs = this.settings.getLocalPlayerViewSettings().turnBannerSeconds * 1000;
        return banner.kind ? Math.max(standMs, FIGHT_BANNER_STAND_MS) : standMs;
      },
      motion,
    );
  }

  private displays(): TurnBannerDisplay[] {
    return [...(this.display ? [this.display] : []), ...this.attached];
  }

  /**
   * Shows the banners where the player view puts them: at every list drawn, else in the one place. The lists are
   * overlays mounted before this one, so they have been drawn for the state this banner announces.
   */
  private show(banners: TurnBanner[], fight?: FightMove): void {
    this.dropAttached();
    const host = this.host;
    const view = this.settings.getLocalPlayerViewSettings();
    // A fight starts and ends at the lists, as they slide in and out: its end at those leaving, every other banner at those staying
    const leaving = fight === 'end' ? '.atlas-player-initiative--leaving' : ':not(.atlas-player-initiative--leaving)';
    const lists = host && (view.turnBannerAtLists || fight)
      ? [...host.ownerDocument.querySelectorAll<HTMLElement>(`.atlas-player-initiative[data-edge]${leaving}`)]
      : [];
    if (!host || lists.length === 0) {
      this.display?.show(...banners);
      return;
    }
    this.display?.hide();
    const { facesPlayers } = this.settings.initiativeLayout();
    lists.forEach((list, index) => {
      const edge = list.dataset.edge as PlayersListEdge;
      // Measured in the overlays' own frame, which a table TV turns
      const box = listBox(list, host, facesPlayers && (edge === 'left' || edge === 'right'));
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

  private hide(): void {
    this.undim();
    for (const display of this.displays()) display.hide();
  }

  /**
   * A turn dims the table instead of naming itself (`turnDim`), for as long as its banner would stand: the lists
   * stay lit above the dim (`turn-banner.scss`), so the cards moving on to the turn stand out.
   */
  private dim(): void {
    const host = this.host;
    if (!host) return;
    this.undim();
    const view = host.ownerDocument.defaultView ?? window;
    if (this.litTimer !== null) view.clearTimeout(this.litTimer);
    this.litTimer = null;
    host.addClass('atlas-player-turn-banner--dim', 'atlas-player-turn-banner--lists-lit');
    this.dimTimer = view.setTimeout(() => this.undim(), this.settings.getLocalPlayerViewSettings().turnBannerSeconds * 1000);
  }

  /** The dim fades; the lists stay above it until it has, or they would be dimmed for the fade's length. */
  private undim(): void {
    const host = this.host;
    const view = host?.ownerDocument.defaultView ?? window;
    if (this.dimTimer !== null) view.clearTimeout(this.dimTimer);
    this.dimTimer = null;
    if (!host?.hasClass('atlas-player-turn-banner--dim')) return;
    host.removeClass('atlas-player-turn-banner--dim');
    this.litTimer = view.setTimeout(() => {
      this.litTimer = null;
      host.removeClass('atlas-player-turn-banner--lists-lit');
    }, DIM_FADE_MS);
  }

  private dropAttached(): void {
    for (const display of this.attached) display.destroy();
    this.attached = [];
    this.host?.querySelectorAll('.atlas-player-turn-banner__anchor').forEach((anchor) => anchor.remove());
  }

  private destroyDisplays(): void {
    this.undim();
    this.dropAttached();
    this.display?.destroy();
    this.display = undefined;
  }

  present(store: StoreApi<ViewAtlasState>): void {
    this.hold();
    this.watch.reset();
    this.fights.reset();
    this.look(store.getState());
    this.unsubscribe = store.subscribe((state) => this.look(state));
  }

  /** While the GM browses another scene tab nothing of that tab is announced; the banner standing ends as it would. */
  hold(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  releaseSource(): void {
    this.hold();
    this.hide();
  }

  destroy(): void {
    this.hold();
    this.destroyDisplays();
  }

  private look(state: ViewAtlasState): void {
    const localPlayerView = this.settings.getLocalPlayerViewSettings();
    // Names as the players' list shows them
    const showNames = localPlayerView.showTokenNameplates || localPlayerView.showInitiativeNames;
    const mapShowsNameplates = localPlayerView.showInitiativeNames || (state.tokenSettings?.showNameplates ?? false);
    const banner = this.watch.next(state, { kind: 'players', showNames, mapShowsNameplates });
    const change = this.fights.next(state);
    const shown = localPlayerView.showInitiative && state.initiativeTrackerOpen && this.settings.initiativeTurnOptions().banner;
    if (!state.initiative?.isActive) {
      // The fight ended: its banner replaces the turn's; a turn's banner leaves with the fight
      const displays = this.displays();
      if (change === 'ended' && shown) this.show([fightBanner('ended')], 'end');
      else if (displays.some((display) => display.showing) && !displays.some((display) => display.showsFightEnd)) this.hide();
      return;
    }
    if (!shown) return;
    // A fight that starts says so at the lists, then names its first turn, which a dimming table (`turnDim`) leaves unsaid
    const named = banner && !localPlayerView.turnDim ? [banner] : [];
    if (change === 'started') this.show([fightBanner('started'), ...named], 'start');
    else if (named.length > 0) this.show(named);
    else if (banner) this.dim();
  }
}
