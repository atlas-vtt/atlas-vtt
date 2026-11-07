// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { COLLECTION_DICE_ID, collectionDiceSet, statblockDiceSet } from '../../../src/app/gameSystems/diceSetResolution';
import { sameSystemRules } from '../../../src/app/gameSystems/systemRules';
import { useCollectionSettingsDraft } from '../../../src/app/react/components/collection-settings/useCollectionSettingsDraft';
import type { AssetService } from '../../../src/app/services/AssetService';
import type { CollectionSettings } from '../../../src/app/types/collectionSettingsTypes';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';

const presets = BUILT_IN_SYSTEM_PRESETS;
const cairn = presets.find((preset) => preset.name === 'Cairn')!;
const drawSteel = presets.find((preset) => preset.name === 'Draw Steel')!;
const duality: DiceSet = {
  id: 'set-duality', name: 'Duality', builtIn: false, crit: 'doubles',
  dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' }],
};
const sets = [duality];

describe('the dice set a collection rolls', () => {
  it('is its pick from the library', () => {
    expect(collectionDiceSet({ diceSetId: duality.id, dice: { defaultRoll: '2d12', crit: 'doubles' } }, presets, sets)).toBe(duality);
  });

  it('is the dice rules it stored before sets existed, read as the built-in set that rolls alike, so nothing changes', () => {
    expect(collectionDiceSet({ dice: { defaultRoll: '1d20', crit: 'roll-under' }, systemPresetId: drawSteel.id }, presets, sets).id).toBe('builtin:d20-roll-under');
    const own = collectionDiceSet({ dice: { defaultRoll: '3d6', crit: 'none' } }, presets, sets);
    expect(own).toMatchObject({ id: COLLECTION_DICE_ID, name: '3d6', dice: [{ count: 3, sides: 6 }], crit: 'none' });
  });

  it('rolls dice rules stored beside a pick that is gone (deleted, or not synced yet)', () => {
    expect(collectionDiceSet({ diceSetId: 'gone', dice: { defaultRoll: '2d12', crit: 'doubles' } }, presets, sets))
      .toMatchObject({ id: COLLECTION_DICE_ID, dice: [{ count: 2, sides: 12 }], crit: 'doubles' });
  });

  it('rolls its game system\'s set where its pick is gone and no dice rules are stored', () => {
    expect(collectionDiceSet({ diceSetId: 'gone', systemPresetId: cairn.id }, presets, sets).id).toBe('builtin:d20-roll-under');
    expect(collectionDiceSet({ diceSetId: 'gone' }, presets, sets).id).toBe('builtin:d20');
  });

  it('is its game system\'s without dice of its own, else the plain d20', () => {
    expect(collectionDiceSet({ systemPresetId: cairn.id }, presets, sets).id).toBe('builtin:d20-roll-under');
    const older = { ...drawSteel, id: 'user-ds', rules: { ...drawSteel.rules, diceSetId: undefined } } as never;
    expect(collectionDiceSet({ systemPresetId: 'user-ds' }, [older], sets).id).toBe('builtin:power-roll');
    expect(collectionDiceSet({}, presets, sets).id).toBe('builtin:d20');
  });
});

describe('the dice set a statblock rolls', () => {
  const collectionSet = collectionDiceSet({ systemPresetId: cairn.id }, presets, sets);
  it('is its template\'s, else the collection\'s', () => {
    expect(statblockDiceSet(duality.id, collectionSet, sets)).toBe(duality);
    expect(statblockDiceSet('builtin:power-roll', collectionSet, sets).id).toBe('builtin:power-roll');
    expect(statblockDiceSet(undefined, collectionSet, sets)).toBe(collectionSet);
    expect(statblockDiceSet('missing', collectionSet, sets)).toBe(collectionSet);
  });
});

describe('saving a collection\'s dice', () => {
  function draftFor(settings: CollectionSettings) {
    const assets = { getCollectionSettings: () => settings } as unknown as AssetService;
    return renderHook(() => useCollectionSettingsDraft(assets, 'dungeon', true));
  }

  it('leaves a collection saved before sets as it was: no set is written for it', () => {
    const { result } = draftFor({ conditions: [], dice: { defaultRoll: '1d20', crit: 'natural' } });
    const saved = result.current.toSettings();
    expect(saved.dice).toEqual({ defaultRoll: '1d20', crit: 'natural' });
    expect(saved.diceSetId).toBeUndefined();
  });

  it('writes a picked set alone: no dice rules beside it for older versions', () => {
    const { result } = draftFor({ conditions: [] });
    act(() => result.current.pickDiceSet(duality));
    const saved = result.current.toSettings();
    expect(saved).toMatchObject({ diceSetId: duality.id });
    expect(saved).toHaveProperty('dice', undefined);
  });

  it('removes the dice rules a collection saved before sets once it picks a set, and keeps the pick when the set is missing', () => {
    const { result } = draftFor({ conditions: [], dice: { defaultRoll: '3d6', crit: 'none' } });
    act(() => result.current.pickDiceSet(duality));
    expect(result.current.toSettings()).toEqual(expect.objectContaining({ diceSetId: duality.id, dice: undefined }));
    const missing = draftFor({ conditions: [], diceSetId: 'gone' });
    expect(missing.result.current.toSettings()).toEqual(expect.objectContaining({ diceSetId: 'gone', dice: undefined }));
  });

  it('takes the system\'s set with its system, and its default dice without one', () => {
    const { result } = draftFor({ conditions: [], diceSetId: duality.id });
    act(() => result.current.applyPreset(drawSteel));
    const system = result.current.toSettings();
    expect(system).toMatchObject({ diceSetId: 'builtin:power-roll' });
    expect(system).toHaveProperty('dice', undefined);
    act(() => result.current.clearSystem());
    expect(result.current.toSettings()).toMatchObject({ diceSetId: undefined, dice: { defaultRoll: '1d20', crit: 'natural' } });
  });

  it('plays as its system while it rolls the system\'s set, picked or stored as rules', () => {
    expect(sameSystemRules(drawSteel.rules, { ...drawSteel.rules })).toBe(true);
    expect(sameSystemRules(drawSteel.rules, { ...drawSteel.rules, diceSetId: undefined })).toBe(true);
    expect(sameSystemRules(drawSteel.rules, { ...drawSteel.rules, diceSetId: duality.id })).toBe(false);
  });
});
