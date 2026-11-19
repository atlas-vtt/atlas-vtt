import { createContext, useContext } from 'react';

/**
 * The asset manager opened to choose one map (a level's map image or roof): it shows the Maps tab alone, edits
 * nothing, and a card chosen by click or Enter is the answer. Scenes are no choice, since each is a scene of its own.
 */
export interface MapPick {
  /** What the choice is for, shown where the tabs stand. */
  title: string;
  /** A choice of no map ("No map image", "No roof"), offered beside the search; left out where none is wanted. */
  noneLabel?: string;
  /** The chosen map's image path, or null for none. Called once; the window closes with it. */
  onPick: (mapPath: string | null) => void;
}

export const MapPickContext = createContext<MapPick | null>(null);

/** The pick the asset manager is open for, or null for the library as it is. */
export function useMapPick(): MapPick | null {
  return useContext(MapPickContext);
}
