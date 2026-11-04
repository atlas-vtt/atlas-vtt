// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { moveStatblocks } from '../../../../src/app/statblocks/editor/fs-import/statblockMove';
import { noteFsLayout, notesUsingLayout } from '../../../../src/app/statblocks/fs/fsLayoutNotes';
import { layoutGroupsOfNotes, statblocksUsingLayout } from '../../../../src/app/statblocks/fs/fsLayoutStatblocks';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';
import { MARSH_LAYOUT, PLAIN_LAYOUT, withFsPlugin, withoutFsPlugin } from './fsImportKit';

const fs = (layout?: string, extra = ''): string => `---\nstatblock: true\nname: Bog\n${layout ? `layout: ${layout}\n` : ''}hp: 7\n${extra}---\nThe bog.\n`;
const NOTES = {
  'Bestiary/Bog.md': fs('Marsh layout'),
  'Bestiary/Fen.md': fs('marsh-layout'),
  'Bestiary/Mire.md': fs(),
  'Bestiary/Elsewhere.md': fs('Unknown layout'),
  'Bestiary/Native.md': fs('Marsh layout', 'atlas-template: builtin:generic-creature\n'),
  'Notes/Plain.md': '---\nlayout: Marsh layout\n---\nNot a statblock.\n',
};
const fence = (body: string): string => `\`\`\`statblock\n${body}\`\`\`\n`;
const FENCES = {
  'Fences/Hag.md': `She waits.\n${fence('layout: Marsh layout\nname: Hag\n')}`,
  'Fences/Ford.md': `---\nstatblock: inline\n---\n${fence('monster: Goblin\n')}`,
  'Fences/Broken.md': fence('layout: marsh-layout\nname: [unclosed\n'),
  'Fences/Example.md': `\`\`\`\`markdown\n${fence('layout: Marsh layout\n')}\`\`\`\`\n`,
  'Fences/Code.md': '```js\nconst layout = "Marsh layout";\n```\n',
};
const MARSH = { id: 'marsh-layout', name: 'Marsh layout' };

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

afterEach(() => {
  withoutFsPlugin(app());
  NoteFieldWriter.release(harness.app);
});

describe('the notes a layout draws', () => {
  it('reads them as Fantasy Statblocks does: the layout named by name or id, else the plugin\'s default', () => {
    harness = noteHarness(NOTES);
    withFsPlugin(app());
    expect(notesUsingLayout(app(), MARSH)).toEqual(['Bestiary/Bog.md', 'Bestiary/Fen.md']);
    // A layout the plugin does not know falls back to its default, as the plugin draws it.
    expect(notesUsingLayout(app(), { id: PLAIN_LAYOUT.id, name: PLAIN_LAYOUT.name })).toEqual(['Bestiary/Elsewhere.md', 'Bestiary/Mire.md']);
    expect(notesUsingLayout(app(), MARSH, ['Bestiary/Fen.md', 'Bestiary/Mire.md'])).toEqual(['Bestiary/Fen.md']);
    expect(noteFsLayout(app(), { statblock: true, layout: 'Marsh layout' })).toBe(MARSH_LAYOUT);
    expect(noteFsLayout(app(), { statblock: true })).toBe(PLAIN_LAYOUT);
  });

  it('reads them by the name they give without the plugin, and none for a note that gives none', () => {
    harness = noteHarness(NOTES);
    expect(notesUsingLayout(app(), MARSH)).toEqual(['Bestiary/Bog.md', 'Bestiary/Fen.md']);
    expect(noteFsLayout(app(), { statblock: true, layout: 'Marsh layout' })).toBeNull();
  });

  it('counts the notes of code blocks drawn with a layout too, by the fence\'s layout: else the plugin\'s default', async () => {
    harness = noteHarness({ ...NOTES, ...FENCES });
    withFsPlugin(app());
    expect(await statblocksUsingLayout(app(), MARSH)).toEqual({
      frontmatter: ['Bestiary/Bog.md', 'Bestiary/Fen.md'],
      // A fence inside another code block is no statblock.
      fences: ['Fences/Hag.md'],
    });
    expect(await statblocksUsingLayout(app(), { id: PLAIN_LAYOUT.id, name: PLAIN_LAYOUT.name })).toEqual({
      frontmatter: ['Bestiary/Elsewhere.md', 'Bestiary/Mire.md'],
      // A fence whose YAML cannot be read names no layout: the default draws it (as an error), and the batch says why it is left.
      fences: ['Fences/Broken.md', 'Fences/Ford.md'],
    });
    expect(await statblocksUsingLayout(app(), MARSH, ['Fences/Hag.md', 'Bestiary/Mire.md'])).toEqual({ frontmatter: [], fences: ['Fences/Hag.md'] });
  });

  it('groups the statblocks of a collection by the layout that draws them, of both kinds, the most used first', async () => {
    harness = noteHarness({ ...NOTES, ...FENCES });
    withFsPlugin(app());
    const paths = [...Object.keys(NOTES), 'Bestiary/Bog.md', 'Fences/Hag.md', 'Fences/Ford.md', 'Fences/Code.md'];
    expect(await layoutGroupsOfNotes(app(), paths)).toEqual([
      { layout: MARSH, statblocks: { frontmatter: ['Bestiary/Bog.md', 'Bestiary/Fen.md'], fences: ['Fences/Hag.md'] } },
      { layout: { id: 'plain-layout', name: 'Plain layout' }, statblocks: { frontmatter: ['Bestiary/Elsewhere.md', 'Bestiary/Mire.md'], fences: ['Fences/Ford.md'] } },
    ]);
  });

  it('reads the names layouts give without the plugin, for both kinds', async () => {
    harness = noteHarness({ ...NOTES, ...FENCES });
    expect(await layoutGroupsOfNotes(app(), [...Object.keys(NOTES), ...Object.keys(FENCES)])).toEqual([
      { layout: { id: 'Marsh layout', name: 'Marsh layout' }, statblocks: { frontmatter: ['Bestiary/Bog.md'], fences: ['Fences/Hag.md'] } },
      { layout: { id: 'marsh-layout', name: 'marsh-layout' }, statblocks: { frontmatter: ['Bestiary/Fen.md'], fences: [] } },
      { layout: { id: 'Unknown layout', name: 'Unknown layout' }, statblocks: { frontmatter: ['Bestiary/Elsewhere.md'], fences: [] } },
    ]);
  });
});

describe('moving frontmatter statblocks', () => {
  it('writes atlas-template alone into each note, keeping layout: and every value', async () => {
    harness = noteHarness(NOTES);
    const result = await moveStatblocks(app(), { frontmatter: ['Bestiary/Bog.md', 'Bestiary/Fen.md'], fences: [] }, 'marsh-layout-k7m2qa');
    expect(result).toEqual({ moved: ['Bestiary/Bog.md', 'Bestiary/Fen.md'], skipped: [], notReached: [] });
    expect(harness.files.get('Bestiary/Bog.md')).toBe(
      '---\nstatblock: true\nname: Bog\nlayout: Marsh layout\nhp: 7\natlas-template: marsh-layout-k7m2qa\n---\nThe bog.\n',
    );
  });

  it('adopts a note whose atlas-template is empty, as it names no template', async () => {
    harness = noteHarness({ 'Bestiary/Blank.md': fs('Marsh layout', 'atlas-template: ""\n'), 'Bestiary/Bare.md': fs('Marsh layout', 'atlas-template:\n') });
    const result = await moveStatblocks(app(), { frontmatter: ['Bestiary/Bare.md', 'Bestiary/Blank.md'], fences: [] }, 'marsh-layout-k7m2qa');
    expect(result).toEqual({ moved: ['Bestiary/Bare.md', 'Bestiary/Blank.md'], skipped: [], notReached: [] });
    // The patcher keeps the value's own quoting.
    expect(harness.files.get('Bestiary/Blank.md')).toContain('atlas-template: "marsh-layout-k7m2qa"\n');
    expect(harness.files.get('Bestiary/Bare.md')).toContain('atlas-template: marsh-layout-k7m2qa\n');
  });

  it('leaves a note that names a template meanwhile, and stops at Cancel', async () => {
    harness = noteHarness({ ...NOTES, 'Bestiary/Pool.md': fs('Marsh layout') });
    const cancel = new AbortController();
    // The batch goes by path: Bog, Native, then Pool, which Cancel keeps it from.
    const result = await moveStatblocks(app(), { frontmatter: ['Bestiary/Native.md', 'Bestiary/Pool.md', 'Bestiary/Bog.md'], fences: [] }, 'marsh-layout-k7m2qa', {
      signal: cancel.signal,
      onProgress: (done) => { if (done === 2) cancel.abort(); },
    });
    expect(result).toEqual({
      moved: ['Bestiary/Bog.md'],
      skipped: [{ path: 'Bestiary/Native.md', reason: 'Its template was changed meanwhile.' }],
      notReached: ['Bestiary/Pool.md'],
    });
    expect(harness.files.get('Bestiary/Native.md')).toBe(NOTES['Bestiary/Native.md']);
    expect(harness.files.get('Bestiary/Pool.md')).toBe(fs('Marsh layout'));
  });
});
