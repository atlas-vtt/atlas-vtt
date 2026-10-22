// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { App, TFile } from 'obsidian';
import { findEditorHeading, findRenderedHeading, headingLine } from '../../src/app/services/noteHeadings';

const NOTE = new TFile('Dungeon.md');

function appWithHeadings(headings: Array<[heading: string, line: number]>): App {
  const app = new App();
  const cache = { headings: headings.map(([heading, line]) => ({ heading, level: 2, position: { start: { line } } })) };
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

describe('headingLine', () => {
  it('finds a heading containing # by its exact text', () => {
    const app = appWithHeadings([['Room #2', 4], ['Room #3', 9]]);
    expect(headingLine(app, NOTE, 'Room #3')).toBe(9);
  });

  it('resolves a nested heading link written by hand', () => {
    const app = appWithHeadings([['Cellar', 2], ['Keep', 6], ['Cellar', 8]]);
    expect(headingLine(app, NOTE, 'Keep#Cellar')).toBe(8);
  });

  it('is null when the note lacks the heading', () => {
    expect(headingLine(appWithHeadings([['Keep', 1]]), NOTE, 'Tower')).toBeNull();
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

  it('matches the source text Obsidian keeps in data-heading, # marks and links included', () => {
    const container = document.body.createDiv();
    rendered(container, '1 Suspect', 0);
    const suspect = rendered(container, '#1 Suspect', 40);
    const market = rendered(container, '[[Alula|The city]] market', 80);
    expect(findRenderedHeading(container, '#1 Suspect')).toBe(suspect);
    expect(findRenderedHeading(container, '[[Alula|The city]] market')).toBe(market);
  });

  it('picks the repeated heading nearest the top', () => {
    const container = document.body.createDiv();
    container.getBoundingClientRect = (): DOMRect => ({ top: 100 }) as DOMRect;
    rendered(container, 'Loot', -400);
    const nearTop = rendered(container, 'Loot', 110);
    rendered(container, 'Loot', 900);
    expect(findRenderedHeading(container, 'Loot')).toBe(nearTop);
  });
});
