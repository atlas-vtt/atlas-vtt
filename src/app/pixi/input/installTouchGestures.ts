import type { Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { feelLongPress } from '../../input/longPress';
import { noteTouchMenu } from '../../input/touchMenuPoint';
import { prefersReducedMotion } from '../../utils/motion';
import type { LayerVisibility } from '../playerSafeFrame';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { NO_HOST, type GestureClock, type GestureEffects, type GestureHost } from './gestureTypes';
import { LongPressRing } from './LongPressRing';
import { LookOnlyPointer } from './lookOnlyPointer';
import { PointerGate } from './pointerGate';
import { TouchGestures } from './touchGestures';
import { TouchNavigation } from './TouchNavigation';
import { TouchSource } from './touchSource';

/** What the view tells the gestures once its tools exist, besides what a finger does there. */
export interface MapGestureHost extends GestureHost {
  undo(): void;
  redo(): void;
  /** A pen touched the map: the device has one. */
  penTouched(): void;
  /** A finger was held on the empty map and lifted in place: `x`, `y` in the canvas' pixels, `at` in the window's. */
  emptyMapMenu?(x: number, y: number, at: { x: number; y: number }): void;
  /** Two fingers rested on a map that is only looked at: the looking ends. */
  endLooking?(): void;
}

/** The fingers on a map's canvas, turned into what its tools understand (`TouchGestures`). */
export interface MapGestures {
  setHost(host: MapGestureHost): void;
  /** What a picture of the scene and the players' picture leave out. */
  hiddenLayers(): LayerVisibility[];
  destroy(): void;
}

const NO_MAP_HOST: MapGestureHost = { ...NO_HOST, undo: () => undefined, redo: () => undefined, penTouched: () => undefined };

/**
 * Puts the gesture layer between the browser and the map's tools. Nothing here runs per frame,
 * and nothing runs for a mouse: the layer hears pointer events only, and looks at fingers and pens.
 */
export function installTouchGestures(app: Application, viewport: Viewport, canvas: HTMLCanvasElement): MapGestures {
  let host: MapGestureHost = NO_MAP_HOST;
  const win = canvas.ownerDocument.defaultView ?? window;
  const events = app.renderer.events;
  const navigation = new TouchNavigation(viewport);
  const ring = new LongPressRing(viewport, app.ticker, {
    accent: () => cssColorToHexNumber(getObsidianAccentColor()),
    reducedMotion: () => prefersReducedMotion(canvas),
  });
  const clock: GestureClock = {
    now: () => performance.now(),
    setTimeout: (run, ms) => win.setTimeout(run, ms),
    clearTimeout: (id) => win.clearTimeout(id),
  };

  const effects: GestureEffects = {
    press: (id) => gate.press(id),
    cancelPress: (id, byBrowser) => {
      const press = gate.pressOf(id);
      if (!byBrowser) source.cancelPointer(id, press?.global.x ?? 0, press?.global.y ?? 0);
      gate.cancel(id);
    },
    secondaryClick: (id) => {
      const press = gate.pressOf(id);
      if (!press) return;
      noteTouchMenu(press.clientX, press.clientY);
      feelLongPress(win);
      gate.secondaryClick(id);
    },
    heldEmptyMap: (id) => {
      const press = gate.pressOf(id);
      if (!press) return;
      noteTouchMenu(press.clientX, press.clientY);
      host.emptyMapMenu?.(press.global.x, press.global.y, { x: press.clientX, y: press.clientY });
    },
    beginNavigation: () => navigation.begin(),
    pan: (dx, dy) => navigation.pan(dx, dy),
    pinch: (fromX, fromY, fromSpan, toX, toY, toSpan) => navigation.pinch(fromX, fromY, fromSpan, toX, toY, toSpan),
    endNavigation: (glide) => navigation.end(glide),
    zoomStep: (x, y, direction) => navigation.zoomStep(x, y, direction),
    pairHeld: () => {
      feelLongPress(win);
      host.endLooking?.();
    },
    undo: () => host.undo(),
    redo: () => host.redo(),
    showRing: (x, y, ms) => ring.show(x, y, ms),
    hideRing: () => ring.hide(),
  };

  const gestures = new TouchGestures(host, effects, clock);
  const source = new TouchSource(
    canvas,
    (out, clientX, clientY) => events.mapPositionToPoint(out, clientX, clientY),
    gestures,
    () => host.penTouched(),
    (id, released) => gate.forget(id, released),
  );
  const lookOnly = new LookOnlyPointer(navigation);
  const gate = new PointerGate(events, viewport, source.admits, {
    active: () => host.fingerMode() === 'look',
    hear: (event) => lookOnly.hear(event),
  });

  return {
    setHost: (next) => {
      host = next;
      gestures.setHost(next);
    },
    hiddenLayers: () => [{ layer: ring.layer, visible: false }],
    destroy: () => {
      gestures.destroy();
      source.destroy();
      gate.destroy();
      ring.destroy();
    },
  };
}
