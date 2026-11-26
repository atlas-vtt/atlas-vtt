import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';

/**
 * What can be done with what is selected on the map, described once: the context menu a right-click
 * or a long press opens and the bar above a selection are both drawn from this list, so they offer
 * the same things, do the same and are enabled alike.
 */

/** Where an action stands among the bar's own buttons (lowest first), and the one word it shows there. */
export interface PrimaryPlace {
  readonly order: number;
  readonly label: string;
}

interface Described {
  readonly id: string;
  /** As the menu names it. */
  readonly label: string;
  /** An Obsidian icon id; a row without one keeps the icon's room. */
  readonly icon?: string | undefined;
  readonly enabled: boolean;
  readonly destructive?: boolean | undefined;
  /** Set for an action the bar shows as a button of its own. */
  readonly primary?: PrimaryPlace | undefined;
}

/** Something that is done at once. */
export interface RunAction extends Described {
  readonly kind: 'run';
  run(): unknown;
  /** A switch: whether it is on. */
  readonly checked?: boolean | undefined;
  /** Drawn in one row with the actions beside it that say the same (Kill and Delete). */
  readonly sideBySide?: boolean | undefined;
}

/** Something that opens choices: a submenu in the menu, a menu at its button in the bar. */
export interface ChoicesAction extends Described {
  readonly kind: 'choices';
  /** A function is read again whenever `follow` reports a change, so open choices stay current. */
  readonly choices: ContextMenuEntry[] | (() => ContextMenuEntry[]);
  readonly follow?: ((onChange: () => void) => () => void) | undefined;
}

/** A row of the menu that is no action: a line between groups, a row that only says something. */
export interface RowAction {
  readonly kind: 'row';
  readonly id: string;
  readonly row: ContextMenuEntry;
}

export type SelectionAction = RunAction | ChoicesAction | RowAction;

/** The ids of the actions that act on everything selected, of every kind. */
export const WHOLE_SELECTION = { duplicate: 'duplicate', copy: 'copy', paste: 'paste', delete: 'delete' } as const;

/** Where the bar's buttons stand; the destructive one is the last. */
export const PRIMARY_ORDER = { edit: 1, duplicate: 2, conditions: 3, delete: 9 } as const;

/** What a menu row has that an action has no words for; such a row stays a row. */
const ROW_ONLY = ['detail', 'keepOpen', 'leading', 'stepper', 'description'] as const;

/**
 * A menu row as an action: an item is done at once, a submenu opens choices. A row with more to it
 * than an action describes (a stepper, a badge), and a row of its own making, stays a row.
 */
export function actionOf(id: string, entry: ContextMenuEntry, primary?: PrimaryPlace): SelectionAction {
  if (entry.type === 'submenu') {
    return { kind: 'choices', id, label: entry.label, icon: entry.icon, enabled: true, choices: entry.children, follow: entry.subscribe, primary };
  }
  if (entry.type === 'custom' || ROW_ONLY.some((field) => entry[field] !== undefined)) return { kind: 'row', id, row: entry };
  return {
    kind: 'run', id, label: entry.label, icon: entry.icon, enabled: entry.disabled !== true, destructive: entry.destructive,
    checked: entry.checked, run: entry.onClick, primary,
  };
}

/** The actions the bar shows as buttons of its own, in the bar's order. */
export function primaryActions(actions: readonly SelectionAction[]): (RunAction | ChoicesAction)[] {
  return actions
    .filter((action): action is RunAction | ChoicesAction => action.kind !== 'row' && action.primary !== undefined)
    .sort((a, b) => (a.primary?.order ?? 0) - (b.primary?.order ?? 0));
}

/** The choices an action opens, as they are now. */
export function choicesOf(action: ChoicesAction): ContextMenuEntry[] {
  return typeof action.choices === 'function' ? action.choices() : action.choices;
}
