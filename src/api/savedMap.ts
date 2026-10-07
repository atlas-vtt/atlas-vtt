import { TFile, type App } from 'obsidian';
import { readSceneLighting } from '../app/lighting/sceneLightingOptions';
import { ATLAS_SCHEMA, ATLAS_VERSION, migrateMapFile, parseSceneFile } from '../app/services/MapPersistence';
import { createDefaultWidgets } from '../app/storeFactory';
import { createDefaultInitiativeState } from '../app/types/initiativeTypes';
import { frozenCopy } from './frozen';
import { vaultImageSize } from './savedMapGrid';
import { readSceneFields, tokenSettingsForFile, type SceneFields } from './savedMapFields';
import type { SavedMap, SavedMapInput } from './types/scenes';

type SavedState = ReturnType<typeof parseSceneFile>['state'];

/** The fields of `SavedMapInput`, from a migrated map file. */
function savedMapInput(state: SavedState, map: ReturnType<typeof migrateMapFile>): SavedMapInput {
  return {
    background: map.background,
    grid: map.grid,
    objects: { tokens: map.objects.tokens, texts: map.objects.texts, drawings: map.objects.drawings, fog: map.objects.fog },
    widgets: { settings: { ...createDefaultWidgets(), ...state.widgetSettings }, values: state.widgetValues ?? {} },
    initiative: { ...createDefaultInitiativeState(), ...state.initiative } as SavedMapInput['initiative'],
    lighting: readSceneLighting((state as { lighting?: unknown }).lighting),
  };
}

/** The background's natural size, read from its file's header; 0 x 0 without a readable one. */
async function backgroundSize(app: App, path: string | null): Promise<SavedMap['mapSize']> {
  return (await vaultImageSize(app, path)) ?? { width: 0, height: 0 };
}

/** The saved map at `path`, migrated, as a frozen copy; null when there is no such file. A file that exists but cannot be read throws. */
export async function readSavedMap(app: App, path: string): Promise<SavedMap | null> {
  if (typeof path !== 'string' || !path.endsWith('.atlasmap')) throw new Error('[Atlas API] scenes.readMap: the path must name an .atlasmap file.');
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const { state } = parseSceneFile(await app.vault.read(file));
  const map = migrateMapFile(state);
  const input = savedMapInput(state, map);
  // Normalised as Atlas loads the map; the GM's note, the dice log, explored memory, pinned previews and the loot roller stay behind.
  return frozenCopy({ ...input, ...readSceneFields(state, map), mapSize: await backgroundSize(app, input.background) });
}

/**
 * The text of a new map file at `mapPath` holding `map`, as Atlas's own save would write it. `fields` are the map's
 * optional fields, already checked (`checkedSceneFields`); without them the file has none, as a new map.
 */
export function savedMapText(map: SavedMapInput, mapPath: string, name: string, fields: SceneFields | null = null): string {
  const zones = fields && Object.keys(fields.lightZones).length > 0 ? { lightZones: fields.lightZones } : {};
  const state = {
    schema: ATLAS_SCHEMA, version: ATLAS_VERSION, name, mapPath,
    background: map.background, grid: map.grid,
    objects: {
      tokens: map.objects.tokens, fog: map.objects.fog, pins: fields?.pins ?? {}, texts: map.objects.texts, drawings: map.objects.drawings,
      walls: fields?.walls ?? {}, lights: fields?.lights ?? {}, ...zones,
    },
    camera: fields?.camera ?? { x: 0, y: 0, scale: 1 },
    widgetSettings: map.widgets.settings, widgetValues: map.widgets.values, initiative: map.initiative,
    ...(map.lighting ? { lighting: map.lighting } : {}),
    ...(fields ? { tokenSettings: tokenSettingsForFile(fields.tokenSettings) } : {}),
    ...(fields?.initiativeTrackerOpen ? { initiativeTrackerOpen: true } : {}),
  };
  return JSON.stringify({ state, version: ATLAS_VERSION }, null, 2);
}
