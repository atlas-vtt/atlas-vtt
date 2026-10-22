import { createTokenPortrait } from '../../packages/components/shared/tokenPortraitElement';
import { animatePanelIn, animatePanelOutAndRemove } from '../../ui/panelMotion';
import { t } from '../../i18n';
import type { TurnBanner } from './turnBanner';
import './turn-banner.scss';

/** How long a banner stands before it leaves. */
export const TURN_BANNER_MS = 2000;

/** The address of a portrait's image by its vault path, or null to draw none. */
export type PortraitSource = (imagePath: string) => string | null;

/** Draws `banner` into `parent`: the portrait, then the round or "Turn" above the name. */
export function renderTurnBanner(parent: HTMLElement, banner: TurnBanner, portraitSrc: PortraitSource): HTMLElement {
  const element = parent.createDiv({ cls: 'atlas-turn-banner', attr: { role: 'status' } });
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
 * The banner standing in `host`: one at a time, shown for `TURN_BANNER_MS` and then gone. A new
 * turn replaces it at once; hiding lets it leave with the panels' motion.
 */
export class TurnBannerDisplay {
  private current: HTMLElement | null = null;
  private timer: number | null = null;

  constructor(private readonly host: HTMLElement, private readonly portraitSrc: PortraitSource) {}

  show(banner: TurnBanner): void {
    this.removeNow();
    const element = renderTurnBanner(this.host, banner, this.portraitSrc);
    this.current = element;
    animatePanelIn(element);
    this.timer = this.window().setTimeout(() => this.hide(), TURN_BANNER_MS);
  }

  /** The standing banner leaves. */
  hide(): void {
    this.clearTimer();
    const element = this.current;
    this.current = null;
    if (element) animatePanelOutAndRemove(element);
  }

  /** Whether a banner stands now. */
  get showing(): boolean {
    return this.current !== null;
  }

  destroy(): void {
    this.removeNow();
  }

  private removeNow(): void {
    this.clearTimer();
    this.current?.remove();
    this.current = null;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.window().clearTimeout(this.timer);
    this.timer = null;
  }

  private window(): Window {
    return this.host.ownerDocument.defaultView ?? window;
  }
}
