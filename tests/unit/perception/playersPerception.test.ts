import { describe, expect, it } from 'vitest';
import { fogCoverage, type FogCoverage } from '../../../src/app/fog/fogCoverage';
import { resolveMeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { canvasSightSource } from '../../../src/app/perception/canvasSight';
import { framePerception, type PictureRoof } from '../../../src/app/perception/framePerception';
import { PlayersPerception, type PerceivedState, type SightSource } from '../../../src/app/perception/playersPerception';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import type { TokenEntity } from '../../../src/app/types';
import { SceneModelBuilder } from '../../../src/app/vision/sceneModel';
import { GENERIC_SIGHT_RULES } from '../../../src/app/vision/sightRules';
import { ownPolicy, PLAYER_SIGHT_POLICY } from '../../../src/app/vision/tokenSightPolicy';

/*
 * What one set of eyes may see of a floor (`PlayersPerception`): the tokens seen and sensed, the doors and the places
 * where the map shows, with committed fog, roofs, hidden tokens, tokens held for sight and a lighting that cannot
 * tell decided in the module. A bright floor with a wall down its middle and a closed door in it: Ana (sight, and
 * tremorsense through walls) and Bo (sight) west of it, a goblin and a rat east of it, a hidden ghost beside Ana.
 */

const MAP = { width: 1000, height: 600 };
const DOOR = { id: 'door', kind: 'wall', type: 'door', closed: true, p1: { x: 500, y: 250 }, p2: { x: 500, y: 350 } } as WallSegment;
const WALLS: Record<string, WallSegment> = {
  north: { id: 'north', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 250 } } as WallSegment,
  door: DOOR,
  south: { id: 'south', kind: 'wall', type: 'solid', p1: { x: 500, y: 350 }, p2: { x: 500, y: 600 } } as WallSegment,
};
const token = (id: string, x: number, y: number, more: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', imagePath: `${id}.png`, size: 1, x, y, ...more } as TokenEntity);
const TOKENS: Record<string, TokenEntity> = {
  ana: token('ana', 200, 300, { kind: 'character', vision: { enabled: true, senses: [{ id: 'tremorsense', range: 30 }] } }),
  bo: token('bo', 200, 500, { kind: 'character', vision: { enabled: true } }),
  ghost: token('ghost', 260, 300, { isHidden: true }),
  goblin: token('goblin', 560, 300),
  rat: token('rat', 800, 100),
};
const fogOver = (x: number, y: number): FogCoverage => fogCoverage({ fog: { id: 'fog', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: x - 40, y: y - 40, width: 80, height: 80 } as FogOperation });

/** The floor, whether its lighting's sight is its own, the committed fog (none: one without shape; null: one that cannot be read) and the roof drawn. */
interface Floor { state: PerceivedState; current: boolean; fog: FogCoverage | null; roof?: PictureRoof }

/** The floor as a canvas shows it: Atlas's scene model for its lighting, and the frame's committed fog and roof over that. */
function sourceOf(floor: Floor): SightSource {
  const builder = new SceneModelBuilder();
  const model = (): ReturnType<SceneModelBuilder['update']>['model'] => builder.update(floor.state as never, MAP, () => resolveMeasurementSettings(undefined, null), () => GENERIC_SIGHT_RULES).model;
  const tokens = (): Record<string, TokenEntity> => floor.state.objects.tokens;
  return canvasSightSource({
    lighting: () => ({ renderer: { isEnabled: () => floor.state.lighting.enabled, sightIsCurrent: () => floor.current, currentSight: () => model().sight, ambientLight: () => model().ambient, lightReaches: () => model().reaches } }),
    tokens: () => ({
      playerFramePerception: (lit) => framePerception(lit, { tokens: tokens(), place: () => undefined, fog: floor.fog, roof: floor.roof ?? null, policy: PLAYER_SIGHT_POLICY }),
      getTokenSprites: tokens,
    }),
  });
}

function floorOf(changes: Partial<PerceivedState> = {}, tokens: Record<string, Partial<TokenEntity>> = {}): Floor {
  const all = Object.fromEntries(Object.entries(TOKENS).map(([id, entry]) => [id, { ...entry, ...tokens[id] } as TokenEntity]));
  const state = { mapPath: 'Scenes/Hall.atlasmap', mapLoaded: true, isMapLoading: false, lighting: { enabled: true, ambient: 1 }, heldTokens: {}, objects: { tokens: all, walls: WALLS, fog: {}, pins: {}, texts: {}, drawings: {}, lights: {}, audios: {} }, ...changes } as PerceivedState;
  return { state, current: true, fog: fogCoverage({}) };
}

/** What `eyes` are told of `floor`: the tokens named, those sensed, the doors, and the places at Ana, the goblin and the rat. */
function told(floor: Floor, policy = PLAYER_SIGHT_POLICY): Record<string, unknown> {
  const eyes = new PlayersPerception(policy, { state: () => floor.state, rules: () => GENERIC_SIGHT_RULES });
  const source = sourceOf(floor);
  const { fog } = floor;
  const places = eyes.places(source, [TOKENS.ana!, TOKENS.goblin!, TOKENS.rat!], fog);
  return {
    named: [...eyes.shown(source, floor.state.mapPath!).keys()].sort(),
    sensed: eyes.sensed(source, floor.state.objects.tokens),
    doors: eyes.doors(source, WALLS, fog) && [...eyes.doors(source, WALLS, fog)!],
    places: places && { ana: places[0], goblin: places[1], rat: places[2] },
  };
}

describe('what one set of eyes may see of a floor', () => {
  it('sees the tokens its sight finds, senses those beyond a wall within its tremorsense, and never a hidden one', () => {
    expect(told(floorOf())).toEqual({ named: ['ana', 'bo'], sensed: ['goblin'], doors: ['door'], places: { ana: true, goblin: false, rat: false } });
    expect(told(floorOf({}, { ghost: { x: 560, y: 360 } }))).toMatchObject({ named: ['ana', 'bo'], sensed: ['goblin'] });
    expect(told(floorOf({ objects: { ...floorOf().state.objects, walls: { ...WALLS, door: { ...DOOR, closed: false } } } }))).toMatchObject({ named: ['ana', 'bo', 'goblin', 'rat'], doors: ['door'] });
  });

  it('tells nothing of a lit floor whose lighting cannot tell, and names no token', () => {
    const floor = floorOf();
    floor.current = false;
    expect(told(floor)).toEqual({ named: [], sensed: null, doors: null, places: null });
  });

  it('on an unlit floor names every token not hidden, senses none and sees no door, and shows the map wherever fog does not cover it', () => {
    const floor = floorOf({ lighting: { enabled: false, ambient: 1 } });
    expect(told(floor)).toEqual({ named: ['ana', 'bo', 'goblin', 'rat'], sensed: null, doors: null, places: { ana: true, goblin: true, rat: true } });
    floor.fog = fogOver(800, 100);
    expect(told(floor)).toMatchObject({ named: ['ana', 'bo', 'goblin'], places: { ana: true, goblin: true, rat: false } });
    floor.fog = null;
    expect(told(floor)).toMatchObject({ named: ['ana', 'bo'], places: { ana: false, goblin: false, rat: false } });
  });

  it('loses what committed fog covers, but never one of the party', () => {
    const floor = floorOf({}, { goblin: { x: 300, y: 400 } });
    floor.fog = fogOver(300, 400);
    expect(told(floor)).toMatchObject({ named: ['ana', 'bo'] });
    floor.fog = fogOver(200, 300);
    expect(told(floor)).toMatchObject({ named: ['ana', 'bo', 'goblin'], places: { ana: false } });
  });

  it('under a drawn roof loses the tokens whose centre it covers; under a roof it cannot read keeps only the party, and sees no door, place or sensed token', () => {
    const drawn = floorOf({}, { goblin: { x: 300, y: 400 } });
    drawn.roof = (point) => point.y > 350;
    expect(told(drawn)).toMatchObject({ named: ['ana'], doors: ['door'] });
    const unread = floorOf({}, { goblin: { x: 300, y: 400 } });
    unread.roof = 'unread';
    const roofed = new PlayersPerception(PLAYER_SIGHT_POLICY, { state: () => unread.state, rules: () => GENERIC_SIGHT_RULES });
    const source = { ...sourceOf(unread), roofed: () => true };
    expect([...roofed.shown(source, 'Scenes/Hall.atlasmap').keys()].sort()).toEqual(['ana', 'bo']);
    expect({ sensed: roofed.sensed(source, unread.state.objects.tokens), doors: [...roofed.doors(source, WALLS, unread.fog)!], places: roofed.places(source, [TOKENS.ana!], unread.fog) }).toEqual({ sensed: [], doors: [], places: [false] });
  });

  it('shows one of the party the pointer holds while sight waits for the drop only within the sight left behind', () => {
    const held = floorOf({ lighting: { enabled: true, ambient: 1, sightOnDrop: true }, heldTokens: { bo: { x: 200, y: 500 } } }, { bo: { x: 800, y: 500 } });
    expect(told(held)).toMatchObject({ named: ['ana'] });
    expect(told({ ...held, state: { ...held.state, heldTokens: {} } })).toMatchObject({ named: ['ana', 'bo', 'goblin', 'rat'] });
  });

  it('cuts one player\'s eyes from the party\'s sight: their own characters\' alone, which always see only themselves', () => {
    const floor = floorOf({}, { goblin: { x: 300, y: 100 } });
    const boOnly = ownPolicy((entry) => entry.id === 'bo', (entry) => entry.id === 'bo');
    expect(told(floor)).toMatchObject({ named: ['ana', 'bo', 'goblin'], sensed: [] });
    expect(told(floor, boOnly)).toMatchObject({ named: ['ana', 'bo', 'goblin'], sensed: [], doors: ['door'] });
    expect(told({ ...floor, state: { ...floor.state, objects: { ...floor.state.objects, walls: { ...WALLS, inner: { id: 'inner', kind: 'wall', type: 'solid', p1: { x: 0, y: 400 }, p2: { x: 500, y: 400 } } as WallSegment } } } }, boOnly)).toMatchObject({ named: ['bo'] });
  });
});
