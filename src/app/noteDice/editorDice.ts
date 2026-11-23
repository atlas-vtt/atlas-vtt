/**
 * Dice in a note roll in Live Preview too: the rolls Reading view links are marked in the editor, and
 * Ctrl-click (Cmd-click on macOS) rolls one, with Shift for advantage and Alt for disadvantage. A plain
 * click places the cursor as on any text. Source mode shows the text as written.
 *
 * Only the lines on screen are marked, and only again when the text, the lines on screen, the parse
 * or the mode change, so typing in a long note costs what typing in a short one does.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField, Keymap } from 'obsidian';
import { advantageSide } from '../tools/diceAdvantage';
import type { AdvantageSide } from '../types/diceSetTypes';
import { EDITOR_DICE_CLASS, editorDiceMarks } from './editorDiceMarks';

/** Rolls a formula clicked in an editor of `doc`'s window. */
export type EditorDiceRoll = (formula: string, side: AdvantageSide | null, doc: Document) => void;

function livePreview(state: EditorState): boolean {
  return state.field(editorLivePreviewField, false) === true;
}

function marksOf(view: EditorView): DecorationSet {
  return livePreview(view.state) ? editorDiceMarks(view.state, view.visibleRanges) : Decoration.none;
}

/** The formula of the roll an event's target lies in, in any window (a popout's nodes are not `instanceof` this window's). */
function clickedFormula(target: EventTarget | null): string | null {
  const node = target as Node | null;
  if (!node || typeof node.instanceOf !== 'function' || !node.instanceOf(Element)) return null;
  return node.closest(`.${EDITOR_DICE_CLASS}`)?.getAttribute('data-formula') ?? null;
}

export function editorDiceExtension(roll: EditorDiceRoll): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = marksOf(view);
      }

      update(update: ViewUpdate): void {
        if (
          update.docChanged ||
          update.viewportChanged ||
          livePreview(update.startState) !== livePreview(update.state) ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = marksOf(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        // On the press, before the editor moves the cursor or adds one for the modifier.
        mousedown(event: MouseEvent, view: EditorView): boolean {
          if (event.button !== 0 || !Keymap.isModEvent(event)) return false;
          const formula = clickedFormula(event.target);
          if (formula === null) return false;
          event.preventDefault();
          roll(formula, advantageSide(event.shiftKey, event.altKey), view.dom.ownerDocument);
          return true;
        },
      },
    },
  );
}
