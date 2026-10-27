import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import { DUNGEON_GENERATOR_VIEW_TYPE } from '../../../dungeon-generator-view';
import type { ViewAtlasState } from '../../../storeFactory';
import type { DungeonGeneratorRequest } from '../../../types/viewUIState';
import type { CreatedDungeonScene } from './useGeneratorActions';

/** The pins waiting for a scene, by the opening that will make it. */
const waiting = new Map<number, (scene: CreatedDungeonScene | null) => void>();
let openings = 0;

/** Hands a waiting pin its scene, or null when the generator closed without one; once. */
export function settleDungeonRequest(id: number, scene: CreatedDungeonScene | null): void {
  const settle = waiting.get(id);
  waiting.delete(id);
  settle?.(scene);
}

/**
 * Opens the dungeon generator in its own tab (`DungeonGeneratorView`), which needs no scene, for
 * `collectionId` (the default collection where unset): the tab already open, else a new one.
 */
export async function showDungeonGenerator(app: App, collectionId?: string): Promise<void> {
  const leaf = app.workspace.getLeavesOfType(DUNGEON_GENERATOR_VIEW_TYPE)[0] ?? app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: DUNGEON_GENERATOR_VIEW_TYPE, active: true, state: collectionId ? { collection: collectionId } : {} });
  await app.workspace.revealLeaf(leaf);
}

/**
 * Opens the dungeon generator over the map for a scene a note pin asks for, with its name and
 * collection fixed, in the place of the pin's dropdown (`anchor`). Resolves with the scene once it
 * was created (the generator closes and the map shows again), or null when it closed without one.
 * A newer opening replaces the one shown, whose overlay settles its pin as it leaves (`DungeonGeneratorOverlay`).
 */
export function generateDungeonFor(
  store: StoreApi<ViewAtlasState>,
  options: { name: string; collectionId: string; anchor?: DungeonGeneratorRequest['anchor'] },
): Promise<{ scenePath: string; entryLevel?: string } | null> {
  return new Promise((resolve) => {
    openings += 1;
    const id = openings;
    store.getState().openDungeonGenerator({ id, collectionId: options.collectionId, name: options.name, ...(options.anchor && { anchor: options.anchor }) });
    waiting.set(id, (scene) => resolve(scene ? { scenePath: scene.scenePath, ...(scene.entryLevel && { entryLevel: scene.entryLevel }) } : null));
  });
}
