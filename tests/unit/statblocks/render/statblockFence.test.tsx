// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type MarkdownPostProcessorContext } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import {
  STATBLOCK_FENCE_LANGUAGE,
  StatblockFenceChild,
  registerStatblockFence,
} from '../../../../src/app/statblocks/render/statblockFence';
import { addNote, creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_PATH, marshText } from '../library/templateTexts';
import { NATIVE, WARDEN, sheetOf, unloadFantasyStatblocks } from './linkedStatblockKit';

type Processor = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;

let current: CreatureVault;
/** Every child a fence added, unloaded after each test as Obsidian unloads a closed note's sections. */
const children: StatblockFenceChild[] = [];

beforeEach(() => {
  current = creatureVault();
  current.files.set(MARSH_PATH, marshText());
  addNote(current, WARDEN, NATIVE, '```atlas-statblock\n```\n');
});

afterEach(async () => {
  for (const child of children.splice(0)) child.onunload();
  await act(async () => { await Promise.resolve(); });
  TemplateLibrary.release(current.app);
  unloadFantasyStatblocks();
  document.body.empty();
});

/** Registers the fence as the plugin does and returns its processor. */
function registeredProcessor(): Processor {
  const registerMarkdownCodeBlockProcessor = vi.fn();
  registerStatblockFence({ app: current.app, registerMarkdownCodeBlockProcessor });
  expect(registerMarkdownCodeBlockProcessor).toHaveBeenCalledWith(STATBLOCK_FENCE_LANGUAGE, expect.any(Function));
  return registerMarkdownCodeBlockProcessor.mock.calls[0]![1] as Processor;
}

/** Runs the processor on a fence in the note at `sourcePath` and returns the child it added. */
function processFence(sourcePath: string, source = ''): { el: HTMLElement; child: StatblockFenceChild } {
  const el = document.body.createDiv();
  const addChild = vi.fn();
  registeredProcessor()(source, el, { sourcePath, addChild } as unknown as MarkdownPostProcessorContext);
  expect(addChild).toHaveBeenCalledTimes(1);
  const child: unknown = addChild.mock.calls[0]![0];
  if (!(child instanceof StatblockFenceChild)) throw new Error('The fence added no statblock child');
  children.push(child);
  return { el, child };
}

describe('the atlas-statblock fence (D14)', () => {
  it('registers under its language', () => {
    expect(STATBLOCK_FENCE_LANGUAGE).toBe('atlas-statblock');
    registeredProcessor();
  });

  it('draws the statblock of the note it is in once loaded', async () => {
    const { el, child } = processFence(WARDEN);
    expect(el.childElementCount).toBe(0);

    act(() => child.onload());
    expect(el.classList.contains('atlas-statblock-fence')).toBe(true);
    await waitFor(() => expect(sheetOf(el)?.textContent).toContain('Marsh Warden'));
    expect(sheetOf(el)?.dataset.variant).toBe('full');
  });

  it('holds no data: the fence\'s own text is ignored', async () => {
    const { el, child } = processFence(WARDEN, 'name: Impostor\nhp: 1');
    act(() => child.onload());
    await waitFor(() => expect(sheetOf(el)?.textContent).toContain('Marsh Warden'));
    expect(el.textContent).not.toContain('Impostor');
  });

  it('draws a Fantasy Statblocks note too, with the auto template while the plugin is missing', async () => {
    unloadFantasyStatblocks();
    const { el, child } = processFence('Bestiary/Goblin.md');
    act(() => child.onload());
    await waitFor(() => expect(sheetOf(el)?.textContent).toContain('Goblin'));
  });

  it('follows its note when the note is renamed', async () => {
    const { el, child } = processFence(WARDEN);
    act(() => child.onload());
    await waitFor(() => expect(sheetOf(el)?.textContent).toContain('Marsh Warden'));

    const renamed = 'Bestiary/Bog Warden.md';
    addNote(current, renamed, { ...NATIVE, name: 'Bog Warden' });
    act(() => current.vault.trigger('rename', new TFile(renamed), WARDEN));
    await waitFor(() => expect(sheetOf(el)?.textContent).toContain('Bog Warden'));
  });

  it('unmounts the statblock when the section unloads', async () => {
    const { el, child } = processFence(WARDEN);
    act(() => child.onload());
    await waitFor(() => expect(sheetOf(el)).not.toBeNull());

    child.onunload();
    await act(async () => { await Promise.resolve(); });
    expect(el.childElementCount).toBe(0);
  });

  it('unloads cleanly before it was ever loaded, and only once', async () => {
    const { el, child } = processFence(WARDEN);
    child.onunload();
    act(() => child.onload());
    child.onunload();
    child.onunload();
    await act(async () => { await Promise.resolve(); });
    expect(el.childElementCount).toBe(0);
  });

  it('never writes to the note it shows', async () => {
    const refusals = forbidWrites(current.app);
    const { el, child } = processFence(WARDEN);
    act(() => child.onload());
    await waitFor(() => expect(sheetOf(el)).not.toBeNull());
    for (const refusal of refusals) expect(refusal).not.toHaveBeenCalled();
  });
});
