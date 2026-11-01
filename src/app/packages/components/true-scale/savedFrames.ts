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

/** How long a saved frame's chip stays after the pointer left the frame and the chip, or came onto another frame. */
export const SAVED_CHIP_HIDE_MS = 300;

/** How close, in world px, a frame is to another to be the same frame. */
const SAME_FRAME = 1;

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
  /** Keeps the chip on its frame and asks again what lies under the pointer: after the camera moved. */
  place(): void;
  /** The canvas may stand elsewhere in the window: after a resize. */
  measure(): void;
  /** The saved frame on the place of `frame`, the newest where several are; -1 where none is. */
  indexOf(frame: WorldFrame): number;
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
 * the pointer. The pointer is followed on the canvas's container, which holds the map's UI too,
 * without taking anything from the map: a move only tests the frames' rectangles of the last draw,
 * and only a move over the canvas is over a frame. The chip stays while the pointer is on it,
 * whatever lies under it. With a chip up, what the pointer came to instead (another frame, none)
 * takes over only `SAVED_CHIP_HIDE_MS` later, so the way to a chip may cross other frames.
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
  /** The pointer on the canvas, in the canvas's pixels; null while it is elsewhere. */
  let pointer: Point | null = null;
  /** A chip is being dragged: past the threshold, not merely pressed. */
  let dragging = false;
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
  const placeChip = (): void => {
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
    placeChip();
  };
  /** Brings the chip in line with the frame under the pointer: at once where none shows, else a moment later. */
  const settle = (): void => {
    if (dragging) return;
    if (overChip || overFrame === shown) {
      clearHide();
      return;
    }
    if (shown < 0) {
      showChip(overFrame);
      return;
    }
    if (hideTimer !== null) return;
    hideTimer = win.setTimeout(() => {
      hideTimer = null;
      if (!overChip && !dragging) showChip(overFrame);
    }, SAVED_CHIP_HIDE_MS);
  };
  /** Asks what lies under the pointer, which changes with the frames and the camera as well as with the pointer. */
  const hover = (): void => {
    const index = pointer ? outline.savedAt(pointer.x, pointer.y) : -1;
    if (index === overFrame) return;
    overFrame = index;
    settle();
  };

  const measure = (): void => {
    const rect = deps.canvas.getBoundingClientRect();
    canvasLeft = rect.left;
    canvasTop = rect.top;
  };
  const onMove = (event: PointerEvent): void => {
    // A pan or a drag on the map is under way: no chip comes up under it
    if (event.buttons !== 0) {
      pointer = null;
      return;
    }
    const onChip = event.composedPath().includes(chip);
    pointer = onChip || event.target === deps.canvas ? { x: event.clientX - canvasLeft, y: event.clientY - canvasTop } : null;
    if (!onChip) hover();
  };
  const onLeave = (): void => {
    pointer = null;
    hover();
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
      hover();
      placeChip();
    },
    place: () => {
      hover();
      placeChip();
    },
    measure,
    indexOf: (frame) => drawn.findLastIndex((other) => (
      Math.abs(other.centerX - frame.centerX) < SAME_FRAME && Math.abs(other.centerY - frame.centerY) < SAME_FRAME
      && Math.abs(other.width - frame.width) < SAME_FRAME && Math.abs(other.height - frame.height) < SAME_FRAME
    )),
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
        dragging = false;
        settle();
      };
      stopDrag = trackGlassDrag(chip, event, {
        start: (clientX, clientY) => {
          const at = deps.toWorld(clientX, clientY);
          const frame = drawn[index];
          if (!at || !frame) return false;
          grab = { x: at.x - frame.centerX, y: at.y - frame.centerY };
          clearHide();
          dragging = true;
          return true;
        },
        move: (clientX, clientY, free) => {
          const at = deps.toWorld(clientX, clientY);
          const frame = drawn[index];
          if (!at || !grab || !frame) return;
          const centre = snapGlassCentre({ x: at.x - grab.x, y: at.y - grab.y }, frame, store.getState().grid, free);
          moved = { index, centre };
          draw();
          placeChip();
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
          placeChip();
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
