// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { readPinNote } from '../../src/app/online/gm/pins/foundNotes';
import { openPinNote } from '../../src/app/services/noteHeadings';
import { remapPaths } from '../../src/app/services/collectionBundle/pathRemap';
import { movedPathOf, rewriteMapReferences } from '../../src/app/services/renamedPaths';
import { noteLinkTitle } from '../../src/app/utils/pathUtils';

const NOTE = new TFile('Book/Chapter.md');
const TEXT = '# Inn\nInn text\n## Overview\nInn overview\n# Stag\n## Overview\nStag overview\n## Overview\nStag again\n';

/** The headings of TEXT as the metadata cache holds them. */
function cacheOf(text: string): { headings: Array<{ heading: string; level: number; position: { start: { line: number; offset: number }; end: { line: number; offset: number } } }> } {
  let offset = 0;
  const headings = text.split('\n').flatMap((line, index) => {
    const start = offset;
    offset += line.length + 1;
    const match = /^(#+) (.*)$/.exec(line);
    if (!match) return [];
    return [{ heading: match[2]!, level: match[1]!.length, position: { start: { line: index, offset: start }, end: { line: index, offset: start + line.length } } }];
  });
  return { headings };
}

function appWithNote(text = TEXT): App {
  const app = new App();
  app.vault = { getAbstractFileByPath: (path: string) => (path === NOTE.path ? NOTE : null), cachedRead: async () => text };
  app.metadataCache = { getFileCache: () => cacheOf(text), getFirstLinkpathDest: (link: string) => (link === 'Chapter' ? NOTE : null) };
  app.workspace = { openLinkText: vi.fn(async () => undefined) };
  return app;
}

describe('what players read of a repeated heading', () => {
  it.each([
    ['Book/Chapter.md#Inn#Overview', 'Inn overview'],
    ['Book/Chapter.md#Stag#Overview', 'Stag overview'],
    ['Book/Chapter.md#Stag#Overview#', 'Stag again'],
  ])('%s', async (link, body) => {
    const reading = await readPinNote(appWithNote(), link, 'map.atlasmap');
    expect(reading?.title).toBe('Overview');
    expect(reading?.body.trim()).toBe(body);
  });

  it('reads nothing once the counted heading is gone, so players are sent no other section', async () => {
    expect(await readPinNote(appWithNote(), 'Book/Chapter.md#Stag#Overview##', 'map.atlasmap')).toBeNull();
  });

  it.each([
    ['a path whose section lost the heading', '# Inn\nInn text\n# Secrets\n## Overview\nThe secret\n', 'Book/Chapter.md#Inn#Overview'],
    ['a count past the headings of its section', '# Inn\n## Overview\nInn overview\n# Secrets\n## Overview\nThe secret\n', 'Book/Chapter.md#Inn#Overview#'],
  ])('reads nothing for %s, so players are sent no other section', async (_, text, link) => {
    expect(await readPinNote(appWithNote(text), link, 'map.atlasmap')).toBeNull();
  });

  it('reads a heading alone in the note the link stands in, and nothing for a map', async () => {
    expect((await readPinNote(appWithNote(), '#Inn', NOTE.path))?.body.trim()).toBe('Inn text\n## Overview\nInn overview');
    expect(await readPinNote(appWithNote(), '#Inn', 'map.atlasmap')).toBeNull();
  });

  it('keeps a link of an older pin on the first of them', async () => {
    const reading = await readPinNote(appWithNote(), 'Book/Chapter.md#Overview', 'map.atlasmap');
    expect(reading?.body.trim()).toBe('Inn overview');
  });
});

describe('opening a pin in a tab', () => {
  it('hands Obsidian the link where its own reading finds the heading', async () => {
    const app = appWithNote();
    await openPinNote(app, 'Book/Chapter.md#Stag#Overview', true);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Book/Chapter.md#Stag#Overview', '', true);
  });

  it('opens a link that counts past the first at the line of its heading', async () => {
    const app = appWithNote();
    await openPinNote(app, 'Book/Chapter.md#Stag#Overview#', false);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Book/Chapter.md', '', false, { eState: { line: 7 } });
  });

  it.each([
    ['a heading in another case', '# Overview\ntext\n# overview\n', 'overview', 2],
    ['a heading with other marks', '# Foo: Bar\ntext\n# Foo Bar\n', 'Foo Bar', 2],
    ['the first of a repeated heading holding a #', '# Room #3\ntext\n# Room #3\n', 'Room #3', 0],
    ['a unique heading holding a #', '# Keep\ntext\n# Room #3\n', 'Room #3', 2],
  ])('opens %s at its line, as Obsidian reads the link elsewhere or nowhere', async (_, text, heading, line) => {
    const app = appWithNote(text);
    await openPinNote(app, `Book/Chapter.md#${heading}`, true);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Book/Chapter.md', '', true, { eState: { line } });
  });

  it('opens the note itself where a path names nothing Obsidian would walk on from', async () => {
    const app = appWithNote('# Inn\ntext\n# Secrets\n## Overview\n');
    await openPinNote(app, 'Book/Chapter.md#Inn#Overview', true);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Book/Chapter.md', '', true);
  });

  it('hands Obsidian a link to a heading the note does not hold, as ever', async () => {
    const app = appWithNote();
    await openPinNote(app, 'Book/Chapter.md#Tower', true);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Book/Chapter.md#Tower', '', true);
  });

  it('finds a note the link names from the map, and opens its counted heading at its line', async () => {
    const app = appWithNote();
    await openPinNote(app, 'Chapter#Stag#Overview#', true, 'Maps/map.atlasmap');
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Book/Chapter.md', 'Maps/map.atlasmap', true, { eState: { line: 7 } });
  });
});

describe('a pin link on its way', () => {
  it('follows a renamed note with its whole heading part', () => {
    const pin = { notePath: 'Book/Chapter.md#Stag#Overview#' };
    rewriteMapReferences({ objects: { pins: { p: pin } } }, movedPathOf([{ from: 'Book/Chapter.md', to: 'Book/Renamed.md' }]));
    expect(pin.notePath).toBe('Book/Renamed.md#Stag#Overview#');
  });

  it('follows a note a bundle puts elsewhere with its whole heading part', () => {
    const map = new Map([['Book/Chapter.md', 'Imported/Chapter.md']]);
    expect(remapPaths({ notePath: 'Book/Chapter.md#Stag#Overview#' }, map).notePath).toBe('Imported/Chapter.md#Stag#Overview#');
  });
});

describe('noteLinkTitle', () => {
  it('reads a path and leaves a # within a heading', () => {
    expect(noteLinkTitle('Places/Keep.md')).toBe('Keep');
    expect(noteLinkTitle('Places/Keep.md#Dungeon')).toBe('Keep > Dungeon');
    expect(noteLinkTitle('Places/Keep.md#Stag#Overview##')).toBe('Keep > Stag > Overview');
    expect(noteLinkTitle('Places/Keep.md#Room #3')).toBe('Keep > Room #3');
  });
});
