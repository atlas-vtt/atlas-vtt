import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App as ObsidianApp, setIcon } from 'obsidian';
import { LinkedStatblock, type LinkedStatblockProps } from '../statblocks/render/LinkedStatblock';
import type { LibraryTemplate } from '../statblocks/model/resolvedTypes';
import { toTokenVitals, type TokenVitals } from './statblockVitalsSync';
import type { NotePreviewUIManager, PreviewAnchorRef, TokenPreviewAnchor } from './NotePreviewUIManager';
import './statblock-preview-window.scss';
import { previewEdgeGaps } from '../react/components/statblock/previewEdgeGap';
import type { TokenRollContext } from '../types/diceRollOrigin';
import { createPinButton, keepPreviewReachable, showPinState, startPreviewWindowDrag, type PreviewWindowReach } from './previewWindowControls';
import { previewReach } from './previewWindowLayout';
import { viewFrame } from '../packages/components/primitives/useKeepInView';
import { observeResize } from '../utils/observeResize';
import { t } from '../i18n';

/** The card's top, which moves a map's preview: the name and title row of an Atlas statblock or a Fantasy Statblocks layout. */
const CARD_HEADER = '.atlas-sb-header, .atlas-sb-heading-row';
/** How far the pointer goes on the card's top before the window moves, so a click on a roll there stays a click. */
const HEADER_DRAG_THRESHOLD = 4;

/** A statblock note that is not in the vault, such as a note of a collection being imported. */
export interface OutsideNote {
  text: string;
  /** Templates that came with the note (its bundle's own), found before the vault's. */
  templates?: readonly LibraryTemplate[] | undefined;
}

/**
 * Keeps a statblock on its token's current values: calls `show` on each change,
 * with null once the token is gone, and returns how to stop.
 */
export type FollowVitals = (show: (vitals: TokenVitals | null) => void) => () => void;

/**
 * Floating CMD+hover preview window for token statblocks: of a token placed on
 * a map, which its map's preview manager tracks, or of a token in a list (the
 * library, a collection being exported or imported). A map's preview can be
 * pinned, so it stays open, and moved by its controls, as note previews can.
 */
export class StatblockPreviewWindow {
  public notePath: string;
  public element: HTMLElement | null = null;
  public originatingPin: PreviewAnchorRef | null;
  private manager: NotePreviewUIManager | null;
  private initialPos?: { x: number; y: number } | undefined;
  private reactRoot: Root | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private closing = false;
  private pinned = false;
  private pinButton: HTMLButtonElement | null = null;
  private controls: HTMLElement | null = null;
  /** The statblock's props but its tokens, which `followVitals` replaces. */
  private statblockProps: Omit<LinkedStatblockProps, 'tokens'>;
  private stopFollowing: (() => void) | null = null;
  private stopDrag: (() => void) | null = null;
  private reach: PreviewWindowReach | null = null;
  private stopFollowingFrame: (() => void) | null = null;

  constructor(
    private app: ObsidianApp,
    notePath: string,
    originatingToken: TokenPreviewAnchor | TokenVitals,
    manager: NotePreviewUIManager | null,
    initialPos?: { x: number; y: number },
    /** The note when it is not in the vault, e.g. inside a collection being imported. */
    outsideNote?: OutsideNote,
    viewId?: string,
    /** The view, scene and token a token on a map was hovered in; none for a token in a list. */
    originContext?: TokenRollContext,
    /** The document of the window the token was hovered in, which may be a popout's. */
    doc: Document = document,
  ) {
    this.notePath = notePath;
    this.originatingPin = 'type' in originatingToken ? originatingToken : null;
    this.manager = manager;
    this.initialPos = initialPos;

    this.element = doc.body.createDiv({ cls: 'atlas-statblock-preview-window' });
    this.element.setAttribute('tabindex', '-1');
    // Only a map's preview, which its manager keeps, can stay open.
    if (manager) this.addControls(this.element, manager);

    if (initialPos) {
      this.setPosition(initialPos.x, initialPos.y);
    }

    this.statblockProps = {
      viewId,
      originContext,
      app: this.app,
      path: notePath,
      noteText: outsideNote?.text,
      bundleTemplates: outsideNote?.templates,
      variant: 'hover',
    };
    const content = this.element.createDiv({ cls: 'atlas-statblock-preview-window__content' });
    this.reactRoot = createRoot(content);
    // The hovered token's vitals; the statblock mirrors them.
    this.renderStatblock(toTokenVitals(originatingToken));

    // The statblock mounts after this constructor returns, so the window only
    // reaches its final size later. Re-clamp on every size change, otherwise
    // the first measurement is of an empty box and the window can end up
    // hanging off the edge of the screen.
    this.resizeObserver = new ResizeObserver(() => this.reposition());
    this.resizeObserver.observe(this.element);
  }

  private renderStatblock(vitals: TokenVitals): void {
    this.reactRoot?.render(React.createElement(LinkedStatblock, { ...this.statblockProps, tokens: [vitals] }));
  }

  /** Keeps the statblock on the token's values while the window is open, which a pinned one may be for long; closes with the token. */
  followVitals(follow: FollowVitals): void {
    this.stopFollowing?.();
    this.stopFollowing = follow((vitals) => {
      if (vitals) this.renderStatblock(vitals);
      else this.hide(true);
    });
  }

  /**
   * The pin and close buttons, in a capsule above the card's top right edge
   * that also moves the window, as does the card's top. It shows while the
   * pointer or focus is in the window and while the window is pinned
   * (`statblock-preview-window.scss`). Neither can be moved out of the map's
   * view, nor left outside it when the view shrinks.
   */
  private addControls(element: HTMLElement, manager: NotePreviewUIManager): void {
    element.classList.add('atlas-statblock-preview-window--movable');
    const controls = element.createDiv({ cls: 'atlas-vtt-plugin atlas-statblock-preview-window__controls' });
    this.controls = controls;
    // The map's view, when the window hangs in its document, else the window.
    const mapView = manager.mapViewElement();
    const frameEl = mapView?.ownerDocument === element.ownerDocument ? mapView : null;
    const reach: PreviewWindowReach = {
      reach: () => previewReach(
        controls.getBoundingClientRect(),
        element.querySelector(CARD_HEADER)?.getBoundingClientRect() ?? null,
      ),
      frame: () => viewFrame(frameEl ?? element),
    };
    this.reach = reach;
    const stopObserving = frameEl ? observeResize([frameEl], () => this.reposition()) : (): void => undefined;
    const onWindowResize = (): void => this.reposition();
    element.win.addEventListener('resize', onWindowResize);
    this.stopFollowingFrame = (): void => {
      stopObserving();
      element.win.removeEventListener('resize', onWindowResize);
    };
    const dragEnded = (): void => { this.stopDrag = null; };
    const grip = controls.createDiv({ cls: 'atlas-statblock-preview-window__grip' });
    setIcon(grip, 'grip-vertical');
    this.pinButton = createPinButton(controls, 'atlas-statblock-preview-window__button', () => this.setPinned(!this.pinned));
    const close = controls.createEl('button', { cls: 'atlas-statblock-preview-window__button' });
    close.type = 'button';
    setIcon(close, 'x');
    close.setAttribute('aria-label', t('preview.close'));
    close.onclick = (): void => this.hide(true);

    // Pinning is the pin button's alone: rolling a die or dragging the window never pins it. A window
    // the user moves stays where they put it rather than following the pointer it opened at.
    controls.addEventListener('mousedown', (e) => {
      this.initialPos = undefined;
      this.stopDrag = startPreviewWindowDrag(element, e, reach, dragEnded);
    });
    element.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement | null;
      if (e.button === 0 && target?.closest(CARD_HEADER)) {
        this.initialPos = undefined;
        this.stopDrag = startPreviewWindowDrag(element, e, reach, dragEnded, HEADER_DRAG_THRESHOLD);
      }
    });
  }

  private setPinned(pinned: boolean): void {
    this.pinned = pinned;
    // A pinned window stays where it is, however its statblock grows.
    if (pinned) this.initialPos = undefined;
    this.element?.classList.toggle('is-pinned', pinned);
    if (this.pinButton) showPinState(this.pinButton, pinned);
  }

  /** Follows the pointer it opened at, or, once placed by the user, keeps its controls in view. */
  private reposition(): void {
    if (this.initialPos) {
      this.setPosition(this.initialPos.x, this.initialPos.y);
    } else if (this.element && this.reach) {
      keepPreviewReachable(this.element, this.reach);
    }
  }

  setPosition(x: number, y: number) {
    if (!this.element) return;

    const winWidth = this.element.win.innerWidth;
    const winHeight = this.element.win.innerHeight;
    // A theme that draws around the preview asks for more room than this.
    const gaps = previewEdgeGaps(this.element.ownerDocument, 20);
    // The controls hang above the window, so they need room above it too.
    const above = this.controls?.offsetHeight ?? 0;

    this.element.classList.add('atlas-statblock-preview-window--measuring');

    this.element.win.requestAnimationFrame(() => {
      if (!this.element) return;

      // Cap the window to the viewport first, so the measurement below is of
      // the clamped box; the card body scrolls when the statblock is taller.
      this.element.style.maxHeight = `${winHeight - gaps.block * 2 - above}px`;

      const rect = this.element.getBoundingClientRect();
      const elementWidth = rect.width || 400;
      const elementHeight = rect.height || 600;

      let finalX = x + 15;
      let finalY = y + 15;

      if (finalX + elementWidth > winWidth - gaps.inline) {
        finalX = x - elementWidth - 15;
        if (finalX < gaps.inline) {
          finalX = winWidth - elementWidth - gaps.inline;
        }
      }

      if (finalY + elementHeight > winHeight - gaps.block) {
        finalY = y - elementHeight - 15;
        if (finalY < gaps.block + above) {
          finalY = winHeight - elementHeight - gaps.block;
        }
      }

      finalX = Math.max(gaps.inline, finalX);
      finalY = Math.max(gaps.block + above, finalY);

      this.element.style.left = `${finalX}px`;
      this.element.style.top = `${finalY}px`;
      this.element.classList.remove('atlas-statblock-preview-window--measuring');
    });
  }

  hide(force?: boolean): void {
    if (this.closing || (this.pinned && !force)) return;
    this.closing = true;
    if (this.element) {
      this.element.classList.add('atlas-statblock-preview-window--closing');
      window.setTimeout(() => {
        this.destroy();
      }, 150);
    } else {
      this.destroy();
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.stopFollowing?.();
    this.stopFollowing = null;
    this.stopDrag?.();
    this.stopDrag = null;
    this.stopFollowingFrame?.();
    this.stopFollowingFrame = null;

    // Unmount asynchronously: React forbids unmounting while it is rendering,
    // which happens when destroy() runs from inside an effect.
    const root = this.reactRoot;
    this.reactRoot = null;
    if (root) window.setTimeout(() => root.unmount(), 0);

    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    this.manager?.handlePreviewClosed(this);
  }

  getIsPinned(): boolean {
    return this.pinned;
  }
}
