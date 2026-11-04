/**
 * Token resources as scene and encounter files hold them. The files keep the fields Atlas
 * wrote before resources were defined per collection (`hp`, `stress` and `maxStress`,
 * `hope`, `statblockResources`, the two bar switches of a scene, the copies in initiative
 * entries), so every version of Atlas reads every file. In memory a token holds
 * `resources` and a scene `hiddenResources`; nothing but this module knows the file's fields.
 */
import { isFiniteNumber, isRecord } from '../utils/guards';
import type { ResourceHolder, ResourceValue } from './resourceTypes';

/** Maxima the old bars showed for values stored as bare numbers; a larger number is its own maximum. */
const BARE_HP_MAX = 100;
const BARE_STRESS_MAX = 10;

/** The resources with fields of their own; every other one is an entry of `statblockResources`. */
const HP = 'hp';
const STRESS = 'stress';
const HOPE = 'hope';
const FILE_FIELDS = [HP, STRESS, 'maxStress', HOPE, 'statblockResources', 'maxHpOverridden', 'maxStressOverridden'] as const;

function valueOf(raw: unknown, bareMax: number): ResourceValue | null {
  if (isFiniteNumber(raw)) return { current: raw, max: Math.max(raw, bareMax) };
  if (isRecord(raw) && typeof raw.current === 'number' && typeof raw.max === 'number') return { current: raw.current, max: raw.max };
  return null;
}

/**
 * A token (or saved token state) as it is in memory. A `resources` entry in the file (builds
 * of this feature wrote one) is kept below the file's fields: where both name a resource,
 * an older Atlas wrote the field last.
 */
export function tokenFromFile<T extends object>(token: T): T & ResourceHolder {
  const file = token as Record<string, unknown>;
  if (!FILE_FIELDS.some((field) => field in file)) return token;

  const resources: Record<string, ResourceValue> = {};
  const put = (key: string, value: ResourceValue | null): void => { if (value) resources[key] = value; };
  const bareStressMax = typeof file.maxStress === 'number' && file.maxStress > 0 ? file.maxStress : BARE_STRESS_MAX;
  put(HP, valueOf(file.hp, BARE_HP_MAX));
  put(STRESS, valueOf(file.stress, bareStressMax));
  put(HOPE, valueOf(file.hope, BARE_STRESS_MAX));
  if (isRecord(file.statblockResources)) {
    for (const [key, value] of Object.entries(file.statblockResources)) {
      if (!(key in resources)) put(key, valueOf(value, 0));
    }
  }

  const overridden = new Set([
    ...(file.maxHpOverridden === true ? [HP] : []),
    ...(file.maxStressOverridden === true ? [STRESS] : []),
    ...(Array.isArray(file.overriddenMax) ? (file.overriddenMax as string[]) : []),
  ]);

  const next: Record<string, unknown> = { ...file };
  for (const field of FILE_FIELDS) delete next[field];
  delete next.overriddenMax;
  const merged = { ...(isRecord(file.resources) ? file.resources : {}), ...resources };
  if (Object.keys(merged).length > 0) next.resources = merged;
  if (overridden.size > 0) next.overriddenMax = [...overridden];
  return next as T & ResourceHolder;
}

/** A token as a file holds it; `tokenFromFile` reads it back unchanged. */
export function tokenToFile<T extends ResourceHolder>(token: T): object {
  const { resources, overriddenMax, ...rest } = token;
  if (!resources && !overriddenMax) return token;

  const { hp, stress, hope, ...others } = resources ?? {};
  const overridden = overriddenMax ?? [];
  const otherOverrides = overridden.filter((key) => key !== HP && key !== STRESS);
  return {
    ...rest,
    ...(hp && { hp }),
    ...(stress && { stress, maxStress: stress.max }),
    ...(hope && { hope }),
    ...(Object.keys(others).length > 0 && { statblockResources: others }),
    ...(overridden.includes(HP) && { maxHpOverridden: true }),
    ...(overridden.includes(STRESS) && { maxStressOverridden: true }),
    ...(otherOverrides.length > 0 && { overriddenMax: otherOverrides }),
  };
}

/** `hidden` with `key` in or out. */
function withHidden(hidden: readonly string[], key: string, isHidden: boolean): string[] {
  if (hidden.includes(key) === isHidden) return [...hidden];
  return isHidden ? [...hidden, key] : hidden.filter((other) => other !== key);
}

/**
 * A scene's token settings as they are in memory, with `hiddenResources`. The two switches
 * of the file decide for HP and the secondary resource; the secondary bar was off unless
 * switched on. Settings that hold no switch are returned as they are.
 */
export function tokenSettingsFromFile(settings: Record<string, unknown>): Record<string, unknown> {
  const { showHPBars, showStressBars, showResources, ...rest } = settings;
  const hasSwitches = 'showHPBars' in settings || 'showStressBars' in settings;
  if (!hasSwitches && !('showResources' in settings)) return settings;

  let hidden = Array.isArray(rest.hiddenResources) ? rest.hiddenResources.filter((key): key is string => typeof key === 'string') : [];
  if (hasSwitches) {
    hidden = withHidden(hidden, HP, showHPBars === false);
    hidden = withHidden(hidden, STRESS, showStressBars !== true);
  } else if (showResources === false) {
    // Builds of this feature had one switch for all resources
    hidden = [HP, STRESS];
  }
  return { ...rest, hiddenResources: hidden };
}

/** A scene's token settings as its file holds them: with the two switches, beside the list that names every hidden resource. */
export function tokenSettingsToFile(settings: Record<string, unknown>): Record<string, unknown> {
  const hidden: unknown[] = Array.isArray(settings.hiddenResources) ? settings.hiddenResources : [];
  return { ...settings, showHPBars: !hidden.includes(HP), showStressBars: !hidden.includes(STRESS) };
}

/** The parts of a scene that hold resources. Each may be missing; a store without a scene persists nothing. */
interface SceneParts {
  objects?: { tokens?: Record<string, object> } | null;
  tokenSettings?: object;
  initiative?: { entries?: unknown } | null;
}

/** The scene's `objects` with every token converted, to spread over the scene; nothing when it has no tokens. */
function mapTokens(scene: SceneParts, convert: (token: object) => object): Pick<SceneParts, 'objects'> | undefined {
  const tokens = scene.objects?.tokens;
  if (!isRecord(tokens)) return undefined;
  const converted = Object.fromEntries(Object.entries(tokens).map(([id, token]) => [id, isRecord(token) ? convert(token) : token]));
  return { objects: { ...scene.objects, tokens: converted } };
}

/** The scene's `initiative` with every entry converted, to spread over the scene; nothing when it has no entries. */
function mapEntries(scene: SceneParts, convert: (entry: Record<string, unknown>) => object): Pick<SceneParts, 'initiative'> | undefined {
  const entries = scene.initiative?.entries;
  if (!Array.isArray(entries)) return undefined;
  const converted = entries.map((entry: unknown) => (isRecord(entry) ? convert(entry) : entry));
  return { initiative: { ...scene.initiative, entries: converted } };
}

/** A scene's state as it is in memory. */
export function sceneFromFile<S extends SceneParts>(scene: S): S {
  return {
    ...scene,
    ...mapTokens(scene, tokenFromFile),
    ...(isRecord(scene.tokenSettings) && { tokenSettings: tokenSettingsFromFile(scene.tokenSettings) }),
    // The tracker reads a token's resources from the token
    ...mapEntries(scene, ({ hp: _hp, stress: _stress, isDefeated: _isDefeated, ...entry }) => entry),
  };
}

/** A scene's state as its file holds it; `sceneFromFile` reads it back unchanged. */
export function sceneToFile<S extends SceneParts>(scene: S): S {
  const tokens: Record<string, ResourceHolder> = scene.objects?.tokens ?? {};
  const vitalsOf = (tokenId: unknown): object => {
    const { hp, stress } = (typeof tokenId === 'string' ? tokens[tokenId]?.resources : undefined) ?? {};
    return { ...(hp && { hp }), ...(stress && { stress }), isDefeated: !!hp && hp.current <= 0 };
  };
  return {
    ...scene,
    ...mapTokens(scene, tokenToFile),
    ...(isRecord(scene.tokenSettings) && { tokenSettings: tokenSettingsToFile(scene.tokenSettings) }),
    ...mapEntries(scene, (entry) => ({ ...entry, ...vitalsOf(entry.tokenId) })),
  };
}
