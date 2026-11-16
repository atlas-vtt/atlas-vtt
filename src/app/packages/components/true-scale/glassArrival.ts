import type { WorldFrame } from '../../../types/playerFrame';

/** How near, in world px, players must be to the staged frame's centre to have arrived. */
export const ARRIVED_WITHIN = 0.5;

/**
 * Where players are on their glide to a staged frame:
 * `arrived` once the frame they see lies on the staged one; `waiting` while they are on their way;
 * `lost` where the glide cannot end there any more (players see another map, or follow the GM
 * again), so the staged frame is kept as it is.
 */
export type Arrival = 'arrived' | 'waiting' | 'lost';

export function arrivalOf(players: WorldFrame | null, target: { x: number; y: number }, frozen: boolean): Arrival {
  if (!players || !frozen) return 'lost';
  const distance = Math.hypot(players.centerX - target.x, players.centerY - target.y);
  return distance < ARRIVED_WITHIN ? 'arrived' : 'waiting';
}
