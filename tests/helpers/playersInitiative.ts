import { playerInitiativeList, type ListRules, type PlayerInitiativeList, type PlayersInitiativeScene } from '../../src/app/services/playerInitiativeList';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import type { TokenEntity } from '../../src/app/types';
import type { CollectionSettings, ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { SystemPreset } from '../../src/app/types/systemPresetTypes';

/** The rules of a test's map: its resources, its conditions and its initiative rules. */
export interface TestRules {
  readonly resources?: readonly ResourceDefinition[];
  readonly conditions?: readonly ConditionDefinition[];
  /** Read as the map's preset's, as they are written; the default rules unless given. */
  readonly initiative?: InitiativeRules;
}

const TEST_PRESET = 'test-rules';

/** Where the players' list looks up the rules of every map: `rules`, none of the resources and conditions it leaves out. */
export function listRules(rules: TestRules = {}): ListRules {
  const settings = { resources: [...(rules.resources ?? [])], conditions: [...(rules.conditions ?? [])], systemPresetId: TEST_PRESET } as CollectionSettings;
  const presets = rules.initiative ? [{ id: TEST_PRESET, name: 'Test', builtIn: false, rules: { initiative: rules.initiative } } as unknown as SystemPreset] : [];
  return { lookup: { getCollectionForMap: () => 'collection', getCollectionSettings: () => settings, playedSystem: () => null }, presets };
}

/** The players' list of `initiative` among `tokens`, on a map that plays by `rules` (`listRules`). */
export function playersListOf(
  initiative: NonNullable<PlayersInitiativeScene['initiative']>,
  tokens: Readonly<Record<string, TokenEntity>> = {},
  rules: TestRules = {},
): PlayerInitiativeList {
  return playerInitiativeList({ initiative, mapPath: 'atlas-vtt/collections/collection/map.atlasmap', objects: { tokens } }, listRules(rules));
}
