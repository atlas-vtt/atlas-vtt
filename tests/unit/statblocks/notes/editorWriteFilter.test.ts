import { describe, expect, it } from 'vitest';
import type { Editor } from 'obsidian';
import { STATBLOCK_EDIT_ORIGIN, writeToEditor } from '../../../../src/app/statblocks/notes/editorWrite';
import { FakeEditor } from './noteHarness';

const BEFORE = '---\nname: Aboleth\nimage: art/aboleth.webp\ntoken-image: art/old.webp\n---\n';
const AFTER = '---\nname: Aboleth\n---\n';

type Spec = { changes: { from: number; to: number; insert: string }; filter?: false; userEvent: string };

/** An editor with a CodeMirror view; `dropsFiltered` makes its filters drop what they may, as Live Preview drops deleting a property naming an image. */
function editorWithView(dropsFiltered: boolean): { editor: FakeEditor; dispatched: Spec[] } {
  const dispatched: Spec[] = [];
  const editor: FakeEditor = Object.assign(new FakeEditor(BEFORE, () => undefined), {
    cm: {
      dispatch: (spec: Spec): void => {
        dispatched.push(spec);
        if (dropsFiltered && spec.filter !== false) return;
        const { from, to, insert } = spec.changes;
        editor.text = editor.text.slice(0, from) + insert + editor.text.slice(to);
      },
    },
  });
  return { editor, dispatched };
}

const CHANGE = { from: BEFORE.indexOf('image:'), to: BEFORE.indexOf('---\n', 4), insert: '' };

describe('writing into an editor', () => {
  it('goes to CodeMirror without asking to scroll, never through Obsidian\'s transaction, which always does', () => {
    const { editor, dispatched } = editorWithView(false);
    writeToEditor(editor as unknown as Editor, BEFORE, AFTER);
    expect(editor.getValue()).toBe(AFTER);
    expect(editor.transactions).toHaveLength(0);
    expect(dispatched).toEqual([{ changes: CHANGE, userEvent: STATBLOCK_EDIT_ORIGIN }]);
  });

  it('passes a filter that drops the change by, once, as one change of Atlas\' origin', () => {
    const { editor, dispatched } = editorWithView(true);
    writeToEditor(editor as unknown as Editor, BEFORE, AFTER);
    expect(editor.getValue()).toBe(AFTER);
    expect(dispatched).toEqual([
      { changes: CHANGE, userEvent: STATBLOCK_EDIT_ORIGIN },
      { changes: CHANGE, filter: false, userEvent: STATBLOCK_EDIT_ORIGIN },
    ]);
  });

  it('takes the editor\'s transaction where it has no CodeMirror view', () => {
    const editor = new FakeEditor(BEFORE, () => undefined);
    writeToEditor(editor as unknown as Editor, BEFORE, AFTER);
    expect(editor.getValue()).toBe(AFTER);
    expect(editor.transactions).toHaveLength(1);
  });
});
