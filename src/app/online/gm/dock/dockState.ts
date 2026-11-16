/**
 * What the GM's control on the map shows, as pure rules: closed (the button alone), the short-lived
 * connection menu, or the online panel, the working surface while players are at the table.
 */

export type Surface = 'closed' | 'menu' | 'panel';

/** What the control knows of the table when it decides. */
export interface TableFacts {
  /** A table runs or is being created. */
  readonly running: boolean;
  /** At least one player joined this table. */
  readonly joined: boolean;
  /** The last table ended without the GM stopping it. */
  readonly lost: boolean;
}

export interface DockState {
  readonly surface: Surface;
  /** The table was lost while the control was closed: the badge stays red until the GM opens it. */
  readonly alert: boolean;
}

export const CLOSED: DockState = { surface: 'closed', alert: false };

/** The surface the control opens to: the panel once players joined a running table, else the menu. */
export function surfaceFor(table: TableFacts): Exclude<Surface, 'closed'> {
  return table.running && table.joined ? 'panel' : 'menu';
}

/** Opens the control (a command, or the button while closed); an open surface stays as it is. */
export function open(state: DockState, table: TableFacts): DockState {
  return state.surface === 'closed' ? { surface: surfaceFor(table), alert: false } : state;
}

/** The button, Enter or Space on it, or the toggle command. */
export function toggle(state: DockState, table: TableFacts): DockState {
  return state.surface === 'closed' ? open(state, table) : close(state);
}

export function close(state: DockState): DockState {
  return state.surface === 'closed' ? state : { ...state, surface: 'closed' };
}

/**
 * The table changed. An open menu becomes the panel when the first player joins; the panel goes back
 * to the menu only when the table ends, never because a player went away. A closed control never
 * opens by itself: a lost table only turns its badge red.
 */
export function tableChanged(state: DockState, before: TableFacts, after: TableFacts): DockState {
  if (state.surface === 'menu' && after.running && after.joined) return { ...state, surface: 'panel' };
  if (state.surface === 'panel' && !after.running) return { ...state, surface: 'menu' };
  if (after.running) return { ...state, alert: false };
  if (after.lost && !before.lost && state.surface === 'closed') return { ...state, alert: true };
  return state;
}

/** An Escape keydown as the control sees it. */
export interface EscapeFacts {
  /** The key belongs to this map view: pressed inside it, or with it the active tab and focus on nothing. */
  readonly inThisView: boolean;
  /** Focus is inside the open menu or panel. */
  readonly inSurface: boolean;
  /** Another control used the key (it prevented the default). */
  readonly handledElsewhere: boolean;
  /** Text is being composed. */
  readonly composing: boolean;
}

/**
 * Whether Escape closes the open surface. The menu closes on an Escape for this view that nothing
 * else used. The panel closes only while focus is inside it, so Escape on the map still deselects.
 */
export function escapeCloses(surface: Surface, key: EscapeFacts): boolean {
  if (key.composing) return false;
  if (surface === 'menu') return key.inThisView && !key.handledElsewhere;
  if (surface === 'panel') return key.inSurface;
  return false;
}

/**
 * Whether a press outside closes the open surface: a left press outside the control, its surface and
 * the menus it opened. The press still reaches what it landed on, and tokens it selects show in the
 * panel's selection bar once the panel is opened again.
 */
export function outsidePressCloses(surface: Surface, press: { readonly button: number; readonly inside: boolean }): boolean {
  return surface !== 'closed' && press.button === 0 && !press.inside;
}

/**
 * Whether Escape closes the invite link's QR card: an Escape for this view that nothing else used. The
 * card goes first, and the menu or panel it hangs from stays.
 */
export function escapeClosesQr(key: EscapeFacts): boolean {
  return !key.composing && key.inThisView && !key.handledElsewhere;
}

/**
 * Whether a press closes the QR card: a left press outside the control, its surface, the cards over it
 * and the menus it opened. A press in the control leaves it open, so the GM admits a player or assigns
 * a token while the others still scan.
 */
export function pressClosesQr(press: { readonly button: number; readonly inside: boolean }): boolean {
  return press.button === 0 && !press.inside;
}

/** The parts of the map view's state that make room for other surfaces. */
export interface ViewFacts {
  readonly diceLog: boolean;
  readonly toolbarEditing: boolean;
}

/** Whether the open surface makes way: the dice log opened over its place, or the toolbar editor started. */
export function makesWay(surface: Surface, before: ViewFacts, after: ViewFacts): boolean {
  if (surface === 'closed') return false;
  return (after.diceLog && !before.diceLog) || (after.toolbarEditing && !before.toolbarEditing);
}

/** Whether opening the surface closes the dice log, which hangs where it opens. */
export function closesDiceLog(before: Surface, after: Surface, view: ViewFacts): boolean {
  return before === 'closed' && after !== 'closed' && view.diceLog;
}

/** Keys without Cmd, Ctrl or Alt stop at the control, so they never reach the map's shortcuts (Enter, Delete, Tab). */
export function keyStaysInControl(key: { readonly metaKey: boolean; readonly ctrlKey: boolean; readonly altKey: boolean }): boolean {
  return !key.metaKey && !key.ctrlKey && !key.altKey;
}
