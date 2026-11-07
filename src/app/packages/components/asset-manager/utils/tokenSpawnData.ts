import type { App as ObsidianApp } from 'obsidian';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import type { TokenVision, TokenVisionDefaults } from '../../../../types/lightingTypes';
import type { TokenInput } from '../../../../types/viewState';
import { mapResources } from '../../../../resources/collectionResources';
import { hitPointResource, rollHitDice, withRolledHitPoints } from '../../../../resources/joiningHitPoints';
import { mapVisionDefaults } from '../../../../gameSystems/visionDefaults';
import { collectionInitiativeRules } from '../../../../gameSystems/initiativeRules';
import { rulesForMap } from '../../../../gameSystems/mapRules';
import { systemPresetsOf } from '../../../../services/mapCollectionRules';
import { rulesLookup } from '../../../../services/mapRules';
import { placementVision } from '../../../../creatures/placementVision';
import { isPlayerCharacter } from '../../../../characters/playerCharacters';
import { t } from '../../../../i18n';
import { loadStatblockOverrides, type StatblockOverrides } from './statblockLoader';
import type { SpawnContext, SpawnTarget } from './spawnTarget';

export interface TokenSpawnData extends Omit<StatblockOverrides, 'hitDice'> {
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
  overriddenMax?: string[];
}

/** What a spawned token inherits from its asset. */
export interface TokenSource {
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
export interface TokenSourceRef {
  id?: string;
  name?: string;
  imagePath?: string;
  imageUrl?: string;
  statblockPath?: string;
  size?: number;
  showRing?: boolean;
}

/** What the scene tokens join decides about them: its collection's resources, vision defaults and initiative rules. */
export interface SpawnRules {
  definitions: readonly ResourceDefinition[];
  visionDefaults: TokenVisionDefaults | undefined;
  /** Rolls a joining creature's hit points (`InitiativeRules.rollHitPoints`) with this stream; null keeps the statblock's. */
  hitPointRoll: (() => number) | null;
}

/** Latest service record for the asset layered over the reference, so spawns use current paths and defaults. */
export async function resolveTokenSource(ctx: SpawnContext, ref: TokenSourceRef): Promise<TokenSource | null> {
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

/** The rules of the map `target` shows, read once for every token a spawn adds. */
export function spawnRules(ctx: SpawnContext, target: SpawnTarget): SpawnRules {
  const lookup = rulesLookup(ctx.app, ctx.assetService ?? undefined);
  const { mapPath } = target.view.getStore().getState();
  const { settings } = rulesForMap(lookup, mapPath);
  const rollsHitPoints = settings !== null && collectionInitiativeRules(settings, systemPresetsOf(ctx.app)).rollHitPoints === true;
  return {
    definitions: mapResources(lookup, mapPath),
    visionDefaults: ctx.assetService ? mapVisionDefaults(lookup, mapPath, systemPresetsOf(ctx.app)) : undefined,
    hitPointRoll: rollsHitPoints ? ctx.random : null,
  };
}

/** `data` with hit points rolled from `hitDice` where the rules roll them; a player character always keeps its own. */
function withJoiningHitPoints<T extends TokenInput>(data: T, hitDice: string | undefined, rules: SpawnRules, playerCharacter: boolean): T {
  const key = hitPointResource(rules.definitions)?.key;
  if (!rules.hitPointRoll || playerCharacter || hitDice === undefined || key === undefined) return data;
  const hp = rollHitDice(hitDice, rules.hitPointRoll);
  return hp === null ? data : { ...data, ...withRolledHitPoints(data, key, hp) };
}

/** A token built from its asset, read once however many copies of it join. */
export interface BuiltToken {
  data: TokenSpawnData;
  /** A copy as it joins the scene: with hit points of its own where the rules roll them. */
  joined(): TokenSpawnData;
}

/** Builds a token from its asset; vision starts off but for a player character (`placementVision`). */
export async function buildTokenData(
  app: ObsidianApp,
  pos: { x: number; y: number },
  { assetId, imagePath, name, statblockPath, size, showRing, playerCharacter }: TokenSource,
  rules: SpawnRules,
): Promise<BuiltToken> {
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

  let hitDice: string | undefined;
  if (statblockPath) {
    data.statblockPath = statblockPath;
    const { hitDice: dice, ...overrides } = await loadStatblockOverrides(app, statblockPath, rules.definitions);
    Object.assign(data, overrides);
    hitDice = dice;
  }

  const vision = placementVision(rules.visionDefaults, Boolean(statblockPath), playerCharacter);
  if (vision) data.vision = vision;

  return { data, joined: () => withJoiningHitPoints(structuredClone(data), hitDice, rules, playerCharacter) };
}

/**
 * A token an encounter saved with its whole state, as it joins: where the rules roll hit points,
 * those of a creature that links a statblock (never a player character's) are rolled anew.
 */
export async function joiningSavedToken(ctx: SpawnContext, token: TokenInput, rules: SpawnRules): Promise<TokenInput> {
  const { statblockPath } = token as { statblockPath?: unknown };
  if (!rules.hitPointRoll || typeof statblockPath !== 'string' || statblockPath === '') return token;
  const record = ctx.assetService && token.assetId ? await ctx.assetService.getAssetById(token.assetId) : null;
  const playerCharacter = record?.type === 'token' && isPlayerCharacter(record);
  const { hitDice } = await loadStatblockOverrides(ctx.app, statblockPath, rules.definitions);
  return withJoiningHitPoints(token, hitDice, rules, playerCharacter);
}

export function imageExists(app: ObsidianApp, imagePath: string): boolean {
  if (app.vault.getAbstractFileByPath(imagePath)) return true;
  console.error(`[tokenSpawnService] Token image not found: ${imagePath}`);
  return false;
}
