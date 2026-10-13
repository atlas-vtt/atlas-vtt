import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import * as parsing from '../../src/app/creatures/parseSenses';
import { tokenSensesResolver, type SenseRules, type TokenSensesResolver } from '../../src/app/creatures/tokenSensesResolver';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { SceneModelBuilder, type SceneModel } from '../../src/app/vision/sceneModel';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { SightRules } from '../../src/app/vision/sightRules';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';

vi.mock('../../src/app/creatures/parseSenses', async (original) => {
  const actual = await original<typeof parsing>();
  return { ...actual, parseSenses: vi.fn(actual.parseSenses) };
});

const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const FEET: SenseRules = { definitions: DND, unit: { unitType: 'feet', ruleDistance: 5 } };
const GOBLIN = 'Bestiary/Goblin.md';
const BOUNDS = { width: 4000, height: 4000 };
/** 70 px squares of 5 ft: 14 px a foot. */
const FT = 14;
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
const WALLS = {};
const LIGHTS = {};

function goblin(id: string, x: number, vision: TokenEntity['vision'] = { enabled: true }): TokenEntity {
  return { id, kind: 'token', imagePath: 'g.png', x, y: 2000, statblockPath: GOBLIN, vision } as TokenEntity;
}

describe('sight by the senses of linked statblocks', () => {
  let current: CreatureVault;
  let index: CreatureIndex;
  let resolver: TokenSensesResolver;
  let builder: SceneModelBuilder;
  let rules: SightRules;
  let tokens: Record<string, TokenEntity>;
  let stop: () => void;

  /** The scene as the lighting view builds it; a new rules object asks for a new build, as the view does on an announcement. */
  const build = (): SceneModel => {
    const state = { objects: { walls: WALLS, lights: LIGHTS, tokens } as ViewAtlasState['objects'], lighting: { enabled: true, ambient: 0 }, grid: null, heldTokens: {} };
    return builder.update(state, BOUNDS, measurement, () => rules).model;
  };
  const regions = (model: SceneModel): [string, string, number][] => model.sight.regions.map((region) => [region.tokenId, region.sense.id, Math.round(region.radius / FT)]);
  const announced = vi.fn();
  /** The index has read the note, and the view heard of it. */
  const settled = async (calls: number): Promise<void> => {
    await vi.waitFor(() => expect(announced.mock.calls.length).toBeGreaterThanOrEqual(calls));
    await vi.waitFor(() => expect(index.isPending()).toBe(false));
  };

  beforeEach(() => {
    current = creatureVault();
    index = CreatureIndex.forApp(current.app);
    resolver = tokenSensesResolver(index, { get: () => FEET });
    builder = new SceneModelBuilder();
    const newRules = (): SightRules => ({ definitions: DND, conditions: [], visionOf: (token) => resolver.visionOf(token) });
    rules = newRules();
    announced.mockReset();
    stop = resolver.subscribe(() => {
      announced();
      rules = newRules();
    });
    vi.mocked(parsing.parseSenses).mockClear();
  });

  afterEach(() => {
    stop();
    CreatureIndex.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
  });

  it('shows and records nothing for a token whose statblock is not read yet, and still counts it as a vision token', () => {
    current.frontmatter[GOBLIN]!.senses = 'blindsight 30 ft. (blind beyond this radius)';
    tokens = { a: goblin('a', 2000) };
    const model = build();
    expect(model.sight).toEqual({ all: false, regions: [] });
    expect(model.explored).toBeNull();
  });

  it('lets a linked token without senses of its own see by its statblock\'s senses, once that is read', async () => {
    current.frontmatter[GOBLIN]!.senses = 'darkvision 60 ft., passive Perception 9';
    tokens = { a: goblin('a', 2000) };
    expect(regions(build())).toEqual([]);
    await settled(1);
    expect(regions(build())).toEqual([['a', 'sight', 404], ['a', 'dnd5e-darkvision', 60]]);
  });

  it('follows an edit of the statblock note', async () => {
    current.frontmatter[GOBLIN]!.senses = 'darkvision 60 ft.';
    tokens = { a: goblin('a', 2000) };
    build();
    await settled(1);
    const before = build();
    expect(build()).toBe(before);
    current.frontmatter[GOBLIN]!.senses = 'darkvision 120 ft., tremorsense 30 ft.';
    current.metadata.trigger('changed', new TFile(GOBLIN));
    await vi.waitFor(() => expect(regions(build())).toEqual([['a', 'sight', 404], ['a', 'dnd5e-darkvision', 120], ['a', 'dnd5e-tremorsense', 30]]));
  });

  it('ignores the statblock\'s senses for a token with senses of its own, and with old darkvision', async () => {
    current.frontmatter[GOBLIN]!.senses = 'darkvision 60 ft., blindsight 10 ft.';
    tokens = {
      own: goblin('own', 1000, { enabled: true, senses: [{ id: 'dnd5e-truesight', range: 30 }] }),
      none: goblin('none', 2000, { enabled: true, senses: [] }),
      old: goblin('old', 3000, { enabled: true, darkvision: 90 }),
    };
    build();
    await settled(1);
    expect(regions(build())).toEqual([
      ['own', 'sight', 404], ['own', 'dnd5e-truesight', 30],
      ['none', 'sight', 404],
      ['old', 'sight', 404], ['old', 'dnd5e-darkvision', 90],
    ]);
  });

  it('caps the sight of a creature that is blind beyond its blindsight, unless the token sets its own range', async () => {
    current.frontmatter[GOBLIN]!.senses = 'blindsight 30 ft. (blind beyond this radius)';
    tokens = { a: goblin('a', 1000), ranged: goblin('ranged', 3000, { enabled: true, range: 100 }) };
    build();
    await settled(1);
    expect(regions(build())).toEqual([
      ['a', 'sight', 30], ['a', 'dnd5e-blindsight', 30],
      ['ranged', 'sight', 100], ['ranged', 'dnd5e-blindsight', 30],
    ]);
  });

  it('reads the senses line once for many tokens that share the statblock', async () => {
    current.frontmatter[GOBLIN]!.senses = 'darkvision 60 ft.';
    tokens = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`g${i}`, goblin(`g${i}`, 100 + i * 90)]));
    build();
    await settled(1);
    const model = build();
    expect(model.sight.regions).toHaveLength(80);
    build();
    expect(vi.mocked(parsing.parseSenses)).toHaveBeenCalledTimes(1);
    // One announcement for the one note, however many tokens link it.
    expect(announced).toHaveBeenCalledTimes(1);
  });

  it('gives an unlinked token its own vision, with no statblock asked for', () => {
    const request = vi.spyOn(index, 'request');
    tokens = { free: { id: 'free', kind: 'token', imagePath: 'f.png', x: 2000, y: 2000, vision: { enabled: true, range: 20, darkvision: 10 } } };
    expect(regions(build())).toEqual([['free', 'sight', 20], ['free', 'dnd5e-darkvision', 10]]);
    expect(request).not.toHaveBeenCalled();
  });
});
