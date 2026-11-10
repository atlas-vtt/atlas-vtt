import '../setup/obsidianDom';
import { act } from '@testing-library/react';
import { describe, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { frame, frames, mount, useEditorStyles, wait } from './sidePanesHarness';

vi.mock('../../src/app/services/statblockDiceLinks', () => ({ attachDiceRolling: () => () => undefined, diceLinkProps: () => ({}), linkDiceIn: () => undefined }));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

describe('shot', () => {
  useEditorStyles();
  it('options', async () => {
    const t = sampleTemplate();
    const session = new FakeSession({ ...t, layout: { ...t.layout, blocks: t.layout.blocks.map((b) => (b.id === 'stat-ac1' ? { ...b, rollable: true, addsToRolls: true } : b)) } });
    mount(session, 1180);
    await frames(3);
    await act(async () => { frame('stat-ac1').click(); });
    await frames(2);
    await act(async () => { frame('stat-ac1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })); });
    await wait(400);
    const options = [...document.querySelectorAll<HTMLElement>('.atlas-te-options:not([data-closing])')].at(-1)!;
    await page.screenshot({ path: './__shots__/options.png', element: options.querySelector<HTMLElement>('.atlas-te-options__panel')! });
  });
});
