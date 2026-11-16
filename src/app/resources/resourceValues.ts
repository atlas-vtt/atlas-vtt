import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';

export function clampValue(value: ResourceValue): ResourceValue {
  const max = Math.max(0, value.max);
  return { current: Math.max(0, Math.min(max, value.current)), max };
}

export function withCurrent(value: ResourceValue, current: number): ResourceValue {
  return clampValue({ current: Number.isFinite(current) ? current : value.current, max: value.max });
}

/** A fresh value: full when the resource drains (a static value is that number), empty when it fills. */
export function startingValue(definition: ResourceDefinition, max: number): ResourceValue {
  return { current: definition.direction === 'fills' ? 0 : max, max };
}

/** Whether a value is one to show: a static value may be 0 (an armour class), a counting one needs a maximum above 0. */
export function holdsValue(definition: ResourceDefinition, value: ResourceValue): boolean {
  return definition.direction === 'static' ? value.max >= 0 : value.max > 0;
}

/** Used up: 0 when draining, full when filling. A value without a maximum is never spent. */
export function isSpent(definition: ResourceDefinition, value: ResourceValue): boolean {
  if (value.max <= 0 || definition.direction === 'static') return false;
  return definition.direction === 'drains' ? value.current <= 0 : value.current >= value.max;
}

export function isDefeated(token: ResourceHolder, definitions: readonly ResourceDefinition[]): boolean {
  return definitions.some((definition) => {
    const value = token.resources?.[definition.key];
    return definition.defeatedWhenSpent === true && value !== undefined && isSpent(definition, value);
  });
}

const defeatTests = new Map<string, (token: ResourceHolder) => boolean>();

/**
 * `isDefeated` by `definitions` as one function, or undefined where none defeats a token. Definitions that defeat
 * alike (the same keys and directions) give the same function, so rules that hold it compare by identity.
 */
export function defeatTest(definitions: readonly ResourceDefinition[]): ((token: ResourceHolder) => boolean) | undefined {
  const defeating = definitions.filter((definition) => definition.defeatedWhenSpent === true);
  if (defeating.length === 0) return undefined;
  const key = JSON.stringify(defeating.map(({ key: resource, direction }) => [resource, direction]));
  let test = defeatTests.get(key);
  if (!test) defeatTests.set(key, test = (token) => isDefeated(token, defeating));
  return test;
}

/** Whether the token holds a resource that defeats it when spent. */
export function isKillable(token: ResourceHolder, definitions: readonly ResourceDefinition[]): boolean {
  return definitions.some((definition) => definition.defeatedWhenSpent === true && token.resources?.[definition.key] !== undefined);
}

/** The token update that sets one resource; a hand-set maximum is remembered in `overriddenMax`. */
export function resourceUpdate(
  token: ResourceHolder,
  key: string,
  next: ResourceValue,
  maxEdited: boolean,
): { resources: Record<string, ResourceValue>; overriddenMax?: string[] } {
  const resources = { ...token.resources, [key]: clampValue(next) };
  const overridden = token.overriddenMax ?? [];
  if (!maxEdited || overridden.includes(key)) return { resources };
  return { resources, overriddenMax: [...overridden, key] };
}

function mapDefined(
  token: ResourceHolder,
  definitions: readonly ResourceDefinition[],
  change: (definition: ResourceDefinition, value: ResourceValue) => ResourceValue,
): Record<string, ResourceValue> | undefined {
  if (!token.resources) return undefined;
  const next = { ...token.resources };
  for (const definition of definitions) {
    const value = next[definition.key];
    if (value) next[definition.key] = change(definition, value);
  }
  return next;
}

/** The token's resources with every one that defeats it spent. */
export function defeatedResources(token: ResourceHolder, definitions: readonly ResourceDefinition[]): Record<string, ResourceValue> | undefined {
  return mapDefined(token, definitions, (definition, value) => (definition.defeatedWhenSpent
    ? { current: definition.direction === 'drains' ? 0 : value.max, max: value.max }
    : value));
}

/** The token's resources with every defined one back at its start: full when draining, empty when filling. */
export function restedResources(token: ResourceHolder, definitions: readonly ResourceDefinition[]): Record<string, ResourceValue> | undefined {
  return mapDefined(token, definitions, (definition, value) => startingValue(definition, value.max));
}
