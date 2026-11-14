import type { HandleRef } from '../../annotations/annotationHandles';

/** The resize cursors by the way they point, in eighths of a turn from the right, clockwise on screen. */
const RESIZE = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

/**
 * The cursor over a handle of a frame turned `rotation` degrees: the resize arrow that points the
 * way the handle pulls, a hand on the turn handle, a pointer on a line's point.
 */
export function gripCursor(handle: Exclude<HandleRef, { kind: 'body' | 'edge' }>, rotation: number): string {
  if (handle.kind === 'turn') return 'grab';
  if (handle.kind === 'point') return 'pointer';
  const pull = (Math.atan2(handle.y, handle.x) * 180) / Math.PI + rotation;
  const eighth = ((Math.round(pull / 45) % 4) + 4) % 4;
  return RESIZE[eighth]!;
}
