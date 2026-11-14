// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { moveStatblocks, moveWithStatblockValues } from '../../../../src/app/statblocks/editor/fs-import/statblockMove';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';
import { withFsPlugin, withoutFsPlugin } from './fsImportKit';

const TEMPLATE = 'marsh-layout-k7m2qa';
const fence = (body: string): string => `\`\`\`statblock\n${body}\`\`\`\n`;
const FRONTMATTER = '---\nstatblock: true\nname: Bog\nlayout: Marsh layout\nhp: 7\n---\nThe bog.\n';
const HAG_BODY_BEFORE = 'She waits.\n\n';
const HAG_BODY_AFTER = '\n## Lair\n\nReeds and mud.\n';
const HAG = `---\ntags: marsh\n---\n${HAG_BODY_BEFORE}${fence('layout: Marsh layout\nname: Fen hag\nhp: 9\n')}${HAG_BODY_AFTER}`;
const GOBLIN = `Ambush at the ford.\n${fence('monster: Goblin\nhp: 12\n')}`;

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

afterEach(() => {
  withoutFsPlugin(app());
  NoteFieldWriter.release(harness.app);
});

/** Fantasy Statblocks with a bestiary that knows a goblin. */
function withGoblin(): void {
  withFsPlugin(app());
  Object.assign(window, {
    FantasyStatblocks: {
      isResolved: () => true,
      hasCreature: (name: string) => name === 'Goblin',
      getCreatureFromBestiary: () => ({ name: 'Goblin', hp: 7, ac: 15, layout: 'Basic layout' }),
      getBestiaryCreatures: () => [],
    },
  });
}

describe('moving statblocks to Atlas (§6.4)', () => {
  it('gives frontmatter statblocks the template in place and moves a fence into its own note\'s properties', async () => {
    harness = noteHarness({ 'Bestiary/Bog.md': FRONTMATTER, 'Bestiary/Fen hag.md': HAG });
    const result = await moveStatblocks(app(), { frontmatter: ['Bestiary/Bog.md'], fences: ['Bestiary/Fen hag.md'] }, TEMPLATE);
    expect(result).toEqual({ moved: ['Bestiary/Bog.md', 'Bestiary/Fen hag.md'], skipped: [], notReached: [] });
    expect(harness.files.get('Bestiary/Bog.md')).toBe(FRONTMATTER.replace('hp: 7\n', `hp: 7\natlas-template: ${TEMPLATE}\n`));
    expect(harness.files.get('Bestiary/Fen hag.md')).toBe(
      `---\ntags: marsh\nstatblock: true\natlas-template: ${TEMPLATE}\nname: Fen hag\nlayout: Marsh layout\nhp: 9\n---\n${HAG_BODY_BEFORE}${HAG_BODY_AFTER}`,
    );
  });

  it('takes the values of the bestiary creature a fence names, the fence\'s own on top, and no layout the fence does not name', async () => {
    harness = noteHarness({ 'Encounters/Ford.md': GOBLIN });
    withGoblin();
    const result = await moveStatblocks(app(), { frontmatter: [], fences: ['Encounters/Ford.md'] }, TEMPLATE);
    expect(result.moved).toEqual(['Encounters/Ford.md']);
    expect(harness.files.get('Encounters/Ford.md')).toBe(`---\nstatblock: true\natlas-template: ${TEMPLATE}\nname: Goblin\nhp: 12\nac: 15\n---\nAmbush at the ford.\n`);
  });

  it('leaves the notes it cannot move safely as they were, each with why', async () => {
    const files = {
      'A/Two.md': `${fence('name: One\n')}\n${fence('name: Two\n')}`,
      'A/Unread.md': fence('name: [unclosed\n'),
      'A/Taken.md': `---\nhp: 3\n---\n${fence('name: Taken\nhp: 9\n')}`,
      'A/Unknown.md': fence('monster: Owlbear\n'),
      'A/Gone.md': 'No fence any more.\n',
    };
    harness = noteHarness(files);
    withGoblin();
    const result = await moveStatblocks(app(), { frontmatter: [], fences: Object.keys(files) }, TEMPLATE);
    expect(result.moved).toEqual([]);
    expect(Object.fromEntries(result.skipped.map(({ path, reason }) => [path, reason]))).toEqual({
      'A/Gone.md': 'Its statblock is no longer in the note.',
      'A/Taken.md': 'The note already holds other values for hp.',
      'A/Two.md': 'It holds 2 statblocks; only a note with one is moved.',
      'A/Unknown.md': 'Fantasy Statblocks has no creature named Owlbear.',
      'A/Unread.md': 'Its statblock can\'t be read.',
    });
    for (const [path, text] of Object.entries(files)) expect(harness.files.get(path)).toBe(text);
  });

  it('moves a note that holds the same value written another way, and says which notes only other values kept back', async () => {
    const TAKEN = `---\n# kept for a query\nlevel: 14\ntags: [marsh]\n---\nBefore.\n${fence('name: Taken\nlevel: Creature 14\nhp: 9\n')}After.\n`;
    const files = {
      'A/Alike.md': `---\nlevel: "3"\n---\n${fence('name: Alike\nlevel: 3\n')}`,
      'A/Taken.md': TAKEN,
      'A/Two.md': `${fence('name: One\n')}\n${fence('name: Two\n')}`,
    };
    const TWO = { path: 'A/Two.md', reason: 'It holds 2 statblocks; only a note with one is moved.' };
    harness = noteHarness(files);
    const first = await moveStatblocks(app(), { frontmatter: [], fences: Object.keys(files) }, TEMPLATE);
    expect(first.moved).toEqual(['A/Alike.md']);
    expect(harness.files.get('A/Alike.md')).toBe(`---\nlevel: "3"\nstatblock: true\natlas-template: ${TEMPLATE}\nname: Alike\n---\n`);
    expect(first.skipped).toEqual([{ path: 'A/Taken.md', reason: 'The note already holds other values for level.', conflicts: ['level'] }, TWO]);
    expect(harness.files.get('A/Taken.md')).toBe(TAKEN);

    // Told to, the batch moves those notes with their statblocks' values and leaves every other line and note alone.
    const progress: Array<[number, number]> = [];
    const second = await moveWithStatblockValues(app(), first, TEMPLATE, { onProgress: (done, total) => progress.push([done, total]) });
    expect(progress).toEqual([[1, 1]]);
    expect(second).toEqual({ moved: ['A/Alike.md', 'A/Taken.md'], skipped: [TWO], notReached: [] });
    expect(harness.files.get('A/Taken.md')).toBe(
      `---\n# kept for a query\nlevel: Creature 14\ntags: [marsh]\nstatblock: true\natlas-template: ${TEMPLATE}\nname: Taken\nhp: 9\n---\nBefore.\nAfter.\n`,
    );
    expect(harness.files.get('A/Two.md')).toBe(files['A/Two.md']);
  });

  it('leaves the notes a Cancel kept the second batch from as they were, still to be moved', async () => {
    const taken = (name: string): string => `---\nhp: 3\n---\n${fence(`name: ${name}\nhp: 9\n`)}`;
    harness = noteHarness({ 'A/One.md': taken('One'), 'A/Three.md': taken('Three'), 'A/Two.md': taken('Two') });
    const first = await moveStatblocks(app(), { frontmatter: [], fences: ['A/One.md', 'A/Three.md', 'A/Two.md'] }, TEMPLATE);
    expect(first.skipped.map(({ conflicts }) => conflicts)).toEqual([['hp'], ['hp'], ['hp']]);
    const cancel = new AbortController();
    const second = await moveWithStatblockValues(app(), first, TEMPLATE, { signal: cancel.signal, onProgress: () => cancel.abort() });
    expect(second.moved).toEqual(['A/One.md']);
    expect(second.skipped).toEqual(first.skipped.slice(1));
    expect(second.notReached).toEqual([]);
    expect(harness.files.get('A/One.md')).toBe(`---\nhp: 9\nstatblock: true\natlas-template: ${TEMPLATE}\nname: One\n---\n`);
    expect(harness.files.get('A/Three.md')).toBe(taken('Three'));
  });

  it('never writes a note whose properties cannot be read, with the statblock\'s values either', async () => {
    const broken = `---\nhp: 3\nhp: 4\n---\n${fence('name: Broken\nhp: 9\n')}`;
    harness = noteHarness({ 'A/Broken.md': broken });
    const first = await moveStatblocks(app(), { frontmatter: [], fences: ['A/Broken.md'] }, TEMPLATE);
    expect(first.skipped).toEqual([{ path: 'A/Broken.md', reason: expect.any(String) }]);
    // Even handed on as a note with other values, it is read again and left.
    const forced = { ...first, skipped: [{ ...first.skipped[0]!, conflicts: ['hp'] }] };
    const second = await moveWithStatblockValues(app(), forced, TEMPLATE);
    expect(second.moved).toEqual([]);
    expect(second.skipped).toEqual([{ path: 'A/Broken.md', reason: first.skipped[0]!.reason }]);
    expect(harness.files.get('A/Broken.md')).toBe(broken);
  });

  it('moves no fence that builds on a creature while Fantasy Statblocks cannot read it', async () => {
    harness = noteHarness({ 'Encounters/Ford.md': GOBLIN });
    const off = await moveStatblocks(app(), { frontmatter: [], fences: ['Encounters/Ford.md'] }, TEMPLATE);
    expect(off.skipped).toEqual([{ path: 'Encounters/Ford.md', reason: 'It is based on the creature Goblin; turn on Fantasy Statblocks to move it.' }]);
    withGoblin();
    Object.assign(window, { FantasyStatblocks: { ...(window as unknown as { FantasyStatblocks: object }).FantasyStatblocks, isResolved: () => false } });
    const reading = await moveStatblocks(app(), { frontmatter: [], fences: ['Encounters/Ford.md'] }, TEMPLATE);
    expect(reading.skipped[0]?.reason).toBe('Fantasy Statblocks is still reading its bestiary; try again in a moment.');
    expect(harness.files.get('Encounters/Ford.md')).toBe(GOBLIN);
  });

  it('changes an open note in its editor as one undo step', async () => {
    harness = noteHarness({ 'Bestiary/Fen hag.md': HAG });
    const view = harness.open('Bestiary/Fen hag.md');
    const result = await moveStatblocks(app(), { frontmatter: [], fences: ['Bestiary/Fen hag.md'] }, TEMPLATE);
    expect(result.moved).toEqual(['Bestiary/Fen hag.md']);
    expect(view.editor.transactions).toHaveLength(1);
    expect(view.editor.getValue()).not.toContain('```statblock');
    expect(view.editor.getValue()).toContain(`atlas-template: ${TEMPLATE}`);
    view.editor.undo();
    expect(view.editor.getValue()).toBe(HAG);
  });

  it('stops at Cancel; the notes not reached stay as they were', async () => {
    harness = noteHarness({ 'Bestiary/Bog.md': FRONTMATTER, 'Bestiary/Fen hag.md': HAG, 'Bestiary/Mire.md': FRONTMATTER });
    const cancel = new AbortController();
    const result = await moveStatblocks(
      app(), { frontmatter: ['Bestiary/Bog.md', 'Bestiary/Mire.md'], fences: ['Bestiary/Fen hag.md'] }, TEMPLATE,
      { signal: cancel.signal, onProgress: (done) => { if (done === 1) cancel.abort(); } },
    );
    expect(result).toEqual({ moved: ['Bestiary/Bog.md'], skipped: [], notReached: ['Bestiary/Fen hag.md', 'Bestiary/Mire.md'] });
    expect(harness.files.get('Bestiary/Fen hag.md')).toBe(HAG);
    expect(harness.files.get('Bestiary/Mire.md')).toBe(FRONTMATTER);
  });
});
