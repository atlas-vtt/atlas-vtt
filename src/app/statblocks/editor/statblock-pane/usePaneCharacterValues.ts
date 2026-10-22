import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { App } from 'obsidian';
import { PartySync } from '../../../campaigns/partyValues/PartySync';
import { characterOfNote } from '../../../characters/playerCharacters';
import { characterRestOf } from '../../../recovery/characterRest';
import { collectionResources } from '../../../resources/collectionResources';
import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import { AssetService } from '../../../services/AssetService';
import { openMapViews } from '../../../services/collectionScenes';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { StatblockTokenContext } from '../../render/sheetTypes';
import type { FieldRecord } from '../../values/fieldValues';

/** How long the panel lets changes settle before it reads the values again: a dragged token changes them every frame. */
const SETTLE_MS = 100;

/** Calls `refresh` (settled) whenever a value the panel shows may have changed; answers how to stop. */
function watchValues(app: App, refresh: () => void): () => void {
  let timer: number | null = null;
  const settled = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = null; refresh(); }, SETTLE_MS);
  };
  let stores: (() => void)[] = [];
  const watchStores = (): void => {
    for (const stop of stores) stop();
    stores = openMapViews(app).map((view) => view.getStore().subscribe((state) => state.objects.tokens, settled));
  };
  watchStores();
  const refs = [
    app.workspace.on('layout-change', () => { watchStores(); settled(); }),
    app.workspace.on('atlas-vtt:collection-settings-changed', settled),
  ];
  const stopParty = PartySync.forApp(app)?.onChange(settled);
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    for (const stop of stores) stop();
    for (const ref of refs) app.workspace.offref(ref);
    stopParty?.();
  };
}

const sameValues = (a: Readonly<Record<string, ResourceValue>>, b: Readonly<Record<string, ResourceValue>>): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key]?.current === b[key]?.current && a[key]?.max === b[key]?.max);
};

const sameDefinitions = (a: readonly ResourceDefinition[], b: readonly ResourceDefinition[]): boolean =>
  a.length === b.length && a.every((definition, index) => definition.key === b[index]?.key && definition.field === b[index]?.field && definition.direction === b[index]?.direction);

/**
 * The token a player character's note is shown for beside it: the first player character linking
 * the note, with the values it holds now as a rest reads them (`characterRestOf`: its token on an
 * open map, else the played campaign's values; a tracked number where it starts while nothing
 * holds it). Undefined where no player character links the note. The object stays the same while
 * the values do, so the card does not draw again for a token moved on the map.
 */
export function usePaneCharacterValues(app: App, notePath: string, template: StatblockTemplate, record: FieldRecord): StatblockTokenContext | undefined {
  const [assets, refreshAssets] = useReducer((count: number): number => count + 1, 0);
  const [revision, refresh] = useReducer((count: number): number => count + 1, 0);
  const last = useRef<StatblockTokenContext | undefined>(undefined);

  // The vault check and every change of a token's record end in `refresh-assets`.
  useEffect(() => {
    const ref = app.workspace.on('atlas-vtt:refresh-assets', refreshAssets);
    return () => app.workspace.offref(ref);
  }, [app]);
  // `assets` reads the index again after it changed.
  const character = useMemo(() => characterOfNote(AssetService.getInstance(app).loadedTokenAssets(), notePath) ?? undefined, [app, notePath, assets]);
  // Only a player character's note follows the maps and the campaign
  useEffect(() => (character ? watchValues(app, refresh) : undefined), [app, character]);

  return useMemo((): StatblockTokenContext | undefined => {
    if (!character) return (last.current = undefined);
    const rest = characterRestOf(app, character, { notePath, templateId: template.id, template, record });
    const definitions = collectionResources(AssetService.getInstance(app).getCollectionSettings(character.collection));
    const resources = Object.fromEntries(rest.character.resources.flatMap((definition): [string, ResourceValue][] => {
      const value = rest.character.resourceValue(definition.key);
      return value ? [[definition.key, value]] : [];
    }));
    const id = rest.holds[0]?.tokenIds[0] ?? character.id;
    const kept = last.current;
    if (kept?.id === id && kept.name === character.name && kept.imagePath === character.imagePath
      && sameValues(kept.resources ?? {}, resources) && sameDefinitions(kept.definitions ?? [], definitions)) return kept;
    // Kept only to hand the card the same object while nothing changed; a render thrown away costs one redraw
    return (last.current = { id, name: character.name, imagePath: character.imagePath, resources, definitions });
    // `revision` reads the maps and the campaign's values again after they changed.
  }, [app, character, notePath, template, record, revision]);
}
