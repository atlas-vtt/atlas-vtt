import type { RecoveryButton, RecoveryRule } from '../../../src/app/recovery/recoveryTypes';
import type { RestCharacter, RestRoll, RestRoller } from '../../../src/app/recovery/restTypes';
import type { ResourceDefinition, ResourceValue } from '../../../src/app/resources/resourceTypes';
import type { FieldValue, TemplateField } from '../../../src/app/statblocks/model/templateTypes';
import type { ConditionDefinition } from '../../../src/app/types/collectionSettingsTypes';

const resource = (key: string, name: string, direction: ResourceDefinition['direction']): ResourceDefinition => ({
  key, name, field: key, direction, color: '#cc3333', visibleToPlayers: true,
});

export const RESOURCES: ResourceDefinition[] = [
  resource('hp', 'HP', 'drains'),
  resource('stress', 'Stress', 'fills'),
  resource('hitDice', 'Hit Dice', 'drains'),
  resource('ac', 'AC', 'static'),
];

export const CONDITIONS: ConditionDefinition[] = [
  { id: 'exhaustion', name: 'Exhaustion', color: '#555555', valued: true },
  { id: 'poisoned', name: 'Poisoned', color: '#00aa00' },
];

export const FIELDS: TemplateField[] = [
  { key: 'uses', label: 'Uses', type: 'counters' },
  { key: 'slots', label: 'Spell slots', type: 'counters' },
  { key: 'level', label: 'Level', type: 'number' },
];

export interface CharacterState {
  resources?: Record<string, ResourceValue>;
  conditions?: Record<string, number> | null;
  note?: Record<string, FieldValue>;
}

/** A character holding `state`: resources by key, conditions on its token (null: no token), the note's values; Mira unless named. */
export function character(state: CharacterState = {}, id = 'mira', name = 'Mira'): RestCharacter {
  const note = state.note ?? {};
  return {
    id,
    name,
    resources: RESOURCES,
    resourceOf: (field) => RESOURCES.find((resource) => resource.field === field),
    conditions: CONDITIONS,
    fields: new Map(FIELDS.map((field) => [field.key, field])),
    resourceValue: (key) => state.resources?.[key],
    conditionValue: (id) => (state.conditions === null ? null : state.conditions?.[id] ?? 0),
    fieldValue: (key) => note[key],
    lookup: (path) => path.split('.').reduce<unknown>((value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined), note),
  };
}

export const button = (rules: RecoveryRule[], name = 'Long rest', id = 'long'): RecoveryButton => ({ id, name, rules });

/** A roller that answers each formula from `totals` in turn (else 5), and remembers what it rolled. */
export function roller(...totals: number[]): RestRoller & { rolled: Array<{ formula: string; label: string }> } {
  const rolled: Array<{ formula: string; label: string }> = [];
  const roll = (formula: string, label: string): RestRoll => {
    rolled.push({ formula, label });
    return { formula, total: totals.shift() ?? 5 };
  };
  return Object.assign(roll, { rolled });
}

export const row = (name: string, max: number, used: number, reset?: string, regain?: string): Record<string, FieldValue> => ({
  name, max, used, ...(reset !== undefined && { reset }), ...(regain !== undefined && { regain }),
});
