import { createElement, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { App } from 'obsidian';
import type { StatblockTokenActions } from '../../../react/components/statblock/StatblockTokenResources';
import type { TokenVitals } from '../../../services/statblockVitalsSync';
import { portalHost } from '../../../host/portalHost';
import { LinkedStatblock } from '../../../statblocks/render/LinkedStatblock';
import type { TokenRollContext } from '../../../types/diceRollOrigin';
import './gm-screen-drawing.scss';

/** What the DM screen hands a statblock it shows (`DMStatblocksPane`): the note, its tokens on the map and their controls. */
export interface DrawnStatblockProps {
  readonly path: string;
  readonly tokens: readonly TokenVitals[];
  readonly viewId: string | undefined;
  readonly originContext: TokenRollContext | undefined;
  readonly tokenActions: StatblockTokenActions;
}

/** A statblock drawn for the devices that show it. */
export interface Drawing {
  draw(props: DrawnStatblockProps): void;
  /** The map whose dice its roll links roll on now: the view it was last put in place for, which a draw just made may not be yet. */
  rollsOn(): string | undefined;
  dispose(): void;
}

/** Hands on, once React has put a drawing in place, which map its rolls go to (`useStatblockDiceRolling` reads it in a layout effect, which runs first). */
function Placed({ viewId, placed, children }: { readonly viewId: string | undefined; readonly placed: (viewId: string | undefined) => void; readonly children: ReactNode }): ReactNode {
  useLayoutEffect(() => {
    placed(viewId);
  });
  return children;
}

/** How long the drawing must stay unchanged before it counts as settled: Markdown and a layout's scripts draw after React. */
export const SETTLE_MS = 150;
/** At most twice a second: a statblock is read again no sooner than this after it was last read. */
export const RESEND_MS = 500;
const SKELETON = '.atlas-statblock-skeleton';

/**
 * One statblock drawn as the DM screen draws it, in a place nobody sees: `LinkedStatblock` in a feed of the
 * DM screen's narrowest width, which follows its note, its template, the bestiary and the tokens it is
 * given. Whenever the drawing has settled (no skeleton, nothing changed for `SETTLE_MS`), and at most every
 * `RESEND_MS`, `settled` is handed the element that holds it.
 */
export class StatblockDrawing implements Drawing {
  private readonly host: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly root: Root;
  private readonly observer: MutationObserver;
  private timer: number | null = null;
  private readAt = Number.NEGATIVE_INFINITY;
  private disposed = false;
  private placedOn: string | undefined;

  constructor(private readonly app: App, private readonly settled: (drawing: HTMLElement) => void) {
    // Laid out, so blocks that measure themselves choose as in a feed, but never seen, focused or read out.
    this.host = portalHost().createDiv({ cls: 'atlas-gm-screen-drawing', attr: { inert: '', 'aria-hidden': 'true' } });
    this.feed = this.host.createDiv({ cls: 'atlas-vtt-plugin' }).createDiv({ cls: 'atlas-dm-statblock-feed-item' });
    this.root = createRoot(this.feed);
    this.observer = new MutationObserver(() => this.changed());
    this.observer.observe(this.feed, { subtree: true, childList: true, attributes: true, characterData: true });
  }

  /** Draws the statblock with these props; a drawing already shown follows them in place. */
  draw(props: DrawnStatblockProps): void {
    if (this.disposed) return;
    const placed = (viewId: string | undefined): void => {
      this.placedOn = viewId;
    };
    this.root.render(createElement(Placed, { viewId: props.viewId, placed, children: createElement(LinkedStatblock, {
      app: this.app,
      path: props.path,
      variant: 'feed',
      tokens: [...props.tokens],
      viewId: props.viewId,
      originContext: props.originContext,
      pressableCounters: true,
      tokenActions: props.tokenActions,
    }) }));
  }

  rollsOn(): string | undefined {
    return this.placedOn;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.root.unmount();
    this.host.remove();
  }

  private changed(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    const wait = Math.max(SETTLE_MS, this.readAt + RESEND_MS - performance.now());
    this.timer = window.setTimeout(() => this.read(), wait);
  }

  private read(): void {
    this.timer = null;
    if (this.disposed || this.feed.querySelector(SKELETON) !== null || !this.feed.hasChildNodes()) return;
    this.readAt = performance.now();
    this.settled(this.feed);
  }
}
