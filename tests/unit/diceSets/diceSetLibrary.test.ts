import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { DICE_SET_FOLDER, DiceSetFiles } from '../../../src/app/services/diceSets/DiceSetFiles';
import { DiceSetService } from '../../../src/app/services/diceSets/DiceSetService';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { memoryPresets } from '../../mocks/memoryPresets';

const opened: App[] = [];
afterEach(() => {
  for (const app of opened.splice(0)) DiceSetFiles.release(app);
});

function vault(seed: Record<string, string> = {}): { files: Map<string, string>; sets: DiceSetFiles } {
  const { app, files } = createInMemoryApp({ files: seed });
  opened.push(app);
  return { files, sets: DiceSetFiles.open(app) };
}

const fileText = (entry: Record<string, unknown>): string => `${JSON.stringify({ format: 1, ...entry }, null, 2)}\n`;
const hope = { count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' };
const fear = { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' };

describe('the dice set library', () => {
  it('lists the built-in sets first, then the vault\'s by name', () => {
    const service = new DiceSetService(memoryPresets());
    service.create('Zany', { dice: [{ count: 1, sides: 6 }], crit: 'none' });
    service.create('Duality', { dice: [hope, fear], crit: 'doubles' });
    expect(service.list().map((set) => set.name)).toEqual([...BUILT_IN_DICE_SETS.map((set) => set.name), 'Duality', 'Zany']);
  });

  it('refuses a name another set has, in any letter case, and an empty one', () => {
    const service = new DiceSetService(memoryPresets());
    const set = service.create('Duality', { dice: [hope, fear], crit: 'doubles' });
    expect(service.nameError('duality')).not.toBeNull();
    expect(service.nameError('D20')).not.toBeNull();
    expect(service.nameError('  ')).not.toBeNull();
    expect(service.nameError('Duality', set.id)).toBeNull();
    expect(service.freeName('Duality')).toBe('Duality 2');
  });

  it('duplicates a built-in set under a free name, the way to change one', () => {
    const service = new DiceSetService(memoryPresets());
    const copy = service.duplicate('builtin:power-roll', (name) => `${name} copy`);
    expect(copy).toMatchObject({ name: 'Power roll copy', builtIn: false, dice: [{ count: 2, sides: 10 }], crit: 'high-total' });
    expect(() => service.update('builtin:d20', { crit: 'none' })).toThrow();
    service.delete('builtin:d20');
    expect(service.list().some((set) => set.id === 'builtin:d20')).toBe(true);
  });

  it('edits field by field: what a newer Atlas wrote into the set and into a group survives', () => {
    const storage = memoryPresets([{ id: 's1', name: 'Duality', crit: 'doubles', aura: 'gold', dice: [{ ...hope, glow: 2 }, fear] }]);
    const service = new DiceSetService(storage);
    service.update('s1', { name: 'Hope and Fear', dice: [{ count: 1, sides: 12, name: 'Hope' }, fear], explode: { dice: 'all', repeats: false, highFaces: 1, lowFaces: 0 } });
    expect(storage.current()[0]).toEqual({
      id: 's1', name: 'Hope and Fear', crit: 'doubles', aura: 'gold',
      dice: [{ count: 1, sides: 12, name: 'Hope', glow: 2 }, fear],
      explode: { dice: 'all', repeats: false, highFaces: 1, lowFaces: 0 },
    });
    service.update('s1', { explode: undefined });
    expect(storage.current()[0]).not.toHaveProperty('explode');
  });

  it('never writes a set of a newer format', () => {
    const service = new DiceSetService(memoryPresets([{ id: 's1', format: 2, name: 'Later', crit: 'none', dice: [{ count: 1, sides: 6 }] }]));
    expect(service.list().at(-1)).toMatchObject({ readOnly: true });
    expect(() => service.update('s1', { crit: 'natural' })).toThrow();
  });
});

describe('dice set files', () => {
  it('keeps each set in a file of its own, named after it, the format first', async () => {
    const { files, sets } = vault();
    const service = new DiceSetService(sets);
    const set = service.create('Hope: Fear', { dice: [hope, fear], crit: 'doubles' });
    await sets.flush();
    const text = files.get(`${DICE_SET_FOLDER}/Hope- Fear.json`)!;
    expect(Object.keys(JSON.parse(text) as object)[0]).toBe('format');
    expect(JSON.parse(text)).toEqual({ format: 1, id: set.id, name: 'Hope: Fear', dice: [hope, fear], crit: 'doubles' });
  });

  it('reads the folder, a newer format read-only, files that hold no set left out', async () => {
    const { files, sets } = vault({
      [`${DICE_SET_FOLDER}/Duality.json`]: fileText({ id: 's1', name: 'Duality', crit: 'doubles', dice: [hope, fear] }),
      [`${DICE_SET_FOLDER}/Later.json`]: fileText({ format: 3, id: 's2', name: 'Later', crit: 'none', dice: [{ count: 1, sides: 6 }], newField: 1 }),
      [`${DICE_SET_FOLDER}/Built in.json`]: fileText({ id: 'builtin:d20', name: 'Fake', crit: 'none', dice: [{ count: 1, sides: 6 }] }),
      [`${DICE_SET_FOLDER}/Broken.json`]: '{',
    });
    await sets.load();
    const service = new DiceSetService(sets);
    expect(service.list().filter((set) => !set.builtIn).map((set) => [set.id, set.readOnly ?? false])).toEqual([['s1', false], ['s2', true]]);
    service.update('s1', { crit: 'none' });
    await sets.flush();
    expect(JSON.parse(files.get(`${DICE_SET_FOLDER}/Duality.json`)!)).toMatchObject({ crit: 'none', dice: [hope, fear] });
    expect(JSON.parse(files.get(`${DICE_SET_FOLDER}/Later.json`)!)).toMatchObject({ format: 3, newField: 1 });
  });
});
