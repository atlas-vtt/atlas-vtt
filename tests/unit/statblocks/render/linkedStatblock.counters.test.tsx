// @vitest-environment jsdom
import { act, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { NoteFieldWriter, type WriteOutcome } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { NoteSource } from '../../../../src/app/statblocks/notes/noteSource';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { MARSH_PATH, marshText } from '../library/templateTexts';
import { NATIVE, WARDEN, renderLinked } from './linkedStatblockKit';

const SLOTS = [{ name: '1st level', max: 3, used: 0 }, { name: '2nd level', max: 2, used: 1 }];

/** The Marsh creature's id with a name and a Counters block of spell slots. */
const COUNTERS_TEMPLATE = marshText({
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'slots', label: 'Spell slots', type: 'counters' },
  ],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, { id: 'slots001', type: 'counters', field: 'slots' }] },
});

const WRITTEN: WriteOutcome = { applied: [], conflicts: [], backend: 'vault', problem: null };

let current: CreatureVault;
let write: ReturnType<typeof vi.spyOn<NoteFieldWriter, 'write'>>;

beforeEach(() => {
  current = creatureVault();
  current.files.set(MARSH_PATH, COUNTERS_TEMPLATE);
  addNote(current, WARDEN, { ...NATIVE, slots: SLOTS });
  write = vi.spyOn(NoteFieldWriter.prototype, 'write').mockResolvedValue(WRITTEN);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  TemplateLibrary.release(current.app);
  NoteSource.release(current.app);
  NoteFieldWriter.release(current.app);
});

/** The pips of the row named `name`, once the card shows them. */
function pipsOf(container: HTMLElement, name: string): Promise<HTMLElement> {
  return vi.waitFor(() => within(container).getByRole('group', { name }));
}

/** Waits for the row `name` drawn as a count only, without buttons, and says whether the card has any pip button. */
async function readOnly(container: HTMLElement, name: string): Promise<boolean> {
  await vi.waitFor(() => within(container).getByRole('img', { name: new RegExp(`^${name}: `) }));
  return container.querySelector('.atlas-sb-counter__pip-button') === null;
}

const press = async (button: HTMLElement): Promise<void> => { await act(async () => { fireEvent.click(button); }); };

describe('Counters on a card that is only read (#581)', () => {
  it('writes a pressed pip into the note in the DM screen, as one patch of the whole value with the old value as its base', async () => {
    withStatblockEditor(current.app);
    const { container } = renderLinked(current, { path: WARDEN, variant: 'feed', pressableCounters: true });
    await press(within(await pipsOf(container, '1st level')).getByRole('button', { name: '1st level 3 of 3' }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(WARDEN, [{ op: 'set', path: ['slots'], base: SLOTS, next: [{ ...SLOTS[0], used: 1 }, SLOTS[1]] }]);
  });

  it('builds a second press in the hover preview on the first while the note does not hold it yet', async () => {
    withStatblockEditor(current.app);
    const { container } = renderLinked(current, { path: WARDEN, variant: 'hover', pressableCounters: true });
    const pips = await pipsOf(container, '1st level');
    await press(within(pips).getByRole('button', { name: '1st level 3 of 3' }));
    await press(within(pips).getByRole('button', { name: '1st level 2 of 3' }));
    const first = [{ ...SLOTS[0], used: 1 }, SLOTS[1]];
    expect(write.mock.calls.at(-1)).toEqual([WARDEN, [{ op: 'set', path: ['slots'], base: first, next: [{ ...SLOTS[0], used: 2 }, SLOTS[1]] }]]);
  });

  it('draws the pips read-only where the mount does not ask for them, or the statblock editor is off', async () => {
    const off = renderLinked(current, { path: WARDEN, variant: 'feed', pressableCounters: true });
    expect(await readOnly(off.container, '1st level')).toBe(true);
    cleanup();
    withStatblockEditor(current.app);
    const notAsked = renderLinked(current, { path: WARDEN, variant: 'feed' });
    expect(await readOnly(notAsked.container, '1st level')).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it('never writes a note that is not in the vault', async () => {
    withStatblockEditor(current.app);
    const text = current.files.get(WARDEN) ?? '';
    const { container } = renderLinked(current, { path: WARDEN, noteText: text, variant: 'hover', pressableCounters: true });
    expect(await readOnly(container, '1st level')).toBe(true);
  });
});
