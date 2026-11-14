import { Graphics, type Container, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../types/visionTypes';
import { trackPointer } from '../measure/pointerTrack';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';
import { DRAW_DRAG_THRESHOLD } from './drawGesture';
import { endedTyping } from './typingEnds';

/** What a press of the Draw tool's Text mode asks of, and tells, whoever types the text. */
export interface TextPlacingHost {
  /** Whether a press starts a text now: the Text mode is in hand, on the GM's view of the canvas. */
  ready(): boolean;
  /** How high one line of the tool's text is, world pixels: the drag's mark is that high. */
  lineHeight(): number;
  /** The colour the drag's mark is drawn in. */
  accent(): number;
  /** A text starts at the world point `at`: as wide as its words for a click (`width` null), `width` wide from `at` for a drag. */
  place(at: Point, width: number | null): void;
}

/**
 * The Draw tool's presses in its Text mode, on a viewport: a press released in place starts a
 * text as wide as its words there, a drag one that is as wide as the drag and wraps. While the
 * drag lasts a mark shows the line the first words will stand in. The primary button only, and no
 * press that a pin, a badge, a handle or a text that is there took (`ownKind`: that text is opened),
 * nor the press that ended the typing of the text before (`endedTyping`); a lost pointer starts nothing.
 */
export class TextPlacing {
  private enabled = false;
  private stop: (() => void) | null = null;
  private readonly mark = new Graphics({ label: 'text-width', eventMode: 'none' });

  /** `chrome` takes the drag's mark: the GM's own layer, above the map. */
  constructor(private readonly viewport: Viewport, chrome: Container, private readonly host: TextPlacingHost) {
    chrome.addChild(this.mark);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.viewport[enabled ? 'on' : 'off']('pointerdown', this.onPointerDown);
    if (!enabled) this.cancel();
  }

  /** The dispatch that claims presses listens now: these presses are heard after it. */
  hearPressesLast(): void {
    if (this.enabled) hearPressesLast(this.viewport, this.onPointerDown);
  }

  /** Drops the drag under way: no text starts. Nothing is drawn anew where none was under way. */
  cancel(): void {
    if (!this.stop) return;
    this.stop();
    this.stop = null;
    this.mark.clear();
  }

  destroy(): void {
    this.setEnabled(false);
    this.mark.destroy();
  }

  private readonly onPointerDown = (e: FederatedPointerEvent): void => {
    if (!isPrimaryPress(e) || isHandled(e) || endedTyping(e.nativeEvent) || !this.host.ready()) return;
    this.cancel();
    const pressed = { x: e.global.x, y: e.global.y };
    const from = this.world(e);
    let to: Point | null = null;
    const end = (place: boolean): void => {
      const dragged = to;
      this.cancel();
      if (!place) return;
      if (dragged) this.host.place({ x: Math.min(from.x, dragged.x), y: from.y }, Math.abs(dragged.x - from.x));
      else this.host.place(from, null);
    };
    this.stop = trackPointer(this.viewport, this.viewport.options.events.domElement, {
      onMove: (move) => {
        if (to === null && Math.hypot(move.global.x - pressed.x, move.global.y - pressed.y) <= DRAW_DRAG_THRESHOLD) return;
        to = this.world(move);
        this.draw(from, to);
      },
      onUp: () => end(true),
      onAbort: () => end(false),
    });
  };

  private world(e: FederatedPointerEvent): Point {
    const { x, y } = this.viewport.toWorld(e.global);
    return { x, y };
  }

  /** The line the first words will stand in: as wide as the drag, one line high, around where the press began. */
  private draw(from: Point, to: Point): void {
    const zoom = Math.abs(this.viewport.scale.x) || 1;
    const height = this.host.lineHeight();
    const left = Math.min(from.x, to.x);
    this.mark.clear();
    this.mark.rect(left, from.y - height / 2, Math.abs(to.x - from.x), height);
    this.mark.fill({ color: this.host.accent(), alpha: 0.12 });
    this.mark.stroke({ color: this.host.accent(), alpha: 0.9, width: 1.5 / zoom });
  }
}
