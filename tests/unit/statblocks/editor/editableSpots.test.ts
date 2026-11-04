import { describe, expect, it } from 'vitest';
import { FIVE_E_2014_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2014';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import { EVERY_BLOCK } from '../../../fixtures/statblockTemplateFixtures';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { editableFields, editableSpots, neighbourSpot } from '../../../../src/app/statblocks/editor/statblock-pane/editableSpots';
import { writtenFields } from '../../../../src/app/statblocks/expressions/patternFields';

const creature = GENERIC_CREATURE.template;
const spotsOf = (record: Record<string, unknown>, template = creature): ReturnType<typeof editableSpots> =>
  editableSpots(template, sheetState({ template, record, mode: 'editing' }));

describe('editableSpots', () => {
  it('walks every field in the template\'s field order, empty ones included; the art is the token socket\'s', () => {
    const { order, byBlock } = spotsOf({ name: 'Marsh Warden' });
    expect(order.map((spot) => spot.field.key)).toEqual(creature.fields.map((field) => field.key).filter((key) => key !== 'image'));
    expect([...byBlock.values()].flat().some((field) => field.key === 'image')).toBe(false);
  });

  it('edits each field in the block that shows it, the header\'s parts first, a line\'s fields together', () => {
    const { byBlock } = spotsOf({});
    expect([...byBlock.keys()].slice(0, 5)).toEqual(['header-name', 'header-level', 'header-type', 'header-hp', 'header-description']);
    expect(byBlock.get('header-hp')?.map((field) => field.key)).toEqual(['hp']);
    expect(byBlock.get('gcaction')?.map((field) => field.key)).toEqual(['actions']);
    // Containers hold no values of their own.
    expect(byBlock.has('gcstrip0')).toBe(false);
    const fiveE = FIVE_E_2014_MONSTER.template;
    expect(spotsOf({}, fiveE).byBlock.get('e4line00')?.map((field) => field.key)).toEqual(['size', 'subtype', 'alignment']);
    expect(spotsOf({}, fiveE).byBlock.get('header-hp')?.map((field) => field.key)).toEqual(['hp', 'hit_dice']);
  });

  it('offers nothing in a part of the header the template hides', () => {
    expect(spotsOf({}, FIVE_E_2014_MONSTER.template).byBlock.has('header-description')).toBe(false);
  });

  it('offers nothing in a block the card hides', () => {
    const spirit = spotsOf({ kind: 'Spirit' }, EVERY_BLOCK);
    expect(spirit.byBlock.has('b3entr00')).toBe(false);
    expect(spirit.order.some((spot) => spot.field.key === 'moves')).toBe(false);
    expect(spotsOf({ kind: 'Beast' }, EVERY_BLOCK).byBlock.has('b3entr00')).toBe(true);
  });

  it('reads plain references from a pattern, never a slot, a formula or a lookup', () => {
    expect(writtenFields('{hp}[ ({hit_dice})]')).toEqual(['hp', 'hit_dice']);
    expect(writtenFields('{stats.1} {=floor((stats.1 - 10) / 2)}')).toEqual([]);
    expect(writtenFields('{cr|lookup:xp}[; PB {cr|lookup:pb}]')).toEqual([]);
    expect(writtenFields('{str|signed}')).toEqual(['str']);
    expect(writtenFields('{unclosed')).toEqual([]);
  });

  it('types nothing into a value its pattern works out, though the block is bound to the field', () => {
    const fields = new Map([['cr', { key: 'cr', label: 'CR', type: 'rating' as const }]]);
    const xp = { id: 'xpline00', type: 'stat' as const, field: 'cr', label: 'XP', look: 'run-in' as const, pattern: '{cr|lookup:xp}' };
    expect(editableFields(xp, fields)).toEqual([]);
    expect(editableFields({ ...xp, pattern: undefined }, fields).map((field) => field.key)).toEqual(['cr']);
  });

  it('steps forwards and back, and nowhere past either end', () => {
    const { order } = spotsOf({});
    expect(neighbourSpot(order, 'name', 1)?.field.key).toBe('size');
    expect(neighbourSpot(order, 'size', -1)?.field.key).toBe('name');
    expect(neighbourSpot(order, 'name', -1)).toBeNull();
    expect(neighbourSpot(order, 'actions', 1)).toBeNull();
  });
});
