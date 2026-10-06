import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';
import { t } from '../i18n';

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

/** The keys of the two bars every map had before resources were defined per collection. */
const FIRST_BARS: readonly string[] = ['hp', 'stress'];

/** The Reset entry of a token's menu: worded as it always was where the collection has no resource beyond those two bars. */
export function resetLabel(definitions: readonly ResourceDefinition[]): string {
  const onlyFirstBars = definitions.every(({ key }) => FIRST_BARS.includes(key));
  return onlyFirstBars ? t('token.reset') : t('resource.resetAll');
}
