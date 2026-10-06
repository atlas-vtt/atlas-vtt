import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App as ObsidianApp } from 'obsidian';
import FantasyStatblock from '../react/components/FantasyStatblock';
import { toTokenVitals, type TokenVitals } from './statblockVitalsSync';
import type { NotePreviewUIManager, PreviewAnchorRef, TokenPreviewAnchor } from './NotePreviewUIManager';
import './statblock-preview-window.scss';
import { previewEdgeGaps } from '../react/components/statblock/previewEdgeGap';

/**
 * Floating CMD+hover preview window for token statblocks: of a token placed on
 * a map, which its map's preview manager tracks, or of a token in a list (the
 * library, a collection being exported or imported).
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

  constructor(
    private app: ObsidianApp,
    notePath: string,
    originatingToken: TokenPreviewAnchor | TokenVitals,
    manager: NotePreviewUIManager | null,
    initialPos?: { x: number; y: number },
    /** The note's text when it is not in the vault, e.g. inside a collection being imported. */
    noteContent?: string,
    viewId?: string,
  ) {
    this.notePath = notePath;
    this.originatingPin = 'type' in originatingToken ? originatingToken : null;
    this.manager = manager;
    this.initialPos = initialPos;

    this.element = document.body.createDiv({ cls: 'atlas-statblock-preview-window' });
    this.element.setAttribute('tabindex', '-1');

    if (initialPos) {
      this.setPosition(initialPos.x, initialPos.y);
    }

    // The hovered token's vitals; the statblock mirrors them.
    const vitals = [toTokenVitals(originatingToken)];
    this.reactRoot = createRoot(this.element);
    this.reactRoot.render(
      React.createElement(FantasyStatblock, {
        notePath,
        noteContent,
        viewId,
        app: this.app,
        tokens: vitals,
      }),
    );

    // The statblock mounts after this constructor returns, so the window only
    // reaches its final size later. Re-clamp on every size change, otherwise
    // the first measurement is of an empty box and the window can end up
    // hanging off the edge of the screen.
    this.resizeObserver = new ResizeObserver(() => this.reposition());
    this.resizeObserver.observe(this.element);
  }

  private reposition(): void {
    if (this.initialPos) {
      this.setPosition(this.initialPos.x, this.initialPos.y);
    }
  }

  setPosition(x: number, y: number) {
    if (!this.element) return;

    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    // A theme that draws around the preview asks for more room than this.
    const gaps = previewEdgeGaps(this.element.ownerDocument, 20);

    this.element.classList.add('atlas-statblock-preview-window--measuring');

    window.requestAnimationFrame(() => {
      if (!this.element) return;

      // Cap the window to the viewport first, so the measurement below is of
      // the clamped box; the card body scrolls when the statblock is taller.
      this.element.style.maxHeight = `${winHeight - gaps.block * 2}px`;

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
        if (finalY < gaps.block) {
          finalY = winHeight - elementHeight - gaps.block;
        }
      }

      finalX = Math.max(gaps.inline, finalX);
      finalY = Math.max(gaps.block, finalY);

      this.element.style.left = `${finalX}px`;
      this.element.style.top = `${finalY}px`;
      this.element.classList.remove('atlas-statblock-preview-window--measuring');
    });
  }

  hide(_force?: boolean): void {
    if (this.closing) return;
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
    return false;
  }
}
