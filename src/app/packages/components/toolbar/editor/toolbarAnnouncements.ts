import { namesHotkey } from '../../../../keyboard/mapHotkeys'

/**
 * What the toolbar editor's live region says. Positions count the bar's
 * controls in order, those in "More tools" included and hidden ones not.
 */

export function enteredMessage(): string {
  return 'Editing the toolbar. Drag a tool to move it, or into the tray to hide it. '
    + 'With a tool focused, Alt and the arrow keys move it and Delete hides it. Escape or Done finishes.'
}

export function finishedMessage(): string {
  return 'Done editing the toolbar.'
}

export function positionMessage(label: string, position: number, count: number): string {
  return `${label}, position ${position} of ${count}.`
}

export function movedMessage(label: string, from: number, to: number): string {
  return `${label} moved from position ${from} to ${to}.`
}

/** `hotkey` as `formatHotkey` writes it; an unassigned key is left out. */
export function hiddenMessage(label: string, hotkey: string): string {
  return namesHotkey(hotkey) ? `${label} hidden. ${hotkey} still selects it.` : `${label} hidden.`
}

export function shownMessage(label: string, position: number, count: number): string {
  return `${label} is back on the toolbar, position ${position} of ${count}.`
}

export function refusedMessage(): string {
  return 'The command palette always stays on the toolbar.'
}

export function resetMessage(undone: boolean): string {
  return undone ? 'Reset undone.' : 'Toolbar reset.'
}

/** A drag let go outside the bar and the tray, or broken off; `position` is null for a tool from the tray. */
export function cancelledMessage(label: string, position: number | null): string {
  return position === null ? `Move cancelled. ${label} is back in hidden tools.` : `Move cancelled. ${label} is back at position ${position}.`
}
