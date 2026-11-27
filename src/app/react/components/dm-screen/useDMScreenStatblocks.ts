import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import type { TokenEntity } from '../../../types';
import type { TokenRollContext } from '../../../types/diceRollOrigin';
import { captureRollContext } from '../../../tools/diceRollOrigins';
import { runInBackground } from '../../../utils/backgroundTask';
import { showsStatblock, statblockPathOf, tokensByStatblock } from './screenStatblocks';

/** A statblock the DM screen shows, with the map's tokens linked to it. */
export interface LoadedStatblock {
  path: string;
  tokens: TokenEntity[];
  /** The view, scene and tokens `tokens` were taken from, taken with them. */
  originContext: TokenRollContext | undefined;
}

/** The map view the DM screen lies over, and the scene its store holds. */
export interface DMScreenScene {
  viewId: string | undefined;
  mapPath: string | null;
  mapLoaded: boolean;
  isMapLoading: boolean;
  tokens: Record<string, TokenEntity>;
}

/**
 * The statblocks of the map's creatures, one per linked note, and whether they are still
 * being looked up. Each keeps its tokens together with the scene they were taken from, so
 * a list shown while the next scene loads still names the scene it came from.
 */
export function useDMScreenStatblocks(isOpen: boolean, app: App, scene: DMScreenScene): { statblocks: Map<string, LoadedStatblock>; loading: boolean } {
  const [statblocks, setStatblocks] = useState<Map<string, LoadedStatblock>>(new Map());
  const [loading, setLoading] = useState(true);
  const { viewId, mapPath, mapLoaded, isMapLoading, tokens } = scene;

  // Get unique statblocks from tokens on the map
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const snapshot = { mapPath, mapLoaded, isMapLoading, objects: { tokens } };
    const contextOf = (pathTokens: readonly TokenEntity[]): TokenRollContext | undefined =>
      captureRollContext(viewId, snapshot, pathTokens.map((token) => token.id));
    const loadStatblocks = async (): Promise<void> => {
      setLoading(true);
      const tokensArray = Object.values(tokens);

      // Group tokens by statblock path, and see whether the paths changed
      const tokensByStatblockPath = tokensByStatblock(tokens);
      const currentStatblockPaths = new Set(tokensByStatblockPath.keys());

      // Check if statblock paths have changed
      const existingPaths = new Set(statblocks.keys());
      const pathsChanged = currentStatblockPaths.size !== existingPaths.size ||
        [...currentStatblockPaths].some(path => !existingPaths.has(path));

      if (!pathsChanged && statblocks.size > 0) {
        // Just update the tokens for existing statblocks without recreating the Map
        setStatblocks(prev => {
          const updatedMap = new Map([...prev].map(([path, statblock]) => [path, { ...statblock, tokens: [] as TokenEntity[] }]));

          // Redistribute tokens
          tokensArray.forEach((token) => {
            const path = statblockPathOf(token);
            if (path) updatedMap.get(path)?.tokens.push(token);
          });
          for (const statblock of updatedMap.values()) statblock.originContext = contextOf(statblock.tokens);

          return updatedMap;
        });
        setLoading(false);
        return;
      }

      // Only recreate the Map if statblock paths have actually changed
      const uniqueStatblocks = new Map<string, LoadedStatblock>();

      // Old Atlas notes can still be linked to tokens, but define no statblock. Only allocate cards for statblock notes.
      try {
        for (const [path, pathTokens] of tokensByStatblockPath) {
          if (await showsStatblock(app, path)) uniqueStatblocks.set(path, { path, tokens: pathTokens, originContext: contextOf(pathTokens) });
        }
      } finally {
        // The screen stays hidden while its statblocks load, so a failed load ends too, with what it found.
        if (!cancelled) {
          setStatblocks(uniqueStatblocks);
          setLoading(false);
        }
      }
    };

    runInBackground(loadStatblocks(), 'Loading DM screen statblocks');
    return () => { cancelled = true; };
  }, [tokens, isOpen, app, viewId, mapPath, mapLoaded, isMapLoading]);

  // A closed screen looks its statblocks up again when it opens
  useEffect(() => {
    if (!isOpen) setLoading(true);
  }, [isOpen]);

  return { statblocks, loading };
}
