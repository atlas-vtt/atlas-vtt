// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playerCodeCopier } from '../../../../src/app/online/gm/dock/playerCodes.ts';

const notices = vi.hoisted(() => ({ shown: [] as string[] }));
vi.mock('../../../../src/app/ui/notice', () => ({ showNotice: (message: string) => void notices.shown.push(message) }));

const ANA = 'a'.repeat(20);

function root(writeText: (text: string) => Promise<void>): HTMLElement {
  const el = document.body.createDiv();
  Object.defineProperty(el, 'win', { value: { navigator: { clipboard: { writeText } } } });
  return el;
}

beforeEach(() => {
  notices.shown.length = 0;
});

describe('Copy code in the player\'s menu', () => {
  it('copies the code as people read it, and says so', async () => {
    const written: string[] = [];
    const copy = playerCodeCopier({ playerCode: (id) => (id === ANA ? '482193' : null) }, root((text) => (written.push(text), Promise.resolve())));
    expect(await copy(ANA)).toBe(true);
    expect(written).toEqual(['482 193']);
    expect(notices.shown).toEqual(['Code copied']);
  });

  it('copies nothing for a player the table has no code for', async () => {
    const written: string[] = [];
    const copy = playerCodeCopier({ playerCode: () => null }, root((text) => (written.push(text), Promise.resolve())));
    expect(await copy(ANA)).toBe(false);
    expect(written).toEqual([]);
    expect(notices.shown).toEqual(['The code could not be copied.']);
  });

  it('says so when the clipboard refuses', async () => {
    const copy = playerCodeCopier({ playerCode: () => '482193' }, root(() => Promise.reject(new Error('denied'))));
    expect(await copy(ANA)).toBe(false);
    expect(notices.shown).toEqual(['The code could not be copied.']);
  });
});
