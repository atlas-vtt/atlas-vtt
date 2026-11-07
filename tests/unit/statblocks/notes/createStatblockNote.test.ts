// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TokenStatblockLinkService } from '../../../../src/app/services/TokenStatblockLinkService';
import { createStatblockNote, noteFileName, shownName, statblockNoteText } from '../../../../src/app/statblocks/notes/createStatblockNote';
import { templateBodyPath } from '../../../../src/app/statblocks/library/templatePaths';
import { statblockSourceFromText } from '../../../../src/app/statblocks/notes/statblockSource';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { noteHarness, type NoteHarness } from './noteHarness';

// The link service is tested on its own; its imports reach the canvas renderer.
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));

const TEMPLATE = 'builtin:generic-creature';

function linkService(): { linkTokenToStatblock: ReturnType<typeof vi.fn> } {
  const service = { linkTokenToStatblock: vi.fn(async () => true) };
  vi.mocked(TokenStatblockLinkService.getInstance).mockReturnValue(service as unknown as TokenStatblockLinkService);
  return service;
}

const harnesses: NoteHarness[] = [];
function vault(files: Record<string, string>): NoteHarness {
  const harness = noteHarness(files);
  harnesses.push(harness);
  return harness;
}

afterEach(() => {
  for (const harness of harnesses.splice(0)) TemplateLibrary.release(harness.app as unknown as App);
  vi.restoreAllMocks();
});

describe('statblockNoteText', () => {
  it('marks a native statblock with its template, name and token art, and leaves the body empty', () => {
    const text = statblockNoteText({ name: 'Marsh Warden', templateId: TEMPLATE, tokenImagePath: 'art/warden.webp' });

    expect(text).toBe('---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Marsh Warden\nimage: art/warden.webp\n---\n');
    expect(statblockSourceFromText(text)).toEqual({ kind: 'atlas', templateId: TEMPLATE });
  });

  it('writes the body below the frontmatter, as given', () => {
    const text = statblockNoteText({ name: 'Wolf', templateId: TEMPLATE, body: '## Tactics\n\nCircles.\n' });

    expect(text).toBe('---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Wolf\n---\n## Tactics\n\nCircles.\n');
  });

  it('quotes a name YAML would read as something else', () => {
    const text = statblockNoteText({ name: 'Yes: no #1', templateId: TEMPLATE });

    expect(text).toContain('name: "Yes: no #1"');
  });
});

describe('noteFileName', () => {
  it('replaces what a file name cannot carry', () => {
    expect(noteFileName(' Orc: chief [elite] ')).toBe('Orc- chief -elite-');
    expect(noteFileName('.hidden')).toBe('hidden');
    expect(noteFileName('   ')).toBe('New statblock');
  });
});

describe('createStatblockNote', () => {
  it('creates the note in the role folder, numbering a taken name in any letter case', async () => {
    linkService();
    const harness = vault({ 'Bestiary/Goblin.md': 'taken', 'Bestiary/goblin 2.md': 'taken' });

    const { file, linked } = await createStatblockNote(harness.app, { name: 'Goblin', templateId: TEMPLATE, folder: 'Bestiary' });

    expect(file.path).toBe('Bestiary/Goblin 3.md');
    expect(linked).toBe(false);
    expect(harness.files.get('Bestiary/Goblin 3.md')).not.toContain('atlas-statblock');
  });

  it('creates a missing role folder, and uses Obsidian\'s folder for new notes without one', async () => {
    linkService();
    const harness = vault({});

    expect((await createStatblockNote(harness.app, { name: 'Wolf', templateId: TEMPLATE, folder: 'World/Beasts' })).file.path).toBe('World/Beasts/Wolf.md');
    expect((await createStatblockNote(harness.app, { name: 'Bear', templateId: TEMPLATE })).file.path).toBe('Bear.md');
    expect(harness.folders.has('World/Beasts')).toBe(true);
  });

  it('writes the token\'s art and links the token to the new note', async () => {
    const service = linkService();
    const harness = vault({});

    const { file, linked } = await createStatblockNote(harness.app, { name: 'Warden', templateId: TEMPLATE, folder: 'Bestiary', tokenImagePath: 'art/warden.webp' });

    expect(linked).toBe(true);
    expect(harness.files.get(file.path)).toContain('image: art/warden.webp');
    expect(service.linkTokenToStatblock).toHaveBeenCalledWith('art/warden.webp', 'Bestiary/Warden.md');
  });

  it('starts the note with the text of the note beside its template\'s file', async () => {
    linkService();
    const harness = vault({ [MARSH_PATH]: marshText(), [templateBodyPath(MARSH_PATH)]: '## Lair\n\nWhere it sleeps.\n' });

    const { file } = await createStatblockNote(harness.app, { name: 'Bog Hag', templateId: MARSH_ID, folder: 'Bestiary' });

    const text = harness.files.get(file.path)!;
    expect(text.endsWith('---\n## Lair\n\nWhere it sleeps.\n')).toBe(true);
    expect(statblockSourceFromText(text)).toEqual({ kind: 'atlas', templateId: MARSH_ID });
  });

  it('starts the note empty below its frontmatter where the template has no note', async () => {
    linkService();
    const harness = vault({ [MARSH_PATH]: marshText() });

    const { file } = await createStatblockNote(harness.app, { name: 'Bog Hag', templateId: MARSH_ID });

    expect(harness.files.get(file.path)!.endsWith('---\n')).toBe(true);
  });

  it('names an unnamed statblock after its file, so note and card agree', async () => {
    linkService();
    const harness = vault({ 'New statblock.md': '' });

    const { file } = await createStatblockNote(harness.app, { name: 'New statblock', templateId: TEMPLATE });

    expect(file.path).toBe('New statblock 2.md');
    expect(harness.files.get(file.path)).toContain('name: New statblock 2');
  });
});

describe('shownName', () => {
  it('keeps a name the user gave, and takes the file name for none or the default', () => {
    expect(shownName('Goblin', 'Bestiary/Goblin 2.md')).toBe('Goblin');
    expect(shownName('', 'New statblock 3.md')).toBe('New statblock 3');
    expect(shownName('New statblock', 'Folder/New statblock 3.md')).toBe('New statblock 3');
  });
});
