import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { DiceTool } from '../../src/app/tools/DiceTool';

describe('DiceTool secret rolls', () => {
  it('marks a roll made with the secret option', () => {
    const diceTool = new DiceTool(new EventEmitter());
    const result = diceTool.rollDice('1d20', undefined, { secret: true });
    expect(result.secret).toBe(true);
  });

  it('leaves the secret key off a roll made without the option', () => {
    const diceTool = new DiceTool(new EventEmitter());
    const result = diceTool.rollDice('1d20');
    expect('secret' in result).toBe(false);
  });

  it('leaves the secret key off a roll made with the option set to false', () => {
    const diceTool = new DiceTool(new EventEmitter());
    const result = diceTool.rollDice('1d20', undefined, { secret: false });
    expect('secret' in result).toBe(false);
  });
});
