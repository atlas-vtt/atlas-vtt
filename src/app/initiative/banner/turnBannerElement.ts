import { createTokenPortrait } from '../../packages/components/shared/tokenPortraitElement';
import { animatePanelIn, animatePanelOutAndRemove } from '../../ui/panelMotion';
import { t } from '../../i18n';
import type { TurnBanner } from './turnBanner';
import './turn-banner.scss';

/** How long a banner stands before it leaves, unless told otherwise. */
export const TURN_BANNER_MS = 2000;

/** The largest the players' turn banner grows. */
export const MAX_TURN_BANNER_SCALE = 5;

/** The window, in CSS pixels, in which the players' banner is drawn at its own size; it grows with larger windows. */
const BANNER_BASE_WINDOW = { long: 960, short: 540 } as const;

/**
 * How large the players' turn banner is drawn in a window of `width` × `height` CSS pixels: twice its own size on a
 * 1080p TV, in step with the window and the same whichever way a table TV is turned, never smaller than its own size.
 */
export function turnBannerScaleFor(width: number, height: number): number {
  const fit = Math.min(Math.max(width, height) / BANNER_BASE_WINDOW.long, Math.min(width, height) / BANNER_BASE_WINDOW.short);
  return Number.isFinite(fit) ? Math.min(Math.max(fit, 1), MAX_TURN_BANNER_SCALE) : 1;
}

/** How a banner comes and goes: `enter` is told how long it stands, `leave` removes it once gone. */
export interface TurnBannerMotion {
  enter(element: HTMLElement, standMs: number): void;
  leave(element: HTMLElement): void;
}

/** How long a fight's banner takes to dissolve (`atlas-fight-banner-out` in `turn-banner.scss`). */
const FIGHT_BANNER_LEAVE_MS = 700;

/**
 * A fight's own banner moves by its stylesheet alone (`turn-banner.scss`): its shade widens in, its words resolve out of a
 * blur and its rules draw outward; `--leaving` dissolves it. Keyframes of its own document, so a player window that
 * covers the main one moves it too.
 */
const FIGHT_BANNER_MOTION: TurnBannerMotion = {
  enter(element, standMs) {
    element.style.setProperty('--atlas-turn-banner-stand', `${standMs}ms`);
  },
  leave(element) {
    element.addClass('atlas-turn-banner--leaving');
    (element.ownerDocument.defaultView ?? window).setTimeout(() => element.remove(), FIGHT_BANNER_LEAVE_MS);
  },
};

/** Whether `element` is a fight's own banner, which keeps its own motion whoever shows it. */
function isFightBanner(element: HTMLElement): boolean {
  return element.hasClass('atlas-turn-banner--fight');
}

/** `motion` for a turn's banner, a fight's own motion for a fight's. */
export function withFightBannerMotion(motion: TurnBannerMotion): TurnBannerMotion {
  return {
    enter: (element, standMs) => (isFightBanner(element) ? FIGHT_BANNER_MOTION : motion).enter(element, standMs),
    leave: (element) => (isFightBanner(element) ? FIGHT_BANNER_MOTION : motion).leave(element),
  };
}

const PANEL_MOTION: TurnBannerMotion = withFightBannerMotion({ enter: animatePanelIn, leave: (element) => animatePanelOutAndRemove(element) });

/** The address of a portrait's image by its vault path, or null to draw none. */
export type PortraitSource = (imagePath: string) => string | null;

/**
 * Draws `banner` into `parent`: the portrait, then the round or "Turn" above the name; a fight's
 * start or end its sentence between two rules, on a shade of its own.
 */
export function renderTurnBanner(parent: HTMLElement, banner: TurnBanner, portraitSrc: PortraitSource): HTMLElement {
  const element = parent.createDiv({ cls: 'atlas-turn-banner', attr: { role: 'status' } });
  // Its border flashes in the combatant's colour
  if (banner.color) element.style.setProperty('--atlas-turn-banner-flash', banner.color);
  if (banner.kind) {
    element.addClass('atlas-turn-banner--fight', `atlas-turn-banner--${banner.kind}`);
    element.createSpan({ cls: 'atlas-fight-banner__rule atlas-fight-banner__rule--before', attr: { 'aria-hidden': 'true' } });
    element.createSpan({ cls: 'atlas-fight-banner__title', text: banner.title ?? '' });
    element.createSpan({ cls: 'atlas-fight-banner__rule atlas-fight-banner__rule--after', attr: { 'aria-hidden': 'true' } });
    return element;
  }
  const src = banner.portrait ? portraitSrc(banner.portrait.imagePath) : null;
  if (banner.portrait && src !== null) {
    createTokenPortrait(element, { src, alt: '', showRing: banner.portrait.showRing, ringColor: banner.portrait.ringColor, cls: 'atlas-turn-banner__portrait' });
  } else {
    element.addClass('atlas-turn-banner--text');
  }
  const text = element.createDiv({ cls: 'atlas-turn-banner__text' });
  const eyebrow = text.createSpan({ cls: 'atlas-turn-banner__eyebrow', text: banner.round === null ? t('initiative.bannerTurn') : t('initiative.bannerRound', { round: banner.round }) });
  if (banner.round !== null) eyebrow.addClass('atlas-turn-banner__eyebrow--round');
  if (banner.title !== null) text.createSpan({ cls: 'atlas-turn-banner__title', text: banner.title });
  return element;
}

/**
 * The banner standing in `host`: one at a time, shown for `standMs` and then gone. Several
 * given at once follow each other (a fight's start, then its first turn). New banners
 * replace what stands at once; hiding lets it leave with the panels' motion.
 */
export class TurnBannerDisplay {
  private current: HTMLElement | null = null;
  private standing: TurnBanner | null = null;
  private waiting: TurnBanner[] = [];
  private timer: number | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly portraitSrc: PortraitSource,
    /** How long each banner stands. */
    private readonly standMs: (banner: TurnBanner) => number = () => TURN_BANNER_MS,
    private readonly motion: TurnBannerMotion = PANEL_MOTION,
  ) {}

  show(...banners: TurnBanner[]): void {
    this.removeNow();
    this.waiting = banners;
    this.showNext();
  }

  /** The standing banner leaves, and those waiting after it with it. */
  hide(): void {
    this.clearTimer();
    this.waiting = [];
    this.standing = null;
    const element = this.current;
    this.current = null;
    if (element) this.motion.leave(element);
  }

  /** Whether a banner stands now. */
  get showing(): boolean {
    return this.current !== null;
  }

  /** Whether the banner standing says the fight ended: one that outlives the fight on purpose. */
  get showsFightEnd(): boolean {
    return this.standing?.kind === 'fight-end';
  }

  private showNext(): void {
    const banner = this.waiting.shift();
    if (!banner) {
      this.hide();
      return;
    }
    this.clearTimer();
    this.current?.remove();
    const element = renderTurnBanner(this.host, banner, this.portraitSrc);
    this.current = element;
    this.standing = banner;
    const standMs = this.standMs(banner);
    this.motion.enter(element, standMs);
    this.timer = this.window().setTimeout(() => this.showNext(), standMs);
  }

  destroy(): void {
    this.removeNow();
  }

  private removeNow(): void {
    this.clearTimer();
    this.current?.remove();
    this.current = null;
    this.standing = null;
    this.waiting = [];
  }

  private clearTimer(): void {
    if (this.timer !== null) this.window().clearTimeout(this.timer);
    this.timer = null;
  }

  private window(): Window {
    return this.host.ownerDocument.defaultView ?? window;
  }
}
