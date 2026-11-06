import type { GridState } from '../../../types/gridTypes';
import type { GlassDragSteps } from './glassDrag';
import { snapGlassCentre } from './glassSnap';
import type { Glass } from './glassState';

interface Point {
  x: number;
  y: number;
}

export interface GlassDragDeps {
  /** The glass as it is when the drag starts. */
  glass(): Glass | null;
  grid(): GridState | null | undefined;
  /** The world point under a client point, on the GM's map. */
  toWorld(clientX: number, clientY: number): Point | null;
  /** Where the GM placed the glass before this drag; null: where it stands by itself. */
  placed(): Point | null;
  /** Puts the glass at a centre, or back where it stands by itself (null). */
  moveTo(centre: Point | null): void;
}

/**
 * What dragging the glass's chip does: the glass moves alone and stays where it is dropped, and a
 * cancel puts it back. Players never move with it: on the map they see it becomes a staged frame,
 * on another map the ghost, and only the chip's button brings them there, so the GM can frame
 * something first and show it when the moment comes.
 */
export function glassDragSteps(deps: GlassDragDeps): GlassDragSteps {
  let session: { grab: Point; size: Glass['frame']; placed: Point | null } | null = null;

  return {
    start(clientX, clientY): boolean {
      const glass = deps.glass();
      const at = deps.toWorld(clientX, clientY);
      if (!glass || !at) return false;
      const { frame } = glass;
      session = { grab: { x: at.x - frame.centerX, y: at.y - frame.centerY }, size: frame, placed: deps.placed() };
      return true;
    },
    move(clientX, clientY, free): void {
      const at = session && deps.toWorld(clientX, clientY);
      if (!session || !at) return;
      deps.moveTo(snapGlassCentre({ x: at.x - session.grab.x, y: at.y - session.grab.y }, session.size, deps.grid(), free));
    },
    end(): void {
      session = null;
    },
    cancel(): void {
      const cancelled = session;
      session = null;
      if (cancelled) deps.moveTo(cancelled.placed);
    },
  };
}
