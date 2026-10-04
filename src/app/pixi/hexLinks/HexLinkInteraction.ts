import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { NotePin } from '../../types';
import type { ViewAtlasStore } from '../../storeFactory';
import { openContextMenuGlobal } from '../../react/root/ContextMenuContext';
import { watchClick } from '../utils/clickRelease';
import { dispatchPinAction } from '../utils/pinActions';
import { addonObjectMenuEntries } from '../../addons/addonHost';
import type { HexLinkRenderer } from './HexLinkRenderer';

/** What the viewport-level pointer dispatch calls for linked hexes. */
export interface HexLinkPointerHandlers {
  hitTest(worldX: number, worldY: number): string | null;
  /** The pointer moved onto a linked hex, or off every linked hex (null). */
  hover(pinId: string | null, e?: FederatedPointerEvent): void;
  /** Left button went down on a linked hex. The event stays unhandled, so dragging still pans or selects. */
  press(pinId: string, e: FederatedPointerEvent): void;
  /** The right button was released in place on a linked hex. */
  openContextMenu(pinId: string, e: FederatedPointerEvent): void;
}

export interface HexLinkInteractionOptions {
  viewport: Viewport;
  store: ViewAtlasStore;
  renderer: HexLinkRenderer;
  /** Hover changes, so Cmd/Ctrl-hover previews the linked note like a pin's. */
  onNoteHover: (type: 'over' | 'out', pin: NotePin, e?: FederatedPointerEvent) => void;
}

/** Linked hexes light up on hover, open their note on click and offer a menu on right-click. */
export class HexLinkInteraction implements HexLinkPointerHandlers {
  private hoveredPinId: string | null = null;
  private releasePress: (() => void) | null = null;

  constructor(private readonly options: HexLinkInteractionOptions) {}

  private pin(pinId: string): NotePin | undefined {
    return this.options.store.getState().objects.pins[pinId];
  }

  hitTest(worldX: number, worldY: number): string | null {
    return this.options.renderer.hitTest(worldX, worldY);
  }

  hover(pinId: string | null, e?: FederatedPointerEvent): void {
    if (pinId === this.hoveredPinId) return;
    const previous = this.hoveredPinId ? this.pin(this.hoveredPinId) : undefined;
    if (previous) this.options.onNoteHover('out', previous, e);
    this.hoveredPinId = pinId;
    this.options.renderer.setHovered(pinId);
    const next = pinId ? this.pin(pinId) : undefined;
    if (next) this.options.onNoteHover('over', next, e);
  }

  press(pinId: string, e: FederatedPointerEvent): void {
    this.releasePress?.();
    const { viewport, renderer } = this.options;
    renderer.setPressed(pinId);
    // Once the pointer travels, the press is a pan or a marquee and the hex lets go
    this.releasePress = watchClick(
      viewport,
      e,
      () => {
        const pin = this.pin(pinId);
        if (pin) dispatchPinAction('open', pin);
      },
      () => {
        renderer.setPressed(null);
        this.releasePress = null;
      },
    );
  }

  openContextMenu(pinId: string, e: FederatedPointerEvent): void {
    const pin = this.pin(pinId);
    if (!pin) return;
    const position = { x: e.clientX, y: e.clientY };
    openContextMenuGlobal(
      [
        { type: 'item', label: 'Open Note', icon: 'file-text', onClick: () => dispatchPinAction('open', pin) },
        { type: 'item', label: 'Change Note', icon: 'edit', onClick: () => dispatchPinAction('edit', pin) },
        ...addonObjectMenuEntries(this.options.store, 'pin', pin.id),
        {
          type: 'item',
          label: 'Unlink Hex',
          icon: 'unlink',
          destructive: true,
          onClick: () => this.options.store.getState().deleteMapObject('pin', pin.id),
        },
      ],
      position,
    );
  }

  destroy(): void {
    this.releasePress?.();
  }
}
