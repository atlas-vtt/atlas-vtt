// @vitest-environment jsdom
import { StreamLanguage } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { editorLivePreviewField } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editorDiceExtension } from '../../src/app/noteDice/editorDice';
import { EDITOR_DICE_CLASS, editorDiceMarks } from '../../src/app/noteDice/editorDiceMarks';

interface Scan {
  fence: boolean;
  code: boolean;
}

/** A stand-in for Obsidian's Markdown parser, giving code, links and frontmatter the token names Obsidian gives them. */
const markdownLike = StreamLanguage.define<Scan>({
  // Obsidian keeps its token names as node names; a stream language does so for the names it knows.
  tokenTable: Object.fromEntries(
    ['formatting', 'formatting-code', 'formatting-code-block', 'hmd-codeblock', 'inline-code', 'hmd-internal-link'].map((name) => [name, tags.content]),
  ),
  startState: () => ({ fence: false, code: false }),
  token(stream, scan) {
    if (stream.sol() && stream.match('```')) {
      scan.fence = !scan.fence;
      stream.skipToEnd();
      return 'formatting-code-block hmd-codeblock';
    }
    if (scan.fence) {
      stream.skipToEnd();
      return 'hmd-codeblock';
    }
    if (stream.eat('`')) {
      scan.code = !scan.code;
      return 'formatting formatting-code inline-code';
    }
    if (scan.code) {
      stream.eatWhile(/[^`]/);
      return 'inline-code';
    }
    if (stream.match(/^\[\[[^\]]*\]\]/)) return 'hmd-internal-link';
    if (!stream.eatWhile(/[^`[]/)) stream.next();
    return null;
  },
});

function stateOf(doc: string, livePreview = true): EditorState {
  return EditorState.create({ doc, extensions: [markdownLike, editorLivePreviewField.init(() => livePreview)] });
}

/** The text and formula of every mark in `ranges` (the whole note by default). */
function marked(doc: string, ranges?: { from: number; to: number }[]): Array<[string, string]> {
  const state = stateOf(doc);
  const out: Array<[string, string]> = [];
  editorDiceMarks(state, ranges ?? [{ from: 0, to: doc.length }]).between(0, doc.length, (from, to, mark) => {
    out.push([state.sliceDoc(from, to), String(mark.spec.attributes?.['data-formula'])]);
  });
  return out;
}

describe('editorDiceMarks', () => {
  it('marks the rolls of running text as Reading view links them', () => {
    expect(marked('Longsword. +5 to hit, 1d8+3 slashing, 3 goblins')).toEqual([
      ['+5', '+5'],
      ['1d8+3', '1d8+3'],
    ]);
  });

  it('marks inline code only where it holds a whole formula', () => {
    expect(marked('Roll `2d6+3` or `dice: 1d20+5`, not `version 2d6`')).toEqual([
      ['2d6+3', '2d6+3'],
      ['dice: 1d20+5', '1d20+5'],
    ]);
  });

  it('leaves code blocks and links alone', () => {
    expect(marked('```\n2d6\n```\n[[Goblin 1d4]] hits for 1d6')).toEqual([['1d6', '1d6']]);
  });

  it('never runs a roll over the end of a line', () => {
    expect(marked('1d6 +\n2 damage')).toEqual([['1d6', '1d6']]);
  });

  it('reads only the ranges asked for', () => {
    const doc = 'First 1d4\nSecond 1d6\nThird 1d8';
    const second = doc.indexOf('Second');
    expect(marked(doc, [{ from: second, to: second + 'Second 1d6'.length }])).toEqual([['1d6', '1d6']]);
  });
});

describe('editorDiceExtension', () => {
  // jsdom lays out no text, and the editor measures where a plain press places the cursor.
  Range.prototype.getClientRects = (): DOMRectList => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect();

  let view: EditorView | null = null;
  afterEach(() => {
    view?.destroy();
    view = null;
  });

  function mount(doc: string, livePreview: boolean, roll = vi.fn()): HTMLElement {
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdownLike, editorLivePreviewField.init(() => livePreview), editorDiceExtension(roll)],
      }),
      parent: document.body,
    });
    return view.contentDOM;
  }

  function press(target: Element, init: MouseEventInit): MouseEvent {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init });
    target.dispatchEvent(event);
    return event;
  }

  it('rolls a marked roll on Ctrl-click, with Shift for advantage and Alt for disadvantage', () => {
    const roll = vi.fn();
    const dice = mount('Hits for 2d6+3', true, roll).querySelector(`.${EDITOR_DICE_CLASS}`);
    expect(dice?.textContent).toBe('2d6+3');

    expect(press(dice!, { ctrlKey: true }).defaultPrevented).toBe(true);
    press(dice!, { ctrlKey: true, shiftKey: true });
    press(dice!, { ctrlKey: true, altKey: true });
    expect(roll.mock.calls.map(([formula, side]) => [formula, side])).toEqual([
      ['2d6+3', null],
      ['2d6+3', 'advantage'],
      ['2d6+3', 'disadvantage'],
    ]);
  });

  it('leaves a plain click to the editor', () => {
    const roll = vi.fn();
    const dice = mount('Hits for 2d6+3', true, roll).querySelector(`.${EDITOR_DICE_CLASS}`);
    press(dice!, {});
    press(dice!, { shiftKey: true });
    expect(roll).not.toHaveBeenCalled();
  });

  it('marks nothing in source mode', () => {
    expect(mount('Hits for 2d6+3', false).querySelector(`.${EDITOR_DICE_CLASS}`)).toBeNull();
  });

  it('follows the text as it is typed', () => {
    const content = mount('Hits for', true);
    view!.dispatch({ changes: { from: view!.state.doc.length, insert: ' 1d10' } });
    expect(content.querySelector(`.${EDITOR_DICE_CLASS}`)?.textContent).toBe('1d10');
  });
});
