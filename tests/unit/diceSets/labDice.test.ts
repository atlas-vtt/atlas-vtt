import { describe, expect, it } from 'vitest';
import {
  diceLimit,
  diceOfGroups,
  groupsOfDice,
  nextDie,
  withChange,
  withCopy,
  withMove,
  without,
  type LabDie,
} from '../../../src/app/react/components/collection-settings/dice-lab/labDice';

const die = (sides: number, name = '', colour?: string): LabDie => ({ id: `${sides}-${name}-${colour ?? ''}-${Math.random()}`, sides, name, ...(colour && { colour }) });

describe('the dice of the lab\'s tray', () => {
  it('show a group of N as N dice, each with an id of its own', () => {
    const dice = diceOfGroups([{ count: 2, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 6 }]);
    expect(dice.map(({ sides, name, colour }) => ({ sides, name, colour }))).toEqual([
      { sides: 12, name: 'Hope', colour: '#ca8a04' },
      { sides: 12, name: 'Hope', colour: '#ca8a04' },
      { sides: 6, name: '', colour: undefined },
    ]);
    expect(new Set(dice.map(({ id }) => id)).size).toBe(3);
    expect(dice[2]).not.toHaveProperty('colour');
  });

  it('split a die out of its group when it is changed alone, and merge it back when it matches again', () => {
    const dice = diceOfGroups([{ count: 3, sides: 6, colour: '#4d7c0f' }]);
    const changed = withChange(dice, dice[1]!.id, { colour: '#b91c1c' });
    expect(groupsOfDice(changed)).toEqual([
      { count: 1, sides: 6, colour: '#4d7c0f' },
      { count: 1, sides: 6, colour: '#b91c1c' },
      { count: 1, sides: 6, colour: '#4d7c0f' },
    ]);
    expect(groupsOfDice(withChange(changed, dice[1]!.id, { colour: '#4D7C0F' }))).toEqual([{ count: 3, sides: 6, colour: '#4d7c0f' }]);
  });

  it('merge only neighbours with the same sides, name and colour, names trimmed', () => {
    expect(groupsOfDice([die(12, 'Hope '), die(12, 'Hope'), die(12, 'Fear'), die(12, 'Hope')])).toEqual([
      { count: 2, sides: 12, name: 'Hope' },
      { count: 1, sides: 12, name: 'Fear' },
      { count: 1, sides: 12, name: 'Hope' },
    ]);
    // A blank name is none, and a die taken off its colour has no colour field
    expect(groupsOfDice([die(20, '  ')])).toEqual([{ count: 1, sides: 20 }]);
    expect(withChange([die(20, '', '#1d4ed8')], 'x', {})[0]).toHaveProperty('colour');
    const plain = withChange([{ id: 'a', sides: 20, name: '', colour: '#1d4ed8' }], 'a', { colour: undefined })[0]!;
    expect(plain).not.toHaveProperty('colour');
  });

  it('keep to the set\'s limits: twenty dice, six groups', () => {
    expect(diceLimit(Array.from({ length: 20 }, () => die(6)))).toBeNull();
    expect(diceLimit(Array.from({ length: 21 }, () => die(6)))).toBe('dice');
    const six = [4, 6, 8, 10, 12, 20].map((sides) => die(sides));
    expect(diceLimit(six)).toBeNull();
    expect(diceLimit([...six, die(100)])).toBe('groups');
    // Another d20 joins the last group: no seventh
    expect(diceLimit([...six, nextDie(six)])).toBeNull();
  });

  it('add a d20 to an empty tray, else a die like the last without its name and colour', () => {
    expect(nextDie([])).toMatchObject({ sides: 20, name: '' });
    const next = nextDie([die(12, 'Fear', '#7e22ce')]);
    expect(next).toMatchObject({ sides: 12, name: '' });
    expect(next).not.toHaveProperty('colour');
  });

  it('copy a die next to itself, remove one, and move one to another place', () => {
    const dice = [die(4), die(6), die(8)];
    const copied = withCopy(dice, dice[0]!.id);
    expect(copied.map(({ sides }) => sides)).toEqual([4, 4, 6, 8]);
    expect(copied[1]!.id).not.toBe(dice[0]!.id);
    expect(without(dice, dice[1]!.id).map(({ sides }) => sides)).toEqual([4, 8]);
    expect(withMove(dice, dice[0]!.id, 2).map(({ sides }) => sides)).toEqual([6, 8, 4]);
    expect(withMove(dice, dice[2]!.id, -1).map(({ sides }) => sides)).toEqual([8, 4, 6]);
  });
});
