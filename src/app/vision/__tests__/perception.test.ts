import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../gameSystems/senses';
import { findSense } from '../../gameSystems/senseRules';
import type { TokenEntity } from '../../types';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import type { LightLevel } from '../../types/senseTypes';
import type { WallSegment } from '../../types/wallTypes';
import type { TokenVision } from '../../types/lightingTypes';
import { exploredShapes } from '../exploredShapes';
import { lightLevelAt } from '../lightLevels';
import { perceive, regionContains, seenSpots, type PerceivedTarget, type Perception } from '../perception';
import { computeSight, lightReach, sceneSight, sightSources, type SightRegion } from '../sight';
import { pointInPolygon } from '../visibility';
import type { SightRules } from '../sightRules';

/** One game unit is one world pixel. */
const scale = { unitDistance: 5, cellSize: 5 };
const bounds = { width: 1000, height: 1000 };
/** Right of the viewer, ending above the far point. */
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 160, y: 0 }, p2: { x: 160, y: 220 } };
const VIEWER = { x: 100, y: 100 };
/** 40 units away with a clear line. */
const NEAR = { x: 140, y: 100 };
/** 90 units away, behind the wall. */
const BEHIND = { x: 190, y: 100 };
/** 150 units away with a clear line: beyond every sense given 100 units. */
const FAR = { x: 100, y: 250 };

const conditions: ConditionDefinition[] = [
  { id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' },
  { id: 'unseen', name: 'Invisible', color: '#000000', effect: 'invisible' },
];
const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const rules: SightRules = { definitions: ALL_SENSES, conditions };
const dark = { ambient: 0 };

function token(id: string, at: { x: number; y: number }, extra: { vision?: TokenVision; conditions?: string[] } = {}): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, x: at.x, y: at.y, ...extra };
}

/** A viewer with normal sight and the one sense `id`, 100 units far where the sense takes a distance. */
function viewerWith(id: string | null, blinded = false): TokenEntity {
  const definition = id ? findSense(ALL_SENSES, id)! : null;
  const senses = definition ? [{ id: definition.id, ...(definition.range === 'required' && { range: 100 }) }] : [];
  return token('viewer', VIEWER, { vision: { enabled: true, senses }, ...(blinded && { conditions: ['blind'] }) });
}

const LETTER: Record<Perception, string> = { seen: 'S', sensed: 's', unseen: '-' };
const LEVELS: readonly LightLevel[] = ['bright', 'dim', 'dark', 'magical-dark'];

/** What a viewer with the sense perceives: S seen, s sensed, - not at all. */
function row(id: string | null): string {
  const sightOf = (blinded: boolean): ReturnType<typeof computeSight> =>
    computeSight(sightSources({ viewer: viewerWith(id, blinded) }, scale, bounds, rules), [wall]);
  const [sight, blind] = [sightOf(false), sightOf(true)];
  const at = (point: { x: number; y: number }, level: LightLevel, target: PerceivedTarget = {}, from = sight): string =>
    LETTER[perceive(point, from, level, target)];
  return [
    id ?? 'sight',
    LEVELS.map((level) => at(NEAR, level)).join(''),
    `wall ${at(BEHIND, 'dark')}${at(BEHIND, 'bright')}`,
    `far ${at(FAR, 'dark')}`,
    `invisible ${at(NEAR, 'bright', { invisible: true })}${at(NEAR, 'dark', { invisible: true })}`,
    `blinded ${at(NEAR, 'bright', {}, blind)}${at(NEAR, 'dark', {}, blind)}`,
    `airborne ${at(NEAR, 'bright', { airborne: true })}${at(NEAR, 'dark', { airborne: true })}`,
  ].join(' | ');
}

describe('what a token perceives through each built-in sense', () => {
  it('follows the rule row of the sense', () => {
    // sense | a creature 40 units away in bright, dim, dark, magical dark | behind a wall in the dark, in bright light
    // | 150 units away in the dark | an invisible one in bright light, in the dark | the viewer blinded: bright, dark
    // | a flying one in bright light, in the dark
    expect([null, ...ALL_SENSES.map((sense) => sense.id)].map(row).join('\n')).toMatchInlineSnapshot(`
      "sight | SS-- | wall -- | far - | invisible -- | blinded -- | airborne S-
      darkvision | SSS- | wall -- | far - | invisible -- | blinded -- | airborne SS
      low-light-vision | SS-- | wall -- | far - | invisible -- | blinded -- | airborne S-
      blindsight | SSSS | wall -- | far - | invisible SS | blinded SS | airborne SS
      tremorsense | SSss | wall ss | far - | invisible ss | blinded ss | airborne S-
      truesight | SSSS | wall -- | far - | invisible SS | blinded -- | airborne SS
      see-invisible | SS-- | wall -- | far - | invisible S- | blinded -- | airborne S-
      dnd5e-darkvision | SSS- | wall -- | far - | invisible -- | blinded -- | airborne SS
      dnd5e-blindsight | SSSS | wall -- | far - | invisible SS | blinded SS | airborne SS
      dnd5e-tremorsense | SSss | wall ss | far - | invisible ss | blinded ss | airborne S-
      dnd5e-truesight | SSSS | wall -- | far - | invisible SS | blinded -- | airborne SS
      dnd5e-devils-sight | SSSS | wall -- | far - | invisible -- | blinded -- | airborne SS
      dnd5e-see-invisibility | SS-- | wall -- | far - | invisible S- | blinded -- | airborne S-
      cyberpunkred-low-light-ir-uv | SSS- | wall -- | far S | invisible -- | blinded -- | airborne SS
      ose-infravision | SSS- | wall -- | far - | invisible -- | blinded -- | airborne SS
      pathfinder2e-low-light-vision | SS-- | wall -- | far - | invisible -- | blinded -- | airborne S-
      pathfinder2e-darkvision | SSSS | wall -- | far S | invisible -- | blinded -- | airborne SS
      pathfinder2e-greater-darkvision | SSSS | wall -- | far S | invisible -- | blinded -- | airborne SS
      pathfinder2e-tremorsense | SSss | wall ss | far - | invisible ss | blinded ss | airborne S-
      pathfinder2e-scent | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-hearing | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-lifesense | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-wavesense | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-echolocation | SSSS | wall -- | far - | invisible SS | blinded SS | airborne SS
      pathfinder2e-see-the-unseen | SS-- | wall -- | far - | invisible S- | blinded -- | airborne S-
      shadowdark-darkness-adapted | SSS- | wall -- | far S | invisible -- | blinded -- | airborne SS"
    `);
  });
});

describe('rules by name', () => {
  const sightWith = (id: string | null, blinded = false): ReturnType<typeof computeSight> =>
    computeSight(sightSources({ viewer: viewerWith(id, blinded) }, scale, bounds, rules), [wall]);

  it('D&D 5e darkvision: darkness within range is seen, magical darkness is not', () => {
    const sight = sightWith('dnd5e-darkvision');
    expect(perceive(NEAR, sight, 'dark')).toBe('seen');
    expect(perceive(NEAR, sight, 'magical-dark')).toBe('unseen');
    expect(perceive(FAR, sight, 'dark')).toBe('unseen');
  });

  it('D&D 5e blindsight: anything not behind total cover, invisible things too, also while blinded', () => {
    expect(perceive(NEAR, sightWith('dnd5e-blindsight', true), 'dark', { invisible: true })).toBe('seen');
    expect(perceive(BEHIND, sightWith('dnd5e-blindsight'), 'bright')).toBe('unseen');
  });

  it('D&D 5e tremorsense: creatures on the same surface through walls, never those in the air, and it is not sight', () => {
    const sight = sightWith('dnd5e-tremorsense', true);
    expect(perceive(BEHIND, sight, 'dark')).toBe('sensed');
    expect(perceive(BEHIND, sight, 'dark', { airborne: true })).toBe('unseen');
    expect(perceive(NEAR, sight, 'bright')).toBe('sensed');
  });

  it('D&D 5e truesight: normal and magical darkness and invisible creatures, but it needs the eyes', () => {
    expect(perceive(NEAR, sightWith('dnd5e-truesight'), 'magical-dark', { invisible: true })).toBe('seen');
    expect(perceive(NEAR, sightWith('dnd5e-truesight', true), 'bright')).toBe('unseen');
  });

  it('Pathfinder: an imprecise sense makes a creature hidden at best, a precise one observed', () => {
    expect(perceive(BEHIND, sightWith('pathfinder2e-scent'), 'dark')).toBe('sensed');
    expect(perceive(NEAR, sightWith('pathfinder2e-scent', true), 'dark')).toBe('sensed');
    expect(perceive(NEAR, sightWith('pathfinder2e-echolocation', true), 'dark')).toBe('seen');
  });

  it('Pathfinder echolocation shows creatures as they are, so walls stop it; hearing passes them', () => {
    expect(perceive(BEHIND, sightWith('pathfinder2e-echolocation'), 'dark')).toBe('unseen');
    expect(perceive(BEHIND, sightWith('pathfinder2e-hearing'), 'dark')).toBe('sensed');
  });

  it('See Invisibility and See the Unseen: the eyes see invisible creatures where they see, and a blinded token gains nothing', () => {
    for (const id of ['see-invisible', 'dnd5e-see-invisibility', 'pathfinder2e-see-the-unseen']) {
      expect(perceive(NEAR, sightWith(id), 'dim', { invisible: true })).toBe('seen');
      expect(perceive(NEAR, sightWith(id), 'dark', { invisible: true })).toBe('unseen');
      expect(perceive(BEHIND, sightWith(id), 'bright', { invisible: true })).toBe('unseen');
      expect(perceive(NEAR, sightWith(id, true), 'bright', { invisible: true })).toBe('unseen');
    }
  });

  it('seeing invisible things joins the other senses of the eyes: darkvision then sees an invisible creature in the dark', () => {
    const viewer = token('viewer', VIEWER, { vision: { enabled: true, senses: [{ id: 'pathfinder2e-darkvision' }, { id: 'pathfinder2e-see-the-unseen' }] } });
    const sight = computeSight(sightSources({ viewer }, scale, bounds, rules), [wall]);
    expect(perceive(NEAR, sight, 'dark', { invisible: true })).toBe('seen');
    expect(perceive(NEAR, sightWith('pathfinder2e-darkvision'), 'dark', { invisible: true })).toBe('unseen');
  });

  it('an undetected creature is perceived by no sense at all', () => {
    for (const sense of ALL_SENSES) {
      for (const level of LEVELS) expect(perceive(NEAR, sightWith(sense.id), level, { undetected: true })).toBe('unseen');
    }
  });

  it('Old-School Essentials infravision: only in darkness, and light is seen by normal sight', () => {
    expect(perceive(NEAR, sightWith('ose-infravision'), 'dark')).toBe('seen');
    expect(perceive(NEAR, sightWith('ose-infravision', true), 'dark')).toBe('unseen');
    expect(perceive(FAR, sightWith('ose-infravision'), 'bright')).toBe('seen');
    expect(perceive(FAR, sightWith('ose-infravision'), 'dark')).toBe('unseen');
  });

  it('a blinded viewer has no sight at all, in any light', () => {
    for (const level of LEVELS) expect(perceive(NEAR, sightWith(null, true), level)).toBe('unseen');
  });

  it('dim light is seen by normal sight', () => {
    expect(perceive(FAR, sightWith(null), 'dim')).toBe('seen');
  });
});

describe('perceive without vision tokens', () => {
  const everything = sceneSight({}, [], [wall]);

  it('sees whatever is lit, wherever it is', () => {
    expect(everything.all).toBe(true);
    expect(perceive(BEHIND, everything, 'bright')).toBe('seen');
    expect(perceive(BEHIND, everything, 'dim')).toBe('seen');
    expect(perceive(BEHIND, everything, 'dark')).toBe('unseen');
  });

  it('ignores the conditions of what is looked at: invisible and undetected act only while sight is the tokens\'', () => {
    expect(perceive(NEAR, everything, 'bright', { invisible: true })).toBe('seen');
    expect(perceive(NEAR, everything, 'dim', { undetected: true, airborne: true })).toBe('seen');
    expect(perceive(NEAR, everything, 'dark', { invisible: true })).toBe('unseen');
    const off = sceneSight({ tokenVision: false }, sightSources({ viewer: viewerWith(null) }, scale, bounds, rules), [wall]);
    expect(perceive(BEHIND, off, 'bright', { invisible: true, undetected: true })).toBe('seen');
  });

  it('is what a scene with token vision off gets, whatever its tokens sense', () => {
    const sources = sightSources({ viewer: viewerWith('dnd5e-tremorsense') }, scale, bounds, rules);
    expect(sceneSight({ tokenVision: false }, sources, [wall]).all).toBe(true);
  });
});

describe('perceive and the light level', () => {
  const sight = computeSight(sightSources({ viewer: viewerWith('darkvision') }, scale, bounds, rules), [wall]);

  it('asks for the light only where a sense reaches as far, and once', () => {
    let asked = 0;
    const level = (): LightLevel => { asked++; return 'dark'; };
    const darkvisionOnly = { all: false, regions: sight.regions.slice(1) };
    expect(perceive({ x: 900, y: 900 }, darkvisionOnly, level)).toBe('unseen');
    expect(perceive(FAR, darkvisionOnly, level)).toBe('unseen');
    expect(asked).toBe(0);
    expect(perceive(NEAR, sight, level)).toBe('seen');
    expect(asked).toBe(1);
  });

  it('looks at no polygon of a sense that perceives nothing in that light', () => {
    const [seeing] = sight.regions;
    const never = { ...seeing!, polygon: new Proxy(seeing!.polygon!, { get: () => { throw new Error('the polygon was read'); } }) };
    expect(perceive(NEAR, { all: false, regions: [never] }, 'dark')).toBe('unseen');
    expect(() => perceive(NEAR, { all: false, regions: [never] }, 'bright')).toThrow('the polygon was read');
  });

  it('answers the same whether it is given the level or asked to find it', () => {
    for (const point of [NEAR, BEHIND, FAR, VIEWER, { x: 900, y: 900 }]) {
      for (const level of LEVELS) expect(perceive(point, sight, () => level)).toBe(perceive(point, sight, level));
    }
  });
});

describe('regionContains', () => {
  it('rules a point out by its distance before it looks at the polygon, with the same answer', () => {
    const [seeing] = computeSight(sightSources({ viewer: { ...viewerWith(null), vision: { enabled: true, range: 80 } } }, scale, bounds, rules), [wall]).regions;
    const never: SightRegion = { ...seeing!, polygon: new Proxy(seeing!.polygon!, { get: () => { throw new Error('the polygon was read'); } }) };
    expect(regionContains(never, { x: 100, y: 181 })).toBe(false);
    expect(regionContains(never, { x: 300, y: 300 })).toBe(false);
    for (let x = 0; x <= 200; x += 7) {
      for (let y = 0; y <= 200; y += 7) expect(regionContains(seeing!, { x, y })).toBe(pointInPolygon({ x, y }, seeing!.polygon!));
    }
  });

  it('reaches a disc for a sense that walls do not stop, a polygon for one they do', () => {
    const [sight, tremor] = computeSight(sightSources({ viewer: viewerWith('tremorsense') }, scale, bounds, rules), [wall]).regions;
    expect(regionContains(tremor!, { x: 200, y: 100 })).toBe(true);
    expect(regionContains(tremor!, { x: 200.5, y: 100 })).toBe(false);
    expect(regionContains(sight!, BEHIND)).toBe(false);
    expect(regionContains(sight!, NEAR)).toBe(true);
  });

  it('cuts the disc of a sense of the eyes to the token\'s cone', () => {
    const smell = { ...findSense(ALL_SENSES, 'pathfinder2e-scent')!, id: 'eyes', worksWhileBlinded: false };
    const viewer = { ...token('viewer', VIEWER, { vision: { enabled: true, angle: 90, senses: [{ id: 'eyes', range: 100 }] } }), rotation: 270 };
    const region = computeSight(sightSources({ viewer }, scale, bounds, { definitions: [smell], conditions }), []).regions[1]!;
    expect(regionContains(region, { x: 150, y: 100 })).toBe(true);
    expect(regionContains(region, { x: 50, y: 100 })).toBe(false);
    expect(regionContains(region, { x: 100, y: 150 })).toBe(false);
    expect(region.cone!.apex).toBeGreaterThan(0);
    expect(regionContains(region, { x: 100, y: 100 + region.cone!.apex! / 2 })).toBe(true);
  });
});

describe('seenSpots', () => {
  const others = (): Record<string, TokenEntity> => ({
    near: token('near', NEAR),
    behind: token('behind', BEHIND),
    far: token('far', FAR),
    hidden: token('hidden', NEAR, { conditions: ['unseen'] }),
    ally: token('ally', { x: 120, y: 100 }, { vision: { enabled: false } }),
  });
  const sightOf = (tokens: Record<string, TokenEntity>): ReturnType<typeof computeSight> => computeSight(sightSources(tokens, scale, bounds, rules), [wall]);
  const places = (spots: { x: number; y: number }[]): { x: number; y: number }[] => spots.map(({ x, y }) => ({ x, y }));
  /** The spots of the creatures around a viewer with the sense `id`, without the viewer's own. */
  const creatureSpots = (id: string | null, ambient = 0): { x: number; y: number }[] => {
    const tokens = { viewer: viewerWith(id), ...others() };
    return places(seenSpots(sightOf(tokens), { ambient }, [], tokens, scale.cellSize, [wall], { conditions })).filter((spot) => spot.x !== VIEWER.x);
  };

  it('are the tokens echolocation sees in the dark, where nothing shows the map: each is shown in its footprint', () => {
    // Echolocation reaches 100 units here: the two tokens within it, the invisible one too, not the one behind the wall.
    expect(creatureSpots('pathfinder2e-echolocation')).toEqual([NEAR, NEAR, { x: 120, y: 100 }]);
  });

  it('are as large as the token', () => {
    const tokens = { viewer: viewerWith('pathfinder2e-echolocation'), big: { ...token('big', NEAR), size: 2 } };
    const sight = sightOf(tokens);
    const [, small] = seenSpots(sight, dark, [], { ...tokens, big: token('big', NEAR) }, 70, [wall], { conditions });
    const [, large] = seenSpots(sight, dark, [], tokens, 70, [wall], { conditions });
    expect(small!.radius).toBe(31);
    expect(large!.radius).toBeGreaterThan(small!.radius * 1.9);
  });

  it('are none where the map is shown: in light for sight, in the dark for a sense that shows the map', () => {
    expect(creatureSpots('pathfinder2e-echolocation', 1)).toEqual([NEAR]);
    const both = { ...others(), viewer: token('viewer', VIEWER, { vision: { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 100 }, { id: 'blindsight', range: 100 }] } }) };
    expect(seenSpots(sightOf(both), dark, [], both, scale.cellSize, [wall], { conditions })).toEqual([]);
  });

  it('are none of the creatures for senses that only sense, for sight alone, and none at all without vision tokens', () => {
    expect(creatureSpots('tremorsense')).toEqual([]);
    expect(creatureSpots('darkvision')).toEqual([]);
    expect(creatureSpots(null)).toEqual([]);
    expect(seenSpots(sceneSight({}, [], [wall]), dark, [], others(), scale.cellSize, [wall], { conditions })).toEqual([]);
    expect(seenSpots(sceneSight({ tokenVision: false }, sightSources({ viewer: viewerWith(null) }, scale, bounds, rules), [wall]), dark, [], { viewer: viewerWith(null) }, scale.cellSize, [wall])).toEqual([]);
  });
});

describe('seenSpots of the party', () => {
  const sightOf = (tokens: Record<string, TokenEntity>): ReturnType<typeof computeSight> => computeSight(sightSources(tokens, scale, bounds, rules), [wall]);
  const spotsOf = (tokens: Record<string, TokenEntity>, ambient = 0, lights: ReturnType<typeof lightReach>[] = []): { x: number; y: number }[] =>
    seenSpots(sightOf(tokens), { ambient }, lights, tokens, scale.cellSize, [wall], { conditions }).map(({ x, y }) => ({ x, y }));

  it('show a token with vision that stands in darkness within its own footprint', () => {
    expect(spotsOf({ viewer: viewerWith(null) })).toEqual([VIEWER]);
    const scout = token('scout', BEHIND, { vision: { enabled: true } });
    expect(spotsOf({ viewer: viewerWith(null), scout })).toEqual([VIEWER, BEHIND]);
  });

  it('are none where the token is seen anyway: in light, or in the dark by a sense that shows the map', () => {
    expect(spotsOf({ viewer: viewerWith(null) }, 0.5)).toEqual([]);
    expect(spotsOf({ viewer: viewerWith(null) }, 0, [lightReach(VIEWER, 40, [], 20)])).toEqual([]);
    expect(spotsOf({ viewer: viewerWith('darkvision') })).toEqual([]);
    expect(spotsOf({ viewer: viewerWith('blindsight') })).toEqual([]);
    // A second party member in the first one's darkvision is seen by it.
    expect(spotsOf({ viewer: viewerWith('darkvision'), scout: token('scout', NEAR, { vision: { enabled: true } }) })).toEqual([]);
  });

  it('show a blinded party token, which sees nothing itself, and one that is invisible or undetected', () => {
    expect(spotsOf({ viewer: viewerWith(null, true) }, 1)).toEqual([VIEWER]);
    const cloaked = token('viewer', VIEWER, { vision: { enabled: true }, conditions: ['unseen'] });
    expect(spotsOf({ viewer: cloaked })).toEqual([VIEWER]);
    expect(spotsOf({ viewer: cloaked }, 1)).toEqual([]);
  });

  it('show a party token at night, when the map is dimly drawn but its place counts as dark', () => {
    expect(spotsOf({ viewer: viewerWith(null) }, 0.15)).toEqual([VIEWER]);
    expect(spotsOf({ viewer: viewerWith(null) }, 0.25)).toEqual([]);
  });

  it('never show a hidden token, and none whose vision is off', () => {
    expect(spotsOf({ viewer: viewerWith(null), gm: { ...token('gm', NEAR, { vision: { enabled: true } }), isHidden: true } })).toEqual([VIEWER]);
    expect(spotsOf({ viewer: viewerWith(null), npc: token('npc', NEAR, { vision: { enabled: false } }) })).toEqual([VIEWER]);
  });

  it('follow a party token the pointer drags as far as the sight that stayed behind reaches, and not beyond', () => {
    const start = { viewer: viewerWith(null) };
    const sight = sightOf(start);
    const held = { viewer: VIEWER };
    const dragged = (at: { x: number; y: number }): { x: number; y: number }[] =>
      seenSpots(sight, dark, [], { viewer: { ...start.viewer, ...at } }, scale.cellSize, [wall], { conditions, held }).map(({ x, y }) => ({ x, y }));
    expect(dragged(NEAR)).toEqual([NEAR]);
    expect(dragged(BEHIND)).toEqual([]);
    // Without sight on drop nothing is held: the token is shown wherever the store has it.
    expect(seenSpots(sight, dark, [], { viewer: { ...start.viewer, ...BEHIND } }, scale.cellSize, [wall], { conditions })).toHaveLength(1);
  });
});

describe('seenSpots and walls', () => {
  /** A party token 8 px left of the wall at x = 160, in the dark. */
  const hugging = (size: number): TokenEntity => ({ ...token('hugger', { x: 152, y: 100 }, { vision: { enabled: true } }), size });
  const spotOf = (size: number, walls: WallSegment[] = [wall]): ReturnType<typeof seenSpots>[number] => {
    const tokens = { hugger: hugging(size) };
    return seenSpots(computeSight(sightSources(tokens, scale, bounds, rules), walls), dark, [], tokens, 70, walls)[0]!;
  };

  it('never show anything past a wall: the footprint of a token that hugs one ends at its centre line, whatever the token\'s size', () => {
    for (const size of [1, 1.5, 2.5, 4]) {
      const spot = spotOf(size);
      expect(spot.radius).toBeGreaterThan(8);
      // The wall runs from y = 0 to y = 220: beside it nothing lies past x = 160.
      const beyond = spot.polygon.filter((point) => point.x > 160.001 && point.y > 0 && point.y < 220);
      expect(beyond).toEqual([]);
      expect(Math.min(...spot.polygon.map((point) => point.x))).toBeCloseTo(152 - spot.radius, 0);
    }
  });

  it('are the whole footprint where no wall is near', () => {
    const spot = spotOf(1, []);
    for (const point of spot.polygon) expect(Math.hypot(point.x - 152, point.y - 100)).toBeCloseTo(31, 3);
    expect(Math.max(...spot.polygon.map((point) => point.x))).toBeCloseTo(183, 0);
  });

  it('follow a one-way wall as sight does: it ends the footprint from its blocking side, and from the other lets it through', () => {
    // The wall runs down the map, so its 'left' side is x < 160, where the token stands.
    const blocking: WallSegment = { ...wall, direction: 'left' };
    expect(Math.max(...spotOf(1, [blocking]).polygon.filter((point) => point.y > 0 && point.y < 220).map((point) => point.x))).toBeLessThanOrEqual(160.001);
    const open: WallSegment = { ...wall, direction: 'right' };
    expect(Math.max(...spotOf(1, [open]).polygon.map((point) => point.x))).toBeCloseTo(183, 0);
  });

  it('end at a wall for a token an echolocation sees, too', () => {
    const tokens = { viewer: viewerWith('pathfinder2e-echolocation'), prey: { ...token('prey', { x: 150, y: 100 }), size: 2 } };
    const spots = seenSpots(computeSight(sightSources(tokens, scale, bounds, rules), [wall]), dark, [], tokens, 70, [wall], { conditions });
    const prey = spots.find((spot) => spot.x === 150)!;
    expect(prey.polygon.every((point) => point.x <= 160.001 || point.y >= 220 || point.y <= 0)).toBe(true);
  });

  it('are not shown for a token that is only sensed, even where a precise creature sense is about', () => {
    const viewer = token('viewer', VIEWER, { vision: { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 20 }, { id: 'tremorsense', range: 100 }] } });
    const tokens = { viewer, sensed: token('sensed', { x: 100, y: 160 }) };
    const sight = computeSight(sightSources(tokens, scale, bounds, rules), [wall]);
    expect(perceive({ x: 100, y: 160 }, sight, 'dark')).toBe('sensed');
    const spots = seenSpots(sight, dark, [], tokens, scale.cellSize, [wall], { conditions });
    expect(spots.map(({ x, y }) => ({ x, y }))).toEqual([VIEWER]);
  });
});

describe('a sense that walls do not stop', () => {
  // Stored data may say it shows the map; sight never draws or records it.
  const xray = { ...findSense(ALL_SENSES, 'blindsight')!, id: 'xray', lineOfSight: false };
  const viewer = token('viewer', VIEWER, { vision: { enabled: true, senses: [{ id: 'xray', range: 100 }] } });
  const sight = computeSight(sightSources({ viewer }, scale, bounds, { definitions: [xray], conditions }), [wall]);

  it('has a disc for a region, never an area of the map', () => {
    const region = sight.regions.find((candidate) => candidate.sense.id === 'xray')!;
    expect(region.polygon).toBeNull();
    expect(perceive(BEHIND, sight, 'dark')).toBe('seen');
  });

  it('shows no map: no explored memory, and a token it sees behind a wall only within its footprint', () => {
    expect(exploredShapes(sight, dark, [])).toBeNull();
    const tokens = { viewer, lurker: token('lurker', BEHIND) };
    const spots = seenSpots(sight, dark, [], tokens, scale.cellSize, [wall], { conditions });
    expect(spots.map(({ x, y }) => ({ x, y }))).toEqual([VIEWER, BEHIND]);
  });
});

describe('in a source of magical darkness', () => {
  /** A Darkness around the creature 40 units from the viewer; the viewer stands outside it. */
  const darkness = lightReach(NEAR, 30, [wall], 0, { darkness: true });
  const day = { ambient: 1 };
  const perceived = (id: string | null, at = NEAR): Perception => {
    const sight = computeSight(sightSources({ viewer: viewerWith(id) }, scale, bounds, rules), [wall]);
    return perceive(at, sight, () => lightLevelAt(at, day, [darkness]));
  };

  it('hides a creature from normal sight and from darkvision that does not see in magical darkness, in daylight too', () => {
    expect(lightLevelAt(NEAR, day, [darkness])).toBe('magical-dark');
    expect(perceived(null)).toBe('unseen');
    expect(perceived('dnd5e-darkvision')).toBe('unseen');
    expect(perceived('darkvision')).toBe('unseen');
    expect(perceived('ose-infravision')).toBe('unseen');
    // Beside the darkness the day shows everything.
    expect(perceived(null, { x: NEAR.x, y: NEAR.y + 40 })).toBe('seen');
  });

  it('shows it to the senses that see in magical darkness, and senses it through those that need no sight', () => {
    for (const id of ['dnd5e-truesight', 'dnd5e-devils-sight', 'dnd5e-blindsight', 'pathfinder2e-darkvision', 'pathfinder2e-greater-darkvision', 'truesight', 'blindsight']) {
      expect([id, perceived(id)]).toEqual([id, 'seen']);
    }
    expect(perceived('dnd5e-tremorsense')).toBe('sensed');
  });

  it('still shows a party token inside it within its footprint, and no other token', () => {
    const tokens = { viewer: viewerWith(null), friend: token('friend', NEAR, { vision: { enabled: true } }), foe: token('foe', { x: NEAR.x, y: NEAR.y + 10 }) };
    const sight = computeSight(sightSources(tokens, scale, bounds, rules), [wall]);
    const spots = seenSpots(sight, day, [darkness], tokens, 70, [wall], { conditions });
    expect(spots.map((spot) => [spot.x, spot.y])).toEqual([[NEAR.x, NEAR.y]]);
  });
});
