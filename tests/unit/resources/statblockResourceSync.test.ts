import { describe, expect, it, vi } from 'vitest';
import { fillMissingResources, followStatblockResources, refieldedResources, syncedResources } from '../../../src/app/resources/statblockResourceSync';
import { HP_RESOURCE } from '../../../src/app/resources/resourceDefinitions';

const STR = { ...HP_RESOURCE, key: 'str', name: 'STR', field: 'stats.0', defeatedWhenSpent: false };

describe('statblock resource sync', () => {
  it('takes a new maximum, keeps and clamps the current value', () => {
    const token = { resources: { hp: { current: 10, max: 14 }, str: { current: 14, max: 14 } } };
    expect(syncedResources(token, { hp: 8, stats: [12, 12, 4] }, [HP_RESOURCE, STR])).toEqual({
      hp: { current: 8, max: 8 }, str: { current: 12, max: 12 },
    });
  });

  it('leaves hand-set maxima and values the statblock lacks alone', () => {
    const token = { resources: { hp: { current: 3, max: 20 }, ammo: { current: 2, max: 6 } }, overriddenMax: ['hp'] };
    expect(syncedResources(token, { hp: 8 }, [HP_RESOURCE])).toEqual({ hp: { current: 3, max: 20 }, ammo: { current: 2, max: 6 } });
  });

  it('follows a static value down to 0', () => {
    const ac = { ...STR, key: 'ac', name: 'AC', field: 'ac', direction: 'static' as const };
    expect(syncedResources({ resources: { ac: { current: 2, max: 2 } } }, { ac: 0 }, [ac])).toEqual({ ac: { current: 0, max: 0 } });
  });
  describe('a field the statblock empties', () => {
    const token = { resources: { hp: { current: 10, max: 14 } } };

    it.each([['emptied', null], ['blank', '  '], ['set to 0', 0]])('drops the resource when its field is %s', (_case, hp) => {
      expect(syncedResources(token, { hp }, [HP_RESOURCE])).toEqual({});
    });

    it('keeps the value while the field is absent or holds no quantity yet', () => {
      expect(syncedResources(token, { name: 'Troll' }, [HP_RESOURCE])).toEqual(token.resources);
      expect(syncedResources(token, { hp: '2d6' }, [HP_RESOURCE])).toEqual(token.resources);
    });

    it('drops the resource when a field the statblock holds empty is missing from its record', () => {
      expect(syncedResources(token, { name: 'Troll' }, [HP_RESOURCE], undefined, ['hp'])).toEqual({});
    });

    it('keeps a maximum set by hand', () => {
      const byHand = { ...token, overriddenMax: ['hp'] };
      expect(syncedResources(byHand, { hp: null }, [HP_RESOURCE])).toEqual(token.resources);
    });

    it('drops a static value only when its field is emptied', () => {
      const ac = { ...STR, key: 'ac', name: 'AC', field: 'ac', direction: 'static' as const };
      expect(syncedResources({ resources: { ac: { current: 2, max: 2 } } }, { ac: null }, [ac])).toEqual({});
    });
  });
});

describe('fillMissingResources', () => {
  const AMMO = { ...HP_RESOURCE, key: 'ammo', name: 'Ammo', field: 'ammo', defeatedWhenSpent: false };
  const statblocks: Record<string, Record<string, unknown>> = { 'Troll.md': { hp: 14, stats: [15, 12, 7] }, 'Rat.md': { hp: 2 } };
  const run = async (tokens: Record<string, object>, definitions = [HP_RESOURCE, STR]) => {
    const apply = vi.fn();
    const read = vi.fn(async (path: string) => (statblocks[path] ? { fields: statblocks[path] } : null));
    await fillMissingResources({ tokens: () => tokens as never, apply }, definitions, read);
    return { apply, read };
  };

  it('starts a resource defined after the token was placed, and leaves the values it has', async () => {
    const { apply } = await run({
      troll: { kind: 'character', statblockPath: 'Troll.md', resources: { hp: { current: 3, max: 14 } } },
      rat: { kind: 'character', statblockPath: 'Rat.md', resources: { hp: { current: 2, max: 2 } } },
    });
    expect(apply).toHaveBeenCalledWith([{ id: 'troll', changes: { resources: { hp: { current: 3, max: 14 }, str: { current: 15, max: 15 } } } }]);
  });

  it('reads each statblock once and nothing for tokens that are complete or not linked', async () => {
    const { apply, read } = await run({
      a: { kind: 'character', statblockPath: 'Troll.md' },
      b: { kind: 'character', statblockPath: 'Troll.md' },
      done: { kind: 'character', statblockPath: 'Rat.md', resources: { hp: { current: 1, max: 2 }, str: { current: 1, max: 1 } } },
      plain: { kind: 'token' },
      unlinked: { kind: 'character', name: 'Hero' },
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![0].map((entry: { id: string }) => entry.id)).toEqual(['a', 'b']);
  });

  it('writes nothing when no statblock has a value for the missing resource', async () => {
    const { apply } = await run({ rat: { kind: 'character', statblockPath: 'Rat.md', resources: { hp: { current: 2, max: 2 } } } }, [HP_RESOURCE, AMMO]);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('a resource that reads another statblock field (#615)', () => {
  const HIT_POINT = { ...HP_RESOURCE, field: 'hit_point' };
  const statblocks: Record<string, Record<string, unknown>> = { 'Hero.md': { hp: 7, hit_point: 30, stats: [12] }, 'Ghost.md': { hp: 7, hit_point: null } };
  const run = async (tokens: Record<string, object>, definitions = [HIT_POINT]) => {
    const apply = vi.fn();
    const read = vi.fn(async (path: string) => (statblocks[path] ? { fields: statblocks[path] } : null));
    await followStatblockResources({ tokens: () => tokens as never, apply }, [], definitions, read);
    return { apply, read };
  };

  it('is found by its key, never a resource that came or went', () => {
    expect(refieldedResources([HP_RESOURCE, STR], [HIT_POINT, STR])).toEqual([HIT_POINT]);
    expect(refieldedResources([HP_RESOURCE], [HP_RESOURCE, STR])).toEqual([]);
  });

  it('takes the new field\'s maximum: a full value stays full, a spent one keeps its current value', async () => {
    const { apply } = await run({
      full: { kind: 'character', statblockPath: 'Hero.md', resources: { hp: { current: 7, max: 7 } } },
      hurt: { kind: 'character', statblockPath: 'Hero.md', resources: { hp: { current: 4, max: 7 } } },
    });
    expect(apply).toHaveBeenCalledWith([
      { id: 'full', changes: { resources: { hp: { current: 30, max: 30 } } } },
      { id: 'hurt', changes: { resources: { hp: { current: 4, max: 30 } } } },
    ]);
  });

  it('clamps a value above the new maximum, and starts a filling value again from empty', async () => {
    const stress = { ...HP_RESOURCE, key: 'stress', field: 'hit_point', direction: 'fills' as const };
    const { apply } = await run({
      hero: { kind: 'character', statblockPath: 'Hero.md', resources: { hp: { current: 50, max: 60 }, stress: { current: 0, max: 7 } } },
    }, [HIT_POINT, stress]);
    expect(apply).toHaveBeenCalledWith([{ id: 'hero', changes: { resources: { hp: { current: 30, max: 30 }, stress: { current: 0, max: 30 } } } }]);
  });

  it('leaves maxima set by hand, tokens holding none, unlinked tokens and fields the statblock lacks alone', async () => {
    const { apply, read } = await run({
      manual: { kind: 'character', statblockPath: 'Hero.md', resources: { hp: { current: 2, max: 7 } }, overriddenMax: ['hp'] },
      none: { kind: 'character', statblockPath: 'Hero.md' },
      unlinked: { kind: 'character', resources: { hp: { current: 2, max: 7 } } },
      unknown: { kind: 'character', statblockPath: 'Gone.md', resources: { hp: { current: 2, max: 7 } } },
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('starts the resources a token lacks in the same pass, each statblock read once', async () => {
    const apply = vi.fn();
    const read = vi.fn(async (path: string) => (statblocks[path] ? { fields: statblocks[path] } : null));
    const tokens = { hero: { kind: 'character', statblockPath: 'Hero.md', resources: { hp: { current: 7, max: 7 } } } };
    await followStatblockResources({ tokens: () => tokens as never, apply }, [HIT_POINT, STR], [HIT_POINT], read);
    expect(read).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith([{ id: 'hero', changes: { resources: { hp: { current: 30, max: 30 }, str: { current: 12, max: 12 } } } }]);
  });

  it('drops the value where the statblock empties the new field', async () => {
    const { apply } = await run({ ghost: { kind: 'character', statblockPath: 'Ghost.md', resources: { hp: { current: 7, max: 7 } } } });
    expect(apply).toHaveBeenCalledWith([{ id: 'ghost', changes: { resources: {} } }]);
  });
});
