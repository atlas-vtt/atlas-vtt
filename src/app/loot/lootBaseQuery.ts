import { isRecord } from '../utils/guards';

/**
 * Atlas reads a base's items through its own Bases view type: no public API
 * runs a base's query on its own, so Atlas renders one of the base's views,
 * off screen, with this view type and gets the results Obsidian computes.
 */
export const LOOT_QUERY_VIEW = 'atlas-loot';

/** A view of a `.base` file, as written in the file. */
type BaseView = Record<string, unknown> & { name: string };

function viewsOf(base: unknown): BaseView[] {
  const views = isRecord(base) ? base.views : undefined;
  if (!Array.isArray(views)) return [];
  return views.filter((view): view is BaseView => isRecord(view) && typeof view.name === 'string' && view.name.trim() !== '');
}

/** The names of a base's views, in the order the base lists them. */
export function baseViewNames(base: unknown): string[] {
  return viewsOf(base).map((view) => view.name);
}

/** A config of the base's own filters, formulas and property names that runs `view` with Atlas's view type. */
function queryConfig(base: Record<string, unknown>, view: Record<string, unknown>): Record<string, unknown> {
  const { filters, formulas, properties } = base;
  return {
    ...(filters !== undefined && { filters }),
    ...(isRecord(formulas) && { formulas }),
    ...(isRecord(properties) && { properties }),
    views: [{ ...view, type: LOOT_QUERY_VIEW }],
  };
}

/**
 * The base config that runs `viewName` of `base` with Atlas's view type: the
 * base's own filters, formulas and property names, and the view's filters,
 * sort and visible properties. Null when the base has no such view.
 */
export function lootQueryConfig(base: unknown, viewName: string): Record<string, unknown> | null {
  const view = viewsOf(base).find((entry) => entry.name === viewName);
  return view && isRecord(base) ? queryConfig(base, view) : null;
}

/** Whether a filter of a base names a condition: `and: []` filters nothing. */
function hasCondition(filter: unknown): boolean {
  if (typeof filter === 'string') return filter.trim() !== '';
  return isRecord(filter) && Object.values(filter).some((group) => Array.isArray(group) && group.some(hasCondition));
}

/**
 * The base config that lists every file the base itself holds, also those no
 * view shows: its own filters with one view that filters nothing more. Null
 * when the base has no filter of its own: it then holds the whole vault, and
 * only its views say what belongs to it.
 */
export function wholeBaseQueryConfig(base: unknown): Record<string, unknown> | null {
  return isRecord(base) && hasCondition(base.filters) ? queryConfig(base, { name: LOOT_QUERY_VIEW }) : null;
}
