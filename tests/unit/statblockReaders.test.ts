import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

/** What a note's YAML reads as, where a test hands a value over that no text could spell out here. */
const parsed = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return {
    ...actual,
    Notice: vi.fn(),
    parseYaml: (text: string): unknown => (text.includes('AS HANDED OVER') ? parsed.value : actual.parseYaml(text)),
  };
});
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ loadAtlasView: vi.fn(async () => null) }));

import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { discoverCreatureFields } from '../../src/app/creatures/creatureFieldDiscovery';
import { CATALOG_CREATURE_FILTERS } from '../../src/app/creatures/creatureFieldCatalog';
import { factsOf } from '../../src/app/creatures/creatureFacts';
import { parseOptions } from '../../src/app/creatures/creatureValues';
import { resolveLinkedCreature } from '../../src/app/creatures/linkedCreature';
import { parseSenses } from '../../src/app/creatures/parseSenses';
import { sensesTextOf } from '../../src/app/creatures/sensesText';
import { STATBLOCK_LIMITS } from '../../src/app/creatures/statblockValues';
import { SENSES_FIXTURES } from '../../src/app/creatures/__tests__/sensesFixtures';
import { DND, FEET } from '../../src/app/creatures/__tests__/sensesTestHelpers';
import { loadStatblockOverrides } from '../../src/app/packages/components/asset-manager/utils/statblockLoader';
import { spawnTokenAsset, type SpawnContext } from '../../src/app/packages/components/asset-manager/utils/tokenSpawnService';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AssetService } from '../../src/app/services/AssetService';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import { startingResources } from '../../src/app/resources/statblockResourceValues';
import { resolveCreatureFromFence } from '../../src/app/services/FantasyStatblocksService';
import { imageReference } from '../../src/app/services/statblockImportCandidates';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { HOSTILE_VALUES, counted, counts, resetCounts, selfHoldingList, sharedLists } from '../mocks/hostileValues';

const DEFINITIONS = [HP_RESOURCE, STRESS_RESOURCE];
const note = 'Bestiary/Toad.md';
const fence = '```statblock\nAS HANDED OVER\n```';

let current: CreatureVault;
beforeEach(() => {
  current = creatureVault();
  current.app.vault.cachedRead = current.app.vault.read;
  resetCounts();
});
afterEach(() => {
  CreatureIndex.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

function installBestiary(creatures: Array<Record<string, unknown>>): void {
  Object.assign(window, { FantasyStatblocks: {
    getBestiaryCreatures: () => creatures,
    hasCreature: (name: string) => creatures.some((creature) => creature.name === name),
    getCreatureFromBestiary: (name: string) => creatures.find((creature) => creature.name === name) ?? null,
    isResolved: () => true,
  } });
}

/** A value's lists, maps and texts, counted as a walk without limits would: only for a bounded value. */
function sizeOf(value: unknown): { values: number; characters: number } {
  if (typeof value === 'string') return { values: 1, characters: value.length };
  if (value === null || typeof value !== 'object') return { values: 1, characters: 0 };
  const parts = Object.values(value).map(sizeOf);
  return { values: 1 + parts.reduce((sum, part) => sum + part.values, 0), characters: parts.reduce((sum, part) => sum + part.characters, 0) };
}

/** The ways a linked note gives its creature, each handing over `statblock` as its parser would. */
const ROUTES: Record<string, (statblock: Record<string, unknown>) => void> = {
  'the bestiary entry of its note': (statblock) => {
    current.files.set(note, '');
    installBestiary([counted({ ...statblock, path: note })]);
  },
  'the bestiary creature of its name': (statblock) => {
    current.files.set(note, 'Lore about toads.');
    installBestiary([counted({ ...statblock, name: 'Toad' })]);
  },
  'a statblock fence': (statblock) => {
    current.files.set(note, fence);
    parsed.value = statblock;
    installBestiary([]);
  },
  'its frontmatter': (statblock) => {
    current.files.set(note, '');
    current.frontmatter[note] = counted({ statblock: true, ...statblock });
    installBestiary([]);
  },
};

describe.each(Object.keys(ROUTES))('a linked creature given by %s', (route) => {
  it.each(Object.keys(HOSTILE_VALUES))('is read within the limits where its fields are %s', async (shape) => {
    const hostile = HOSTILE_VALUES[shape]!;
    ROUTES[route]!(counted({ name: 'Toad', senses: hostile(), actions: hostile(), type: hostile() }));

    const creature = await resolveLinkedCreature(current.app, note);
    expect(creature?.name).toBe('Toad');
    expect(counts.reads).toBeLessThanOrEqual(4 * STATBLOCK_LIMITS.values);
    expect(sizeOf(creature).values).toBeLessThanOrEqual(STATBLOCK_LIMITS.values + 10);
    expect(sizeOf(creature).characters).toBeLessThanOrEqual(2 * STATBLOCK_LIMITS.characters);
  });

  it('is named by a text, whatever the statblock gives for a name', async () => {
    ROUTES[route]!(counted({ name: route.includes('name') ? 'Toad' : sharedLists(10, 9), hp: 7 }));
    const creature = await resolveLinkedCreature(current.app, note);
    expect(typeof creature?.name).toBe('string');
    expect(creature!.name.length).toBeLessThanOrEqual(STATBLOCK_LIMITS.text);
  });
});

describe('what the filters read of a creature', () => {
  it.each(['the bestiary entry of its note', 'a statblock fence'])('is within the limits for %s', async (route) => {
    ROUTES[route]!(counted({ name: 'Toad', type: selfHoldingList(1000), traits: sharedLists(10, 9) }));
    const index = CreatureIndex.forApp(current.app);
    index.request([note]);
    await vi.waitFor(() => expect(index.isPending()).toBe(false));

    const fields = index.get(note)!.fields;
    expect(sizeOf(fields).values).toBeLessThanOrEqual(STATBLOCK_LIMITS.values + 10);
    // The filters' own walks end: a list that holds itself has no options, and no rating.
    const facts = factsOf({ statblockPath: note }, (path) => index.get(path), CATALOG_CREATURE_FILTERS);
    expect(facts.options.get('type')?.map((option) => option.label)).toEqual(['in']);
  });

  it('takes no option from a text far longer than one', () => {
    expect(parseOptions(`${'x'.repeat(5000)} p. 12`)).toEqual([]);
    expect(parseOptions(`[[Books/${'Monster Manual'.padEnd(200, ' of the Deep')}|Monster Manual]] p. 12`)).toEqual(['Monster Manual']);
  });
});

describe('a token placed from a statblock note', () => {
  const asset: TokenAsset = { id: 'toad', name: 'Toad token', type: 'tokens', imageUrl: 'app://toad.png', imagePath: 'tokens/toad.png', statblockPath: note, modifiedAt: 0 };

  /** Places the token on a map and gives what the scene was handed. */
  async function place(): Promise<Array<Record<string, unknown>>> {
    current.files.set('tokens/toad.png', '');
    const viewport = { screenWidth: 800, screenHeight: 600, toWorld: (point: { x: number; y: number }) => point, scale: { x: 1 } };
    const spawned: Array<Record<string, unknown>> = [];
    const view = {
      leaf: {},
      serviceManager: { getRendererService: () => ({ getViewport: () => viewport, getGridSystem: () => null }) },
      getStore: () => ({ getState: () => ({
        mapPath: 'maps/cave.atlasmap', isMapLoading: false, setSelection: vi.fn(),
        addTokens: (tokens: Array<Record<string, unknown>>) => tokens.map((token) => { spawned.push(token); return `tok_${spawned.length}`; }),
      }) }),
    } as unknown as AtlasView;
    Object.assign(current.app.workspace, { revealLeaf: vi.fn(async () => undefined) });
    const ctx: SpawnContext = {
      app: current.app,
      view,
      assetService: {
        getAssetById: vi.fn(async () => ({ ...asset, type: 'token' })),
        getCollectionForMap: vi.fn(() => 'dungeon'),
        getCollectionSettings: vi.fn(() => ({ conditions: [], resources: DEFINITIONS })),
      } as unknown as AssetService,
    };
    await spawnTokenAsset(ctx, asset, 1);
    return spawned;
  }

  it.each([
    ['lists that hold each other', (): unknown => sharedLists(10, 9)],
    ['a list that holds itself', (): unknown => selfHoldingList(50)],
    ['a map', (): unknown => ({ first: 'Grik', last: 'the Bold' })],
    ['a number', (): unknown => 7],
  ])('is named by a text where the statblock\'s name is %s, and its scene can be written', async (_kind, name) => {
    ROUTES['a statblock fence']!(counted({ name: name(), hp: 12, cr: 2 }));
    const [token] = await place();

    expect(typeof token?.name).toBe('string');
    expect((token!.name as string).length).toBeLessThanOrEqual(STATBLOCK_LIMITS.text);
    expect(token?.statblockPath).toBe(note);
    expect(JSON.stringify(token).length).toBeLessThan(2 * STATBLOCK_LIMITS.text);
  });

  it('takes the rest of a statblock whose name is no text', async () => {
    ROUTES['a statblock fence']!({ name: { first: 'Grik', last: 'the Bold' }, hp: 12, cr: 2 });
    const [token] = await place();
    expect(token).toMatchObject({ name: 'Grik the Bold', difficulty: 'CR 2', resources: { hp: { current: 12, max: 12 } } });
  });
});

describe('the walks of the readers beside the renderer', () => {
  it('finds the note a fence names in lists inside each other, and ends where they hold themselves', async () => {
    installBestiary([]);
    current.files.set('Other.md', '');
    current.frontmatter['Other.md'] = { hp: 9 };
    Object.assign(current.app.metadataCache, { getFirstLinkpathDest: (link: string) => (link === 'Other' ? new TFile('Other.md') : null) });

    await expect(resolveCreatureFromFence(current.app, { name: 'Toad', note: [['Other']] }, note)).resolves.toMatchObject({ name: 'Toad', hp: 9 });
    await expect(resolveCreatureFromFence(current.app, { name: 'Toad', note: selfHoldingList(3) }, note)).resolves.toMatchObject({ name: 'Toad' });
  });

  it('finds the image a statblock names in lists inside each other, and ends where they hold themselves', () => {
    expect(imageReference([['Art/toad.png']])).toBe('Art/toad.png');
    expect(imageReference(selfHoldingList(3))).toBe('in');
    const loop: unknown[] = [];
    loop.push(loop);
    expect(imageReference(loop)).toBeUndefined();
  });

  it('joins a list of senses to a line no longer than one text', () => {
    const line = sensesTextOf({ senses: Array<string>(5).fill(`darkvision ${'x'.repeat(STATBLOCK_LIMITS.text)}`.slice(0, STATBLOCK_LIMITS.text)) });
    expect(line).toHaveLength(STATBLOCK_LIMITS.text);
    const perception = Array.from({ length: 5 }, () => ({ name: 'Perception', desc: `+7; ${'y'.repeat(STATBLOCK_LIMITS.text)}`.slice(0, STATBLOCK_LIMITS.text) }));
    expect(sensesTextOf({ perception })?.length).toBeLessThanOrEqual(STATBLOCK_LIMITS.text);
  });
});

/**
 * Statblocks as their notes write them, in the shapes the layouts of Fantasy Statblocks use: the
 * senses lines of published creatures from the repository's own fixtures, each with the fields
 * tokens, resources and filters read.
 */
const WELL_FORMED: Array<Record<string, unknown>> = [
  ...SENSES_FIXTURES.map((fixture, index) => ({
    name: fixture.creature,
    source: fixture.source,
    senses: fixture.text,
    type: index % 2 ? 'beast' : 'humanoid (goblinoid)',
    alignment: 'neutral evil',
    cr: index % 3 ? '1/4' : index,
    hp: index % 2 ? `${7 + index} (2d6)` : 7 + index,
    ac: 15,
    stats: [8, 14, 10, 10, 8, 8],
    saves: [{ dexterity: 4 }],
    traits: [{ name: 'Nimble Escape', desc: 'Disengage or Hide as a bonus action.' }],
    actions: [{ name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage.' }],
    spells: ['The creature knows:', { cantrips: 'mage hand' }],
  })),
  { name: 'Acid Burrower', tier: 1, type: 'Solo', difficulty: 14, hp: 8, stress: 3, thresholds: '8/15', experience: 'Tremor Sense +2', feats: [{ name: 'Relentless (3)', desc: 'Up to three spotlights.' }] },
  { name: 'Goblin Warrior', level: 'Creature -1', rarity: 'Common', trait_01: 'Small', trait_02: 'Goblin', trait_03: 'Humanoid', modifier: 2, perception: [{ name: 'Perception', desc: '+2; darkvision' }], health: [{ name: 'HP', desc: '6' }], resources: { mana: { current: 2, max: 5 } } },
  { name: 'Wight', cr: 3, senses: { darkvision: '60 ft.', passive_perception: 13 }, hp: '45 (6d8 + 18)', traits: ['undead', 'unholy'], image: '[[wight.webp]]' },
];

describe.each(['the bestiary entry of its note', 'a statblock fence', 'its frontmatter'])('a well-formed statblock given by %s', (route) => {
  it.each(WELL_FORMED.map((statblock) => [statblock.name as string, statblock] as const))('reads as it always did: %s', async (_name, statblock) => {
    ROUTES[route]!(structuredClone(statblock));
    const creature = (await resolveLinkedCreature(current.app, note))!;

    // The creature is its statblock, field for field.
    const { path, statblock: marker, ...fields } = creature;
    expect(fields).toEqual(statblock);
    expect([path, marker]).toEqual(route === 'its frontmatter' ? [note, true] : [note, undefined]);

    // So is all that is made of it: the token's name, difficulty and resources, its senses, and the filters' facts.
    const overrides = await loadStatblockOverrides(current.app, note, DEFINITIONS);
    const difficulty = statblock.cr !== undefined && statblock.cr !== '' ? `CR ${String(statblock.cr)}` : statblock.tier !== undefined ? `T${String(statblock.tier)}` : undefined;
    expect(overrides.name).toBe(statblock.name);
    expect(overrides.difficulty).toBe(difficulty);
    expect(overrides.resources ?? {}).toEqual(startingResources(statblock, DEFINITIONS));
    expect(sensesTextOf(creature)).toBe(sensesTextOf(statblock));
    expect(parseSenses(sensesTextOf(creature) ?? '', DND, FEET)).toEqual(parseSenses(sensesTextOf(statblock) ?? '', DND, FEET));
    const factsFrom = (read: Record<string, unknown>): unknown =>
      factsOf({ statblockPath: note }, () => ({ path: note, layout: null, fields: read }), CATALOG_CREATURE_FILTERS);
    const { creature: _read, ...facts } = factsFrom(fields) as { creature: unknown };
    const { creature: _given, ...factsBefore } = factsFrom(statblock) as { creature: unknown };
    expect(facts).toEqual(factsBefore);
    expect(discoverCreatureFields([{ path: note, layout: null, fields }])).toEqual(discoverCreatureFields([{ path: note, layout: null, fields: statblock }]));
  });
});
