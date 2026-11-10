import { describe, expect, it } from 'vitest';
import { parseTokenUI } from '../../../../src/app/online/protocol/tokenUI';
import { parseBookCharacter } from '../../../../src/app/online/protocol/bookCharacter';

const bar = (direction: string, max: number): Record<string, unknown> => ({ colour: '#ffffff', direction, defeats: false, current: max, max });
const ui = (bars: unknown[]): unknown => ({ nameplate: false, downed: false, bars, conditions: [] });
const resource = (direction: string, max: number): Record<string, unknown> => ({ key: 'ac', name: 'AC', colour: '#ffffff', direction, current: max, max, editable: false });
const character = (resources: unknown[]): unknown => ({ name: 'Rat', art: null, ring: null, resources });

describe('static resource values sent to players', () => {
  it('reads a static bar of 0 and refuses a counting bar without a maximum', () => {
    expect(parseTokenUI(ui([bar('static', 0)]))?.bars).toEqual([bar('static', 0)]);
    expect(parseTokenUI(ui([bar('drains', 0)]))).toBeUndefined();
  });

  it('reads a sheet with a static value of 0 and refuses a counting one without a maximum', () => {
    expect(parseBookCharacter(character([resource('static', 0)]))?.resources).toHaveLength(1);
    expect(parseBookCharacter(character([resource('fills', 0)]))).toBeUndefined();
  });
});
