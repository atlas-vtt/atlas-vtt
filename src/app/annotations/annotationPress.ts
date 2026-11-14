/**
 * Which annotations the pointer takes, by the tool in hand. One rule for a press, the hover that
 * shows what a press would take, a marquee and the handles: a drawing never takes a press meant
 * for something else, and nothing can be made unreachable.
 */

import type { Annotation, DrawMode } from './annotationTypes';

/**
 * What the tool in hand takes of the annotations of the level shown:
 * - `'all'` (the Draw tool's Select mode): every one, on the map too, hidden and locked ones too;
 * - `'made'` (the Draw tool's other modes): only the handles of what is selected, which is the one
 *   just made (a pen's stroke is not selected, so the pen has none), and in a mode that places by
 *   a press the annotations of its own kind (`ownKind`);
 * - `'above'` (the move and select tools): those above the tokens that are not locked;
 * - `'none'`: none, and no handles.
 */
export type PressScope = 'all' | 'made' | 'above' | 'none';

export function pressScope(activeTool: string, mode: DrawMode): PressScope {
  if (activeTool === 'draw') return mode === 'select' ? 'all' : 'made';
  return activeTool === 'move' || activeTool === 'select' ? 'above' : 'none';
}

/** Whether a press, a hover or a marquee in `scope` takes `annotation`. */
export function takesPress(scope: PressScope, annotation: Annotation): boolean {
  if (scope === 'all') return true;
  return scope === 'above' && annotation.layer === 'above' && !annotation.locked;
}

/** The kinds of annotation a Draw mode places by one press. */
export type OwnKind = 'stamp' | 'text';

/**
 * What a Draw mode that places by a press takes besides the handles of what it made: the
 * annotations of its own kind. A press on a stamp in Stamp mode selects that stamp, and a drag
 * from it moves it, as in Select mode; a press on a text in Text mode opens it for typing. So
 * neither lays a second one over the first by mistake. Null in every other mode and tool, and
 * while `free` (Alt) is held: then the press places, and things can still be stacked.
 */
export function ownKind(activeTool: string, mode: DrawMode, free = false): OwnKind | null {
  if (activeTool !== 'draw' || free) return null;
  return mode === 'stamp' ? 'stamp' : mode === 'text' ? 'text' : null;
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
 * The annotations among `selected` that the handles frame in `scope`. The Draw tool frames every
 * selected one. The move and select tools frame those they take, and none while a token is
 * selected with them (`withTokens`): a selection with tokens has the tokens' group frame.
 */
export function framedAnnotations(selected: readonly Annotation[], scope: PressScope, withTokens: boolean): readonly Annotation[] {
  if (scope === 'none' || selected.length === 0) return [];
  if (scope !== 'above') return selected;
  if (withTokens) return [];
  const taken = selected.filter((annotation) => takesPress(scope, annotation));
  return taken.length === selected.length ? selected : taken;
}
