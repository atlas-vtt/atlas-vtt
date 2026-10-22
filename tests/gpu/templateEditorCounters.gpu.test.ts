import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { frame, frames, mount, useEditorStyles, wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/** Long enough for the Options popover to open. */
const SETTLED_MS = 260;

function withCounters(): StatblockTemplate {
  const sample = sampleTemplate();
  return {
    ...sample,
    fields: [...sample.fields, {
      key: 'slots', label: 'Spell slots', type: 'counters',
      counterRows: [{ name: '1st level', max: 4, regain: '1d4' }, { name: 'Arcane Recovery', max: 1 }],
    }],
    layout: { ...sample.layout, blocks: [...sample.layout.blocks, { id: 'slots001', type: 'counters', field: 'slots' }] },
  };
}

/**
 * A Counters tile in the template editor: drawn as beside a note, its pips
 * there but inert, and its Options listing its rows inside the popover's one width.
 */
describe('a Counters tile in the template editor', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('draws its preset rows with inert pips, and its Options hold every row within their width', async () => {
    mount(new FakeSession(withCounters()), 1180);
    await frames(3);
    const tile = frame('slots001');
    const buttons = [...tile.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.length).toBe(5);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    await act(async () => { tile.click(); });
    await act(async () => {
      document.querySelector<HTMLElement>('.atlas-te-toolbar [data-options] button')!.click();
      await wait(SETTLED_MS);
    });
    const panel = document.querySelector<HTMLElement>('.atlas-te-options__panel')!.getBoundingClientRect();
    const rows = [...document.querySelectorAll<HTMLElement>('.atlas-te-counter-row')];
    expect(rows).toHaveLength(2);
    for (const control of rows.flatMap((row) => [...row.querySelectorAll<HTMLElement>('input, button')])) {
      const box = control.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(panel.left);
      expect(box.right).toBeLessThanOrEqual(panel.right);
    }
    const name = rows[0]!.querySelector<HTMLElement>('input')!.getBoundingClientRect();
    expect(name.width, 'the name keeps room to read').toBeGreaterThan(120);
  });
});
