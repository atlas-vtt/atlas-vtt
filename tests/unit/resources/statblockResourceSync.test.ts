import { describe, expect, it, vi } from 'vitest';
import { fillMissingResources, syncedResources } from '../../../src/app/resources/statblockResourceSync';
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
