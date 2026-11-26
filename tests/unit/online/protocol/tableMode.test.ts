import { describe, expect, it } from 'vitest';
import { parseGmMessage } from '../../../../src/app/online/protocol/index.ts';

describe('the table\'s mode as a page reads it', () => {
  it('reads the mode, the curtain and the pause', () => {
    expect(parseGmMessage({ t: 'table-mode', mode: 'remote', curtain: true, paused: false })).toEqual({ t: 'table-mode', mode: 'remote', curtain: true, paused: false });
  });

  it('reads a mode it does not know as the table, and refuses a message without both switches', () => {
    expect(parseGmMessage({ t: 'table-mode', mode: 'hologram', curtain: false, paused: true })).toEqual({ t: 'table-mode', mode: 'table', curtain: false, paused: true });
    expect(parseGmMessage({ t: 'table-mode', mode: 'remote', curtain: 'yes', paused: false })).toBeNull();
    expect(parseGmMessage({ t: 'table-mode', mode: 'remote' })).toBeNull();
  });

  it('reads a move refused for a pause, and a reason it does not know as none', () => {
    const refused = { t: 'move-refused', scene: 's', id: '1'.repeat(24), x: 10, y: 20 };
    expect(parseGmMessage({ ...refused, reason: 'paused' })).toEqual({ ...refused, reason: 'paused' });
    expect(parseGmMessage({ ...refused, reason: 'tea' })).toEqual(refused);
  });
});
