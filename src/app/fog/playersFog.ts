import type { FogOperation } from '../types/fogTypes';
import type { FogStyle } from './fogStyle';

type FogRecord = Readonly<Record<string, FogOperation>>;

/** What `heldFog` reads of a view's state. */
export interface FogHoldState {
  activeTool: string;
  isPlayerView: boolean;
  fogStyle: FogStyle;
  fogHeld: FogRecord | null;
  objects: { fog: FogRecord };
}

/**
 * The fog the players are kept on: under cloud reveal, while the GM's view has the fog or eraser
 * tool, the fog from when the tool was taken up; otherwise none, and they see the fog as it is.
 */
export function heldFog(state: FogHoldState): FogRecord | null {
  const editing = state.activeTool === 'fog' || state.activeTool === 'eraser';
  if (!editing || state.isPlayerView || !state.fogStyle.clouds) return null;
  return state.fogHeld ?? state.objects.fog;
}

/**
 * The fog the players see. Everything that shows them fog or decides by it reads this: the
 * player frame, the tokens and door badges fog hides from them, and what an online table sends.
 */
export function playersFog(state: { fogHeld?: FogRecord | null | undefined; objects: { fog: FogRecord } }): FogRecord {
  return state.fogHeld ?? state.objects.fog;
}
