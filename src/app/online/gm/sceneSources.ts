import type { App } from 'obsidian';
import { PlayedRules } from '../../campaigns/playedRules';
import { CreatureIndex } from '../../creatures/CreatureIndex';
import { SystemPresetFiles } from '../../services/systemPresets/SystemPresetFiles';
import { atlasPlayerSettings, followAtlasSettings } from './atlasLighting.ts';
import type { ObservedStore } from './atlasView.ts';
import type { MapCanvas } from './mapView.ts';
import { gatedStatblocks } from './book/statblockGate.ts';
import type { Follow, SceneSources } from './sceneSignal.ts';

/** `follow` heard only where `read` gives another text than at its last change: Atlas tells of every setting, players' pictures read a few. */
function whenRead(read: () => string, follow: Follow): Follow {
  return (listener) => {
    let last = read();
    return follow(() => {
      const now = read();
      if (now === last) return;
      last = now;
      listener();
    });
  };
}

/** Calls `listener` at each workspace event `name` of Atlas's; returns what stops it. */
function onWorkspace(app: App, name: 'atlas-vtt:collection-settings-changed' | 'atlas-vtt:refresh-assets'): Follow {
  return (listener) => {
    const ref = app.workspace.on(name as 'atlas-vtt:refresh-assets', listener);
    return () => app.workspace.offref(ref);
  };
}

/**
 * Every input of what players see of a shared view beside its store, and what tells of each change: the
 * view's canvas audience (the players' sight, the roof, a token drawn once its art loaded, a level's map image),
 * Atlas's settings for the players' view (the table's controls the signal reads itself), the map's rules
 * (measurement, senses, conditions, resources, dice, movement), the characters' statblocks (their dice
 * sets), the creature index (speeds read from statblocks), the asset index (which statblock a library
 * token links) and the theme (`accent`, which only reads it). A new input is one more entry here.
 */
export function sceneSources(app: App, store: ObservedStore, renderer: MapCanvas, accent: () => string | null): SceneSources {
  return {
    store,
    sight: (listener) => renderer.getCanvasAudience().onSightChange(listener),
    settings: { read: () => atlasPlayerSettings(app), follow: whenRead(() => JSON.stringify(atlasPlayerSettings(app)), (listener) => followAtlasSettings(app, listener)) },
    accent,
    atlas: [
      // The map's rules change where `onMapRulesChange` hears them, any collection's: the table runs long after the asset index loaded.
      onWorkspace(app, 'atlas-vtt:collection-settings-changed'),
      (listener) => PlayedRules.forApp(app)?.onChange(listener) ?? (() => undefined),
      (listener) => SystemPresetFiles.forApp(app)?.onChange(listener) ?? (() => undefined),
      (listener) => gatedStatblocks.onChange(() => listener()),
      (listener) => CreatureIndex.forApp(app).subscribe(listener),
      onWorkspace(app, 'atlas-vtt:refresh-assets'),
      (listener) => {
        const ref = app.workspace.on('css-change', listener);
        return () => app.workspace.offref(ref);
      },
    ],
  };
}
