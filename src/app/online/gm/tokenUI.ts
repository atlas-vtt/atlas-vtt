import { MAX_CONDITION_TEXT, MAX_TOKEN_CONDITIONS, MAX_TOKEN_VALUE, type SharedBar, type SharedCondition, type SharedTokenUI } from '../protocol/index.ts';
import { resolveActiveConditions, type ActiveCondition } from '../../utils/activeConditions';
import { isTokenDowned } from '../../pixi/token-renderer/isTokenDowned';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import { shapeOf, visibleResources } from '../../resources/visibleResources';
import type { TokenEntity } from '../../types';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { badgeNumberInView, numberTokensInView, type InstanceNumbers } from '../../vision/instanceNumbers';

/** The map's resource and condition definitions, as the GM's token renderer reads them for its collection. */
export interface TokenRules {
  readonly resources: readonly ResourceDefinition[];
  readonly conditions: readonly ConditionDefinition[];
}

/** No definitions: what is sent while the GM's cannot be read, so nothing of a resource or condition goes out. */
export const NO_TOKEN_RULES: TokenRules = { resources: [], conditions: [] };

const HEX_COLOUR = /^#[0-9a-f]{6}$/;

const hexColour = (colour: number): string => `#${(colour & 0xffffff).toString(16).padStart(6, '0')}`;
const finiteValue = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE;

/**
 * The bars Atlas's player window draws below a token: the resources players see
 * (`visibleResources` for the viewer `player`) whose socket is a bar. Wheels never show there,
 * and nothing of a resource players may not see is read.
 */
function barsOf(token: TokenEntity, rules: TokenRules): SharedBar[] {
  return visibleResources(token, rules.resources, 'player').flatMap(({ definition, value, slot }): SharedBar[] => {
    const colour = definition.color.toLowerCase();
    if (shapeOf(slot) !== 'bar' || !HEX_COLOUR.test(colour) || !finiteValue(value.current) || !finiteValue(value.max)) return [];
    return [{ colour, direction: definition.direction, defeats: definition.defeatedWhenSpent === true, current: value.current, max: value.max }];
  });
}

/** Condition badges as players are sent them, within the protocol's bounds. */
export function sharedConditions(conditions: readonly ActiveCondition[]): SharedCondition[] {
  return conditions.slice(0, MAX_TOKEN_CONDITIONS).map(({ color, glyph, value }) => ({
    colour: hexColour(color),
    glyph: glyph.kind === 'icon' ? { kind: 'icon', icon: glyph.icon } : { kind: 'text', text: glyph.text.slice(0, MAX_CONDITION_TEXT) || '?' },
    value: value !== undefined && finiteValue(value) ? value : null,
  }));
}

/** The condition badges on a token's ring, as Atlas resolves them (`resolveActiveConditions`): those its collection defines, in order. */
function conditionsOf(token: TokenEntity, rules: TokenRules): SharedCondition[] {
  return sharedConditions(resolveActiveConditions(token, rules.conditions));
}

/**
 * What Atlas's player window draws on a creature token besides its artwork (`UIManager.getPlayerViewLayers`):
 * the nameplate while players see names, the bars of resources players may see, the conditions and the
 * downed look. Other tokens have none.
 */
export function tokenUIOf(token: TokenEntity, rules: TokenRules, nameplate: boolean): SharedTokenUI | null {
  if (token.kind !== 'character') return null;
  return { nameplate, downed: isTokenDowned(token, rules.resources), bars: barsOf(token, rules), conditions: conditionsOf(token, rules) };
}

/**
 * Numbers the look-alikes the players see as their picture does (`numberTokensInView`, in the scene's
 * token order): a token that stays in view keeps its number. `badge` gives a token's number, or null
 * where it shows no badge (badges off, or fewer than two of its artwork in view).
 */
export function numberShownTokens(previous: InstanceNumbers, tokens: Readonly<Record<string, TokenEntity>>, shown: (id: string) => boolean, badgesOn: boolean): { readonly numbers: InstanceNumbers; badge(id: string): number | null } {
  const inView = Object.entries(tokens).flatMap(([id, token]) => (shown(id) ? [{ id, art: token.imagePath, rank: token.instanceNumber ?? 1 }] : []));
  const numbers = numberTokensInView(previous, inView);
  return { numbers, badge: (id) => badgeNumberInView(numbers, id, badgesOn) };
}
