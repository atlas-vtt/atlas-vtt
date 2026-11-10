import type { OnLevels } from './sceneLevelTypes';

export type WallType = 'solid' | 'door' | 'secret-door';

/** What a wall can stop: the sight of tokens, or light. */
export type WallChannel = 'sight' | 'light';

/** What a wall stops when it stops one thing only: sight, light, or nothing but a token (a window). */
export type WallBlocks = WallChannel | 'movement';

export interface WallSegment extends OnLevels {
  id: string;
  kind: 'wall';
  type: WallType;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  direction?: 'left' | 'right' | undefined;   // Light pass-through side (undefined = blocks both sides)
  closed?: boolean;               // Doors/secret doors: true = blocks vision (default true)
  /** A door the GM locked: it is closed and its badge does not open it until it is unlocked. A GM aid; light and sight read only `closed`. */
  locked?: boolean;
  /**
   * The one thing the wall stops: a curtain stops sight and lets light through, glass that glows
   * stops light and lets sight through, a window (`movement`) stops a token and lets both through.
   * Unset, it stops both. A door keeps its kind.
   */
  blocks?: WallBlocks | undefined;
  /**
   * A hedge, a low wall, a fence: sight and light pass the first limited wall on their way and
   * stop at the second, so what stands at it or right behind it is seen, and nothing through
   * two. A solid wall stops them as ever. With `blocks`, it is limited for that thing alone.
   */
  limited?: boolean | undefined;
  chainId?: string;               // Groups segments from same draw action
}

/** Input for creating a wall (without auto-generated id/kind) */
export type WallInput = Omit<WallSegment, 'id' | 'kind'>;
