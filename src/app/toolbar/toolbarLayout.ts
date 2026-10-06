import { isRecord } from '../utils/guards';
import {
  DEFAULT_TOOLBAR_ORDER, isHideableToolbarControl, isToolbarControlId, isToolbarUnitId, UNDO_BAR_ID, type ToolbarControlId, type ToolbarUnitId,
} from './toolbarCatalog';

/**
 * What `AtlasSettings.toolbar` holds: only what differs from the default. Ids
 * this version does not know (a newer Atlas on another device) are kept. A
 * hidden undo/redo bar is `UNDO_BAR_ID` in `hidden`; it is never in `order`.
 */
export interface StoredToolbarLayout {
  readonly order?: readonly string[];
  readonly hidden?: readonly string[];
}

/**
 * The layout this version works with: every catalog id once, in order. A
 * hidden control keeps its slot in the order, which is where it returns to.
 * `hidden` also holds `UNDO_BAR_ID` while the undo/redo bar is hidden; that
 * bar has its own place left of the main one, so it has none in the order.
 */
export interface ToolbarLayout {
  readonly order: readonly ToolbarControlId[];
  readonly hidden: ReadonlySet<ToolbarUnitId>;
}

const MAX_STORED_IDS = 64;
const MAX_ID_LENGTH = 64;

/** Distinct strings of a sane length, at most `MAX_STORED_IDS`; anything that is not an array gives none. */
function readIds(value: unknown, keep: (id: string) => boolean): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const entry of value as unknown[]) {
    if (ids.size >= MAX_STORED_IDS) break;
    if (typeof entry === 'string' && entry.length >= 1 && entry.length <= MAX_ID_LENGTH && keep(entry)) ids.add(entry);
  }
  return [...ids];
}

/** Reads a stored layout defensively; the Command palette can never be hidden, and the undo/redo bar has no place in the order. */
export function readToolbarLayout(stored: unknown): StoredToolbarLayout {
  if (!isRecord(stored)) return {};
  const order = readIds(stored.order, id => id !== UNDO_BAR_ID);
  const hidden = readIds(stored.hidden, id => !isToolbarUnitId(id) || isHideableToolbarControl(id));
  return { ...(order.length > 0 && { order }), ...(hidden.length > 0 && { hidden }) };
}

/**
 * The order of `defaultIds` with the user's order applied: their order first,
 * then every control they have not placed (a later version's, say) after the
 * control that precedes it by default. An empty user order is the default.
 */
export function orderedToolbarIds(defaultIds: readonly string[], custom: readonly string[]): string[] {
  const known = new Set(defaultIds);
  const order = [...new Set(custom.filter(id => known.has(id)))];
  defaultIds.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = defaultIds.slice(0, index).reverse().find(previous => order.includes(previous));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id);
  });
  return order;
}

export function resolveToolbarLayout(stored: StoredToolbarLayout): ToolbarLayout {
  const order = orderedToolbarIds(DEFAULT_TOOLBAR_ORDER, stored.order ?? []).filter(isToolbarControlId);
  const hidden = new Set((stored.hidden ?? []).filter(isToolbarUnitId).filter(isHideableToolbarControl));
  return { order, hidden };
}

/** `ids` with each unknown id of `previous` back after the id that preceded it there, or at the start. */
function withUnknownIds(ids: readonly string[], previous: readonly string[]): string[] {
  const result = [...ids];
  previous.forEach((id, index) => {
    if (isToolbarControlId(id) || result.includes(id)) return;
    const before = previous.slice(0, index).reverse().find(other => result.includes(other));
    result.splice(before === undefined ? 0 : result.indexOf(before) + 1, 0, id);
  });
  return result;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** A resolved layout in stored form: only what differs from the default, with the unknown ids of `previous` kept. */
export function storedToolbarLayout(previous: StoredToolbarLayout, next: ToolbarLayout): StoredToolbarLayout {
  const order = withUnknownIds(next.order, previous.order ?? []);
  const unknownHidden = (previous.hidden ?? []).filter(id => !isToolbarUnitId(id));
  const hidden = [...(next.hidden.has(UNDO_BAR_ID) ? [UNDO_BAR_ID] : []), ...next.order.filter(id => next.hidden.has(id)), ...unknownHidden];
  return {
    ...(!sameIds(order, DEFAULT_TOOLBAR_ORDER) && { order }),
    ...(hidden.length > 0 && { hidden }),
  };
}

function withoutHidden(hidden: ReadonlySet<ToolbarUnitId>, id: ToolbarUnitId): ReadonlySet<ToolbarUnitId> {
  if (!hidden.has(id)) return hidden;
  const next = new Set(hidden);
  next.delete(id);
  return next;
}

/** Moves a control right after `after` (`null`: to the start) and shows it. */
export function withControlAfter(layout: ToolbarLayout, id: ToolbarControlId, after: ToolbarControlId | null): ToolbarLayout {
  if (after === id) return withControlShown(layout, id);
  const rest = layout.order.filter(other => other !== id);
  const index = after === null ? 0 : rest.indexOf(after) + 1;
  return { order: [...rest.slice(0, index), id, ...rest.slice(index)], hidden: withoutHidden(layout.hidden, id) };
}

/** Hides a control or the undo/redo bar; a control's slot in the order stays, so showing it puts it back there. */
export function withControlHidden(layout: ToolbarLayout, id: ToolbarUnitId): ToolbarLayout {
  if (layout.hidden.has(id) || !isHideableToolbarControl(id)) return layout;
  return { order: layout.order, hidden: new Set([...layout.hidden, id]) };
}

/** Shows a control at its remembered slot, or the undo/redo bar at its own place. */
export function withControlShown(layout: ToolbarLayout, id: ToolbarUnitId): ToolbarLayout {
  return { order: layout.order, hidden: withoutHidden(layout.hidden, id) };
}

export function isDefaultToolbarLayout(layout: ToolbarLayout): boolean {
  return layout.hidden.size === 0 && sameIds(layout.order, DEFAULT_TOOLBAR_ORDER);
}

/** What a control remembers between renders to decide whether it may visit the bar. */
export interface VisitMemory {
  active: boolean;
  armed: boolean;
}

/**
 * Whether a hidden control may visit the bar. It is armed only when it
 * becomes active while hidden outside edit mode (its tool is selected, its
 * menu or panel opens) and disarmed once inactive or in edit mode. Being
 * active when first seen (at mount, at map open) or when edit mode ends does
 * not arm it, so a hidden resting tool such as Move stays hidden.
 */
export function nextVisitArmed(previous: VisitMemory | undefined, active: boolean, hidden: boolean, editing: boolean): boolean {
  if (!previous || !active || editing) return false;
  return previous.armed || (hidden && !previous.active);
}

export type ControlPlacement = 'bar' | 'visiting' | 'hidden';

/** Where a control shows: in the bar, visiting it at its slot while hidden, or hidden. */
export function controlPlacement(hidden: boolean, active: boolean, editing: boolean, visitArmed: boolean): ControlPlacement {
  if (!hidden) return 'bar';
  return active && visitArmed && !editing ? 'visiting' : 'hidden';
}
