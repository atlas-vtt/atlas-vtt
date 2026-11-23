/**
 * Select more: a switch of the view that makes a press on a token, drawing or text add it to the
 * selection or take it out, as a Shift-click does, and a marquee add what it takes. It is the
 * view's own state (never saved, no undo step) and switches itself off when the selection is
 * cleared or another tool is taken.
 */

/** The tools that select what is on the map. */
export function toolSelects(tool: string): boolean {
  return tool === 'move' || tool === 'select';
}

/** What the switch follows: the tool in hand, and how many things were selected before the change and are now. */
export interface SelectMoreChange {
  readonly tool: string;
  readonly had: number;
  readonly has: number;
}

/** Whether Select more is still on after a change of the selection or the tool. */
export function selectMoreAfter(on: boolean, { tool, had, has }: SelectMoreChange): boolean {
  if (!on || !toolSelects(tool)) return false;
  return !(had > 0 && has === 0);
}

/** Whether a press adds to the selection or takes from it instead of replacing it: Shift, or the switch. */
export function picksMore(state: { readonly selectMore?: boolean | undefined }, event: { readonly shiftKey?: boolean | undefined }): boolean {
  return event.shiftKey === true || state.selectMore === true;
}

/**
 * What is selected once a marquee took `taken`: those alone, or, with Select more on, what was
 * selected with them added. A marquee that was only a tap on the empty map (`tapped`) took nothing
 * and clears the selection, with the switch on too.
 */
export function marqueeSelection(selected: readonly string[], taken: readonly string[], more: boolean, tapped: boolean): string[] {
  if (!more || (tapped && taken.length === 0)) return [...taken];
  return [...selected, ...taken.filter((id) => !selected.includes(id))];
}
