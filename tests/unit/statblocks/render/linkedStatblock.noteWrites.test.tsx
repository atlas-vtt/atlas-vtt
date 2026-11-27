// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { NoteSource } from '../../../../src/app/statblocks/notes/noteSource';
import { frontmatterOfText } from '../../../../src/app/statblocks/notes/statblockSource';
import { LinkedStatblock } from '../../../../src/app/statblocks/render/LinkedStatblock';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';
import { noteText } from './linkedStatblockKit';

const NOTE = 'Characters/Arden.md';
const ROWS = [{ name: 'Quick Vials', max: 6, used: 0 }, { name: 'Advanced Alchemy', max: 8, used: 0 }];

/** A player character's template: a name and a Counters block the note fills with its own rows. */
const COUNTERS_TEMPLATE = marshText({
  fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'charges', label: 'Class counters', type: 'counters' }],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, { id: 'charge01', type: 'counters', field: 'charges' }] },
});

let harness: NoteHarness;

beforeEach(() => {
  harness = noteHarness({
    [MARSH_PATH]: COUNTERS_TEMPLATE,
    [NOTE]: noteText({ statblock: true, 'atlas-template': MARSH_ID, name: 'Arden', charges: ROWS }),
  });
  withStatblockEditor(harness.app);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  TemplateLibrary.release(harness.app);
  NoteSource.release(harness.app);
  NoteFieldWriter.release(harness.app);
});

/** The DM screen's card of the note, whose counters a press writes into the note. */
function renderCard(): HTMLElement {
  return render(<LinkedStatblock app={harness.app} path={NOTE} variant="feed" pressableCounters />).container;
}

/** The count the card shows for Advanced Alchemy, once it shows one. */
async function shownCount(card: HTMLElement): Promise<string> {
  return vi.waitFor(() => {
    const count = card.querySelector('.atlas-sb-counter__count')?.textContent;
    if (!count) throw new Error('No count yet');
    return count;
  });
}

const decrease = async (card: HTMLElement): Promise<void> => {
  await shownCount(card);
  await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Decrease Advanced Alchemy' })); });
};

/** The uses of Advanced Alchemy in a note text. */
function usedIn(text: string): number | undefined {
  const rows = frontmatterOfText(text)?.charges as Array<{ name: string; used: number }> | undefined;
  return rows?.find((row) => row.name === 'Advanced Alchemy')?.used;
}

describe('Counters pressed on a card of a note that is open in an editor', () => {
  it('shows the press at once, though the metadata cache follows only once Obsidian saves the editor', async () => {
    const editor = harness.open(NOTE).editor;
    const card = renderCard();
    expect(await shownCount(card)).toBe('8 / 8');

    await decrease(card);

    expect(usedIn(editor.getValue())).toBe(1);
    expect(usedIn(harness.files.get(NOTE) ?? '')).toBe(0);
    await vi.waitFor(() => expect(card.querySelector('.atlas-sb-counter__count')?.textContent).toBe('7 / 8'), { timeout: 500 });
  });

  it('counts each of three quick presses', async () => {
    const editor = harness.open(NOTE).editor;
    const card = renderCard();
    for (let count = 0; count < 3; count++) await decrease(card);
    expect(usedIn(editor.getValue())).toBe(3);
  });
});

describe('Counters pressed on a card of a note that no editor holds', () => {
  it('counts each of three presses made before the disk write of the first, and writes the note once', async () => {
    const card = renderCard();
    for (let count = 0; count < 3; count++) await decrease(card);

    await vi.waitFor(() => expect(usedIn(harness.files.get(NOTE) ?? '')).toBe(3), { timeout: 2000 });
    expect(harness.app.vault.process).toHaveBeenCalledTimes(1);
    expect(harness.app.vault.create).not.toHaveBeenCalled();
    expect(await vi.waitFor(() => {
      const count = card.querySelector('.atlas-sb-counter__count')?.textContent;
      if (count !== '5 / 8') throw new Error(`Still ${count}`);
      return count;
    })).toBe('5 / 8');
  });
});
