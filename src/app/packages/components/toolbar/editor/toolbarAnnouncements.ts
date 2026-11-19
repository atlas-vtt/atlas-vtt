import { t } from '../../../../i18n'
import { namesHotkey } from '../../../../keyboard/mapHotkeys'
import type { MapHotkeyId } from '../../../../keyboard/mapHotkeys'
import { HELP_BAR, toolbarUnit, UNDO_BAR_ID, type ToolbarUnitId } from '../../../../toolbar/toolbarCatalog'

/**
 * What the toolbar editor's live region says. Positions count the bar's
 * controls in order, those in "More tools" included and hidden ones not.
 */

/** What the hotkey of a hidden control or bar still does. */
export type KeyEffect = 'selects' | 'undoes' | 'opens'

export function enteredMessage(): string {
  return t('toolbarEdit.say.entered')
}

export function finishedMessage(): string {
  return t('toolbarEdit.say.finished')
}

export function positionMessage(label: string, position: number, count: number): string {
  return t('toolbarEdit.say.position', { label, position, total: count })
}

export function movedMessage(label: string, from: number, to: number): string {
  return t('toolbarEdit.say.moved', { label, from, to })
}

/** `hotkey` as `formatHotkey` writes it; an unassigned key is left out. `effect` is what the key does (the undo/redo bar's undoes). */
export function hiddenMessage(label: string, hotkey: string, effect: KeyEffect = 'selects'): string {
  if (!namesHotkey(hotkey)) return t('toolbarEdit.say.hidden', { label })
  const key = effect === 'undoes' ? 'toolbarEdit.say.hiddenUndoes' : effect === 'opens' ? 'toolbarEdit.say.hiddenOpens' : 'toolbarEdit.say.hiddenSelects'
  return t(key, { label, hotkey })
}

/** The key that works a control or a bar while it is hidden, as the user bound it; empty where it has none. */
export function unitHotkey(id: ToolbarUnitId, hotkeyLabel: (id: MapHotkeyId) => string): string {
  const key = toolbarUnit(id).hotkey
  return key === undefined ? '' : hotkeyLabel(key)
}

export function keyEffect(id: ToolbarUnitId): KeyEffect {
  if (id === UNDO_BAR_ID) return 'undoes'
  return id === HELP_BAR.id ? 'opens' : 'selects'
}

export function shownMessage(label: string, position: number, count: number): string {
  return t('toolbarEdit.say.shown', { label, position, total: count })
}

/** A bar beside the toolbar shown again: it has no position among the bar's controls. */
export function shownInPlaceMessage(label: string): string {
  return t('toolbarEdit.say.shownInPlace', { label })
}

/** Alt with the arrow keys on the undo/redo bar, which has no place in the order. */
export function fixedPlaceMessage(label: string): string {
  return t('toolbarEdit.say.fixedPlace', { label })
}

export function refusedMessage(): string {
  return t('toolbarEdit.say.refused')
}

export function resetMessage(undone: boolean): string {
  return t(undone ? 'toolbarEdit.say.resetUndone' : 'toolbarEdit.say.reset')
}

/**
 * A drag let go outside the bar and the tray, or broken off: `position` is
 * null for a tool from the tray, 'own' for the undo/redo bar from its place.
 */
export function cancelledMessage(label: string, position: number | null | 'own'): string {
  if (position === null) return t('toolbarEdit.say.cancelledTray', { label })
  return position === 'own' ? t('toolbarEdit.say.cancelledOwn', { label }) : t('toolbarEdit.say.cancelledPosition', { label, position })
}
