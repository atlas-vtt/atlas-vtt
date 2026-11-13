import type { PlayerWindowService } from '../../../services/PlayerWindowService';
import type { GridState } from '../../../types/gridTypes';
import type { WorldFrame } from '../../../types/playerFrame';
import { trackGlassDrag, type GlassDragSteps } from './glassDrag';
import { snapGlassCentre } from './glassSnap';

interface Point {
  x: number;
  y: number;
}

export interface LiveDragDeps {
  service: PlayerWindowService;
  tabId: string;
  /** The frame players see now, as it is when the drag starts; null where they see none of this map. */
  frame(): WorldFrame | null;
  grid(): GridState | null | undefined;
  /** The world point under a client point, on the GM's map. */
  toWorld(clientX: number, clientY: number): Point | null;
}

/**
 * What dragging the frame players see does when the GM wants them to follow at once: players move
 * with the pointer, pinned (`dragPlayersTo`), snapped to the grid's cells (Alt frees it); the drop
 * keeps the frame (`framePlayersOn`), and a cancel puts players back as they were, pinned there
 * or following the GM. A frame staged elsewhere is not touched.
 */
export function liveDragSteps(deps: LiveDragDeps): GlassDragSteps {
  const { service, tabId } = deps;
  let session: { grab: Point; size: WorldFrame; restore: () => void } | null = null;
  let last: Point | null = null;

  return {
    start(clientX, clientY): boolean {
      last = null;
      const frame = deps.frame();
      const at = deps.toWorld(clientX, clientY);
      if (!frame || !at) return false;
      const pinnedOn = service.isFrozen() ? service.playerCameraAt(frame.centerX, frame.centerY) : null;
      session = {
        grab: { x: at.x - frame.centerX, y: at.y - frame.centerY },
        size: frame,
        restore: (): void => {
          if (pinnedOn) service.freezeCamera(pinnedOn);
          else service.unfreezeCamera();
        },
      };
      return true;
    },
    move(clientX, clientY, free): void {
      const at = session && deps.toWorld(clientX, clientY);
      if (!session || !at) return;
      const centre = snapGlassCentre({ x: at.x - session.grab.x, y: at.y - session.grab.y }, session.size, deps.grid(), free);
      last = centre;
      service.dragPlayersTo(tabId, centre.x, centre.y);
    },
    end(): void {
      const ended = session;
      session = null;
      if (ended && last) service.framePlayersOn(tabId, last.x, last.y);
    },
    cancel(): void {
      const cancelled = session;
      session = null;
      cancelled?.restore();
    },
  };
}

/**
 * Follows a press on `element` as a live drag of the frame players see. `done` runs when it ends
 * or is cancelled. Returns what stops following at once (the chip unmounting), which cancels.
 */
export function trackLiveDrag(element: HTMLElement, down: PointerEvent, deps: LiveDragDeps, done: () => void): () => void {
  const steps = liveDragSteps(deps);
  return trackGlassDrag(element, down, {
    ...steps,
    end: (): void => { done(); steps.end(); },
    cancel: (): void => { done(); steps.cancel(); },
  });
}
