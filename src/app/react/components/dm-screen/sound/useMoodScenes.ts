import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import type { SceneSound } from '../../../../sound/soundTypes';
import { sceneThumbnailPath } from '../../../../services/collectionBundle/collectionReferences';
import { SceneMoodLinks, sceneOfMood } from '../../../../soundLibrary/SceneMoodLinks';

/** The open scene, whose links count before its file is saved. */
export interface OpenScene {
  path: string | null;
  sound: SceneSound | null;
}

/**
 * The thumbnail of the scene that links each mood, by mood id: the open scene's links first, as the GM
 * sets them, then what the scene files say. A scene without a thumbnail shows none.
 */
export function useMoodScenes(app: App, open: OpenScene): ReadonlyMap<string, string> {
  const links = SceneMoodLinks.forApp(app);
  const scenes = useSyncExternalStore((listener) => links.onChange(listener), () => links.scenes());
  // A thumbnail Atlas makes anew keeps its path: the resource URL carries its time, so it is asked again.
  const [thumbnails, setThumbnails] = useState(0);
  useEffect(() => {
    const ref = app.workspace.on('atlas-vtt:scene-thumbnail-updated', () => setThumbnails((count) => count + 1));
    return () => app.workspace.offref(ref);
  }, [app]);

  return useMemo(() => {
    const chosen = new Map(sceneOfMood(scenes));
    if (open.path !== null) {
      // The open scene speaks for its own moods, and no longer for one it has just let go.
      for (const [mood, path] of [...chosen]) if (path === open.path) chosen.delete(mood);
      if (open.sound?.combatMood) chosen.set(open.sound.combatMood, open.path);
      if (open.sound?.mood) chosen.set(open.sound.mood, open.path);
    }
    const images = new Map<string, string>();
    for (const [mood, path] of chosen) {
      const file = app.vault.getFileByPath(sceneThumbnailPath(path));
      if (file) images.set(mood, app.vault.getResourcePath(file));
    }
    return images;
  }, [app, scenes, open.path, open.sound, thumbnails]);
}
