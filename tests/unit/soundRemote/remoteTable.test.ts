import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remoteRolls } from '@/app/soundRemote/remoteRolls';
import { isTableCommand, remoteCombat, remotePlayer, runTableCommand, savedRollsOnMap } from '@/app/soundRemote/remoteTable';
import { showNotice } from '@/app/ui/notice';
import { fakeTable } from '../../helpers/soundRemoteRig';

vi.mock('@/app/ui/notice', () => ({ showNotice: vi.fn() }));

beforeEach(() => vi.mocked(showNotice).mockClear());

describe('the remote\'s combat keys', () => {
  it('starts a fight as the tracker does, with the defeated combatants of the map, and ends it', () => {
    const { table, state, map } = fakeTable();
    expect(runTableCommand(table, { type: 'combat' })).toBeNull();
    expect(state.startCombat).toHaveBeenCalledWith(map.rules(), new Set(['e1']));
    expect(remoteCombat(table)).toEqual({ active: true, round: 1, combatants: 2, rolls: true });
    expect(runTableCommand(table, { type: 'combat' })).toBeNull();
    expect(state.endCombat).toHaveBeenCalledOnce();
  });

  it('refuses without a loaded map or combatants, and a fight by cards the deck is too short for', () => {
    expect(runTableCommand(fakeTable({ map: false }).table, { type: 'combat' })).toBe('no-scene');
    const loading = fakeTable();
    loading.state.isMapLoading = true;
    expect(runTableCommand(loading.table, { type: 'rollInitiative' })).toBe('no-scene');
    expect(remoteCombat(loading.table)).toBeNull();
    expect(runTableCommand(fakeTable({ combatants: 0 }).table, { type: 'combat' })).toBe('no-combatants');
    const cards = fakeTable({ combatants: 3, rules: { mode: 'cards', roll: '1d20', firstSide: 'players', deck: 2 } });
    expect(runTableCommand(cards.table, { type: 'combat' })).toBe('cards-short');
    expect(cards.state.startCombat).not.toHaveBeenCalled();
    expect(showNotice).toHaveBeenCalledOnce();
  });

  it('rolls only where the rules roll numbers', () => {
    const { table, map } = fakeTable();
    expect(runTableCommand(table, { type: 'rollInitiative' })).toBeNull();
    expect(map.roll).toHaveBeenCalledOnce();
    const sides = fakeTable({ rules: { mode: 'sides', roll: '1d20', firstSide: 'players' } });
    expect(remoteCombat(sides.table)?.rolls).toBe(false);
    expect(runTableCommand(sides.table, { type: 'rollInitiative' })).toBe('no-rolls');
    expect(runTableCommand(fakeTable({ combatants: 0 }).table, { type: 'rollInitiative' })).toBe('no-combatants');
  });

  it('tells table commands from sound commands', () => {
    expect(isTableCommand({ type: 'curtain' })).toBe(true);
    expect(isTableCommand({ type: 'pause' })).toBe(false);
  });
});

describe('the remote\'s player window keys', () => {
  it('presents the map in front, opening the window, and refuses without a map', () => {
    const { table, map, window } = fakeTable();
    window.open = false;
    expect(runTableCommand(table, { type: 'present' })).toBeNull();
    expect(map.present).toHaveBeenCalledOnce();
    expect(runTableCommand(fakeTable({ map: false }).table, { type: 'present' })).toBe('no-scene');
    map.presented.mockReturnValue(true);
    expect(remotePlayer(table).presented).toBe(true);
  });

  it('freezes and lowers the curtain only in an open window, and not while TrueScale pins the camera', () => {
    const { table, player, window } = fakeTable();
    expect(runTableCommand(table, { type: 'freeze' })).toBeNull();
    expect(runTableCommand(table, { type: 'curtain' })).toBeNull();
    expect(remotePlayer(table)).toEqual({ open: true, presented: false, frozen: true, trueScale: false, hidden: true, handout: false });
    window.trueScale = true;
    expect(runTableCommand(table, { type: 'freeze' })).toBe('true-scale');
    expect(remotePlayer(table).frozen).toBe(false);
    window.open = false;
    expect(runTableCommand(table, { type: 'freeze' })).toBe('no-player-window');
    expect(runTableCommand(table, { type: 'curtain' })).toBe('no-player-window');
    expect(player.toggleFreeze).toHaveBeenCalledOnce();
    expect(player.setCurtain).toHaveBeenCalledWith(true);
  });

  it('takes back a handout only while one is shown', () => {
    const { table, player, window } = fakeTable();
    expect(runTableCommand(table, { type: 'takeBackHandout' })).toBe('no-handout');
    window.handout = true;
    expect(remotePlayer(table).handout).toBe(true);
    expect(runTableCommand(table, { type: 'takeBackHandout' })).toBeNull();
    expect(player.takeBackHandout).toHaveBeenCalledOnce();
  });

  it('shows the hovered image, and refuses where none is under the pointer', () => {
    const { table, player, window } = fakeTable();
    expect(runTableCommand(table, { type: 'showHoveredImage' })).toBe('no-image');
    window.hoveringImage = true;
    expect(runTableCommand(table, { type: 'showHoveredImage' })).toBeNull();
    expect(player.showHoveredImage).toHaveBeenCalledTimes(2);
  });
});

describe('the remote\'s dice keys', () => {
  it('rolls a saved roll of the map in front by its id, and refuses one its collection lacks', () => {
    const { table, map } = fakeTable();
    expect(runTableCommand(table, { type: 'roll', id: 'attack' })).toBeNull();
    expect(map.rollSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'attack', formula: '1d20+5' }));
    expect(runTableCommand(table, { type: 'roll', id: 'gone' })).toBe('no-roll');
    expect(runTableCommand(fakeTable({ map: false }).table, { type: 'roll', id: 'attack' })).toBe('no-scene');
    expect(savedRollsOnMap(fakeTable({ map: false }).table)).toEqual([]);
  });

  it('lists the rolls with the face their place in the tray draws', () => {
    expect(remoteRolls(savedRollsOnMap(fakeTable().table))).toEqual([
      { id: 'attack', name: 'Attack', formula: '1d20+5', look: { sides: 20, count: 1, rule: '', rest: '+5', colour: null } },
      { id: 'fire', name: 'Fire bolt', formula: '2d10 + 2', look: { sides: 10, count: 2, rule: '', rest: '+2', colour: '#ff6600' } },
    ]);
  });

  it('switches the shared rolls', () => {
    const { table, shareRolls } = fakeTable();
    expect(runTableCommand(table, { type: 'shareRolls' })).toBeNull();
    expect(shareRolls.setShown).toHaveBeenCalledWith(true);
    expect(shareRolls.shown()).toBe(true);
  });
});
