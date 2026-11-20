import { setIcon } from 'obsidian';
import { createTokenPortrait } from '../../packages/components/shared/tokenPortraitElement';
import { animatePanelIn, animatePanelOutAndRemove } from '../../ui/panelMotion';
import { t } from '../../i18n';
import type { TurnBanner } from './turnBanner';
import './turn-banner.scss';

/** How long a banner stands before it leaves, unless told otherwise. */
export const TURN_BANNER_MS = 2000;

/** The largest the players' turn banner grows. */
export const MAX_TURN_BANNER_SCALE = 5;

/** How a banner comes and goes: `enter` is told how long it stands, `leave` removes it once gone. */
export interface TurnBannerMotion {
  enter(element: HTMLElement, standMs: number): void;
  leave(element: HTMLElement): void;
}

const PANEL_MOTION: TurnBannerMotion = { enter: animatePanelIn, leave: (element) => animatePanelOutAndRemove(element) };

/** The address of a portrait's image by its vault path, or null to draw none. */
export type PortraitSource = (imagePath: string) => string | null;

/** The icon a fight's own banner shows where a turn's shows its portrait. */
const FIGHT_ICONS = { 'fight-start': 'swords', 'fight-end': 'flag' } as const;

/**
 * Draws `banner` into `parent`: the portrait, then the round or "Turn" above the name; a fight's
 * start or end its icon and its sentence.
 */
export function renderTurnBanner(parent: HTMLElement, banner: TurnBanner, portraitSrc: PortraitSource): HTMLElement {
  const element = parent.createDiv({ cls: 'atlas-turn-banner', attr: { role: 'status' } });
  // Its border flashes in the combatant's colour
  if (banner.color) element.style.setProperty('--atlas-turn-banner-flash', banner.color);
  if (banner.kind) {
    element.addClass(`atlas-turn-banner--${banner.kind}`);
    setIcon(element.createDiv({ cls: 'atlas-turn-banner__icon', attr: { 'aria-hidden': 'true' } }), FIGHT_ICONS[banner.kind]);
    element.createDiv({ cls: 'atlas-turn-banner__text' }).createSpan({ cls: 'atlas-turn-banner__title', text: banner.title ?? '' });
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
