import { toggleMark, type InlineMark } from './markdownMarks';
import { fieldSelection, markdownField, replaceInField } from './textFields';

/** Mod+B or Mod+I in `target`: the mark toggled on its selection. False where `target` is no field Markdown is typed into. */
export function toggleMarkIn(target: EventTarget | null, mark: InlineMark): boolean {
  const field = markdownField(target);
  const now = field ? fieldSelection(field) : null;
  if (!field || !now) return false;
  const edit = toggleMark(now, mark);
  replaceInField(field, edit.from, edit.to, edit.insert, [edit.start, edit.end]);
  return true;
}
