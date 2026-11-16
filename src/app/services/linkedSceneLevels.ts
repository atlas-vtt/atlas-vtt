import type { App } from 'obsidian';
import { readSceneLevels } from '../levels/levelFile';
import type { SceneLevels } from '../levels/sceneLevels';
import type { SceneLevel } from '../types/sceneLevelTypes';
import { parseSceneFile } from './MapPersistence';
import { linkedMapPath, linkedSceneFile } from './sceneLinks';

/** What a pin's menu reads of the scene it links: that scene's levels. */
export interface PinnedScene {
  /** The scene the pin stands on, and its levels as the view holds them. */
  mapPath: string | null;
  levels?: SceneLevels;
}

/**
 * The levels of the scene a pin's `link` opens (`linkedSceneFile`: only a scene of the pin's own
 * collection), bottom first: the view's own where the pin links its own scene, else read from that
 * scene's file. Null where the link opens no scene, or a file that cannot be read.
 */
export async function linkedSceneLevels(app: App, from: PinnedScene, link: string): Promise<readonly SceneLevel[] | null> {
  if (!linkedMapPath(link)) return null;
  const file = linkedSceneFile(app, from.mapPath, link);
  if (!file) return null;
  if (file.path === from.mapPath) return from.levels ?? null;
  try {
    const { state } = parseSceneFile(await app.vault.cachedRead(file));
    return readSceneLevels(state.levels, typeof state.background === 'string' ? state.background : null) ?? null;
  } catch {
    return null;
  }
}
