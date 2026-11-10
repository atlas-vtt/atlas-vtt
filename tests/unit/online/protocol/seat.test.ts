import { describe, expect, it } from 'vitest';
import { parseYourCode } from '../../../../src/app/online/protocol/index.ts';

describe('the player\'s own code', () => {
  it('is read from a your-code message', () => {
    expect(parseYourCode({ t: 'your-code', code: '482193', first: true })).toEqual({ t: 'your-code', code: '482193', first: true });
    expect(parseYourCode({ t: 'your-code', code: '000001', first: false })).toEqual({ t: 'your-code', code: '000001', first: false });
  });

  it('is refused when the code is not six digits, the flag is no boolean, or the body is something else', () => {
    for (const body of [
      { t: 'your-code', code: '48219', first: true }, { t: 'your-code', code: '4821930', first: true }, { t: 'your-code', code: 482193, first: true }, { t: 'your-code', code: '482193', first: 'yes' },
      { t: 'your-code', code: '482193' }, { t: 'your-code', first: true }, { t: 'other', code: '482193', first: true }, null, undefined, 'your-code', [], 7,
    ]) expect(parseYourCode(body), JSON.stringify(body)).toBeNull();
  });
});
