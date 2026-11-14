/**
 * Which annotations the pointer takes, by the tool in hand. One rule for a press, the hover that
 * shows what a press would take, a marquee and the handles: a drawing never takes a press meant
 * for something else, and nothing can be made unreachable.
 */

import type { Annotation, DrawMode } from './annotationTypes';

/**
 * What the tool in hand takes of the annotations of the level shown:
 * - `'move'` (the move and select tools, the way the GM selects and moves what lies on the map):
 *   every one, on the map too, hidden and locked ones too, after tokens and pins; a locked one is
 *   selected and moves nowhere. A marquee takes tokens alone (`SelectionManager`);
 * - `'made'` (the Draw tool): only the handles of what is selected, which is the stamp or the
 *   text just made (a stroke, a line and a shape are not selected once drawn, so those modes
 *   have none of their own), and in a mode that places by a press the annotations of its own
 *   kind (`ownKind`);
 * - `'all'` (the players' page's Draw tool in its Select mode, `DrawMode`): every one alike; also
 *   the group rule's own scope for a mode that takes its own kind;
 * - `'none'`: none, and no handles.
 */
export type PressScope = 'all' | 'made' | 'move' | 'none';

export function pressScope(activeTool: string, mode?: DrawMode): PressScope {
  if (activeTool === 'draw') return mode === 'select' ? 'all' : 'made';
  return activeTool === 'move' || activeTool === 'select' ? 'move' : 'none';
}

/** Whether a press or a hover in `scope` takes `annotation`: every one with the move and select tools and in the players' Select mode, none in the Draw tool's other modes. */
export function takesPress(scope: PressScope, _annotation: Annotation): boolean {
  return scope === 'all' || scope === 'move';
}

/** The kinds of annotation a Draw mode places by one press. */
export type OwnKind = 'stamp' | 'text';

/**
 * What a Draw mode that places by a press takes besides the handles of what it made: the
 * annotations of its own kind. A press on a stamp in Stamp mode selects that stamp, and a drag
 * from it moves it, as in Select mode; a press on a text in Text mode opens it for typing. So
 * neither lays a second one over the first by mistake. Null in every other mode and tool. While
 * `free` (Alt) is held, a text is passed over, so texts can still be typed over each other; a stamp
 * is taken all the same, since Alt there frees a stamp from the grid: the one placed, and the one
 * dragged.
 */
export function ownKind(activeTool: string, mode: DrawMode, free = false): OwnKind | null {
  if (activeTool !== 'draw') return null;
  if (mode === 'stamp') return 'stamp';
  return mode === 'text' && !free ? 'text' : null;
}

/** Whether `annotation` is of the kind `own`: on the map or above the tokens, hidden and locked ones too. None for null. */
export function takesOwn(own: OwnKind | null, annotation: Annotation): boolean {
  if (own === null) return false;
  return own === 'text' ? annotation.kind === 'text' : annotation.kind === 'drawing' && annotation.shape === 'stamp';
}

/**
 * `ids` and with each annotation among them every other one of its group that `scope` takes: a
 * group is selected as one. In the order of `ids`, the others of a group after its first member.
 */
export function withGroups(ids: readonly string[], list: readonly Annotation[], scope: PressScope): string[] {
  const wanted = new Set(ids);
  const groups = new Set<string>();
  for (const annotation of list) {
    if (annotation.group !== null && wanted.has(annotation.id)) groups.add(annotation.group);
  }
  if (groups.size === 0) return [...ids];
  const members = new Map<string, string[]>();
  for (const annotation of list) {
    if (annotation.group === null || !groups.has(annotation.group) || !takesPress(scope, annotation)) continue;
    const group = members.get(annotation.group);
    if (group) group.push(annotation.id);
    else members.set(annotation.group, [annotation.id]);
  }
  const byId = new Map(list.map((annotation) => [annotation.id, annotation]));
  const all: string[] = [];
  const taken = new Set<string>();
  const take = (id: string): void => {
    if (taken.has(id)) return;
    taken.add(id);
    all.push(id);
  };
  for (const id of ids) {
    take(id);
    const group = byId.get(id)?.group ?? null;
    if (group !== null) for (const member of members.get(group) ?? []) take(member);
  }
  return all;
}

/**
 * The annotations among `selected` that the handles frame in `scope`: every selected one, and in
 * the move tool none while a token is selected with them (`withTokens`): a selection with tokens
 * has the tokens' group frame.
 */
export function framedAnnotations(selected: readonly Annotation[], scope: PressScope, withTokens: boolean): readonly Annotation[] {
  if (scope === 'none' || selected.length === 0) return [];
  return scope === 'move' && withTokens ? [] : selected;
}
