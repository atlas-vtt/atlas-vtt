import { describe, expect, it } from 'vitest';
import { SEES_ALL, SightCache, computeSight, lightReach, sceneSight, sightOptionsChanged, sightSources, type AmbientLight, type LightReach, type Sight, type SightSource } from '../sight';
import { lightLevelAt } from '../lightLevels';
import { perceive } from '../perception';
import { darkvision, senseSource, tremorsense } from './senseSources';
import { BUILT_IN_SENSES, GENERIC_SENSES, NORMAL_SIGHT } from '../../gameSystems/senses';
import type { TokenEntity } from '../../types';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import type { WallSegment } from '../../types/wallTypes';

const scale = { unitDistance: 5, cellSize: 70 };
const bounds = { width: 1000, height: 1000 };
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };

function token(id: string, x: number, y: number, vision?: TokenEntity['vision']): TokenEntity {
  return { id, kind: 'token', imagePath: 'a.png', x, y, ...(vision && { vision }) };
}

function source(overrides: Partial<SightSource> = {}): SightSource {
  return { tokenId: 't', origin: { x: 100, y: 100 }, range: 1414, senses: [], ...overrides };
}

/** Whether the vision tokens see a token at `point`, by the light there. */
function isSeen(point: { x: number; y: number }, sight: Sight, ambient: AmbientLight, lights: readonly LightReach[]): boolean {
  return perceive(point, sight, lightLevelAt(point, ambient, lights)) === 'seen';
}

const sightPolygon = (sight: Sight, index = 0): unknown => sight.regions.filter((region) => region.sense === NORMAL_SIGHT)[index]?.polygon;

describe('sightSources', () => {
  const generic = (id: string): unknown => GENERIC_SENSES.find((sense) => sense.id === id);

  it('takes only tokens with vision on, converting game units to pixels', () => {
    const sources = sightSources({
      a: token('a', 10, 20, { enabled: true, range: 30, darkvision: 60 }),
      b: token('b', 0, 0, { enabled: false }),
      c: token('c', 0, 0),
    }, scale, bounds);
    expect(sources).toEqual([{ tokenId: 'a', origin: { x: 10, y: 20 }, range: 420, senses: [{ definition: generic('darkvision'), range: 840 }] }]);
  });

  it('gives tokens without a range sight across the whole map', () => {
    const [only] = sightSources({ a: token('a', 0, 0, { enabled: true }) }, scale, bounds);
    expect(only!.range).toBeCloseTo(Math.hypot(1000, 1000));
    expect(only!.senses).toEqual([]);
  });

  it('reads the senses of the collection, with the distance each takes', () => {
    const definitions = BUILT_IN_SENSES['builtin:pathfinder2e']!;
    const [only] = sightSources({
      a: token('a', 0, 0, { enabled: true, senses: [{ id: 'pathfinder2e-darkvision' }, { id: 'pathfinder2e-scent' }, { id: 'pathfinder2e-hearing' }, { id: 'made-up' }] }),
    }, scale, bounds, { definitions, conditions: [] });
    expect(only!.senses.map((sense) => [sense.definition.id, Math.round(sense.range)])).toEqual([['pathfinder2e-darkvision', 1414], ['pathfinder2e-scent', 420]]);
  });

  it('asks how a token perceives where the rules say, instead of reading its vision', () => {
    const visionOf = (asked: TokenEntity): { senses: { id: string; range: number }[]; sightRange?: number } =>
      (asked.id === 'a' ? { senses: [{ id: 'blindsight', range: 10 }], sightRange: 10 } : { senses: [] });
    const sources = sightSources({
      a: token('a', 0, 0, { enabled: true, darkvision: 60, range: 60 }),
      b: token('b', 0, 0, { enabled: true, darkvision: 60, range: 60 }),
    }, scale, bounds, { definitions: GENERIC_SENSES, conditions: [], visionOf });
    expect(sources.map((each) => each.senses.map((sense) => sense.definition.id))).toEqual([['blindsight'], []]);
    expect(sources.map((each) => Math.round(each.range))).toEqual([140, 1414]);
  });

  it('gives a token whose way of perceiving is not known yet no sight and no senses, and keeps it a source', () => {
    const rules = { definitions: GENERIC_SENSES, conditions: [], visionOf: (): { senses: { id: string; range: number }[]; pending: boolean } => ({ senses: [{ id: 'darkvision', range: 60 }], pending: true }) };
    const sources = sightSources({ a: token('a', 10, 20, { enabled: true }) }, scale, bounds, rules);
    expect(sources).toEqual([{ tokenId: 'a', origin: { x: 10, y: 20 }, range: 0, senses: [] }]);
    const sight = computeSight(sources, []);
    expect(sight).toEqual({ all: false, regions: [] });
    expect(perceive({ x: 12, y: 20 }, sight, 'bright')).toBe('unseen');
  });

  it('gives a token without normal sight no region of sight and none for its senses of the eyes, and keeps the others', () => {
    const rules = { definitions: GENERIC_SENSES, conditions: [], visionOf: (): { senses: { id: string; range: number }[]; sightRange: number } => ({ senses: [{ id: 'blindsight', range: 30 }, { id: 'darkvision', range: 60 }], sightRange: 0 }) };
    const sight = computeSight(sightSources({ a: token('a', 500, 500, { enabled: true }) }, scale, bounds, rules), []);
    expect(sight.regions.map((region) => [region.sense.id, region.radius])).toEqual([['blindsight', 420]]);
  });

  it('leaves a blinded token only the senses that work while blinded', () => {
    const conditions: ConditionDefinition[] = [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }];
    const vision = { enabled: true, senses: [{ id: 'darkvision', range: 60 }, { id: 'tremorsense', range: 30 }, { id: 'see-invisible' }] };
    const [blind] = sightSources({ a: { ...token('a', 0, 0, vision), conditions: ['blind'] } }, scale, bounds, { definitions: GENERIC_SENSES, conditions });
    expect(blind).toMatchObject({ blinded: true, senses: [{ definition: generic('tremorsense') }] });
    expect(blind).not.toHaveProperty('seesInvisible');
    const [sighted] = sightSources({ a: token('a', 0, 0, vision) }, scale, bounds, { definitions: GENERIC_SENSES, conditions });
    expect(sighted).toMatchObject({ seesInvisible: true });
    expect(sighted).not.toHaveProperty('blinded');
    expect(sighted!.senses.map((sense) => sense.definition.id)).toEqual(['darkvision', 'tremorsense']);
  });

  it('reads the blinded condition a collection copied before effects existed by its id', () => {
    const conditions: ConditionDefinition[] = [{ id: 'dnd5e-blinded', name: 'Blinded', color: '#000000' }];
    const [blind] = sightSources({ a: { ...token('a', 0, 0, { enabled: true }), conditions: ['dnd5e-blinded'] } }, scale, bounds, { definitions: GENERIC_SENSES, conditions });
    expect(blind!.blinded).toBe(true);
  });
});

describe('computeSight', () => {
  it('sees everything when no token has vision', () => {
    expect(computeSight([], [wall])).toBe(SEES_ALL);
  });

  it('keeps what lies behind a wall out of sight', () => {
    const sight = computeSight([source()], [wall]);
    expect(isSeen({ x: 150, y: 100 }, sight, { ambient: 1 }, [])).toBe(true);
    expect(isSeen({ x: 300, y: 100 }, sight, { ambient: 1 }, [])).toBe(false);
  });

  it('limits darkvision by walls', () => {
    const sight = computeSight([source({ senses: [darkvision(400)] })], [wall]);
    expect(isSeen({ x: 150, y: 100 }, sight, { ambient: 0 }, [])).toBe(true);
    expect(isSeen({ x: 300, y: 100 }, sight, { ambient: 0 }, [])).toBe(false);
  });
});

describe('sight regions', () => {
  it('has one for each token\'s sight and one for each of its senses, with where it is perceived from', () => {
    const a = source({ tokenId: 'a', origin: { x: 100, y: 100 } });
    const b = source({ tokenId: 'b', origin: { x: 500, y: 500 }, senses: [darkvision(400), tremorsense(90)] });
    const sight = computeSight([a, b], [wall]);
    expect(sight.regions.map((region) => [region.tokenId, region.sense.id, region.origin, region.radius])).toEqual([
      ['a', 'sight', a.origin, 1414], ['b', 'sight', b.origin, 1414], ['b', 'darkvision', b.origin, 400], ['b', 'tremorsense', b.origin, 90],
    ]);
    expect(sight.regions.map((region) => region.polygon !== null)).toEqual([true, true, true, false]);
  });

  it('gives a blinded token no region of sight', () => {
    const sight = computeSight([source({ blinded: true, senses: [tremorsense(90)] })], [wall]);
    expect(sight.all).toBe(false);
    expect(sight.regions.map((region) => region.sense.id)).toEqual(['tremorsense']);
    expect(computeSight([source({ blinded: true })], [wall])).toEqual({ all: false, regions: [] });
  });

  it('caps a sense of the eyes at the token\'s sight range, and lets the others reach their own', () => {
    const sight = computeSight([source({ range: 100, senses: [darkvision(400), senseSource('blindsight', 300), tremorsense(250)] })], []);
    expect(sight.regions.map((region) => region.radius)).toEqual([100, 100, 300, 250]);
  });

  it('shares one polygon between sight and a sense of the eyes that reaches as far', () => {
    const sight = computeSight([source({ range: 300, senses: [senseSource('low-light-vision', 1414), darkvision(200)] })], [wall]);
    expect(sight.regions[1]!.polygon).toBe(sight.regions[0]!.polygon);
    expect(sight.regions[2]!.polygon).not.toBe(sight.regions[0]!.polygon);
  });

  it('lets the eyes of a token that sees invisible things do so, and no other sense', () => {
    const sight = computeSight([source({ seesInvisible: true, senses: [darkvision(100), tremorsense(90), senseSource('blindsight', 50)] })], []);
    expect(sight.regions.map((region) => [region.sense.id, region.seesInvisible])).toEqual([['sight', true], ['darkvision', true], ['tremorsense', true], ['blindsight', true]]);
    const plain = computeSight([source({ senses: [darkvision(100), tremorsense(90)] })], []);
    expect(plain.regions.map((region) => region.seesInvisible)).toEqual([false, false, true]);
  });

  it('sees an invisible creature in the dark with darkvision and a sense that lets the eyes see invisible things', () => {
    const dark = computeSight([source({ seesInvisible: true, senses: [darkvision(100)] })], []);
    expect(perceive({ x: 150, y: 100 }, dark, 'dark', { invisible: true })).toBe('seen');
    expect(perceive({ x: 150, y: 100 }, computeSight([source({ senses: [darkvision(100)] })], []), 'dark', { invisible: true })).toBe('unseen');
    expect(perceive({ x: 150, y: 100 }, computeSight([source({ seesInvisible: true })], []), 'dark', { invisible: true })).toBe('unseen');
  });
});

describe('seeing by light', () => {
  const sight = computeSight([source()], []);

  it('does not see into darkness', () => {
    expect(isSeen({ x: 150, y: 150 }, sight, { ambient: 0 }, [])).toBe(false);
  });

  it('sees what a light reaches', () => {
    const torch = lightReach({ x: 160, y: 160 }, 100, []);
    expect(isSeen({ x: 150, y: 150 }, sight, { ambient: 0 }, [torch])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0 }, [torch])).toBe(false);
  });

  it('sees everything in sight once the ambient light is bright enough', () => {
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.5 }, [])).toBe(true);
  });

  it('counts the scene as lit from 25 % ambient light unless the scene sets its own threshold', () => {
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.25 }, [])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.24 }, [])).toBe(false);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.3, litThreshold: 0.5 }, [])).toBe(false);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.5, litThreshold: 0.5 }, [])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0, litThreshold: 0 }, [])).toBe(true);
  });

  it('still needs light or darkvision where the threshold is out of reach', () => {
    const torch = lightReach({ x: 160, y: 160 }, 100, []);
    expect(isSeen({ x: 150, y: 150 }, sight, { ambient: 0.9, litThreshold: 1 }, [torch])).toBe(true);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.9, litThreshold: 1 }, [torch])).toBe(false);
  });

  it('leaves which tokens are seen at night and at dusk as it was before light levels', () => {
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.15 }, [])).toBe(false);
    expect(isSeen({ x: 400, y: 400 }, sight, { ambient: 0.5 }, [])).toBe(true);
  });
});

describe('SightCache', () => {
  it('reuses a token\'s regions while the token, its senses and the walls stay the same', () => {
    const cache = new SightCache();
    const walls = [wall];
    const first = computeSight([source()], walls, cache).regions[0];
    expect(computeSight([source()], walls, cache).regions[0]).toBe(first);
    expect(computeSight([source()], [wall], cache).regions[0]).not.toBe(first);
    expect(computeSight([source({ origin: { x: 110, y: 100 } })], walls, cache).regions[0]).not.toBe(first);
  });

  it('recomputes for each change of a token\'s senses', () => {
    const walls = [wall];
    const base = source({ senses: [darkvision(300)] });
    for (const overrides of [{ senses: [darkvision(200)] }, { senses: [] }, { senses: [tremorsense(300)] }, { blinded: true as const }, { seesInvisible: true as const }]) {
      const cache = new SightCache();
      const first = computeSight([base], walls, cache).regions;
      expect(computeSight([{ ...base, ...overrides }], walls, cache).regions[0]).not.toBe(first[0]);
    }
  });

  it('leaves the other tokens\' regions as they are when one token moves', () => {
    const cache = new SightCache();
    const walls = [wall];
    const still = source({ tokenId: 'still', origin: { x: 500, y: 500 }, senses: [darkvision(100)] });
    const before = computeSight([source(), still], walls, cache).regions;
    const after = computeSight([source({ origin: { x: 120, y: 100 } }), still], walls, cache).regions;
    expect(after[0]).not.toBe(before[0]);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });
});

describe('vision cones', () => {
  const at = { x: 500, y: 500 };
  const seenFrom = (vision: TokenEntity['vision'], rotation?: number): ((x: number, y: number, ambient?: number) => boolean) => {
    const viewer = { ...token('v', at.x, at.y, vision), ...(rotation !== undefined && { rotation }) };
    const sight = computeSight(sightSources({ v: viewer }, scale, bounds), []);
    return (x: number, y: number, ambient = 1): boolean => isSeen({ x, y }, sight, { ambient: ambient }, []);
  };

  it('looks down at rotation 0, towards the art\'s bottom, since token art faces the viewer', () => {
    const sees = seenFrom({ enabled: true, angle: 90 });
    expect(sees(500, 700)).toBe(true);
    expect(sees(500, 300)).toBe(false);
    expect(sees(700, 500)).toBe(false);
  });

  it('turns clockwise with the token rotation', () => {
    const left = seenFrom({ enabled: true, angle: 90 }, 90);
    expect(left(300, 500)).toBe(true);
    expect(left(700, 500)).toBe(false);
    expect(left(500, 700)).toBe(false);
    for (const rotation of [-90, 270]) {
      const right = seenFrom({ enabled: true, angle: 90 }, rotation);
      expect(right(700, 500)).toBe(true);
      expect(right(300, 500)).toBe(false);
    }
  });

  it('sees all around without an angle or with 360', () => {
    for (const vision of [{ enabled: true }, { enabled: true, angle: 360 }]) {
      const sees = seenFrom(vision, 90);
      expect(sees(300, 500)).toBe(true);
      expect(sees(500, 700)).toBe(true);
    }
  });

  it('limits darkvision to the cone', () => {
    const sees = seenFrom({ enabled: true, angle: 90, darkvision: 30 }, 0);
    expect(sees(500, 600, 0)).toBe(true);
    expect(sees(500, 400, 0)).toBe(false);
  });

  it('does not limit a sense that needs no eyes to the cone', () => {
    const sees = seenFrom({ enabled: true, angle: 90, senses: [{ id: 'blindsight', range: 30 }] }, 0);
    expect(sees(500, 400, 0)).toBe(true);
    expect(sees(500, 600, 0)).toBe(true);
    expect(sees(500, 930, 0)).toBe(false);
  });

  it('always sees its own space, even behind the cone', () => {
    const sees = seenFrom({ enabled: true, angle: 90 }, 0);
    expect(sees(500, 475)).toBe(true);
    expect(sees(475, 500)).toBe(true);
    expect(sees(500, 465)).toBe(false);
  });

  it('sees in the dark within its own space when it has darkvision', () => {
    const sees = seenFrom({ enabled: true, angle: 90, darkvision: 30 }, 0);
    expect(sees(500, 475, 0)).toBe(true);
    expect(sees(500, 465, 0)).toBe(false);
  });

  it('takes its own space from the token\'s size', () => {
    const viewer = (size?: number): TokenEntity => ({ ...token('v', 0, 0, { enabled: true, angle: 90 }), ...(size !== undefined && { size }) });
    // A medium token on a 70 px grid is 62 px across, a large one twice that.
    expect(sightSources({ v: viewer() }, scale, bounds)[0]!.cone!.apex).toBe(31);
    expect(sightSources({ v: viewer(1.5) }, scale, bounds)[0]!.cone!.apex).toBe(62);
    const cache = new SightCache();
    const walls = [wall];
    const first = sightPolygon(computeSight(sightSources({ v: viewer() }, scale, bounds), walls, cache));
    expect(sightPolygon(computeSight(sightSources({ v: viewer() }, scale, bounds), walls, cache))).toBe(first);
    expect(sightPolygon(computeSight(sightSources({ v: viewer(1.5) }, scale, bounds), walls, cache))).not.toBe(first);
  });

  it('recomputes the polygon when the token turns', () => {
    const cache = new SightCache();
    const walls = [wall];
    const facingUp = source({ cone: { facing: -Math.PI / 2, angle: 1 } });
    const first = sightPolygon(computeSight([facingUp], walls, cache));
    expect(sightPolygon(computeSight([{ ...facingUp, cone: { facing: -Math.PI / 2, angle: 1 } }], walls, cache))).toBe(first);
    expect(sightPolygon(computeSight([{ ...facingUp, cone: { facing: 0, angle: 1 } }], walls, cache))).not.toBe(first);
    expect(sightPolygon(computeSight([{ ...facingUp, cone: { facing: -Math.PI / 2, angle: 2 } }], walls, cache))).not.toBe(first);
  });
});

describe('tremorsense', () => {
  it('converts the range to world pixels and adds no sight of its own', () => {
    const viewer = token('v', 100, 100, { enabled: true, range: 5, tremorsense: 30 });
    const [only] = sightSources({ v: viewer }, scale, bounds);
    expect(only!.senses).toEqual([tremorsense(420)]);
    const sight = computeSight([only!], [wall]);
    const without = computeSight([{ ...only!, senses: [] }], [wall]);
    expect(sightPolygon(sight)).toEqual(sightPolygon(without));
    expect(sight.regions[1]).toMatchObject({ origin: { x: 100, y: 100 }, radius: 420, polygon: null });
    expect(without.regions).toHaveLength(1);
  });

  it('senses points within range through walls and darkness, without seeing them', () => {
    const sight = computeSight([source({ senses: [tremorsense(300)] })], [wall]);
    expect(perceive({ x: 300, y: 100 }, sight, 'dark')).toBe('sensed');
    expect(perceive({ x: 400, y: 100 }, sight, 'dark')).toBe('sensed');
    expect(perceive({ x: 401, y: 100 }, sight, 'dark')).toBe('unseen');
    expect(perceive({ x: 450, y: 100 }, sight, 'bright')).toBe('unseen');
  });

  it('senses nothing without tremorsense', () => {
    expect(perceive({ x: 110, y: 100 }, computeSight([source()], []), 'dark')).toBe('unseen');
  });
});

describe('sceneSight', () => {
  it('computes the tokens\' sight while the scene uses token vision', () => {
    expect(sceneSight({}, [source()], [wall]).regions).toEqual(computeSight([source()], [wall]).regions);
    expect(sceneSight({ tokenVision: true }, [source()], [wall]).all).toBe(false);
  });

  it('sees everything when the scene switches token vision off', () => {
    const sight = sceneSight({ tokenVision: false }, [source()], [wall]);
    expect(sight).toBe(SEES_ALL);
    expect(isSeen({ x: 300, y: 100 }, sight, { ambient: 1 }, [])).toBe(true);
  });
});

describe('sightOptionsChanged', () => {
  const night = { enabled: true, ambient: 0.1 };

  it('is true for the options that decide what is seen and recorded', () => {
    expect(sightOptionsChanged(night, { ...night, tokenVision: false })).toBe(true);
    expect(sightOptionsChanged(night, { ...night, exploredMemory: false })).toBe(true);
    expect(sightOptionsChanged(night, { ...night, litThreshold: 0.5 })).toBe(true);
    expect(sightOptionsChanged(night, { ...night, brightThreshold: 0.5 })).toBe(true);
  });

  it('is true when the ambient light crosses a threshold, and false for other ambient changes and for colours', () => {
    expect(sightOptionsChanged(night, { ...night, ambient: 0.25 })).toBe(true);
    expect(sightOptionsChanged({ ...night, ambient: 0.5 }, { ...night, ambient: 0.75 })).toBe(true);
    expect(sightOptionsChanged(night, { ...night, ambient: 0.2 })).toBe(false);
    expect(sightOptionsChanged({ ...night, ambient: 0.5 }, { ...night, ambient: 0.6 })).toBe(false);
    expect(sightOptionsChanged(night, { ...night, ambientColor: '#ffeecc', exploredColor: '#112233' })).toBe(false);
  });
});
