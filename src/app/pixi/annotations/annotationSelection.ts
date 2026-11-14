import type { TextMeasure } from '../../annotations/annotationBounds';
import { handlesOf, type HandleSet } from '../../annotations/annotationHandles';
import { annotationList } from '../../annotations/annotationList';
import { framedAnnotations, pressScope, type PressScope } from '../../annotations/annotationPress';
import type { Annotation } from '../../annotations/annotationTypes';
import { levelObjects } from '../../levels/levelObjects';
import { mapTokens } from '../../tokens/offMap';
import type { SelectionState } from './drawToolState';

export type { SelectionState };

/** The selected drawings and texts of the level shown, as the pointer and the handles take them. */
export interface SelectionRead {
  /** Every annotation of the level shown, in drawing order. */
  readonly list: readonly Annotation[];
  /** What the tool in hand takes. */
  readonly scope: PressScope;
  /** The selected annotations, in drawing order. */
  readonly selected: readonly Annotation[];
  /** A token of the map is selected with them, under the move or select tool. */
  readonly withTokens: boolean;
  /** Those the handles frame (`framedAnnotations`), and their ids. */
  readonly framed: readonly Annotation[];
  readonly framedIds: ReadonlySet<string>;
  /** Those of the framed that may be moved: the ones that are not locked. */
  readonly free: readonly Annotation[];
  /** What a drag of the selection moves: `free`, or with tokens, which leave nothing framed, the selected ones that are not locked. */
  readonly movable: readonly Annotation[];
  /** The frame and handles of `free`; null for none. */
  readonly handles: HandleSet | null;
  /** What it was read from: the same again reads as the same object. */
  readonly from: { readonly selectedIds: readonly string[]; readonly tokens: unknown };
}

const NONE: readonly Annotation[] = [];
const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Reads the selection of `state`. `previous` is what was read last: the same object comes back
 * while the annotations, the selection and the tool are the same and a token is selected with them
 * or none is, so a pointer that moves over a still scene, and tokens that move, work nothing out.
 */
export function readSelection(state: SelectionState, measure: TextMeasure | undefined, previous: SelectionRead | null = null): SelectionRead {
  const objects = levelObjects(state);
  const list = annotationList(objects);
  const scope = pressScope(state.activeTool, state.drawTool.mode);
  const { selectedIds } = state;
  const tokens = mapTokens(objects);
  const from = { selectedIds, tokens };
  const same = previous !== null && previous.from.selectedIds === selectedIds && previous.scope === scope;
  // Tokens that move are other records at every step: only whether one is selected counts.
  const withTokens = same && previous.from.tokens === tokens
    ? previous.withTokens
    : scope === 'move' && selectedIds.some((id) => tokens[id] !== undefined);
  if (same && previous.list === list && previous.withTokens === withTokens) return previous;
  let selected = NONE;
  if (selectedIds.length > 0 && list.length > 0) {
    const ids = new Set(selectedIds);
    selected = list.filter((annotation) => ids.has(annotation.id));
  }
  if (selected.length === 0) {
    return { list, scope, selected: NONE, withTokens, framed: NONE, framedIds: NO_IDS, free: NONE, movable: NONE, handles: null, from };
  }
  const framed = framedAnnotations(selected, scope, withTokens);
  const free = framed.filter((annotation) => !annotation.locked);
  const movable = withTokens ? selected.filter((annotation) => !annotation.locked) : free;
  return { list, scope, selected, withTokens, framed, framedIds: new Set(framed.map(({ id }) => id)), free, movable, handles: handlesOf(free, measure), from };
}
