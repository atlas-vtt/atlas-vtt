import type { TokenAsset, AnyAsset, EncounterAsset } from '../types';
import { placeFormation, type FormationSlot } from '../../../../encounters/encounterFormation';
import type { TokenInput } from '../../../../types/viewState';
import { tokenFromFile } from '../../../../resources/resourceFileFormat';
import { addOffMapCombatants, joinInitiative } from '../../../../initiative/offMapCombatants';
import { t } from '../../../../i18n';
import { showNotice } from '../../../../ui/notice';
import { getSpawnTarget, getViewportCenter, gridPosition, type SpawnContext, type SpawnTarget } from './spawnTarget';
import { buildTokenData, imageExists, joiningSavedToken, resolveTokenSource, spawnRules } from './tokenSpawnData';
import { tokenDiameterInCells } from '../../../../pixi/token-renderer/tokenSizing';
import type { ViewAtlasStore } from '../../../../storeFactory';

export type { SpawnContext } from './spawnTarget';

/**
 * Where spawned tokens go: onto the map (`map`), onto it and into the initiative tracker (`fight`),
 * or into the tracker beside the map (`beside`, `tokens/offMap.ts`), where they wait in a column
 * left of the map image.
 */
export type SpawnPlacement = 'map' | 'fight' | 'beside';

/** Formation slots for an encounter, or null if any token lacks captured layout data. */
function encounterSlots(encounter: EncounterAsset): FormationSlot[] | null {
  if (!encounter.formation) return null;
  const slots: FormationSlot[] = [];
  for (const token of encounter.tokens ?? []) {
    if (!token.cell || !token.offset) return null;
    slots.push({ cell: token.cell, offset: token.offset });
  }
  return slots;
}

/** Adds tokens to the map in one store write (a single undo step) and, for a fight, puts them in the tracker. */
function addToMap(store: ViewAtlasStore, tokens: TokenInput[], placement: SpawnPlacement): string[] {
  const ids = store.getState().addTokens(tokens);
  if (placement === 'fight') joinInitiative(store, ids);
  return ids;
}

/**
 * Brings the tokens into the target's scene. Beside the map they go straight into the tracker. On
 * it the GM places them by hand where the map can (`TokenPlacer`): they wait in the GM's hand,
 * laid out as given, and each is added as it is put down, the selection left as it was; elsewhere
 * they are added as laid out and selected, so the GM finds them. Resolves with the ids of the tokens added.
 */
async function addSpawnedTokens(ctx: SpawnContext, target: SpawnTarget, tokens: TokenInput[], placement: SpawnPlacement): Promise<string[]> {
  const store = target.view.getStore();
  if (placement === 'beside') return addOffMapCombatants(store, tokens);
  if (tokens.length === 0) return [];
  if (target.placer) {
    const placing = target.placer.place({ tokens, commit: (placed) => addToMap(store, placed, placement) });
    ctx.onPlacing?.();
    ctx.app.workspace.setActiveLeaf(target.view.leaf, { focus: true });
    return placing;
  }
  const ids = addToMap(store, tokens, placement);
  if (ids.length > 0) store.getState().setSelection(ids);
  return ids;
}

/** Spacing for tokens laid out together: the widest footprint among them, so none overlap. */
function layoutPitch(target: SpawnTarget, sizes: ReadonlyArray<number | undefined>): number {
  return target.pitch * Math.max(1, ...sizes.map((size) => tokenDiameterInCells(size || 1)));
}

// ─── Public spawn functions ─────────────────────────────────────────

/** Copies of one token asset to spawn together. */
export interface TokenGroup {
  asset: TokenAsset;
  count: number;
}

/**
 * Spawn copies of token assets in one store write (one undo step): on the map around its view's
 * centre, or beside it into the tracker (`placement`). Each asset's statblock is read once; each
 * copy rolls its own hit points where the rules say so.
 */
export async function spawnTokenGroups(ctx: SpawnContext, groups: readonly TokenGroup[], placement: SpawnPlacement = 'map'): Promise<string[]> {
  const target = await getSpawnTarget(ctx);
  if (!target) return [];
  const { viewport, grid } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const rules = spawnRules(ctx, target);

  const built = [];
  for (const { asset, count } of groups) {
    const source = await resolveTokenSource(ctx, asset);
    if (source) built.push({ token: await buildTokenData(ctx.app, center, source, rules), count });
  }
  const total = built.reduce((sum, { count }) => sum + count, 0);
  const pitch = layoutPitch(target, built.map(({ token }) => token.data.size));
  const tokens: TokenInput[] = [];
  for (const { token, count } of built) {
    for (let copy = 0; copy < count; copy++) {
      tokens.push({ ...token.joined(), ...gridPosition(tokens.length, total, center.x, center.y, pitch, gridSystem, token.data.size || 1) });
    }
  }
  return addSpawnedTokens(ctx, target, tokens, placement);
}

/** Spawn `count` copies of a single token asset (`spawnTokenGroups`). */
export function spawnTokenAsset(ctx: SpawnContext, asset: TokenAsset, count: number, placement: SpawnPlacement = 'map'): Promise<string[]> {
  return spawnTokenGroups(ctx, [{ asset, count }], placement);
}

/**
 * Spawn all tokens from an encounter asset (`placement`: on the map in its formation, on it and
 * into the tracker for a fight, or beside it into the tracker) and report how many it added.
 */
export async function spawnEncounterTokens(
  ctx: SpawnContext,
  encounter: EncounterAsset,
  placement: SpawnPlacement = 'map',
): Promise<string[]> {
  const target = await getSpawnTarget(ctx);
  if (!target) return [];
  const { viewport, grid, pitch } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const tokensToSpawn = encounter.tokens || [];

  const slots = encounterSlots(encounter);
  const formationPositions = slots && encounter.formation
    ? placeFormation(slots, encounter.formation, center, grid, tokensToSpawn.map((token) => token.size))
    : null;

  const rules = spawnRules(ctx, target);
  const tokens: TokenInput[] = [];
  for (let i = 0; i < tokensToSpawn.length; i++) {
    const token = tokensToSpawn[i];
    if (!token) continue;

    // Captured formation → legacy absolute offsets → generic grid layout
    let pos: { x: number; y: number };
    const formationPos = formationPositions?.[i];
    if (formationPos) {
      pos = formationPos;
    } else if (token.x !== undefined && token.y !== undefined) {
      let x = center.x + token.x;
      let y = center.y + token.y;
      if (gridSystem) {
        const snapped = gridSystem.snapTokenCenter(x, y, token.size || 1);
        x = snapped.x;
        y = snapped.y;
      }
      pos = { x, y };
    } else {
      pos = gridPosition(i, tokensToSpawn.length, center.x, center.y, pitch, gridSystem, token.size || 1);
    }

    // A saved state snapshot is restored as saved (in today's token format). Encounters built from token
    // assets rebuild from the asset, so they follow its current image, size and ring.
    if (token.state) {
      if (imageExists(ctx.app, token.imagePath)) {
        tokens.push(await joiningSavedToken(ctx, { ...tokenFromFile(token.state), imagePath: token.imagePath, x: pos.x, y: pos.y }, rules));
      }
      continue;
    }
    const source = await resolveTokenSource(ctx, token);
    if (source && imageExists(ctx.app, source.imagePath)) {
      tokens.push((await buildTokenData(ctx.app, pos, source, rules)).joined());
    }
  }

  const ids = await addSpawnedTokens(ctx, target, tokens, placement);
  // Placed by hand, the GM may have put every token away again
  if (ids.length === 0 && tokens.length > 0 && placement !== 'beside') return ids;
  showNotice(ids.length < tokensToSpawn.length
    ? t(placement === 'beside' ? 'am.besidePartial' : 'am.spawnedPartial', { count: ids.length, expected: tokensToSpawn.length, name: encounter.name })
    : t(placement === 'beside' ? 'am.beside' : 'am.spawned', { count: ids.length, name: encounter.name }));
  return ids;
}

/**
 * Spawn multiple selected token assets (from context menu "Spawn N tokens on map", or beside the map into the tracker).
 */
export async function spawnSelectedTokens(
  ctx: SpawnContext,
  selectedAssets: AnyAsset[],
  placement: SpawnPlacement = 'map',
): Promise<string[]> {
  const target = await getSpawnTarget(ctx);
  if (!target) return [];
  const { viewport, grid } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const tokensToSpawn = selectedAssets.filter(a => a.type === 'tokens');

  const rules = spawnRules(ctx, target);
  const sources = [];
  for (const tokenAsset of tokensToSpawn) {
    const source = await resolveTokenSource(ctx, tokenAsset);
    if (source) sources.push(source);
  }
  const pitch = layoutPitch(target, sources.map((source) => source.size));
  const tokens: TokenInput[] = [];
  for (const [i, source] of sources.entries()) {
    const pos = gridPosition(i, sources.length, center.x, center.y, pitch, gridSystem, source.size || 1);
    tokens.push((await buildTokenData(ctx.app, pos, source, rules)).joined());
  }

  return addSpawnedTokens(ctx, target, tokens, placement);
}

/**
 * Runs `spawn` and calls `onClose` once: as soon as the tokens are in the GM's hand to be placed,
 * or once they were added, so the asset manager gets out of the way of the map.
 */
export async function spawnAndClose(ctx: SpawnContext, onClose: () => void, spawn: (ctx: SpawnContext) => Promise<string[]>): Promise<string[]> {
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    onClose();
  };
  const ids = await spawn({ ...ctx, onPlacing: close });
  if (ids.length > 0) close();
  return ids;
}
