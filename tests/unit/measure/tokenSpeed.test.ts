import { describe, expect, it } from 'vitest';
import { chosenSpeed, ownSpeed, speedChoices, statblockSpeeds, tokenSpeed, type SpeedUnit } from '../../../src/app/creatures/statblockSpeeds';
import type { GameUnit } from '../../../src/app/grid/statedDistance';
import { sceneFromFile, sceneToFile, tokenFromFile, tokenToFile } from '../../../src/app/resources/resourceFileFormat';
import { meaningsOf } from '../../../src/app/statblocks/resolve/fieldMeanings';
import { BUILT_IN_TEMPLATES } from '../../../src/app/statblocks/presets';

const FEET: GameUnit = { unitType: 'feet', ruleDistance: 5 };
const METRES: GameUnit = { unitType: 'meters', ruleDistance: 1.5 };
const SQUARES: GameUnit = { unitType: 'units', ruleDistance: 1 };
const YARDS: GameUnit = { unitType: 'yards', ruleDistance: 1 };
/** A game of range bands on 5-foot squares. */
const BANDS: SpeedUnit = {
  ...FEET, mode: 'abstract',
  rangeBands: [{ name: 'Close', maxSquares: 1 }, { name: 'Near', maxSquares: 6 }, { name: 'Double Near', maxSquares: 12 }, { name: 'Far', maxSquares: 13 }],
};

const speedsOf = (speed: unknown, unit = FEET): Array<[string | null, number]> => statblockSpeeds({ speed }, undefined, unit).map((stated) => [stated.name, stated.speed]);

describe('statblockSpeeds', () => {
  it('reads every speed of a line with its name, the one without a name first', () => {
    expect(speedsOf('30 ft., fly 60 ft., swim 30 ft.')).toEqual([[null, 30], ['fly', 60], ['swim', 30]]);
    expect(speedsOf('40 ft., burrow 20 ft., climb 30 ft.')).toEqual([[null, 40], ['burrow', 20], ['climb', 30]]);
    expect(speedsOf('fly 60 ft. (hover), swim 30 ft.')).toEqual([['fly', 60], ['swim', 30]]);
    expect(speedsOf('Speed 25 feet; fly 40 feet')).toEqual([[null, 25], ['fly', 40]]);
    expect(speedsOf("120' (40')")).toEqual([[null, 120], [null, 40]]);
    expect(speedsOf('0 ft., fly 30 ft.')).toEqual([['fly', 30]]);
  });

  it('converts a written distance to what the collection measures in, and takes a bare number as it stands', () => {
    expect(speedsOf('30 ft.', METRES)).toEqual([[null, 9]]);
    expect(speedsOf('9 m', FEET)).toEqual([[null, 30]]);
    expect(speedsOf('6 squares', FEET)).toEqual([[null, 30]]);
    expect(speedsOf('30 ft.', SQUARES)).toEqual([[null, 6]]);
    expect(speedsOf('5', SQUARES)).toEqual([[null, 5]]);
    expect(speedsOf('5 (fly)', SQUARES)).toEqual([[null, 5]]);
    expect(speedsOf(30, METRES)).toEqual([[null, 30]]);
  });

  it('reads a list, named entries and speeds kept by name', () => {
    expect(speedsOf(['30 ft.', 'fly 60 ft.'])).toEqual([[null, 30], ['fly', 60]]);
    expect(speedsOf([{ name: 'walk', desc: '30 ft.' }, { name: 'swim', desc: 20 }])).toEqual([['walk', 30], ['swim', 20]]);
    expect(speedsOf({ walk: 30, fly: '60 ft.', hover: true })).toEqual([['walk', 30], ['fly', 60]]);
  });

  it('states none where the value holds no distance', () => {
    for (const speed of [undefined, null, '', '  ', 'fast', 0, -30, NaN, Infinity, true, [], {}, [null, 7, {}]]) expect(speedsOf(speed), String(speed)).toEqual([]);
    expect(speedsOf('+7, climb')).toEqual([]);
  });

  it('reads no more than eight speeds of a line', () => {
    expect(speedsOf(Array.from({ length: 30 }, (_, i) => `${i + 1} ft.`).join(', '))).toHaveLength(8);
  });

  it('reads the field a template means as the speed before `speed`, and `speed` where that field is empty', () => {
    const meanings = meaningsOf([{ key: 'movement', label: 'Movement', type: 'text', meaning: 'speed' }]);
    expect(statblockSpeeds({ movement: "90' (30')", speed: '10 ft.' }, meanings, FEET)[0]).toEqual({ name: null, speed: 90 });
    expect(statblockSpeeds({ movement: '', speed: '10 ft.' }, meanings, FEET)[0]).toEqual({ name: null, speed: 10 });
    expect(statblockSpeeds({ speed: '10 ft.' }, meanings, FEET)[0]).toEqual({ name: null, speed: 10 });
    expect(statblockSpeeds({ move: 8 }, meanings, FEET)).toEqual([]);
  });

  it('is told by every built-in template that has a speed which field holds it', () => {
    const speedFields = Object.fromEntries(BUILT_IN_TEMPLATES.flatMap(({ id, template }) => {
      const key = meaningsOf(template.fields).speed;
      return key === undefined ? [] : [[id, key]];
    }));
    expect(speedFields).toEqual({
      'builtin:generic-creature': 'speed',
      'builtin:generic-npc': 'speed',
      'builtin:5e-2014-monster': 'speed',
      'builtin:5e-2024-monster': 'speed',
      'builtin:d20-creature': 'speed',
      'builtin:bx-creature': 'movement',
      'builtin:draw-steel-monster': 'speed',
      'builtin:percentile-creature': 'move',
    });
  });
});

describe('the speed a statblock of each built-in template states', () => {
  /** The first speed of a statblock written for the template `id`, whose speed field holds `value`. */
  const stated = (id: string, value: unknown, unit: SpeedUnit): number | undefined => {
    const { fields } = BUILT_IN_TEMPLATES.find((entry) => entry.id === id)!.template;
    const meanings = meaningsOf(fields);
    return chosenSpeed(statblockSpeeds({ [meanings.speed!]: value }, meanings, unit), undefined)?.speed;
  };
  const SHAPES: Array<[template: string, value: unknown, unit: SpeedUnit, speed: number]> = [
    // The base rate stands first; the encounter rate in brackets is a step of it.
    ['builtin:bx-creature', "120' (40')", FEET, 120],
    ['builtin:bx-creature', "90' (30') / 180' (60') flying", FEET, 90],
    ['builtin:bx-creature', 'near', BANDS, 30],
    ['builtin:bx-creature', 'double near (fly)', BANDS, 60],
    ['builtin:percentile-creature', 8, YARDS, 8],
    ['builtin:percentile-creature', '8', YARDS, 8],
    ['builtin:draw-steel-monster', 5, SQUARES, 5],
    ['builtin:draw-steel-monster', '5 (fly)', SQUARES, 5],
    ['builtin:d20-creature', '25 feet, fly 40 feet', FEET, 25],
    ['builtin:5e-2014-monster', '30 ft., climb 30 ft.', FEET, 30],
    ['builtin:5e-2024-monster', '30 ft., Fly 60 ft.', FEET, 30],
    ['builtin:generic-npc', 6, { unitType: 'meters', ruleDistance: 2 }, 6],
  ];

  for (const [template, value, unit, speed] of SHAPES) {
    it(`${template}: ${JSON.stringify(value)} is ${speed}`, () => {
      expect(stated(template, value, unit)).toBe(speed);
    });
  }
});

describe('a speed written as a range band', () => {
  const speeds = (speed: unknown, unit: SpeedUnit = BANDS): Array<[string | null, number]> => statblockSpeeds({ speed }, undefined, unit).map((stated) => [stated.name, stated.speed]);

  it('is as far as the band reaches, the longer name where one holds another', () => {
    expect(speeds('near')).toEqual([[null, 30]]);
    expect(speeds('Double Near')).toEqual([[null, 60]]);
    expect(speeds('MV close')).toEqual([[null, 5]]);
    expect(speeds('near (climb), double near (fly)')).toEqual([[null, 30], [null, 60]]);
    expect(speeds('fly far')).toEqual([['fly', 65]]);
  });

  it('is read only where the collection measures in bands, and only as a whole word', () => {
    expect(speeds('near', FEET)).toEqual([]);
    expect(speeds('nearly none')).toEqual([]);
    expect(speeds('none')).toEqual([]);
    expect(speeds('near', { ...BANDS, rangeBands: [] })).toEqual([]);
    expect(speeds('near', { ...BANDS, rangeBands: [{ name: ' ', maxSquares: 3 }] })).toEqual([]);
  });

  it('gives way to a distance the statblock states', () => {
    expect(speeds('30 ft. (near)')).toEqual([[null, 30]]);
    expect(speeds(60)).toEqual([[null, 60]]);
  });
});

describe('tokenSpeed', () => {
  const goblin = { fields: { speed: '30 ft., climb 20 ft.' } };

  it('is the token\'s own speed where the GM set one, else its statblock\'s first', () => {
    expect(tokenSpeed({ speed: 45, statblockPath: 'Goblin.md' }, goblin, FEET)).toBe(45);
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, goblin, FEET)).toBe(30);
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, goblin, METRES)).toBe(9);
  });

  it('is none for a token without either, and while its statblock is unread', () => {
    expect(tokenSpeed({}, undefined, FEET)).toBeNull();
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, undefined, FEET)).toBeNull();
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, null, FEET)).toBeNull();
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, { fields: { speed: 'slow' } }, FEET)).toBeNull();
    // A statblock record handed over for a token that links none says nothing about it.
    expect(tokenSpeed({}, goblin, FEET)).toBeNull();
  });

  it('is the speed the rules give a creature that states none, for a token without a statblock or whose statblock says nothing of its speed', () => {
    expect(tokenSpeed({}, undefined, FEET, 30)).toBe(30);
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, { fields: {} }, FEET, 30)).toBe(30);
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, { fields: { speed: '  ' } }, FEET, 30)).toBe(30);
    // The link leads to a note without a statblock.
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, null, FEET, 30)).toBe(30);
    // A template whose speed field is empty, in a statblock without `speed`.
    const meanings = meaningsOf([{ key: 'movement', label: 'Movement', type: 'text', meaning: 'speed' }]);
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, { fields: { movement: '' }, meanings }, FEET, 30)).toBe(30);
  });

  it('never stands in for a speed the token or its statblock states, one that is none included', () => {
    expect(tokenSpeed({ speed: 45 }, undefined, FEET, 30)).toBe(45);
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, goblin, FEET, 40)).toBe(30);
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, { fields: { speed: '0 ft.' } }, FEET, 30)).toBeNull();
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, { fields: { speed: 'none' } }, BANDS, 30)).toBeNull();
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, { fields: { speed: 0 } }, FEET, 30)).toBeNull();
    // While the statblock is unread, what it states is not known yet.
    expect(tokenSpeed({ statblockPath: 'Goblin.md' }, undefined, FEET, 30)).toBeNull();
  });

  it('takes a rules\' speed that is none as none', () => {
    for (const none of [undefined, 0, -5, NaN, Infinity]) expect(tokenSpeed({}, undefined, FEET, none), String(none)).toBeNull();
  });

  it('reads a speed of its own only where it is a number above 0', () => {
    for (const speed of [0, -5, NaN, Infinity, '30', null, undefined, {}]) {
      expect(ownSpeed({ speed }), String(speed)).toBeUndefined();
      expect(tokenSpeed({ speed, statblockPath: 'Goblin.md' }, goblin, FEET)).toBe(30);
    }
    expect(ownSpeed({ speed: 7.5 })).toBe(7.5);
  });
});

describe('the speed a token picked of those its statblock states', () => {
  const dragon = { fields: { speed: '40 ft., climb 40 ft., Fly 80 ft., swim 40 ft.' } };
  const linked = (speedKind?: unknown): { statblockPath: string; speedKind?: unknown } => ({ statblockPath: 'Dragon.md', ...(speedKind !== undefined && { speedKind }) });

  it('moves the token by the speed of that name, whatever its case', () => {
    expect(tokenSpeed(linked(), dragon, FEET)).toBe(40);
    expect(tokenSpeed(linked('Fly'), dragon, FEET)).toBe(80);
    expect(tokenSpeed(linked(' fly '), dragon, FEET)).toBe(80);
    expect(tokenSpeed(linked('fly'), dragon, METRES)).toBe(24);
  });

  it('falls back to the first for a pick the statblock does not state, and for one that is no name', () => {
    for (const kind of ['burrow', '', '  ', 3, null, {}, ['fly']]) expect(tokenSpeed(linked(kind), dragon, FEET), String(kind)).toBe(40);
  });

  it('gives way to a speed of the token\'s own', () => {
    expect(tokenSpeed({ ...linked('fly'), speed: 15 }, dragon, FEET)).toBe(15);
  });

  it('offers the first speed and every later one with a name of its own', () => {
    const names = (speed: unknown): Array<string | null> => speedChoices(statblockSpeeds({ speed }, undefined, FEET)).map((stated) => stated.name);
    expect(names('40 ft., climb 40 ft., fly 80 ft.')).toEqual([null, 'climb', 'fly']);
    expect(names('fly 60 ft., swim 30 ft.')).toEqual(['fly', 'swim']);
    // A later speed without a name, or named like one before it, cannot be picked by name.
    expect(names("120' (40')")).toEqual([null]);
    expect(names('30 ft., fly 60 ft., Fly 90 ft. (hover)')).toEqual([null, 'fly']);
    expect(names({ walk: 30, fly: 60 })).toEqual(['walk', 'fly']);
    expect(names('slow')).toEqual([]);
  });

  it('picks among the choices alone: a named first speed is found by its name too', () => {
    const speeds = statblockSpeeds({ speed: 'fly 60 ft., swim 30 ft.' }, undefined, FEET);
    expect(chosenSpeed(speeds, 'fly')?.speed).toBe(60);
    expect(chosenSpeed(speeds, 'swim')?.speed).toBe(30);
    expect(chosenSpeed(speeds, undefined)?.speed).toBe(60);
    expect(chosenSpeed([], 'fly')).toBeUndefined();
  });

  it('goes through a scene file with the token and is left out once cleared', () => {
    const token = { id: 't', kind: 'character', name: 'Wyrm', x: 1, y: 2, imagePath: 'w.png', statblockPath: 'Dragon.md', speedKind: 'fly' };
    expect(tokenToFile(token)).toMatchObject({ speedKind: 'fly' });
    expect(tokenFromFile(JSON.parse(JSON.stringify(tokenToFile(token))) as Record<string, unknown>)).toEqual(token);
    const scene = { objects: { tokens: { t: token } }, tokenSettings: { hiddenResources: [] }, initiative: { entries: [] } };
    expect(sceneFromFile(JSON.parse(JSON.stringify(sceneToFile(scene))) as typeof scene).objects.tokens.t).toEqual(token);
    const cleared = JSON.parse(JSON.stringify(tokenToFile({ ...token, speedKind: undefined }))) as Record<string, unknown>;
    expect(cleared).not.toHaveProperty('speedKind');
  });
});

describe('a token\'s speed in a scene file', () => {
  const token = { id: 't', kind: 'character', name: 'Mirabel', x: 10, y: 20, imagePath: 'm.png', speed: 30, resources: { hp: { current: 4, max: 9 } } };

  it('is written as the token holds it, beside the fields every Atlas reads, and read back the same', () => {
    const file = tokenToFile(token) as Record<string, unknown>;
    expect(file).toMatchObject({ speed: 30, hp: { current: 4, max: 9 } });
    expect(tokenFromFile(file)).toEqual(token);
    const plain = { id: 'p', kind: 'token', x: 0, y: 0, imagePath: 'p.png', speed: 12.5 };
    expect(tokenFromFile(tokenToFile(plain))).toEqual(plain);
  });

  it('goes through a scene\'s file and back with its tokens', () => {
    const scene = { objects: { tokens: { t: token } }, tokenSettings: { hiddenResources: [] }, initiative: { entries: [] } };
    const read = sceneFromFile(JSON.parse(JSON.stringify(sceneToFile(scene))) as typeof scene);
    expect(read.objects.tokens.t).toEqual(token);
  });

  it('leaves a file without one as it is, and a cleared speed out of the file', () => {
    const { speed: _speed, ...slow } = token;
    expect(tokenToFile(slow)).not.toHaveProperty('speed');
    const cleared = JSON.parse(JSON.stringify(tokenToFile({ ...token, speed: undefined }))) as Record<string, unknown>;
    expect(cleared).not.toHaveProperty('speed');
    expect(tokenFromFile(cleared)).toEqual(slow);
  });
});
