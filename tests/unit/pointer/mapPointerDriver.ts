import type { Viewport } from 'pixi-viewport';
import { MapPointer, type MapPointerHost } from '../../../src/app/pixi/pointer/MapPointer';
import { listenToViewport } from '../../../src/app/pixi/pointer/viewportPointer';
import { EventEmitter } from '../../../src/app/utils/typedEmitter';
import { RESET_CURSOR, type PointerDriver } from './pointerOutcome';
import type { PointerWorld } from './pointerWorld';

/** As much of a viewport as the map's pointer reads: its events, an unzoomed world, the pan threshold and the cursor. */
export class FakeViewport extends EventEmitter {
  readonly threshold = 5;
  cursor = RESET_CURSOR;
  toWorld(point: { x: number; y: number }): { x: number; y: number } {
    return { x: point.x, y: point.y };
  }
}

/** A map's pointer fed by its listener on a viewport of its own, as a view binds it. */
export function boundPointer(host: MapPointerHost): { pointer: MapPointer; viewport: FakeViewport; canvas: HTMLCanvasElement; stop: () => void } {
  const pointer = new MapPointer(host);
  const viewport = new FakeViewport();
  const canvas = document.createElement('canvas');
  return { pointer, viewport, canvas, stop: listenToViewport(pointer, viewport as unknown as Viewport, canvas) };
}

/** The map's pointer, fed by its viewport listener, with every layer the world's fake. */
export function mapPointerDriver(world: PointerWorld): PointerDriver & { destroy(): void } {
  const view = { activeTool: 'select', selectedIds: [] as readonly string[] };
  const store = {
    getState: () => ({ activeTool: view.activeTool as never, selectedIds: view.selectedIds as string[], clearSelection: () => { view.selectedIds = []; } }),
  };
  const { pointer, viewport, canvas, stop } = boundPointer({ store, gmView: () => world.current.gmView ?? true, placing: () => world.current.placing ?? false });
  const f = world.layers();

  pointer.attach('measureHandles', f.measure);
  pointer.attach('pins', { hitTest: f.pins.hitTest, press: f.pins.press, hover: (id) => world.hover('pin', id !== null) });
  pointer.attach('doors', { click: f.doors.click, pressActsAt: f.doors.pressAt, menuHitTest: f.doors.menuHitTest, openMenu: f.doors.openMenu });
  pointer.attach('lights', f.lights);
  pointer.attach('annotations', f.annotations);
  pointer.attach('stairs', f.stairs);
  pointer.attach('walls', f.walls);
  pointer.attach('sounds', f.sounds);
  pointer.attach('hexLinks', f.hexLinks);
  pointer.attach('mapFeatures', f.mapFeatures);
  pointer.attach('fog', f.fog);
  pointer.attach('groupFrame', { contains: f.groupFrame });
  pointer.attach('tokens', {
    hitTest: f.tokens.hitTest,
    press: f.tokens.press,
    offersMenu: () => !world.current.playerView,
    hover: (id) => {
      f.tokens.hover(id);
      f.tokens.uiHover(id);
    },
    preview: (id) => {
      f.tokens.hover(id);
      f.tokens.uiHover(null);
    },
    barAt: f.tokens.barAt,
    pressBar: f.tokens.pressBar,
    hoverBar: f.tokens.hoverBar,
    dragSelected: f.tokens.groupDrag,
    dragging: () => false,
  });

  return {
    arrange: (w) => {
      view.activeTool = w.current.tool;
      view.selectedIds = [...(w.current.selected ?? [])];
      viewport.cursor = RESET_CURSOR;
    },
    press: (e) => viewport.emit('pointerdown', e),
    release: (e) => viewport.emit('pointerup', e),
    move: (e) => viewport.emit('pointermove', e),
    cancel: (e) => viewport.emit('pointercancel', e),
    doubleClick: () => canvas.dispatchEvent(new MouseEvent('dblclick')),
    leave: () => canvas.dispatchEvent(new Event('pointerleave')),
    menuAt: (x, y) => pointer.menuAt(x, y),
    tapActsAt: (x, y) => pointer.tapActsAt(x, y),
    pressActsAt: (x, y) => pointer.pressActsAt(x, y),
    cursor: () => viewport.cursor,
    selectionCleared: (w) => (w.current.selected?.length ?? 0) > 0 && view.selectedIds.length === 0,
    destroy: stop,
  };
}
