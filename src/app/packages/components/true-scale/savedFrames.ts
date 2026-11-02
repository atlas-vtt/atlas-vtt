import type { StoreApi } from 'zustand';
import { getDomHost } from '../../../host/dom';
import type { GlassOutline } from '../../../pixi/glassOutline';
import type { PlayerWindowService } from '../../../services/PlayerWindowService';
import type { ViewAtlasState } from '../../../storeFactory';
import type { SavedPlayerFrame } from '../../../stores/playerFramesSlice';
import type { PlayerCameraState } from '../../../types/playerCamera';
import type { Size, WorldFrame } from '../../../types/playerFrame';
import { trackGlassDrag } from './glassDrag';
import { snapGlassCentre } from './glassSnap';
import { savedChipPlace, type ChipRoom } from './glassState';

/** How long a saved frame's chip stays after the pointer left the frame and the chip. */
export const SAVED_CHIP_HIDE_MS = 300;

interface Point {
  x: number;
  y: number;
}

export interface SavedFramesDeps {
  store: StoreApi<ViewAtlasState>;
  service: PlayerWindowService;
  tabId(): string | null;
  outline: GlassOutline;
  /** The chip of the saved frame under the pointer. */
  chip: HTMLElement;
  /** The canvas, whose container is listened to for the pointer. */
  canvas: HTMLElement;
  room(): ChipRoom;
  /** The world point under a client point, on the GM's map. */
  toWorld(clientX: number, clientY: number): Point | null;
  /** What players see of this map at true scale; null where true scale does not apply, and frames keep their own size. */
  trueSize(): Size | null;
  /** Shows players this map, through `camera`. */
  present(camera: PlayerCameraState): void;
  /** The saved frame whose chip shows, by index; null: none. */
  setShown(index: number | null): void;
}

export interface SavedFrames {
  /** Reads the saved frames anew and draws them. */
  refresh(): void;
  /** Keeps the chip inside the corner of its frame: after the camera moved. */
  place(): void;
  /** Sends players to the frame whose chip shows. */
  show(): void;
  remove(): void;
  /** A press on the chip, which may become a drag of its frame. */
  pointerDown(event: PointerEvent): void;
  /** The pointer came onto the chip (true) or left it. */
  hoverChip(over: boolean): void;
  destroy(): void;
}

/**
 * The frames the GM saved on a map, drawn by the glass's outline, and the chip of the one under
 * the pointer. The pointer is followed on the canvas's container without taking anything from
 * the map: a move only tests the frames' rectangles of the last draw. The chip stays while the
 * pointer is over its frame or over it, and goes `SAVED_CHIP_HIDE_MS` after it left both.
 * Dragging the chip moves its frame, snapped like the glass, and the drop writes it.
 */
export function savedFrames(deps: SavedFramesDeps): SavedFrames {
  const { store, outline, chip } = deps;
  const surface = deps.canvas.parentElement ?? deps.canvas;
  const win = getDomHost().ownerWindow(chip);
  let frames: readonly SavedPlayerFrame[] = [];
  let drawn: WorldFrame[] = [];
  let shown = -1;
  let overFrame = -1;
  let overChip = false;
  let hideTimer: number | null = null;
  /** Where a frame being dragged stands now, before the drop writes it. */
  let moved: { index: number; centre: Point } | null = null;
  let stopDrag: (() => void) | null = null;
  let canvasLeft = 0;
  let canvasTop = 0;

  const worldFrames = (): WorldFrame[] => {
    const size = deps.trueSize();
    return frames.map((frame, index) => {
      const centre = moved?.index === index ? moved.centre : { x: frame.centerX, y: frame.centerY };
      return { centerX: centre.x, centerY: centre.y, width: size?.width ?? frame.width, height: size?.height ?? frame.height };
    });
  };
  const draw = (): void => {
    const next = worldFrames();
    const same = next.length === drawn.length && next.every((frame, index) => {
      const was = drawn[index]!;
      return frame.centerX === was.centerX && frame.centerY === was.centerY && frame.width === was.width && frame.height === was.height;
    });
    drawn = next;
    if (!same) outline.setSaved(drawn);
  };
  const place = (): void => {
    const rect = shown >= 0 ? outline.savedRect(shown) : undefined;
    if (!rect) return;
    const at = savedChipPlace(rect, { width: chip.offsetWidth, height: chip.offsetHeight }, deps.room());
    chip.style.translate = `${at.x}px ${at.y}px`;
  };
  const clearHide = (): void => {
    if (hideTimer !== null) win.clearTimeout(hideTimer);
    hideTimer = null;
  };
  const showChip = (index: number): void => {
    if (index < 0) overChip = false;
    if (shown === index) return;
    shown = index;
    deps.setShown(index < 0 ? null : index);
    place();
  };
  /** Shows the chip of the frame under the pointer, or lets it go a moment after the pointer left frame and chip. */
  const settle = (): void => {
    if (stopDrag) return;
    if (overFrame >= 0 || overChip) {
      clearHide();
      if (overFrame >= 0) showChip(overFrame);
      return;
    }
    if (shown < 0 || hideTimer !== null) return;
    hideTimer = win.setTimeout(() => {
      hideTimer = null;
      if (overFrame < 0 && !overChip && !stopDrag) showChip(-1);
    }, SAVED_CHIP_HIDE_MS);
  };

  const measure = (): void => {
    const rect = deps.canvas.getBoundingClientRect();
    canvasLeft = rect.left;
    canvasTop = rect.top;
  };
  const onMove = (event: PointerEvent): void => {
    // A pan or a drag on the map is under way: no chip comes up under it
    if (event.buttons !== 0) return;
    const index = outline.savedAt(event.clientX - canvasLeft, event.clientY - canvasTop);
    if (index === overFrame) return;
    overFrame = index;
    settle();
  };
  const onLeave = (): void => {
    overFrame = -1;
    settle();
  };
  surface.addEventListener('pointerenter', measure, { passive: true });
  surface.addEventListener('pointermove', onMove, { passive: true });
  surface.addEventListener('pointerleave', onLeave, { passive: true });
  measure();

  return {
    refresh: () => {
      frames = store.getState().playerFrames ?? [];
      if (shown >= frames.length) showChip(-1);
      draw();
      place();
    },
    place,
    show: () => {
      const id = deps.tabId();
      const frame = frames[shown];
      if (!id || !frame) return;
      if (!deps.service.playersToCamera(id, frame)) deps.present({ ...frame });
    },
    remove: () => {
      const index = shown;
      if (index < 0) return;
      overFrame = -1;
      showChip(-1);
      store.getState().removePlayerFrame(index);
    },
    pointerDown: (event) => {
      const index = shown;
      if (event.button !== 0 || index < 0) return;
      stopDrag?.();
      let grab: Point | null = null;
      const done = (): void => {
        stopDrag = null;
        settle();
      };
      stopDrag = trackGlassDrag(chip, event, {
        start: (clientX, clientY) => {
          const at = deps.toWorld(clientX, clientY);
          const frame = drawn[index];
          if (!at || !frame) return false;
          grab = { x: at.x - frame.centerX, y: at.y - frame.centerY };
          clearHide();
          return true;
        },
        move: (clientX, clientY, free) => {
          const at = deps.toWorld(clientX, clientY);
          const frame = drawn[index];
          if (!at || !grab || !frame) return;
          const centre = snapGlassCentre({ x: at.x - grab.x, y: at.y - grab.y }, frame, store.getState().grid, free);
          moved = { index, centre };
          draw();
          place();
        },
        end: () => {
          const drop = moved;
          moved = null;
          if (drop) store.getState().movePlayerFrame(drop.index, drop.centre);
          done();
        },
        cancel: () => {
          moved = null;
          draw();
          place();
          done();
        },
      });
    },
    hoverChip: (over) => {
      overChip = over;
      settle();
    },
    destroy: () => {
      stopDrag?.();
      clearHide();
      surface.removeEventListener('pointerenter', measure);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerleave', onLeave);
    },
  };
}
