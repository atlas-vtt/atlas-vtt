import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import { copyMapObjects, holdsMapClipboard } from '../clipboard/mapClipboardActions';
import { saveMapTokensAsEncounter } from '../encounters/saveMapTokensAsEncounter';
import type { GridSystem } from '../grid/GridSystem';
import { resizedTokenCenter } from '../grid/gridPlacement';
import { t } from '../i18n';
import { levelObjects } from '../levels/levelObjects';
import type { TokenMovement } from '../pixi/token-renderer/tokenMovement';
import { conditionsSubmenu } from '../react/components/context-menu/conditionsMenu';
import { selectionResourceEntry } from '../react/components/context-menu/selectionResourceMenu';
import { tokenAuraSubmenu } from '../react/components/context-menu/tokenAuraMenu';
import { tokenHeightSubmenu } from '../react/components/context-menu/tokenHeightMenu';
import { tokenLevelSubmenu } from '../react/components/context-menu/tokenLevelMenu';
import { tokenLightingEntries } from '../react/components/context-menu/tokenLightingMenu';
import { tokenMovementSubmenu } from '../react/components/context-menu/tokenMovementMenu';
import { tokenSizeSubmenu } from '../react/components/context-menu/tokenSizeMenu';
import type { ResourceDefinition } from '../resources/resourceTypes';
import { isKillable } from '../resources/resourceValues';
import { visibleResources } from '../resources/visibleResources';
import { AssetService } from '../services/AssetService';
import { mapLightPresets } from '../services/mapCollectionRules';
import { mapMeasurementSettings } from '../services/mapMeasurementSettings';
import { rulesLookup } from '../services/mapRules';
import { StatblockDialogService } from '../services/StatblockDialogService';
import { TokenStatblockLinkService } from '../services/TokenStatblockLinkService';
import { createStatblockEntry, newStatblockOption, type TokenCreationContext } from '../statblocks/editor/create/entryPoints';
import type { ViewAtlasState } from '../storeFactory';
import { initiativeEntryForToken } from '../stores/initiativeEntries';
import { mapTokens } from '../tokens/offMap';
import type { Character, TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import { runInBackground } from '../utils/backgroundTask';
import { actionOf, PRIMARY_ORDER, WHOLE_SELECTION, type SelectionAction } from './selectionActions';
import { deleteWholeSelection, groupOf } from './wholeSelection';

/** What the actions of a token need of the view it stands in. */
export interface TokenActionHost {
  readonly store: StoreApi<ViewAtlasState>;
  readonly app: App;
  readonly grid: GridSystem;
  readonly isPlayerView: boolean;
  /** The map's movement rules; a view without them offers no speed. */
  readonly movement: TokenMovement | undefined;
  /** The pointer is a finger: the menu also holds what a keyboard does elsewhere (Paste). */
  readonly touch: boolean;
  conditions(): ConditionDefinition[];
  resources(): readonly ResourceDefinition[];
  editToken(token: TokenEntity): void;
  /** Opens the popover of one change of a resource for the selection's tokens, at a point of the window. */
  changeResource(at: { x: number; y: number }, resourceName: string, count: number, apply: (amount: number) => void): void;
  /** Pastes what was copied in the middle of what the view shows. */
  paste(): void;
  /** Opens the token's statblock preview at a point of the window, as a held Mod over the token does. */
  preview(character: Character, at: { x: number; y: number }): void;
}

const RING_COLORS = (): { name: string; value: string | null }[] => [
  { name: t('color.default'), value: null },
  { name: t('color.blue'), value: '#086ddd' },
  { name: t('color.orange'), value: '#ec7500' },
  { name: t('color.red'), value: '#e93147' },
  { name: t('color.yellow'), value: '#e0ac00' },
  { name: t('color.brown'), value: '#a97142' },
  { name: t('color.purple'), value: '#7852ee' },
  { name: t('color.green'), value: '#08b94e' },
  { name: t('color.pink'), value: '#d53984' },
  { name: t('color.cyan'), value: '#00bfbc' },
  { name: t('color.gray'), value: '#ababab' },
  { name: t('color.white'), value: '#ffffff' },
];

/** The selected tokens when `tokenId` is one of them, otherwise that token alone. */
function targetsOf(state: ViewAtlasState, tokenId: string): string[] {
  if (!state.selectedIds.includes(tokenId)) return [tokenId];
  const tokens = mapTokens(levelObjects(state));
  return state.selectedIds.filter((id) => tokens[id] !== undefined);
}

/** The characters among the tokens `ids`, as the store holds them now. */
function charactersOf(state: ViewAtlasState, ids: readonly string[]): Character[] {
  const tokens = mapTokens(levelObjects(state));
  return ids.flatMap((id) => {
    const shown = tokens[id];
    return shown?.kind === 'character' ? [shown] : [];
  });
}

/** Adds the tokens to the initiative, or takes them out, and opens the tracker. */
function toggleInitiative(store: StoreApi<ViewAtlasState>, tokenIds: readonly string[], remove: boolean): void {
  if (!store.getState().initiativeTrackerOpen) store.getState().setInitiativeTrackerOpen(true);
  for (const tokenId of tokenIds) {
    const state = store.getState();
    const { initiative, addToInitiative, removeFromInitiative } = state;
    const entry = initiative.entries.find((e) => e.tokenId === tokenId);
    const token = mapTokens(levelObjects(state))[tokenId];
    if (remove && entry) removeFromInitiative(entry.id);
    else if (!remove && !entry && token) addToInitiative(initiativeEntryForToken(token));
  }
}

/** A statblock made for the token: named after it, linked to it on this map too, in the map's collection. */
function creationContext({ app, store }: TokenActionHost, token: TokenEntity, name: string): TokenCreationContext {
  const mapPath = store.getState().mapPath;
  return {
    collectionId: mapPath ? AssetService.getInstance(app).getCollectionForMap(mapPath) : null,
    from: 'map',
    token: { imagePath: token.imagePath, name },
    onLinked: (statblockPath) => store.getState().updateToken(token.id, { statblockPath }),
  };
}

function linkStatblock(host: TokenActionHost, token: TokenEntity, character: Character | undefined): void {
  const { app, store } = host;
  if (!app || !token.imagePath) return;
  const dialogService = new StatblockDialogService(app);
  const linkService = TokenStatblockLinkService.getInstance(app);
  dialogService.showStatblockDialog(
    null,
    (statblockPath: string | null) => {
      if (!statblockPath) return;
      runInBackground(
        linkService.linkTokenToStatblock(token.imagePath, statblockPath).then(() => {
          store.getState().updateToken(token.id, { statblockPath });
        }),
        `Linking statblock ${statblockPath}`,
        t('token.linkFailed'),
      );
    },
    character?.name || t('initiative.token'),
    { imagePath: token.imagePath, showRing: token.showRing },
    newStatblockOption(app, creationContext(host, token, character?.name || 'Token')),
  );
}

/**
 * What can be done with `token` and the selection it belongs to, in the menu's order. The token
 * decides what a row shows as current (its size, its ring, whether it is hidden); a row acts on
 * every selected token when the token is one of them, otherwise on it alone, in one undo step.
 * Duplicate, Copy and Delete act on everything selected with it, drawings and texts too. `at` is
 * where the menu opens, which a popover it leads to hangs from.
 */
export function tokenActions(host: TokenActionHost, token: TokenEntity, at: { x: number; y: number }): SelectionAction[] {
  const { store, app, isPlayerView } = host;
  const state = store.getState();
  const character = token.kind === 'character' ? token : undefined;
  const targets = targetsOf(state, token.id);
  const settings = (): ReturnType<typeof mapMeasurementSettings> => mapMeasurementSettings(rulesLookup(app), store.getState());
  const actions: SelectionAction[] = [];
  const add = (action: SelectionAction | null): void => {
    if (action) actions.push(action);
  };

  const conditions = host.conditions();
  if (conditions.length > 0) {
    add(actionOf('conditions', conditionsSubmenu(store, conditions, targets), { order: PRIMARY_ORDER.conditions, label: t('menu.conditions') }));
  }

  // Size of the selection in one undo step; the token's is ticked
  add(actionOf('size', tokenSizeSubmenu(token.size, (size) => {
    const now = store.getState();
    const tokens = mapTokens(levelObjects(now));
    now.updateTokens(targets.flatMap((id) => {
      const current = tokens[id];
      if (!current) return [];
      const center = resizedTokenCenter(current, current.size || 1, size, now.grid);
      return [{ id, changes: { size, x: center.x, y: center.y } }];
    }));
  })));

  // The speed the selection moves by, where their statblocks state several
  const movement = host.movement ? tokenMovementSubmenu(store, token.id, targets, host.movement) : null;
  if (movement) add(actionOf('movement', movement));

  // Move to another level of the scene, the selection in one undo step
  const level = tokenLevelSubmenu(store, targets);
  if (level) add(actionOf('level', level));

  // How far off the floor the selection stands, where the map measures distances; the GM's to say
  const height = isPlayerView ? null : tokenHeightSubmenu(store, targets, settings);
  if (height) add(actionOf('height', height));

  // An area around each token of the selection that goes where the token goes; the GM's to give
  const aura = isPlayerView ? null : tokenAuraSubmenu(store, targets, settings);
  if (aura) add(actionOf('aura', aura));

  // Hide or show the selection in one undo step; the token decides which way
  const isHidden = mapTokens(levelObjects(state))[token.id]?.isHidden || false;
  add({
    kind: 'run', id: 'visibility', enabled: true,
    label: isHidden ? t('token.show') : t('token.hide'),
    icon: isHidden ? 'eye' : 'eye-off',
    run: () => store.getState().updateTokens(targets.map((id) => ({ id, changes: { isHidden: !isHidden } }))),
  });

  if (!isPlayerView) {
    // Vision and carried light, for the selection the token belongs to
    const [vision, light] = tokenLightingEntries(store, token.id, targets, mapLightPresets(app, state));
    if (vision) add(actionOf('vision', vision));
    if (light) add(actionOf('carry-light', light));

    // Everything selected with the token, of every kind
    const group = groupOf(state, token.id);
    add({
      kind: 'run', id: WHOLE_SELECTION.duplicate, enabled: true, label: t('common.duplicate'), icon: 'files',
      primary: { order: PRIMARY_ORDER.duplicate, label: t('common.duplicate') },
      run: () => store.getState().duplicateMapObjects(group),
    });
    add({ kind: 'run', id: WHOLE_SELECTION.copy, enabled: true, label: t('common.copy'), icon: 'copy', run: () => copyMapObjects(store, group) });
    if (host.touch) {
      add({ kind: 'run', id: WHOLE_SELECTION.paste, enabled: holdsMapClipboard(), label: t('selection.paste'), icon: 'clipboard-paste', run: () => host.paste() });
    }
    add({
      kind: 'run', id: 'save-encounter', enabled: true, label: t('token.saveEncounter'), icon: 'swords',
      run: () => {
        void saveMapTokensAsEncounter(app, store, host.grid, group);
      },
    });
  }

  add({
    kind: 'run', id: 'edit', enabled: true, label: t('editToken.title'), icon: 'edit',
    primary: { order: PRIMARY_ORDER.edit, label: t('common.edit') },
    run: () => host.editToken(token),
  });

  // Initiative, for the selection the token belongs to; the token decides which way
  const isInInitiative = (state.initiative?.entries || []).some((entry) => entry.tokenId === token.id);
  add({
    kind: 'run', id: 'initiative', enabled: true,
    label: isInInitiative ? t('initiative.remove') : t('token.addInitiative'),
    icon: 'swords',
    run: () => toggleInitiative(store, targets, isInInitiative),
  });

  // The statblock a held Mod shows over the token, for a hand that holds no key
  if (character?.statblockPath?.trim()) {
    add({ kind: 'run', id: 'preview', enabled: true, label: t('preview.show'), icon: 'eye', run: () => host.preview(character, at) });
  }

  // A token without a statblock can be given one here. Editing and unlinking one are the asset manager's.
  if (!character?.statblockPath) {
    add({ kind: 'run', id: 'link-statblock', enabled: true, label: t('am.menu.linkStatblock'), icon: 'link', run: () => linkStatblock(host, token, character) });
    const create = token.imagePath ? createStatblockEntry(app, creationContext(host, token, character?.name || 'Token')) : null;
    if (create) add(actionOf('create-statblock', create));
  }

  // Ring colour of the selection in one undo step; the token's colour is ticked
  add({
    kind: 'choices', id: 'ring', enabled: true, label: t('token.ringColor'), icon: 'circle',
    choices: RING_COLORS().map((color) => ({
      type: 'item' as const,
      label: color.name,
      checked: color.value === token.ringColor || (color.value === null && !token.ringColor),
      onClick: () => store.getState().updateTokens(targets.map((id) => ({ id, changes: { ringColor: color.value ?? undefined } }))),
    })),
  });

  // One change of a resource for every selected token that holds it (an area's damage), the GM's
  const resources = host.resources();
  const change = isPlayerView ? null : selectionResourceEntry(
    store, targets, resources,
    (definition, count, apply) => host.changeResource(at, definition.name, count, apply),
  );
  if (change) add(actionOf('change-resource', change));

  // Reset the selection (only if one of its tokens tracks resources)
  const characters = charactersOf(state, targets);
  if (characters.some((one) => visibleResources(one, resources, 'dm').length > 0)) {
    add({ kind: 'run', id: 'reset', enabled: true, label: t('token.reset'), icon: 'rotate-ccw', run: () => store.getState().resetTokens(targets, resources) });
  }

  // What ends a token, side by side: Kill where one of them has a resource that defeats it when spent
  if (characters.some((one) => isKillable(one, resources))) {
    add({ kind: 'run', id: 'kill', enabled: true, sideBySide: true, label: t('token.kill'), icon: 'skull', run: () => store.getState().killTokens(targets, resources) });
  }
  add({
    kind: 'run', id: WHOLE_SELECTION.delete, enabled: true, sideBySide: true, destructive: true, label: t('common.delete'), icon: 'trash',
    primary: { order: PRIMARY_ORDER.delete, label: t('common.delete') },
    run: () => deleteWholeSelection(store, token.id, targets),
  });

  return actions;
}
