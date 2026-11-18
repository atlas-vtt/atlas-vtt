import type { PressClock } from '../../input/longPress';

/**
 * What one finger does on the map, by the tool in hand:
 * - `'objects'` (the move and select tools): on a token, pin, drawing or handle it is the tool;
 *   on the empty map it pans, a tap stays a tap, and a long press draws the marquee;
 * - `'tool'`: it is the tool wherever it lands, as the left button is;
 * - `'navigate'` (a drawing tool on a device whose pen draws): it pans, and a tap is the tool's click;
 * - `'direct'`: something took the press before the map's tools could (tokens being placed), so
 *   nothing is held back or sent again.
 */
export type FingerMode = 'objects' | 'tool' | 'navigate' | 'direct';

/** What the gestures ask of the view's tools. */
export interface GestureHost {
  fingerMode(): FingerMode;
  /** Asked right after a press reached the tools: nothing on the map took it, so a drag would draw the marquee. */
  pressedEmptyMap(): boolean;
  /** Whether a secondary click at the point of the canvas opens a menu. */
  menuAt(x: number, y: number): boolean;
  /**
   * Whether a tap at the point of the canvas does something although its press counts as one on the
   * empty map (a linked hex opens its note, and a drag from it still pans): two taps there are two
   * such taps and no double tap. A host without it has nothing of the kind.
   */
  tapActsAt?(x: number, y: number): boolean;
}

/** What the gestures do; every point is in the canvas' own pixels. */
export interface GestureEffects {
  /** Hands the finger's press, held back until now, to the tools as a press of the primary button. */
  press(id: number): void;
  /** Ends the press the tools were handed as a lost pointer; `byBrowser` when the browser has told them already. */
  cancelPress(id: number, byBrowser: boolean): void;
  /** A press and release of the secondary button where the finger came down. */
  secondaryClick(id: number): void;
  beginNavigation(): void;
  pan(dx: number, dy: number): void;
  /** Two fingers went from a middle and a span to another. */
  pinch(fromX: number, fromY: number, fromSpan: number, toX: number, toY: number, toSpan: number): void;
  endNavigation(glide: boolean): void;
  /** One step of zoom about a point: in (1) or out (-1). */
  zoomStep(x: number, y: number, direction: 1 | -1): void;
  undo(): void;
  redo(): void;
  /** A ring closes around the finger within `ms`, when its long press fires. */
  showRing(x: number, y: number, ms: number): void;
  hideRing(): void;
}

export interface GestureClock extends PressClock {
  now(): number;
}

/** A host for a view whose tools are not there yet: every finger is the tool, and nothing has a menu. */
export const NO_HOST: GestureHost = {
  fingerMode: () => 'tool',
  pressedEmptyMap: () => false,
  menuAt: () => false,
};
