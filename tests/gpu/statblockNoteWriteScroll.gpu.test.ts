import '../setup/obsidianDom';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import type { Editor } from 'obsidian';
import css from '../../styles/main.scss?inline';
import panelCss from '../../src/app/statblocks/editor/note-panel/note-statblock-panel.scss?inline';
import frameCss from '../../src/app/statblocks/editor/panel-frame/panel-frame.scss?inline';
import { STATBLOCK_EDIT_ORIGIN, writeToEditor } from '../../src/app/statblocks/notes/editorWrite';

/** Obsidian's rules for a Markdown view, as `statblockNotePanelLayout.gpu.test.ts` copies them. */
const OBSIDIAN = `
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.5 -apple-system, sans-serif; --header-height: 40px; }
  .workspace-leaf-content { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .view-header { height: var(--header-height); flex: none; }
  .view-content { width: 100%; height: calc(100% - var(--header-height)); }
  .markdown-source-view.mod-cm6 { height: 100%; display: flex; flex-direction: column; }
  .markdown-source-view .cm-editor { flex: 1 1; min-height: 0; }
  .markdown-source-view .cm-scroller { overflow: auto; }
`;
const BEFORE = `---\nname: Marsh Warden\nhp: 14\n---\n${'A line of the note.\n'.repeat(400)}`;
const AFTER = BEFORE.replace('hp: 14', 'hp: 15');

interface Mounted {
  content: HTMLElement;
  scroller: HTMLElement;
  panel: HTMLElement;
  cm: EditorView;
  editor: Editor;
}

const views: EditorView[] = [];

/** A decorated Markdown view `width` wide around a real CodeMirror, the caret at the note's start, as a note opens. */
function mount(width: number, stacked: boolean): Mounted {
  const frame = document.body.createDiv();
  frame.style.cssText = `position: relative; width: ${width}px; height: 800px;`;
  const container = frame.createDiv({ cls: ['workspace-leaf-content', 'atlas-sb-note'] });
  if (stacked) container.addClass('atlas-sb-note--stacked');
  container.createDiv({ cls: 'view-header' });
  const content = container.createDiv({ cls: 'view-content' });
  const source = content.createDiv({ cls: ['markdown-source-view', 'mod-cm6', 'is-live-preview'] });
  const panel = content.createDiv({ cls: ['atlas-vtt-plugin', 'atlas-sb-note-panel'] });
  panel.style.setProperty('--atlas-sb-panel-width', '500px');
  panel.createDiv({ cls: 'atlas-sb-note-panel__scroll' }).createDiv().style.height = '3000px';
  const cm = new EditorView({ doc: BEFORE, parent: source });
  views.push(cm);
  const editor = { cm, getValue: () => cm.state.doc.toString() } as unknown as Editor;
  return { content, scroller: source.querySelector<HTMLElement>('.cm-scroller')!, panel, cm, editor };
}

/** What Obsidian's `editor.transaction` dispatches for the same change (its bundle, 1.15): it always scrolls. */
function dispatchAsObsidianDoes(cm: EditorView): void {
  cm.dispatch({ changes: { from: BEFORE.indexOf('14'), to: BEFORE.indexOf('14') + 2, insert: '15' }, scrollIntoView: true, userEvent: STATBLOCK_EDIT_ORIGIN });
}

/** CodeMirror measures and scrolls in a frame of its own. */
async function settled(): Promise<void> {
  for (let frame = 0; frame < 4; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
}

describe('a write from the statblock beside its note', () => {
  const style = document.createElement('style');
  style.textContent = OBSIDIAN + css + panelCss + frameCss;

  beforeEach(async () => {
    await page.viewport(1400, 900);
    document.head.append(style);
  });

  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
    style.remove();
    document.body.replaceChildren();
  });

  it('leaves the one scroll of a stacked panel and note where it is', async () => {
    const { content, editor, cm } = mount(640, true);
    await settled();
    content.scrollTop = 1500;
    await settled();
    writeToEditor(editor, BEFORE, AFTER);
    await settled();
    expect(cm.state.doc.toString()).toBe(AFTER);
    expect(content.scrollTop).toBe(1500);
  });

  it('would jump there the way Obsidian\'s own transaction asks, to the caret under the statblock', async () => {
    const { content, panel, cm } = mount(640, true);
    await settled();
    content.scrollTop = 1500;
    await settled();
    dispatchAsObsidianDoes(cm);
    await settled();
    // The end of the statblock and the top of the note, the caret's line: what the report's video shows.
    const view = content.getBoundingClientRect();
    const caretLine = cm.coordsAtPos(cm.state.selection.main.head)!;
    expect(content.scrollTop).not.toBe(1500);
    expect(caretLine.top).toBeGreaterThanOrEqual(view.top);
    expect(caretLine.bottom).toBeLessThanOrEqual(view.bottom);
    const panelEnd = panel.getBoundingClientRect().bottom;
    expect(panelEnd).toBeGreaterThan(view.top);
    expect(panelEnd).toBeLessThan(view.bottom);
  });

  it('leaves the note where it is beside a wide panel', async () => {
    const { scroller, editor } = mount(1200, false);
    await settled();
    scroller.scrollTop = 1500;
    await settled();
    expect(scroller.scrollTop).toBe(1500);
    writeToEditor(editor, BEFORE, AFTER);
    await settled();
    expect(scroller.scrollTop).toBe(1500);
  });
});
