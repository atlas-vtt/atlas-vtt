/**
 * Frames the GM saved on a scene for the players' TV (TrueScale's saved frames): cameras players
 * are sent to with one click. Saved with the map, never undo-tracked, like `lighting`.
 */

import type { SavedPlayerFrame } from '../types/playerCamera';
import type { ViewState } from '../types/viewState';
import { isFiniteNumber, isRecord } from '../utils/guards';

/** As many as a badge numbers with two digits. */
export const MAX_PLAYER_FRAMES = 99;

export type { SavedPlayerFrame } from '../types/playerCamera';

export interface PlayerFramesSlice {
  /** Appends a frame; a scene that holds `MAX_PLAYER_FRAMES` takes no more. */
  addPlayerFrame: (camera: SavedPlayerFrame) => void;
  /** Moves frame `index` to be centred on `centre`; its size and zoom stay. */
  movePlayerFrame: (index: number, centre: { x: number; y: number }) => void;
  removePlayerFrame: (index: number) => void;
}

type ImmerSet = (fn: (draft: Pick<ViewState, 'playerFrames'>) => void) => void;

function isSize(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function readFrame(value: unknown): SavedPlayerFrame | null {
  if (!isRecord(value)) return null;
  const { centerX, centerY, scale, width, height } = value;
  if (!isFiniteNumber(centerX) || !isFiniteNumber(centerY) || !isSize(scale) || !isSize(width) || !isSize(height)) return null;
  return { centerX, centerY, scale, width, height };
}

/**
 * The saved frames a map file holds, which arrive unchecked: none where the value is no list or
 * one of its entries is no camera with finite numbers, since the numbers the GM knows them by
 * would shift if an entry were left out.
 */
export function readPlayerFrames(value: unknown): SavedPlayerFrame[] {
  if (!Array.isArray(value)) return [];
  const frames: SavedPlayerFrame[] = [];
  for (const entry of value.slice(0, MAX_PLAYER_FRAMES)) {
    const frame = readFrame(entry);
    if (!frame) return [];
    frames.push(frame);
  }
  return frames;
}

export function createPlayerFramesActions(set: ImmerSet): PlayerFramesSlice {
  return {
    addPlayerFrame: (camera) => set((draft) => {
      const frame = readFrame(camera);
      if (frame && draft.playerFrames.length < MAX_PLAYER_FRAMES) draft.playerFrames.push(frame);
    }),
    movePlayerFrame: (index, { x, y }) => set((draft) => {
      const frame = draft.playerFrames[index];
      if (!frame || !isFiniteNumber(x) || !isFiniteNumber(y)) return;
      frame.centerX = x;
      frame.centerY = y;
    }),
    removePlayerFrame: (index) => set((draft) => {
      if (index >= 0 && index < draft.playerFrames.length) draft.playerFrames.splice(index, 1);
    }),
  };
}
