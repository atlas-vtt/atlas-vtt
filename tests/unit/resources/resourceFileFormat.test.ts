import { describe, expect, it } from 'vitest';
import { sceneFromFile, sceneToFile, tokenFromFile, tokenSettingsFromFile, tokenSettingsToFile, tokenToFile } from '../../../src/app/resources/resourceFileFormat';

describe('tokenFromFile', () => {
  it('reads object HP and numeric stress as resources', () => {
    const token = { id: 't1', kind: 'character', hp: { current: 5, max: 12 }, stress: 2, maxStress: 6 };
    expect(tokenFromFile(token)).toEqual({ id: 't1', kind: 'character', resources: { hp: { current: 5, max: 12 }, stress: { current: 2, max: 6 } } });
  });

  it('keeps the old display maxima for bare numbers', () => {
    expect(tokenFromFile({ hp: 12, stress: 3 }).resources).toEqual({ hp: { current: 12, max: 100 }, stress: { current: 3, max: 10 } });
  });

  it('raises the display maximum to a bare number above it', () => {
    expect(tokenFromFile({ hp: 150, stress: 12 }).resources).toEqual({ hp: { current: 150, max: 150 }, stress: { current: 12, max: 12 } });
  });

  it('reads the DM screen\'s quantities under the keys the file has, and never over HP, Stress or Hope', () => {
    const token = tokenFromFile({
      stress: 2, maxStress: 6,
      statblockResources: { 'resources.Mana': { current: 3, max: 10 }, luck: { current: 2, max: 5 }, stress: { current: 0, max: 3 } },
    });
    expect(token.resources).toEqual({ stress: { current: 2, max: 6 }, 'resources.Mana': { current: 3, max: 10 }, luck: { current: 2, max: 5 } });
  });

  it('carries hope and the override flags, and drops the file\'s fields', () => {
    const token = tokenFromFile({ hope: { current: 2, max: 6 }, maxHpOverridden: true, maxStressOverridden: false, hp: { current: 9, max: 9 }, overriddenMax: ['str'] });
    expect(token.resources).toEqual({ hp: { current: 9, max: 9 }, hope: { current: 2, max: 6 } });
    expect(token.overriddenMax).toEqual(['hp', 'str']);
    expect(token).not.toHaveProperty('hp');
    expect(token).not.toHaveProperty('maxHpOverridden');
  });

  it('leaves a token without resources alone', () => {
    const token = { id: 't1', kind: 'token' };
    expect(tokenFromFile(token)).toBe(token);
  });

  it('lets the file\'s fields decide over a `resources` entry: an older Atlas wrote them last', () => {
    expect(tokenFromFile({ hp: { current: 3, max: 9 }, resources: { hp: { current: 7, max: 9 }, str: { current: 1, max: 4 } } }).resources)
      .toEqual({ hp: { current: 3, max: 9 }, str: { current: 1, max: 4 } });
  });
});

describe('tokenToFile', () => {
  const token = {
    id: 't1', kind: 'character', name: 'Root Goblin',
    resources: {
      hp: { current: 3, max: 8 }, stress: { current: 2, max: 6 }, hope: { current: 1, max: 6 },
      str: { current: 9, max: 10 }, 'resources.Mana': { current: 0, max: 4 },
    },
    overriddenMax: ['hp', 'str'],
  };

  it('writes the fields every Atlas reads', () => {
    expect(tokenToFile(token)).toEqual({
      id: 't1', kind: 'character', name: 'Root Goblin',
      hp: { current: 3, max: 8 },
      stress: { current: 2, max: 6 }, maxStress: 6,
      hope: { current: 1, max: 6 },
      statblockResources: { str: { current: 9, max: 10 }, 'resources.Mana': { current: 0, max: 4 } },
      maxHpOverridden: true,
      overriddenMax: ['str'],
    });
  });

  it('is undone by reading the file', () => {
    expect(tokenFromFile(tokenToFile(token))).toEqual(token);
    const stressed = { resources: { stress: { current: 0, max: 3 } }, overriddenMax: ['stress'] };
    expect(tokenFromFile(tokenToFile(stressed))).toEqual(stressed);
  });

  it('leaves a token without resources alone', () => {
    const plain = { id: 't2', kind: 'token' };
    expect(tokenToFile(plain)).toBe(plain);
  });

  it('shows an older Atlas what it changed there: its numbers come back', () => {
    const file = tokenToFile(token) as Record<string, unknown>;
    const edited = { ...file, hp: { current: 1, max: 8 }, maxHpOverridden: false, statblockResources: { str: { current: 4, max: 10 } } };
    expect(tokenFromFile(edited)).toMatchObject({
      resources: { hp: { current: 1, max: 8 }, stress: { current: 2, max: 6 }, str: { current: 4, max: 10 } },
      overriddenMax: ['str'],
    });
  });
});

describe('sceneFromFile', () => {
  it('reads what each of the two switches hid on the map', () => {
    const hidden = (tokenSettings: Record<string, unknown>): unknown => sceneFromFile({ tokenSettings }).tokenSettings;
    expect(hidden({ showHPBars: false, showStressBars: false, showNameplates: true })).toEqual({ showNameplates: true, hiddenResources: ['hp', 'stress'] });
    expect(hidden({ showHPBars: true, showStressBars: false })).toEqual({ hiddenResources: ['stress'] });
    expect(hidden({ showHPBars: true, showStressBars: true })).toEqual({ hiddenResources: [] });
    // A scene that showed only the secondary bar keeps hiding HP
    expect(hidden({ showHPBars: false, showStressBars: true })).toEqual({ hiddenResources: ['hp'] });
  });

  it('lets the switches decide when they disagree with the list: an older Atlas changed them', () => {
    const hidden = (tokenSettings: Record<string, unknown>): unknown => sceneFromFile({ tokenSettings }).tokenSettings;
    expect(hidden({ hiddenResources: ['ammo'], showHPBars: false, showStressBars: true })).toEqual({ hiddenResources: ['ammo', 'hp'] });
    expect(hidden({ hiddenResources: ['hp', 'stress', 'ammo'], showHPBars: true, showStressBars: true })).toEqual({ hiddenResources: ['ammo'] });
  });

  it('reads the single switch of earlier builds of this feature', () => {
    expect(sceneFromFile({ tokenSettings: { showResources: false } }).tokenSettings).toEqual({ hiddenResources: ['hp', 'stress'] });
    expect(sceneFromFile({ tokenSettings: { showResources: true } }).tokenSettings).toEqual({ hiddenResources: [] });
  });

  it('reads tokens and drops the vitals initiative entries copy from them', () => {
    const scene = sceneFromFile({
      objects: { tokens: { t1: { id: 't1', hp: { current: 1, max: 2 } } }, walls: {} },
      initiative: { round: 2, entries: [{ id: 'e1', tokenId: 't1', hp: { current: 1, max: 2 }, stress: { current: 0, max: 6 }, isDefeated: false, order: 0 }] },
    });
    expect(scene.objects).toEqual({ tokens: { t1: { id: 't1', resources: { hp: { current: 1, max: 2 } } } }, walls: {} });
    expect(scene.initiative).toEqual({ round: 2, entries: [{ id: 'e1', tokenId: 't1', order: 0 }] });
  });

  it('takes a scene without those parts, or with unreadable ones, as it is', () => {
    expect(sceneFromFile({})).toEqual({});
    expect(sceneFromFile({ initiative: null, objects: {} })).toEqual({ initiative: null, objects: {} });
    expect(sceneFromFile({ initiative: { entries: 'broken' } })).toEqual({ initiative: { entries: 'broken' } });
  });
});

describe('sceneToFile', () => {
  const scene = {
    grid: { size: 70 },
    objects: {
      tokens: {
        t1: { id: 't1', resources: { hp: { current: 0, max: 8 }, stress: { current: 2, max: 6 } } },
        t2: { id: 't2', resources: { hp: { current: 5, max: 5 } } },
        t3: { id: 't3' },
      },
      walls: {},
    },
    tokenSettings: { showNameplates: true, hiddenResources: ['stress', 'ammo'] },
    initiative: { round: 1, entries: [{ id: 'e1', tokenId: 't1', order: 0 }, { id: 'e2', tokenId: 't2', order: 1 }, { id: 'e3', tokenId: 't3', order: 2 }, { id: 'e4', tokenId: 'gone', order: 3 }] },
  };

  it('writes tokens, the two switches and the initiative copies as every Atlas reads them', () => {
    const file = sceneToFile(scene);
    expect(file.grid).toBe(scene.grid);
    expect(file.objects.tokens.t1).toEqual({ id: 't1', hp: { current: 0, max: 8 }, stress: { current: 2, max: 6 }, maxStress: 6 });
    expect(file.objects.walls).toBe(scene.objects.walls);
    expect(file.tokenSettings).toEqual({ showNameplates: true, hiddenResources: ['stress', 'ammo'], showHPBars: true, showStressBars: false });
    expect(file.initiative.entries).toEqual([
      { id: 'e1', tokenId: 't1', order: 0, hp: { current: 0, max: 8 }, stress: { current: 2, max: 6 }, isDefeated: true },
      { id: 'e2', tokenId: 't2', order: 1, hp: { current: 5, max: 5 }, isDefeated: false },
      { id: 'e3', tokenId: 't3', order: 2, isDefeated: false },
      { id: 'e4', tokenId: 'gone', order: 3, isDefeated: false },
    ]);
  });

  it('is undone by reading the file, and never changes the scene it is given', () => {
    const before = structuredClone(scene);
    expect(sceneFromFile(sceneToFile(scene))).toEqual(scene);
    expect(scene).toEqual(before);
  });

  it('writes a state without a scene as it is', () => {
    expect(sceneToFile({})).toEqual({});
  });
});

describe('token settings in a file', () => {
  it('tell an older Atlas the two switches it knows', () => {
    expect(tokenSettingsToFile({ hiddenResources: [] })).toEqual({ hiddenResources: [], showHPBars: true, showStressBars: true });
    expect(tokenSettingsToFile({ hiddenResources: ['stress', 'ammo'] })).toMatchObject({ showHPBars: true, showStressBars: false });
    expect(tokenSettingsToFile({ showNameplates: true })).toEqual({ showNameplates: true, showHPBars: true, showStressBars: true });
  });

  it('are left alone when they hold neither switches nor a list', () => {
    const current = { showNameplates: true, hiddenResources: ['stress'] };
    expect(tokenSettingsFromFile(current)).toBe(current);
  });
});

describe('unrelated saved fields', () => {
  it('preserves old character values and an existing initiative icon through a scene round trip', () => {
    const token = {
      id: 'hero', kind: 'character', name: 'Hero', x: 0, y: 0, imagePath: 'hero.webp',
      playerLinked: true, playerId: 'old-player', playerCharacterId: 'old-character',
      hp: { current: 5, max: 12 },
    };
    const scene = {
      objects: { tokens: { hero: token } },
      initiative: { entries: [{ id: 'entry', tokenId: 'hero', isNPC: false }] },
    };

    const saved = sceneToFile(sceneFromFile(scene));

    expect(saved.objects.tokens.hero).toEqual(token);
    expect(saved.initiative.entries[0]?.isNPC).toBe(false);
  });
});
