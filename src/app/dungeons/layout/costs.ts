import { adjacency, type Edge, pathCosts } from './graph';
import { type WorkLayout, isNormal, roomAt } from './workLayout';

export function layoutEdges(layout: WorkLayout): Edge[][] {
  const live = layout.doors.filter((door) => (door.from === null || !roomAt(layout, door.from).removed) && (door.to === null || !roomAt(layout, door.to).removed));
  return adjacency(layout.rooms.length, live, (id) => isNormal(roomAt(layout, id)));
}

/** Walking cost from the first room to every room. */
export function costsFromStart(layout: WorkLayout): number[] {
  return pathCosts(layoutEdges(layout), 0);
}
