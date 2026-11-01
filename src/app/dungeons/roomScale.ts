/** Physical room scale is independent of the number of rooms or floors. */
export type RoomScale = 'standard' | 'tactical';

export function readRoomScale(value: unknown): RoomScale {
  return value === 'tactical' ? 'tactical' : 'standard';
}
