import type { App, WorkspaceLeaf } from 'obsidian';
import { showNotice } from '../ui/notice';

/** Where a created scene opens: in `leaf` where one is given, on `level` where the scene should show one first. */
export interface SceneOpening {
  leaf?: WorkspaceLeaf | undefined;
  level?: string | undefined;
}

/**
 * Opens a scene Atlas just created, as a new scene is opened; false where it could not be
 * opened, which the GM is told (the scene stays in the Scenes tab). A level to show first goes
 * with the view state (`AtlasView.setState`), so the scene loads on it.
 */
export async function openCreatedScene(app: App, scenePath: string, name: string, { leaf, level }: SceneOpening = {}): Promise<boolean> {
  const scene = app.vault.getFileByPath(scenePath);
  if (!scene) return false;
  try {
    await (leaf ?? app.workspace.getLeaf(false)).openFile(scene, level ? { state: { level } } : undefined);
    return true;
  } catch (error) {
    console.error('[Atlas] A new scene could not be opened', error);
    showNotice(`"${name}" could not be opened. It is in the Scenes tab.`);
    return false;
  }
}
