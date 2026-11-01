// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { App, TFile } from 'obsidian';
import { findEditorHeading, findRenderedHeading, linkedHeading, type LinkedHeading } from '../../src/app/services/noteHeadings';

const NOTE = new TFile('Dungeon.md');

function appWithHeadings(headings: Array<[heading: string, line: number, level?: number]>): App {
  const app = new App();
  const cache = { headings: headings.map(([heading, line, level = 2]) => ({ heading, level, position: { start: { line } } })) };
  app.metadataCache = { getFileCache: (): typeof cache => cache };
  return app;
}

/** A CodeMirror editor marking `headingLines` (0-based) as heading lines, as Obsidian's markdown mode does. */
function editorWithHeadings(parent: HTMLElement, lines: string[], headingLines: number[]): EditorView {
  const doc = EditorState.create({ doc: lines.join('\n') }).doc;
  const builder = new RangeSetBuilder<Decoration>();
  headingLines.forEach((line) => {
    const from = doc.line(line + 1).from;
    builder.add(from, from, Decoration.line({ class: 'HyperMD-header' }));
  });
  const state = EditorState.create({ doc, extensions: EditorView.decorations.of(builder.finish()) });
  return new EditorView({ state, parent });
}

describe('linkedHeading', () => {
  it('finds a heading containing # by its exact text', () => {
    const app = appWithHeadings([['Room #2', 4], ['Room #3', 9]]);
    expect(linkedHeading(app, NOTE, 'Room #3')?.line).toBe(9);
  });

  it('resolves a nested heading link written by hand', () => {
    const app = appWithHeadings([['Cellar', 2, 2], ['Keep', 6, 1], ['Cellar', 8, 2]]);
    expect(linkedHeading(app, NOTE, 'Keep#Cellar')).toEqual({ text: 'Cellar', line: 8, occurrence: 1, count: 2 });
  });

  it('tells which of its name a counted link means', () => {
    const app = appWithHeadings([['Loot', 2], ['Exit', 4], ['Loot', 6], ['Loot', 8]]);
    expect(linkedHeading(app, NOTE, 'Loot##')).toEqual({ text: 'Loot', line: 8, occurrence: 2, count: 3 });
  });

  it('is null when the note lacks the heading', () => {
    expect(linkedHeading(appWithHeadings([['Keep', 1]]), NOTE, 'Tower')).toBeNull();
  });
});

describe('findEditorHeading', () => {
  let editor: EditorView | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
    document.body.empty();
  });

  it('finds the heading line by its place in the note, whatever live preview draws', () => {
    const container = document.body.createDiv();
    editor = editorWithHeadings(container, ['# Keep', 'text', '## [[Alula|The city]] market', 'text', '## Tower'], [0, 2, 4]);
    const found = findEditorHeading(container, 2);
    expect(found?.textContent).toBe('## [[Alula|The city]] market');
  });

  it('is null while the line is not a drawn heading', () => {
    const container = document.body.createDiv();
    editor = editorWithHeadings(container, ['# Keep', 'text'], [0]);
    expect(findEditorHeading(container, 1)).toBeNull();
    expect(findEditorHeading(container, 40)).toBeNull();
  });
});

describe('findRenderedHeading', () => {
  afterEach(() => document.body.empty());

  const rendered = (container: HTMLElement, heading: string, top: number): HTMLElement => {
    const element = container.createEl('h2', { text: heading.replace(/[[\]*]/g, '') });
    element.dataset.heading = heading;
    element.getBoundingClientRect = (): DOMRect => ({ top }) as DOMRect;
    return element;
  };

  const only = (text: string): LinkedHeading => ({ text, line: 0, occurrence: 0, count: 1 });

  it('matches the source text Obsidian keeps in data-heading, # marks and links included', () => {
    const container = document.body.createDiv();
    rendered(container, '1 Suspect', 0);
    const suspect = rendered(container, '#1 Suspect', 40);
    const market = rendered(container, '[[Alula|The city]] market', 80);
    expect(findRenderedHeading(container, only('#1 Suspect'))).toBe(suspect);
    expect(findRenderedHeading(container, only('[[Alula|The city]] market'))).toBe(market);
  });

  it('picks the repeated heading nearest the top while not all of its name are drawn', () => {
    const container = document.body.createDiv();
    container.getBoundingClientRect = (): DOMRect => ({ top: 100 }) as DOMRect;
    rendered(container, 'Loot', -400);
    const nearTop = rendered(container, 'Loot', 110);
    rendered(container, 'Loot', 900);
    expect(findRenderedHeading(container, { text: 'Loot', line: 30, occurrence: 4, count: 9 })).toBe(nearTop);
  });

  it('counts to the very heading when all of its name are drawn, however far it is from the top', () => {
    const container = document.body.createDiv();
    container.getBoundingClientRect = (): DOMRect => ({ top: 100 }) as DOMRect;
    rendered(container, 'Loot', 100);
    const second = rendered(container, 'Loot', 700);
    expect(findRenderedHeading(container, { text: 'Loot', line: 30, occurrence: 1, count: 2 })).toBe(second);
  });

  it('takes the view\'s word for the line a drawn heading is on', () => {
    const container = document.body.createDiv();
    container.getBoundingClientRect = (): DOMRect => ({ top: 100 }) as DOMRect;
    const first = rendered(container, 'Loot', 100);
    const second = rendered(container, 'Loot', 500);
    const lines = new Map([[first, 50], [second, 80]]);
    const lineOf = (element: HTMLElement): number | null => lines.get(element) ?? null;
    expect(findRenderedHeading(container, { text: 'Loot', line: 80, occurrence: 8, count: 9 }, lineOf)).toBe(second);
  });
});
