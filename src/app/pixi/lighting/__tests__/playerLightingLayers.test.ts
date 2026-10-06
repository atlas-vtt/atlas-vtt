import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { PerceptionMemo, playerDoorSight, playerLightingLayers, playerTokenSight, tokenPerception, type GmOverlays } from '../playerLightingLayers';
import { hiddenTokenLayers } from '../../playerSafeFrame';
import { computeSight, lightReach, sightSources, type LightReach } from '../../../vision/sight';
import type { Perception } from '../../../vision/perception';
import { tremorsense } from '../../../vision/__tests__/senseSources';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import type { TokenEntity } from '../../../types';
import { fogCoverage } from '../../../fog/fogCoverage';
import { fogRectangle } from '../../../../../tests/helpers/fogOperations';

describe('playerLightingLayers', () => {
  function overlays(): GmOverlays {
    return { wallEditor: new Container(), lightZones: new Container(), exploredMemory: new Container(), doorBadges: new Container(), lightMarkers: new Container(), rangeRings: new Container(), sightAids: new Container() };
  }

  it('switches the lighting to the player view and hides every GM overlay, light markers, range rings and sight aids included', () => {
    const modeLayer = { visible: false };
    const gm = overlays();
    expect(playerLightingLayers({ enabled: true, modeLayer, gmOverlays: gm })).toEqual([
      { layer: modeLayer, visible: true },
      { layer: gm.wallEditor, visible: false },
      { layer: gm.lightZones, visible: false },
      { layer: gm.exploredMemory, visible: false },
      { layer: gm.doorBadges, visible: false },
      { layer: gm.lightMarkers, visible: false },
      { layer: gm.rangeRings, visible: false },
      { layer: gm.sightAids, visible: false },
    ]);
  });

  it('shows the outlines of sensed tokens in the players\' view of a lit scene, and nowhere else', () => {
    const modeLayer = { visible: false };
    const sensedOutlines = new Container();
    const gm = overlays();
    expect(playerLightingLayers({ enabled: true, modeLayer, gmOverlays: gm, sensedOutlines }).slice(0, 2)).toEqual([
      { layer: modeLayer, visible: true },
      { layer: sensedOutlines, visible: true },
    ]);
    expect(playerLightingLayers({ enabled: false, modeLayer, gmOverlays: gm, sensedOutlines })[0]).toEqual({ layer: sensedOutlines, visible: false });
  });

  it('shows the players\' own door badges in their view of a lit scene, in place of the GM\'s, and none on an unlit one', () => {
    const modeLayer = { visible: false };
    const playerDoorBadges = new Container();
    const gm = overlays();
    const lit = playerLightingLayers({ enabled: true, modeLayer, gmOverlays: gm, playerDoorBadges });
    expect(lit).toContainEqual({ layer: playerDoorBadges, visible: true });
    expect(lit).toContainEqual({ layer: gm.doorBadges, visible: false });
    expect(playerLightingLayers({ enabled: false, modeLayer, gmOverlays: gm, playerDoorBadges })[0]).toEqual({ layer: playerDoorBadges, visible: false });
  });

  it('still hides the GM overlays while the scene has no lighting', () => {
    const gm = overlays();
    expect(playerLightingLayers({ enabled: false, modeLayer: { visible: false }, gmOverlays: gm })).toEqual([
      { layer: gm.wallEditor, visible: false },
      { layer: gm.lightZones, visible: false },
      { layer: gm.exploredMemory, visible: false },
      { layer: gm.doorBadges, visible: false },
      { layer: gm.lightMarkers, visible: false },
      { layer: gm.rangeRings, visible: false },
      { layer: gm.sightAids, visible: false },
    ]);
  });
});

const wall = { id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };
const conditions: ConditionDefinition[] = [
  { id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' },
  { id: 'unseen', name: 'Invisible', color: '#000000', effect: 'invisible' },
  { id: 'flying', name: 'Flying', color: '#000000', effect: 'airborne' },
  { id: 'gone', name: 'Undetected', color: '#000000', effect: 'undetected' },
  { id: 'prone', name: 'Prone', color: '#000000' },
];

describe('playerDoorSight', () => {
  const door = { ...wall, id: 'door', type: 'door' as const, closed: true };
  const view = (enabled: boolean): Parameters<typeof playerDoorSight>[0] => ({
    isEnabled: () => enabled,
    currentSight: () => computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], [door]),
    ambientLight: () => ({ ambient: 1 }),
    lightReaches: () => [],
  });

  it('is the doors the players\' sight and the scene\'s light show, and none while the scene is unlit', () => {
    expect([...playerDoorSight(view(true), { door })]).toEqual(['door']);
    expect([...playerDoorSight(view(false), { door })]).toEqual([]);
  });
});

describe('door fog eligibility', () => {
  const door = { ...wall, id: 'door', type: 'door' as const, closed: true };
  const view: Parameters<typeof playerDoorSight>[0] = {
    isEnabled: () => true,
    currentSight: () => ({ all: true, regions: [] }),
    ambientLight: () => ({ ambient: 1 }),
    lightReaches: () => [],
  };

  it('tests the midpoint, including its boundary, rather than either endpoint', () => {
    const middle = fogCoverage({ paint: fogRectangle({ x: 200, y: 190, width: 10, height: 20 }) });
    expect(middle.covers(door.p1)).toBe(false);
    expect(middle.covers(door.p2)).toBe(false);
    expect([...playerDoorSight(view, { door }, middle)]).toEqual([]);
    const endpoint = fogCoverage({ paint: fogRectangle({ x: 190, y: -10, width: 20, height: 20 }) });
    expect([...playerDoorSight(view, { door }, endpoint)]).toEqual(['door']);
  });

  it('restores an erased midpoint without exposing secret or out-of-sight doors', () => {
    const fog = fogCoverage({
      paint: fogRectangle({ x: 100, y: 100, width: 200, height: 200 }),
      erase: fogRectangle({ id: 'erase', timestamp: 2, isErasing: true, x: 190, y: 190, width: 20, height: 20 }),
    });
    const secret = { ...door, id: 'secret', type: 'secret-door' as const };
    expect([...playerDoorSight(view, { door, secret }, fog)]).toEqual(['door']);
    expect([...playerDoorSight({ ...view, currentSight: () => ({ all: false, regions: [] }) }, { door }, fog)]).toEqual([]);
    expect([...playerDoorSight({ ...view, isEnabled: () => false }, { door }, fog)]).toEqual([]);
  });

  it('fails closed for invalid coverage and retains existing behavior when no provider is supplied', () => {
    expect([...playerDoorSight(view, { door }, null)]).toEqual([]);
    expect([...playerDoorSight(view, { door })]).toEqual(['door']);
    expect([...playerDoorSight(view, { door }, fogCoverage({}))]).toEqual(['door']);
  });
});

describe('tokenPerception', () => {
  const tokens: Record<string, TokenEntity> = {
    hero: { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true } },
    lurker: { id: 'lurker', kind: 'token', imagePath: 'l.png', x: 400, y: 100 },
  };
  const sight = computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], [wall]);

  it('hides tokens out of sight, even in daylight', () => {
    const perception = tokenPerception(sight, { ambient: 1 }, [], tokens);
    expect(perception('hero')).toBe('seen');
    expect(perception('lurker')).toBe('unseen');
  });

  it('always shows the tokens that see, even in the dark', () => {
    expect(tokenPerception(sight, { ambient: 0 }, [], tokens)('hero')).toBe('seen');
  });

  it('hides tokens in sight while the ambient light is below the scene\'s threshold', () => {
    const inSight = { ...tokens, guard: { id: 'guard', kind: 'token' as const, imagePath: 'g.png', x: 150, y: 150 } };
    expect(tokenPerception(sight, { ambient: 0.5 }, [], inSight)('guard')).toBe('seen');
    expect(tokenPerception(sight, { ambient: 0.5, litThreshold: 0.75 }, [], inSight)('guard')).toBe('unseen');
  });

  it('shows tokens at dusk and hides them at night, as before light levels', () => {
    const inSight = { ...tokens, guard: { id: 'guard', kind: 'token' as const, imagePath: 'g.png', x: 150, y: 150 } };
    expect(tokenPerception(sight, { ambient: 0.5 }, [], inSight)('guard')).toBe('seen');
    expect(tokenPerception(sight, { ambient: 0.15 }, [], inSight)('guard')).toBe('unseen');
  });

  it('shows a vision token the pointer has moved only in the line of sight that stayed behind, lit or not', () => {
    const held = { hero: { x: 100, y: 100 } };
    const moved = (x: number): Record<string, TokenEntity> => ({ ...tokens, hero: { ...tokens.hero!, x } });
    expect(tokenPerception(sight, { ambient: 0 }, [], tokens, { held })('hero')).toBe('seen');
    expect(tokenPerception(sight, { ambient: 0 }, [], moved(150), { held })('hero')).toBe('seen');
    expect(tokenPerception(sight, { ambient: 1 }, [], moved(400), { held })('hero')).toBe('unseen');
    expect(tokenPerception(sight, { ambient: 1 }, [], moved(400))('hero')).toBe('seen');
  });

  it('treats unknown tokens as unseen', () => {
    expect(tokenPerception(sight, { ambient: 1 }, [], tokens)('missing')).toBe('unseen');
  });

  it('reads each token from the record it is given, wherever the store has it', () => {
    const moved = { ...tokens, lurker: { ...tokens.lurker!, x: 150 } };
    expect(tokenPerception(sight, { ambient: 1 }, [], moved)('lurker')).toBe('seen');
  });
});

describe('tokenPerception with conditions', () => {
  const near = { x: 150, y: 100 };
  const behind = { x: 300, y: 100 };
  const at = (id: string, point: { x: number; y: number }, extra: { conditions?: string[]; vision?: TokenEntity['vision'] } = {}): TokenEntity =>
    ({ id, kind: 'token', imagePath: `${id}.png`, ...point, ...(extra.conditions && { conditions: extra.conditions }), ...(extra.vision && { vision: extra.vision }) });
  const tokens: Record<string, TokenEntity> = {
    hero: at('hero', { x: 100, y: 100 }, { vision: { enabled: true, tremorsense: 60 } }),
    invisible: at('invisible', near, { conditions: ['unseen'] }),
    flying: at('flying', behind, { conditions: ['flying'] }),
    undetected: at('undetected', near, { conditions: ['gone'] }),
    prone: at('prone', near, { conditions: ['prone', 'no-such-condition'] }),
    ally: at('ally', behind, { vision: { enabled: true }, conditions: ['unseen', 'blind', 'gone'] }),
    off: at('off', behind, { vision: { enabled: false }, conditions: ['gone'] }),
  };
  const scale = { unitDistance: 5, cellSize: 5 };
  // Tremorsense 60 units is 60 px here; the token behind the wall at x = 300 is 200 px away.
  const sight = computeSight(sightSources({ hero: { ...tokens.hero!, vision: { enabled: true, tremorsense: 250 } } }, scale, { width: 1000, height: 1000 }), [wall]);
  const perceived = (id: string, ambient = 1): string => tokenPerception(sight, { ambient }, [], tokens, { conditions })(id);

  it('shows an invisible token only to senses that perceive invisible things: here it is sensed, not seen', () => {
    expect(perceived('invisible')).toBe('sensed');
    expect(tokenPerception(computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], [wall]), { ambient: 1 }, [], tokens, { conditions })('invisible')).toBe('unseen');
  });

  it('does not sense a flying token by tremorsense', () => {
    expect(perceived('flying')).toBe('unseen');
    expect(tokenPerception(sight, { ambient: 1 }, [], { ...tokens, flying: at('flying', behind) }, { conditions })('flying')).toBe('sensed');
  });

  it('never shows an undetected token', () => {
    expect(perceived('undetected')).toBe('unseen');
    expect(perceived('off')).toBe('unseen');
  });

  it('ignores conditions that do nothing to sight, and ones the collection does not define', () => {
    expect(perceived('prone')).toBe('seen');
    expect(perceived('prone', 0)).toBe('sensed');
  });

  it('always shows a token with vision: invisible, blinded, undetected, behind a wall and in the dark', () => {
    expect(perceived('ally', 0)).toBe('seen');
  });

  it('shows every lit token, invisible and undetected ones too, while no token has vision or the scene has token vision off', () => {
    const everything = computeSight([], [wall]);
    const perception = tokenPerception(everything, { ambient: 1 }, [], tokens, { conditions });
    expect(['invisible', 'undetected', 'flying', 'prone'].map(perception)).toEqual(['seen', 'seen', 'seen', 'seen']);
    expect(tokenPerception(everything, { ambient: 0 }, [], tokens, { conditions })('invisible')).toBe('unseen');
  });

  it('reads no conditions without the collection\'s definitions', () => {
    expect(tokenPerception(sight, { ambient: 1 }, [], tokens)('undetected')).toBe('seen');
  });
});

describe('PerceptionMemo', () => {
  const tokens: Record<string, TokenEntity> = {
    hero: { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true } },
    guard: { id: 'guard', kind: 'token', imagePath: 'g.png', x: 150, y: 150 },
    lurker: { id: 'lurker', kind: 'token', imagePath: 'l.png', x: 400, y: 100 },
  };
  const sight = computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], [wall]);
  const day = { ambient: 1 };
  const NO_LIGHTS: never[] = [];
  const night = { ambient: 0 };
  /** A torch over the guard that counts how often the light at a token is worked out: once per perception that is not remembered. */
  const counting = (): { lights: LightReach[]; reads: () => number } => {
    let reads = 0;
    const torch = lightReach({ x: 150, y: 150 }, 400, []);
    return { lights: [{ ...torch, get dim(): number { reads++; return 400; } }], reads: () => reads };
  };

  it('works a token out once for all who ask in a frame, and once for all frames while nothing changes', () => {
    const memo = new PerceptionMemo();
    const { lights, reads } = counting();
    const options = { conditions };
    for (let frame = 0; frame < 5; frame++) {
      const perception = tokenPerception(sight, night, lights, tokens, options, memo);
      for (let consumer = 0; consumer < 3; consumer++) {
        expect(['hero', 'guard', 'lurker'].map(perception)).toEqual(['seen', 'seen', 'unseen']);
      }
    }
    // The hero is the party's and needs no light; the guard and the lurker are within the sight's range: once each.
    expect(reads()).toBe(2);
  });

  it('works out again only the token that changed', () => {
    const memo = new PerceptionMemo();
    const { lights, reads } = counting();
    tokenPerception(sight, night, lights, tokens, {}, memo)('guard');
    const moved = { ...tokens, lurker: { ...tokens.lurker!, x: 150 } };
    const perception = tokenPerception(sight, night, lights, moved, {}, memo);
    expect(perception('guard')).toBe('seen');
    expect(reads()).toBe(1);
    expect(perception('lurker')).toBe('seen');
    expect(reads()).toBe(2);
  });

  it('forgets everything when the sight, the light, the conditions or the held tokens change', () => {
    const memo = new PerceptionMemo();
    const inSight = { guard: tokens.guard! };
    const read = (...args: [Parameters<typeof tokenPerception>[0], Parameters<typeof tokenPerception>[1], Parameters<typeof tokenPerception>[2], Parameters<typeof tokenPerception>[4]?]): string =>
      tokenPerception(args[0], args[1], args[2], inSight, args[3], memo)('guard');
    const options = { conditions, held: {} };
    expect(read(sight, day, NO_LIGHTS, options)).toBe('seen');
    expect(read(sight, { ambient: 0 }, NO_LIGHTS, options)).toBe('unseen');
    expect(read(sight, day, NO_LIGHTS, options)).toBe('seen');
    expect(read(computeSight([{ tokenId: 'hero', origin: { x: 600, y: 100 }, range: 1000, senses: [] }], [wall]), day, NO_LIGHTS, options)).toBe('unseen');
    expect(read(sight, { ambient: 0 }, [lightReach({ x: 150, y: 150 }, 40, [])], options)).toBe('seen');
    const cloaked = { guard: { ...tokens.guard!, conditions: ['unseen'] } };
    expect(tokenPerception(sight, day, NO_LIGHTS, cloaked, options, memo)('guard')).toBe('unseen');
    expect(tokenPerception(sight, day, NO_LIGHTS, cloaked, { conditions: [], held: options.held }, memo)('guard')).toBe('seen');
  });

  it('answers as without a memo for every token and scene', () => {
    const memo = new PerceptionMemo();
    for (const ambient of [{ ambient: 0 }, { ambient: 0.5 }, day]) {
      for (const id of [...Object.keys(tokens), 'missing']) {
        expect(tokenPerception(sight, ambient, NO_LIGHTS, tokens, { conditions }, memo)(id)).toBe(tokenPerception(sight, ambient, NO_LIGHTS, tokens, { conditions })(id));
      }
    }
  });
});

describe('playerTokenSight', () => {
  const sight = computeSight([{ tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] }], [wall]);
  const lurker: TokenEntity = { id: 'lurker', kind: 'token', imagePath: 'l.png', x: 400, y: 100 };

  function lighting(enabled: boolean): Parameters<typeof playerTokenSight>[0] {
    return { isEnabled: () => enabled, currentSight: () => sight, ambientLight: () => ({ ambient: 1 }), lightReaches: () => [] };
  }

  it('hides nothing by sight while the scene has no lighting', () => {
    expect(playerTokenSight(lighting(false), { lurker })).toBeUndefined();
  });

  it('is how the scene\'s sight and light perceive each token', () => {
    expect(playerTokenSight(lighting(true), { lurker })?.('lurker')).toBe('unseen');
  });

  it('follows a token that moved into sight', () => {
    expect(playerTokenSight(lighting(true), { lurker: { ...lurker, x: 150 } })?.('lurker')).toBe('seen');
  });

  it('reads the conditions it is given', () => {
    const hidden = { lurker: { ...lurker, x: 150, conditions: ['unseen'] } };
    expect(playerTokenSight(lighting(true), hidden, { conditions })?.('lurker')).toBe('unseen');
  });
});

describe('tokenPerception with tremorsense', () => {
  const tokens: Record<string, TokenEntity> = {
    hero: { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, tremorsense: 30 } },
    near: { id: 'near', kind: 'token', imagePath: 'n.png', x: 300, y: 100 },
    far: { id: 'far', kind: 'token', imagePath: 'f.png', x: 600, y: 100 },
  };
  const hero = { tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] };
  const sight = computeSight([{ ...hero, senses: [tremorsense(300)] }], [wall]);

  it('senses tokens within range through walls, even in the dark', () => {
    expect(tokenPerception(sight, { ambient: 1 }, [], tokens)('near')).toBe('sensed');
    expect(tokenPerception(sight, { ambient: 0 }, [], tokens)('near')).toBe('sensed');
  });

  it('shows a vision token the pointer has moved out of sight while another vision token feels it', () => {
    const scout: TokenEntity = { id: 'scout', kind: 'token', imagePath: 's.png', x: 300, y: 100, vision: { enabled: true } };
    const held = { scout: { x: 100, y: 300 } };
    expect(tokenPerception(sight, { ambient: 0 }, [], { ...tokens, scout }, { held })('scout')).toBe('seen');
    expect(tokenPerception(sight, { ambient: 0 }, [], { ...tokens, scout: { ...scout, x: 600 } }, { held })('scout')).toBe('unseen');
  });

  it('does not sense tokens out of range', () => {
    expect(tokenPerception(sight, { ambient: 1 }, [], tokens)('far')).toBe('unseen');
  });

  it('leaves the sight polygon as it is', () => {
    expect(sight.regions[0]!.polygon).toEqual(computeSight([hero], [wall]).regions[0]!.polygon);
  });
});

describe('hiddenTokenLayers with a perception', () => {
  it('hides unseen tokens as well as hidden ones, and sensed ones, whose outline stands for them', () => {
    const [a, b, c, d] = [new Container(), new Container(), new Container(), new Container()];
    const perception = (id: string): Perception => (id === 'b' ? 'unseen' : id === 'd' ? 'sensed' : 'seen');
    const layers = hiddenTokenLayers({ a: { isHidden: true }, b: {}, c: {}, d: {} }, { a, b, c, d }, perception);
    expect(layers).toEqual([{ layer: a, visible: false }, { layer: b, visible: false }, { layer: d, visible: false }]);
  });
});
