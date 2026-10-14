import type { WallSegment } from '../types/wallTypes';

export function isDoor(wall: Pick<WallSegment, 'type'>): boolean {
  return wall.type === 'door' || wall.type === 'secret-door';
}

export function isWindow(wall: Pick<WallSegment, 'type' | 'window'>): boolean {
  return isDoor(wall) && wall.window === true;
}

export function isPlayerDoor(wall: Pick<WallSegment, 'type' | 'revealed'>): boolean {
  return wall.type === 'door' || (wall.type === 'secret-door' && wall.revealed === true);
}
