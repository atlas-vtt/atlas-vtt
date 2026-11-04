// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { tokenSensesResolver, type SenseRules } from '../../src/app/creatures/tokenSensesResolver';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import type { TokenSense } from '../../src/app/types/senseTypes';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';

const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const FEET: SenseRules = { definitions: DND, unit: { unitType: 'feet', ruleDistance: 5 } };
const GOBLIN = 'Bestiary/Goblin.md';

function named(senses: readonly TokenSense[]): Array<[string, number?]> {
  return senses.map((sense) => {
    const name = DND.find((definition) => definition.id === sense.id)?.name ?? `? ${sense.id}`;
    return sense.range === undefined ? [name] : [name, sense.range];
  });
}

describe('tokenSensesResolver on the creature index', () => {
  let current: CreatureVault;

  afterEach(() => {
    CreatureIndex.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
  });

  it('follows an edit of the statblock note', async () => {
    current = creatureVault();
    current.frontmatter[GOBLIN]!.senses = 'darkvision 60 ft., passive Perception 9';
    const index = CreatureIndex.forApp(current.app);
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    const sight = vi.fn(() => named(resolver.sensesOf({ vision: { enabled: true }, statblockPath: GOBLIN })));
    const stop = resolver.subscribe(sight);

    expect(sight()).toEqual([]);
    await vi.waitFor(() => expect(sight).toHaveLastReturnedWith([['Darkvision', 60]]));

    current.frontmatter[GOBLIN]!.senses = 'darkvision 120 ft., blindsight 10 ft.';
    current.metadata.trigger('changed', new TFile(GOBLIN));
    await vi.waitFor(() => expect(sight).toHaveLastReturnedWith([['Darkvision', 120], ['Blindsight', 10]]));

    const calls = sight.mock.calls.length;
    stop();
    current.frontmatter[GOBLIN]!.senses = '';
    current.metadata.trigger('changed', new TFile(GOBLIN));
    await vi.waitFor(() => expect(index.isPending()).toBe(false));
    expect(sight).toHaveBeenCalledTimes(calls);
  });
});
