import { isSocket, slottedResources } from './resourceSlots';
import { MAX_RESOURCES, type ResourceDefinition } from './resourceTypes';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const HP_RESOURCE: Readonly<ResourceDefinition> = {
  key: 'hp', name: 'HP', field: 'hp', direction: 'drains',
  color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: false,
};

export const STRESS_RESOURCE: Readonly<ResourceDefinition> = {
  key: 'stress', name: 'Stress', field: 'stress', direction: 'fills',
  color: '#a855f7', visibleToPlayers: false,
};

/** The second bar of collections whose game has no name for it, as the old settings called it. */
const SECONDARY_RESOURCE: Readonly<ResourceDefinition> = { ...STRESS_RESOURCE, name: 'Secondary resource' };

/**
 * `resources` of a collection (or preset) saved before resources existed. Hit points stay
 * whatever the old "HP Bar" switch said: it only hid the bar on the map. The secondary bar
 * counts when its switch was on or a scene shows it (`usedInScenes`), and goes when it was
 * switched off and no scene shows it.
 */
export function withLegacyBars(
  resources: readonly ResourceDefinition[],
  widgets: Record<string, boolean> | undefined,
  usedInScenes = false,
): ResourceDefinition[] {
  const wanted = usedInScenes || widgets?.stressBar === true;
  const kept = resources.filter(({ key }) => key !== STRESS_RESOURCE.key || wanted || widgets?.stressBar !== false);
  if (wanted && !kept.some(({ key }) => key === STRESS_RESOURCE.key)) kept.push({ ...SECONDARY_RESOURCE });
  return kept;
}

/**
 * `Hit Protection` → `hit-protection`, unique among `taken` (`ammo`, `ammo-2`, …); `fallback`
 * where the name has no letter or digit to key by. Statblock roles take their ids by this rule too.
 */
export function resourceKey(name: string, taken: Iterable<string>, fallback = 'resource'): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const DRAFT_KEY_PREFIX = 'new:';

/** A placeholder key for a resource added in a dialog; `withFinalKeys` replaces it when the resource is saved. */
export function draftResourceKey(): string {
  return `${DRAFT_KEY_PREFIX}${crypto.randomUUID()}`;
}

export function isDraftResourceKey(key: string): boolean {
  return key.startsWith(DRAFT_KEY_PREFIX);
}

/**
 * `resources` as they are saved: one added in a dialog takes its key from the
 * name it has now, so adding "Ammo" again after deleting it finds the values
 * tokens still hold. Saved resources keep their key whatever they are renamed to.
 */
export function withFinalKeys(resources: readonly ResourceDefinition[]): ResourceDefinition[] {
  const taken = resources.filter((resource) => !isDraftResourceKey(resource.key)).map((resource) => resource.key);
  return resources.map((resource) => {
    if (!isDraftResourceKey(resource.key)) return resource;
    const key = resourceKey(resource.name, taken);
    taken.push(key);
    return { ...resource, key };
  });
}

/** A definition without the defeat a static value cannot have; the dialog keeps it while the GM steps through the directions. */
function withoutStaticDefeat(resource: ResourceDefinition): ResourceDefinition {
  if (resource.direction !== 'static' || resource.defeatedWhenSpent === undefined) return resource;
  const { defeatedWhenSpent: _defeats, ...rest } = resource;
  return rest;
}

/** Resources as they are stored: names and fields trimmed, a static value defeating nothing, and resources added in a dialog keyed by their name. */
export function savedResources(resources: readonly ResourceDefinition[]): ResourceDefinition[] {
  return withFinalKeys(resources.map((resource) => withoutStaticDefeat({ ...resource, name: resource.name.trim(), field: resource.field.trim() })));
}

/** A stored or imported definition, or null when a required part is missing or invalid. */
export function parseResourceDefinition(raw: unknown): ResourceDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
  const key = text(r.key);
  const name = text(r.name);
  const field = text(r.field);
  if (!key || !name || !field) return null;
  if (r.direction !== 'drains' && r.direction !== 'fills' && r.direction !== 'static') return null;
  if (typeof r.color !== 'string' || !HEX_COLOR.test(r.color)) return null;
  return {
    key, name, field: field.trim(), direction: r.direction, color: r.color,
    // A static value is never spent, so it defeats nothing
    ...(r.defeatedWhenSpent === true && r.direction !== 'static' && { defeatedWhenSpent: true }),
    visibleToPlayers: r.visibleToPlayers === true,
    ...(isSocket(r.slot) && { slot: r.slot }),
  };
}

/** The valid definitions of a stored list, without duplicates; a token shows no more than the first `MAX_RESOURCES`. */
export function parseResourceDefinitions(raw: unknown): ResourceDefinition[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map(parseResourceDefinition).filter((d): d is ResourceDefinition => {
    if (!d || seen.has(d.key)) return false;
    seen.add(d.key);
    return true;
  }).slice(0, MAX_RESOURCES);
}

/** Whether two definitions play the same. What players see is the table's choice, not the game's rules. */
function sameDefinition(a: ResourceDefinition, b: ResourceDefinition): boolean {
  return a.key === b.key && a.name === b.name && a.field === b.field && a.direction === b.direction
    && a.color.toLowerCase() === b.color.toLowerCase()
    && !!a.defeatedWhenSpent === !!b.defeatedWhenSpent;
}

export function sameResourceDefinitions(
  a: readonly ResourceDefinition[] | undefined,
  b: readonly ResourceDefinition[] | undefined,
): boolean {
  // By socket, not by place in the list: a moved resource is a difference, a reordered list is none
  const left = slottedResources(a ?? []);
  const right = slottedResources(b ?? []);
  return left.length === right.length
    && left.every(({ definition, slot }, i) => slot === right[i]!.slot && sameDefinition(definition, right[i]!.definition));
}

/** `next` with each resource shown to players as `current` shows the one of its key: what players see is the table's choice. */
export function keepingPlayerVisibility(next: readonly ResourceDefinition[], current: readonly ResourceDefinition[]): ResourceDefinition[] {
  return next.map((resource) => {
    const kept = current.find(({ key }) => key === resource.key);
    return kept ? { ...resource, visibleToPlayers: kept.visibleToPlayers } : resource;
  });
}
