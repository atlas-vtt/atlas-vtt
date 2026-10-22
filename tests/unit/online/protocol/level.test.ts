import { describe, expect, it } from 'vitest';
import { parseClientFrame, parseRelayFrame, readLevel } from '../../../../src/app/online/protocol/index.ts';

describe('GM levels', () => {
  it('read a whole number from 0 to 10,000, and anything else as 0', () => {
    expect(readLevel(3)).toBe(3);
    expect(readLevel(0)).toBe(0);
    for (const value of [-1, 1.5, '2', 1e9, null, undefined, Number.NaN]) expect(readLevel(value), String(value)).toBe(0);
  });

  it('keep a GM hello\'s level, and read one without as level 1', () => {
    expect(parseClientFrame('{"v":1,"t":"hello","role":"gm","secret":"0123456789abcdef","level":3}')).toMatchObject({ level: 3 });
    expect(parseClientFrame('{"v":1,"t":"hello","role":"gm","secret":"0123456789abcdef"}')).toMatchObject({ level: 1 });
    expect(parseClientFrame('{"v":1,"t":"hello","role":"gm","secret":"0123456789abcdef","level":"x"}')).toMatchObject({ level: 0 });
  });

  it('read the relay\'s minimum in a GM welcome, the GM\'s level for players, and nothing from an older relay', () => {
    expect(parseRelayFrame('{"v":1,"t":"welcome","role":"gm","players":[],"minLevel":2,"later":true}')).toEqual({ v: 1, t: 'welcome', role: 'gm', players: [], minLevel: 2 });
    expect(parseRelayFrame('{"v":1,"t":"welcome","role":"gm","players":[]}')).toEqual({ v: 1, t: 'welcome', role: 'gm', players: [] });
    expect(parseRelayFrame('{"v":1,"t":"gm","online":true,"level":2}')).toEqual({ v: 1, t: 'gm', online: true, level: 2 });
    expect(parseRelayFrame('{"v":1,"t":"gm","online":false}')).toEqual({ v: 1, t: 'gm', online: false });
    const key = 'k'.repeat(20);
    expect(parseRelayFrame(`{"v":1,"t":"welcome","role":"player","id":"p","key":"${key}","gmOnline":true,"gmLevel":4}`)).toMatchObject({ gmLevel: 4 });
    expect(parseRelayFrame(`{"v":1,"t":"welcome","role":"player","id":"p","key":"${key}","gmOnline":false}`)).not.toHaveProperty('gmLevel');
  });
});
