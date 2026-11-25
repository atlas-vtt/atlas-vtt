// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOOKS = path.join(__dirname, '../../styles/looks/atlas-looks.css');

/** `**text**` as Obsidian's source view and a line's active Live Preview draw it. */
const sourceBold = (text: string, extra = ''): string =>
  `<span class="cm-formatting cm-formatting-strong ${extra} cm-strong">**</span>` +
  `<span class="${extra} cm-strong">${text}</span>` +
  `<span class="cm-formatting cm-formatting-strong cm-formatting-strong-end ${extra} cm-strong">**</span>`;

/** The lines of one note in source view and in reading view, as Obsidian 1.15 draws them. */
const NOTE = `
<div class="markdown-source-view mod-cm6"><div class="cm-content">
  <div class="cm-line" data-line="words">${sourceBold('first')} ${sourceBold('second')} ${sourceBold('third')} 1d100</div>
  <div class="cm-line" data-line="list"><span class="cm-formatting cm-formatting-list cm-formatting-list-ul cm-list-1">- </span>${sourceBold('Weapons:', 'cm-list-1')}<span class="cm-list-1"> sword </span>${sourceBold('two', 'cm-list-1')}</div>
  <div class="cm-line" data-line="quote"><span class="cm-formatting cm-formatting-quote cm-formatting-quote-1 cm-quote cm-quote-1">&gt; </span>${sourceBold('a', 'cm-quote cm-quote-1')}<span class="cm-quote cm-quote-1"> and </span>${sourceBold('b', 'cm-quote cm-quote-1')}</div>
  <div class="cm-line HyperMD-table-2 HyperMD-table-row HyperMD-table-row-2" data-line="table"><span class="cm-hmd-table-sep cm-hmd-table-sep-dummy">|</span> ${sourceBold('cell')} <span class="cm-hmd-table-sep cm-hmd-table-sep-0">|</span> ${sourceBold('d6')} <span class="cm-hmd-table-sep cm-hmd-table-sep-dummy">|</span></div>
</div></div>
<div class="markdown-rendered">
  <p data-line="words"><strong>first</strong> <strong>second</strong> <strong>third</strong> 1d100</p>
  <ul><li data-line="list"><span class="list-bullet"></span><strong>Weapons:</strong> sword <strong>two</strong></li></ul>
  <blockquote><p data-line="quote"><strong>a</strong> and <strong>b</strong></p></blockquote>
  <table><tbody><tr data-line="table"><td><strong>cell</strong></td><td><strong>d6</strong></td></tr></tbody></table>
</div>`;

/** The bold words of each line that take the look's heading face, in one view of the note. */
function headingFaceWords(view: string): Record<string, string[]> {
  const words: Record<string, string[]> = {};
  for (const line of document.querySelectorAll<HTMLElement>(`${view} [data-line]`)) {
    words[line.dataset.line!] = [...line.querySelectorAll('strong, .cm-strong:not(.cm-formatting)')]
      .filter((bold) => getComputedStyle(bold).fontFamily.includes('--atlas-theme-heading-font'))
      .map((bold) => bold.textContent!);
  }
  return words;
}

describe.each([
  ['Medieval', 'atlas-look'],
  ['Sci-fi', 'atlas-look atlas-look-scifi'],
])('a note\'s bold lead-in under the %s look', (_look, classes) => {
  const style = document.createElement('style');

  beforeAll(() => {
    style.textContent = fs.readFileSync(LOOKS, 'utf8');
    document.head.append(style);
    document.body.className = `theme-dark ${classes}`;
    document.body.innerHTML = NOTE;
  });

  afterAll(() => {
    style.remove();
    document.body.className = '';
    document.body.innerHTML = '';
  });

  it('is only the bold that opens a line or list item, in reading view', () => {
    expect(headingFaceWords('.markdown-rendered')).toEqual({ words: ['first'], list: ['Weapons:'], quote: ['a'], table: [] });
  });

  it('is the same bold in the editor as in reading view', () => {
    expect(headingFaceWords('.markdown-source-view')).toEqual(headingFaceWords('.markdown-rendered'));
  });

  it('takes the closing marks of its own bold and no others', () => {
    const marks = [...document.querySelectorAll('.markdown-source-view [data-line="words"] .cm-formatting-strong')]
      .map((mark) => getComputedStyle(mark).fontFamily.includes('--atlas-theme-heading-font'));
    expect(marks).toEqual([true, true, false, false, false, false]);
  });
});
