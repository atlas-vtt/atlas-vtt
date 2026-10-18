import { mapResources } from '../../../../resources/collectionResources';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import { App as ObsidianApp } from 'obsidian';
import type { TokenAsset, AnyAsset, EncounterAsset } from '../types';
import { loadStatblockOverrides, type StatblockOverrides } from './statblockLoader';
import type { AssetService } from '../../../../services/AssetService';
import {
  FALLBACK_PITCH,
  cellPitch,
  formationGridFromOptions,
  placeFormation,
  type FormationGrid,
  type FormationSlot,
} from '../../../../encounters/encounterFormation';
import type { AtlasView } from '../../../../atlas-view';
import type { TokenInput } from '../../../../types/viewState';
import { loadAtlasView } from '../../../../plugin/atlasLeaves';
import { tokenFromFile } from '../../../../resources/resourceFileFormat';
import { t } from '../../../../i18n';
import { mapVisionDefaults } from '../../../../gameSystems/visionDefaults';
import { systemPresetsOf } from '../../../../services/mapCollectionRules';
import { rulesLookup } from '../../../../services/mapRules';
import type { TokenVision, TokenVisionDefaults } from '../../../../types/lightingTypes';
import { placementVision } from '../../../../creatures/placementVision';
import { isPlayerCharacter } from '../../../../characters/playerCharacters';
import { showNotice } from '../../../../ui/notice';
import { isImageUrl } from '../../../../utils/imageSource';

// ─── Viewport helpers ───────────────────────────────────────────────

interface ViewportLike {
  screenWidth: number;
  screenHeight: number;
  toWorld(point: { x: number; y: number }): { x: number; y: number };
  x?: number;
  y?: number;
  scale: { x: number };
  getVisibleBounds?(): { left: number; right: number; top: number; bottom: number };
  animate?(opts: { position: { x: number; y: number }; scale: number; time: number }): void;
}

interface GridSystemLike {
  getOptions(): { type?: string; size: number; offsetX?: number; offsetY?: number; enabled?: boolean };
  snapTokenCenter(x: number, y: number, tokenSize: number): { x: number; y: number };
}

export interface SpawnContext {
  app: ObsidianApp;
  /** The view the asset manager belongs to; null for the global asset manager. */
  view: AtlasView | null;
  assetService: AssetService | null;
}

interface SpawnTarget {
  view: AtlasView;
  viewport: ViewportLike;
  gridSystem: GridSystemLike | null;
  /** Grid geometry for formation placement; null when the grid is off or unusable. */
  grid: FormationGrid | null;
  /** Spacing between spawned tokens. */
  pitch: number;
}

/**
 * The scene spawned tokens go to: the asset manager's own view or, for the global
 * asset manager, the open Atlas view, looked up now since the scene may have changed
 * since the manager opened. Null, after telling the user, while no scene is ready.
 */
async function getSpawnTarget(ctx: SpawnContext): Promise<SpawnTarget | null> {
  const view = ctx.view ?? await loadAtlasView(ctx.app);
  if (!view) {
    showNotice('No scene is open. Open a scene to add tokens to it.');
    return null;
  }
  if (view !== ctx.view) void ctx.app.workspace.revealLeaf(view.leaf);
  const rendererService = view.serviceManager.getRendererService();
  const viewport = rendererService.getViewport() as ViewportLike | null;
  const { mapPath, isMapLoading } = view.getStore().getState();
  if (!viewport || !mapPath || isMapLoading) {
    showNotice('The scene is still loading. Add the tokens once it is open.');
    return null;
  }
  const gridSystem = rendererService.getGridSystem() as GridSystemLike | null;
  const grid = formationGridFromOptions(gridSystem?.getOptions());
  return { view, viewport, gridSystem, grid, pitch: grid ? cellPitch(grid) : FALLBACK_PITCH };
}

function getViewportCenter(viewport: ViewportLike): { x: number; y: number } {
  try {
    const centerScreen = { x: viewport.screenWidth / 2, y: viewport.screenHeight / 2 };
    return viewport.toWorld(centerScreen);
  } catch {
    return { x: viewport.x || 0, y: viewport.y || 0 };
  }
}

// ─── Grid layout helper ─────────────────────────────────────────────

function gridPosition(
  index: number,
  total: number,
  centerX: number,
  centerY: number,
  cellSize: number,
  gridSystem: GridSystemLike | null,
  tokenSize: number
): { x: number; y: number } {
  const tokensPerRow = Math.ceil(Math.sqrt(total));
  const totalRows = Math.ceil(total / tokensPerRow);
  const row = Math.floor(index / tokensPerRow);
  const col = index % tokensPerRow;

  let x = centerX + (col - (tokensPerRow - 1) / 2) * cellSize;
  let y = centerY + (row - (totalRows - 1) / 2) * cellSize;

  if (gridSystem) {
    const snapped = gridSystem.snapTokenCenter(x, y, tokenSize);
    x = snapped.x;
    y = snapped.y;
  }

  return { x, y };
}

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

// ─── Build token data ───────────────────────────────────────────────

interface TokenSpawnData extends StatblockOverrides {
  x: number;
  y: number;
  imagePath: string;
  /** The library token it was placed from (`libraryTokenOf`). */
  assetId?: string;
  kind: 'character';
  name: string;
  statblockPath?: string;
  size?: number;
  showRing?: boolean;
  vision?: TokenVision;
}

/** What a spawned token inherits from its asset. */
interface TokenSource {
  /** The library token record the source was resolved from; unset when none was found. */
  assetId?: string | undefined;
  imagePath: string;
  name: string;
  statblockPath: string | null;
  size?: number | undefined;
  showRing?: boolean | undefined;
  /** Placed from one of the players' characters (`isPlayerCharacter`): its token sees by default. */
  playerCharacter: boolean;
}

/** Fields an asset-manager view model or stored token reference may carry. */
interface TokenSourceRef {
  id?: string;
  name?: string;
  imagePath?: string;
  imageUrl?: string;
  statblockPath?: string;
  size?: number;
  showRing?: boolean;
}

/** Latest service record for the asset layered over the reference, so spawns use current paths and defaults. */
async function resolveTokenSource(ctx: SpawnContext, ref: TokenSourceRef): Promise<TokenSource | null> {
  const latest = ctx.assetService && ref.id ? await ctx.assetService.getAssetById(ref.id) : null;
  const record = latest?.type === 'token' ? latest : null;
  const imagePath = record?.imagePath ?? ref.imagePath ?? ref.imageUrl;
  if (!imagePath) {
    console.error('[tokenSpawnService] Token asset missing imagePath:', ref);
    return null;
  }
  return {
    ...(record && { assetId: record.id }),
    imagePath,
    name: ref.name || t('initiative.token'),
    statblockPath: record?.statblockPath ?? ref.statblockPath ?? null,
    size: record?.size ?? ref.size,
    showRing: record?.showRing ?? ref.showRing,
    playerCharacter: record !== null && isPlayerCharacter(record),
  };
}

/** What new tokens start with in the scene they are spawned into, from its collection. */
function spawnVisionDefaults(ctx: SpawnContext, target: SpawnTarget): TokenVisionDefaults | undefined {
  return ctx.assetService
    ? mapVisionDefaults(rulesLookup(ctx.app, ctx.assetService), target.view.getStore().getState().mapPath, systemPresetsOf(ctx.app))
    : undefined;
}

/** Builds a token from its asset; `visionDefaults` (the placing collection's) start vision off but for a player character (`placementVision`). */
async function buildTokenData(
  app: ObsidianApp,
  pos: { x: number; y: number },
  { assetId, imagePath, name, statblockPath, size, showRing, playerCharacter }: TokenSource,
  definitions: readonly ResourceDefinition[],
  visionDefaults: TokenVisionDefaults | undefined,
): Promise<TokenSpawnData> {
  const data: TokenSpawnData = {
    x: pos.x,
    y: pos.y,
    imagePath,
    kind: 'character',
    name,
  };

  if (assetId !== undefined) data.assetId = assetId;
  if (size !== undefined) data.size = size;
  if (showRing !== undefined) data.showRing = showRing;

  if (statblockPath) {
    data.statblockPath = statblockPath;
    const overrides = await loadStatblockOverrides(app, statblockPath, definitions);
    Object.assign(data, overrides);
  }

  const vision = placementVision(visionDefaults, Boolean(statblockPath), playerCharacter);
  if (vision) data.vision = vision;

  return data;
}

/** The resources of the rules the target map plays by. */
function targetResources(ctx: SpawnContext, target: SpawnTarget): ResourceDefinition[] {
  return mapResources(rulesLookup(ctx.app, ctx.assetService ?? undefined), target.view.getStore().getState().mapPath);
}

/** Whether a token's art can be shown: web art is loaded when shown, a vault path must name a file. */
function imageExists(app: ObsidianApp, imagePath: string): boolean {
  if (isImageUrl(imagePath) || app.vault.getAbstractFileByPath(imagePath)) return true;
  console.error(`[tokenSpawnService] Token image not found: ${imagePath}`);
  return false;
}

/** Adds the tokens to the target's scene in one store write (a single undo step) and selects them. */
function addSpawnedTokens(target: SpawnTarget, tokens: TokenInput[]): string[] {
  const { addTokens, setSelection } = target.view.getStore().getState();
  const ids = addTokens(tokens);
  if (ids.length > 0) setSelection(ids);
  return ids;
}

// ─── Public spawn functions ─────────────────────────────────────────

/**
 * Spawn one or more copies of a single token asset on the map.
 */
export async function spawnTokenAsset(
  ctx: SpawnContext,
  asset: TokenAsset,
  count: number
): Promise<string[]> {
  const target = await getSpawnTarget(ctx);
  if (!target) return [];
  const { viewport, grid, pitch } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const source = await resolveTokenSource(ctx, asset);
  if (!source) return [];

  // The statblock is read once; every copy shares that data at its own position.
  const template = await buildTokenData(ctx.app, center, source, targetResources(ctx, target), spawnVisionDefaults(ctx, target));
  const tokens = Array.from({ length: count }, (_, i): TokenInput => ({
    ...structuredClone(template),
    ...gridPosition(i, count, center.x, center.y, pitch, gridSystem, template.size || 1),
  }));
  return addSpawnedTokens(target, tokens);
}

/**
 * Spawn all tokens from an encounter asset and report how many made it onto the map.
 */
export async function spawnEncounterTokens(
  ctx: SpawnContext,
  encounter: EncounterAsset
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

  const definitions = targetResources(ctx, target);
  const visionDefaults = spawnVisionDefaults(ctx, target);
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
        tokens.push({ ...tokenFromFile(token.state), imagePath: token.imagePath, x: pos.x, y: pos.y });
      }
      continue;
    }
    const source = await resolveTokenSource(ctx, token);
    if (source && imageExists(ctx.app, source.imagePath)) {
      tokens.push(await buildTokenData(ctx.app, pos, source, definitions, visionDefaults));
    }
  }

  const ids = addSpawnedTokens(target, tokens);
  showNotice(ids.length < tokensToSpawn.length
    ? t('am.spawnedPartial', { count: ids.length, expected: tokensToSpawn.length, name: encounter.name })
    : t('am.spawned', { count: ids.length, name: encounter.name }));
  return ids;
}

/**
 * Spawn multiple selected token assets (from context menu "Spawn N tokens on map").
 */
export async function spawnSelectedTokens(
  ctx: SpawnContext,
  selectedAssets: AnyAsset[]
): Promise<string[]> {
  const target = await getSpawnTarget(ctx);
  if (!target) return [];
  const { viewport, grid, pitch } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const tokensToSpawn = selectedAssets.filter(a => a.type === 'tokens');

  const definitions = targetResources(ctx, target);
  const visionDefaults = spawnVisionDefaults(ctx, target);
  const tokens: TokenInput[] = [];
  for (let i = 0; i < tokensToSpawn.length; i++) {
    const tokenAsset = tokensToSpawn[i];
    if (!tokenAsset) continue;

    const source = await resolveTokenSource(ctx, tokenAsset);
    if (!source) continue;
    const pos = gridPosition(i, tokensToSpawn.length, center.x, center.y, pitch, gridSystem, source.size || 1);
    tokens.push(await buildTokenData(ctx.app, pos, source, definitions, visionDefaults));
  }

  return addSpawnedTokens(target, tokens);
}
