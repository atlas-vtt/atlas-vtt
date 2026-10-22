import { describe, expect, it } from 'vitest';
import { sheetOf } from '../../../../src/app/online/gm/book/bookSheet.ts';
import type { BookScene } from '../../../../src/app/online/gm/book/bookScene.ts';
import type { PlayedCharacter } from '../../../../src/app/online/gm/book/characters.ts';
import { checkResourceEdit, editableValue } from '../../../../src/app/online/gm/book/resourceEdit.ts';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { trackedSheetValues } from '../../../../src/app/online/gm/book/trackedSheet.ts';
import type { SheetNode } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { HP } from '../../../mocks/resourceFixtures';
import { templateOf } from '../../statblocks/render/sheetTestKit';
import { resolvedOf } from './statblockSheet/sheetKit';
import { ANA } from './realStore.ts';
import { token } from './shareHarness.ts';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'hp', label: 'HP', type: 'number' },
  { key: 'luck', label: 'Luck', type: 'number', tracks: { counts: 'down' } },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'secret', label: 'Secret', type: 'number', tracks: { counts: 'down' } },
];
const TEMPLATE: StatblockTemplate = {
  ...templateOf(FIELDS, [
    { id: 'metric01', type: 'metric', fields: ['luck'] },
    { id: 'track001', type: 'track', field: 'stress', look: 'boxes', counts: 'up' },
  ]),
  players: { secret: 'hidden' },
};
const RESOLVED = resolvedOf(TEMPLATE, { name: 'Ana', hp: 10, luck: 3, stress: 4, secret: 2 });
const HELD = { hp: { current: 6, max: 10 }, luck: { current: 1, max: 3 } };

describe('tracked numbers on a player\'s sheet', () => {
  const tracked = trackedSheetValues(RESOLVED, [HP], HELD);

  it('are the numbers the statblock tracks that the player may see, held or where they start', () => {
    expect(tracked.map(({ definition, value }) => [definition.key, value])).toEqual([
      ['luck', { current: 1, max: 3 }],
      ['stress', { current: 0, max: 4 }],
    ]);
  });

  it('leave out a number whose maximum a field hidden from players holds', () => {
    const hiddenMax: StatblockTemplate = {
      ...TEMPLATE,
      fields: [...FIELDS, { key: 'level', label: 'Level', type: 'number' }, { key: 'ki', label: 'Ki', type: 'number', tracks: { counts: 'down', max: 'level' } }],
      players: { secret: 'hidden', level: 'hidden' },
    };
    const keys = trackedSheetValues(resolvedOf(hiddenMax, { name: 'Ana', luck: 3, stress: 4, level: 5 }), [HP], {}).map(({ definition }) => definition.key);
    expect(keys).toEqual(['luck', 'stress']);
  });

  it('leave a number a collection resource reads to that resource, on the sheet and in the statblock', () => {
    const stress = { ...HP, key: 'stress', name: 'Stress', field: 'Stress', direction: 'fills' as const };
    expect(trackedSheetValues(RESOLVED, [HP, stress], HELD).map(({ definition }) => definition.key)).toEqual(['luck']);
    const statblock = statblockSheet({ resolved: RESOLVED, definitions: [HP, stress], resources: { ...HELD, stress: { current: 3, max: 4 } } })!;
    expect(statblock.blocks.find((node) => node.k === 'track')).toMatchObject({ resource: null, current: 0, max: 4 });
  });

  it('may be stepped only where the template lets the player change the field', () => {
    const readOnly: StatblockTemplate = { ...TEMPLATE, players: { secret: 'hidden', luck: 'read' } };
    const values = trackedSheetValues(resolvedOf(readOnly, { name: 'Ana', luck: 3, stress: 4 }), [HP], {});
    expect(values.map(({ definition, editable }) => [definition.key, editable])).toEqual([['luck', false], ['stress', true]]);
    const sheet = sheetOf({ id: 'ana', name: 'Ana', imagePath: 'ana.png', showRing: false } as never, {}, [HP], () => null, values);
    expect(sheet?.resources.find((resource) => resource.key === 'luck')?.editable).toBe(false);
  });

  it('are resources of the sheet the player may change', () => {
    const shown = { id: 'ana', name: 'Ana', imagePath: 'ana.png', showRing: false, ringColor: undefined } as never;
    const sheet = sheetOf(shown, { resources: HELD }, [HP], () => null, tracked);
    expect(sheet?.resources.map((resource) => [resource.key, resource.current, resource.max, resource.editable])).toEqual([
      ['hp', 6, 10, true], ['luck', 1, 3, true], ['stress', 0, 4, true],
    ]);
  });

  it('carry their resource in the statblock, a Metric\'s number and an unbound Track alike', () => {
    const statblock = statblockSheet({ resolved: RESOLVED, definitions: [HP], resources: HELD })!;
    const metric = statblock.blocks.find((node): node is Extract<SheetNode, { k: 'metric' }> => node.k === 'metric');
    const track = statblock.blocks.find((node): node is Extract<SheetNode, { k: 'track' }> => node.k === 'track');
    expect(metric?.values[0]?.resource).toBe('luck');
    expect(track).toMatchObject({ resource: 'stress', current: 0, max: 4, counts: 'up' });
  });

  it('are taken from their player with the value the sheet offered, also where the token holds none yet', () => {
    const sheet = sheetOf({ id: 'ana', name: 'Ana', imagePath: 'ana.png', showRing: false } as never, {}, [HP], () => null, tracked)!;
    const ana: PlayedCharacter = {
      collection: 'c', key: 'lib-ana', imagePath: 'ana.png', tokenId: 'ana', placed: { assetId: 'lib-ana', imagePath: 'ana.png' },
      sheet, statblockPath: 'Characters/Ana.md', drawnWith: { definitions: [HP], resources: {} },
    };
    const scene: BookScene = { mapPath: 'map', collection: 'c', resources: [HP], tokens: { ana: token('ana') }, shown: () => new Map(), listedToken: () => undefined };
    const edit = checkResourceEdit(ANA, ana, scene, () => ANA, { t: 'book-resource', key: 'stress', current: 2 });
    expect(edit).toEqual({ kind: 'token', from: ANA, tokenId: 'ana', key: 'stress', current: 2, tracked: { current: 0, max: 4 } });
    expect(editableValue({}, [HP], 'stress', { current: 0, max: 4 })).toEqual({ current: 0, max: 4 });
    expect(editableValue({ resources: { stress: { current: 3, max: 9 } } }, [HP], 'stress', { current: 0, max: 4 })).toEqual({ current: 3, max: 4 });
    expect(checkResourceEdit(ANA, ana, null, () => ANA, { t: 'book-resource', key: 'secret', current: 1 })).toBeNull();
    // Without a scene, a resource of the collection carries the value its sheet offered, which the campaign's own outranks
    expect(checkResourceEdit(ANA, { ...ana, sheet: sheetOf({ id: 'ana', name: 'Ana', imagePath: 'ana.png', showRing: false } as never, { resources: HELD }, [HP], () => null, tracked)! }, null, () => ANA, { t: 'book-resource', key: 'hp', current: 3 }))
      .toMatchObject({ kind: 'character', from: ANA, placed: ana.placed, key: 'hp', current: 3 });
  });
});
