import type { GlassOutline } from '../../../pixi/glassOutline';
import type { PlayerWindowService } from '../../../services/PlayerWindowService';
import type { GridState } from '../../../types/gridTypes';
import type { GlassDragSteps } from './glassDrag';
import { snapGlassCentre } from './glassSnap';
import type { Glass } from './glassState';

interface Point {
  x: number;
  y: number;
}

export interface GlassDragDeps {
  service: PlayerWindowService;
  tabId: string;
  /** The glass as it is when the drag starts. */
  glass(): Glass | null;
  grid(): GridState | null | undefined;
  /** The world point under a client point, on the GM's map. */
  toWorld(clientX: number, clientY: number): Point | null;
  outline: GlassOutline;
  /** Where the GM placed the ghost; null: it stands in the middle of the view. */
  ghostPlace(): Point | null;
  /** Puts the ghost at a centre, or back in the middle of the view (null). */
  moveGhost(centre: Point | null): void;
}

/**
 * What dragging the glass's chip does. The live glass moves players with it at once, pinned
 * (`dragPlayersTo`), while the place they saw stays dotted; the drop keeps the frame
 * (`framePlayersOn`), and a cancel puts players back as they were, pinned there or following.
 * The ghost moves alone and stays where it is dropped: only the chip's button presents this map
 * framed there, so placing it never moves the players by itself.
 */
export function glassDragSteps(deps: GlassDragDeps): GlassDragSteps {
  const { service, tabId, outline } = deps;
  let session: { look: Glass['look']; grab: Point; size: Glass['frame']; restore: () => void } | null = null;
  let last: Point | null = null;

  return {
    start(clientX, clientY): boolean {
      last = null;
      const glass = deps.glass();
      const at = deps.toWorld(clientX, clientY);
      if (!glass || !at) return false;
      const { frame } = glass;
      const grab = { x: at.x - frame.centerX, y: at.y - frame.centerY };
      if (glass.look === 'ghost') {
        const placed = deps.ghostPlace();
        session = { look: 'ghost', grab, size: frame, restore: () => deps.moveGhost(placed) };
        return true;
      }
      const pinnedOn = service.isFrozen() ? service.playerCameraAt(frame.centerX, frame.centerY) : null;
      session = {
        look: 'live',
        grab,
        size: frame,
        restore: () => {
          if (pinnedOn) service.freezeCamera(pinnedOn);
          else service.unfreezeCamera();
        },
      };
      outline.setOrigin(frame);
      return true;
    },
    move(clientX, clientY, free): void {
      const at = session && deps.toWorld(clientX, clientY);
      if (!session || !at) return;
      const centre = snapGlassCentre({ x: at.x - session.grab.x, y: at.y - session.grab.y }, session.size, deps.grid(), free);
      last = centre;
      if (session.look === 'ghost') deps.moveGhost(centre);
      else service.dragPlayersTo(tabId, centre.x, centre.y);
    },
    end(): void {
      const ended = session;
      session = null;
      outline.setOrigin(null);
      if (!ended || !last || ended.look !== 'live') return;
      service.framePlayersOn(tabId, last.x, last.y);
    },
    cancel(): void {
      const cancelled = session;
      session = null;
      outline.setOrigin(null);
      cancelled?.restore();
    },
  };
}
