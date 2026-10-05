import type { ExperimentalFeatureId } from '../experimental/experimentalFeatures';
import { AMBIENT_AUDIO_ENABLED } from '../featureFlags';
import { isActiveAtlasLeaf } from '../utils/activeLeafGuard';
import { handledByAnotherControl } from './tooltipEscape';
import type { SettingsService } from '../services/SettingsService';
import { t } from '../i18n';

export const MAP_HOTKEYS = [
  { id: 'help', label: t('hotkey.help'), group: t('hotkey.group.map'), defaultKey: '?' },
  { id: 'palette', label: t('hotkey.palette'), group: t('hotkey.group.map'), defaultKey: 'Space' },
  { id: 'assets', label: t('hotkey.assets'), group: t('hotkey.group.map'), defaultKey: 'a', dmOnly: true },
  // The id stays `dashboard` (the DM screen's former name): custom keys are saved under it.
  { id: 'dashboard', label: t('hotkey.dashboard'), group: t('hotkey.group.map'), defaultKey: 'Tab', dmOnly: true },
  { id: 'gmView', label: t('hotkey.gmView'), group: t('hotkey.group.map'), defaultKey: 'd', dmOnly: true },
  { id: 'sceneSwitcher', label: t('hotkey.sceneSwitcher'), group: t('hotkey.group.map'), defaultKey: 'g', dmOnly: true },
  { id: 'lightingPeek', label: t('hotkey.lightingPeek'), group: t('hotkey.group.map'), defaultKey: 'h', dmOnly: true, experimental: 'dynamicLighting' },
  { id: 'fitMap', label: t('hotkey.fitMap'), group: t('hotkey.group.map'), defaultKey: 'Shift+1' },
  { id: 'fitToken', label: t('hotkey.fitToken'), group: t('hotkey.group.map'), defaultKey: 'Shift+2' },
  { id: 'move', label: t('hotkey.move'), group: t('hotkey.group.tools'), defaultKey: 'v' },
  { id: 'fog', label: t('hotkey.fog'), group: t('hotkey.group.tools'), defaultKey: 'f', dmOnly: true },
  { id: 'draw', label: t('hotkey.draw'), group: t('hotkey.group.tools'), defaultKey: 'b', dmOnly: true },
  { id: 'erase', label: t('hotkey.erase'), group: t('hotkey.group.tools'), defaultKey: 'e', dmOnly: true },
  { id: 'text', label: t('hotkey.text'), group: t('hotkey.group.tools'), defaultKey: 't', dmOnly: true },
  { id: 'measure', label: t('hotkey.measure'), group: t('hotkey.group.tools'), defaultKey: 'm' },
  { id: 'pin', label: t('hotkey.pin'), group: t('hotkey.group.tools'), defaultKey: 'p', dmOnly: true },
  { id: 'wall', label: t('hotkey.wall'), group: t('hotkey.group.tools'), defaultKey: 'w', dmOnly: true, experimental: 'dynamicLighting' },
  { id: 'audio', label: t('hotkey.audio'), group: t('hotkey.group.tools'), defaultKey: 's', dmOnly: true, enabled: AMBIENT_AUDIO_ENABLED },
  { id: 'selectAll', label: t('hotkey.selectAll'), group: t('hotkey.group.editing'), defaultKey: 'Mod+a', dmOnly: true },
  { id: 'copy', label: t('hotkey.copy'), group: t('hotkey.group.editing'), defaultKey: 'Mod+c', dmOnly: true, yieldsToTextSelection: true },
  { id: 'cut', label: t('hotkey.cut'), group: t('hotkey.group.editing'), defaultKey: 'Mod+x', dmOnly: true, yieldsToTextSelection: true },
  { id: 'paste', label: t('hotkey.paste'), group: t('hotkey.group.editing'), defaultKey: 'Mod+v', dmOnly: true },
  { id: 'duplicate', label: t('hotkey.duplicate'), group: t('hotkey.group.editing'), defaultKey: 'Mod+d', dmOnly: true },
  { id: 'undo', label: t('hotkey.undo'), group: t('hotkey.group.editing'), defaultKey: 'Mod+z', dmOnly: true },
  { id: 'redo', label: t('hotkey.redo'), group: t('hotkey.group.editing'), defaultKey: 'Mod+Shift+z', dmOnly: true },
  { id: 'redoAlt', label: t('hotkey.redoAlt'), group: t('hotkey.group.editing'), defaultKey: 'Mod+y', dmOnly: true },
  { id: 'delete', label: t('hotkey.delete'), group: t('hotkey.group.editing'), defaultKey: 'Delete', dmOnly: true },
  { id: 'deleteAlt', label: t('hotkey.deleteAlt'), group: t('hotkey.group.editing'), defaultKey: 'Backspace', dmOnly: true },
  { id: 'cancel', label: t('hotkey.cancel'), group: t('hotkey.group.editing'), defaultKey: 'Escape' },
  { id: 'diceTray', label: t('hotkey.diceTray'), group: t('hotkey.group.combat'), defaultKey: 'r' },
  { id: 'diceLog', label: t('hotkey.diceLog'), group: t('hotkey.group.combat'), defaultKey: 'Enter' },
  { id: 'initiative', label: t('hotkey.initiative'), group: t('hotkey.group.combat'), defaultKey: 'i', dmOnly: true },
  { id: 'lootRoller', label: t('hotkey.lootRoller'), group: t('hotkey.group.combat'), defaultKey: 'l', dmOnly: true },
  { id: 'previousTurn', label: t('hotkey.previousTurn'), group: t('hotkey.group.combat'), defaultKey: 'ArrowUp', dmOnly: true },
  { id: 'nextTurn', label: t('hotkey.nextTurn'), group: t('hotkey.group.combat'), defaultKey: 'ArrowDown', dmOnly: true },
  ...([1, 2, 3, 4, 5] as const).map(n => ({ id: `widget${n}` as const, label: t('hotkey.holdWidget', { n }), group: t('hotkey.group.widgets'), defaultKey: String(n), dmOnly: true, selectsWidget: true })),
  { id: 'increase', label: t('hotkey.increase'), group: t('hotkey.group.widgets'), defaultKey: '+', dmOnly: true, whileWidgetHeld: true },
  { id: 'increaseAlt', label: t('hotkey.increaseAlt'), group: t('hotkey.group.widgets'), defaultKey: '=', dmOnly: true, whileWidgetHeld: true },
  { id: 'decrease', label: t('hotkey.decrease'), group: t('hotkey.group.widgets'), defaultKey: '-', dmOnly: true, whileWidgetHeld: true },
  { id: 'timerPlayPause', label: t('hotkey.timerPlayPause'), group: t('hotkey.group.widgets'), defaultKey: 'Space', dmOnly: true, whileWidgetHeld: true },
  { id: 'timerReset', label: t('hotkey.timerReset'), group: t('hotkey.group.widgets'), defaultKey: 'r', dmOnly: true, whileWidgetHeld: true },
] as const;
type MapHotkey = typeof MAP_HOTKEYS[number];
export type MapHotkeyId = MapHotkey['id'];
/** Actions that run only while a widget's number key is held; the widget bar dispatches them. */
export type HeldWidgetHotkeyId = Extract<MapHotkey, { whileWidgetHeld: true }>['id'];
export type MapHotkeys = Record<MapHotkeyId, string>;
export const DEFAULT_MAP_HOTKEYS = Object.fromEntries(MAP_HOTKEYS.map(h => [h.id, h.defaultKey])) as MapHotkeys;
/** The shortcuts on offer: `isOn` leaves out those of experimental features that are switched off. */
export const availableHotkeys = (player = false, isOn: (feature: ExperimentalFeatureId) => boolean = () => true) => MAP_HOTKEYS.filter(h =>
  !('enabled' in h && !h.enabled) && !('experimental' in h && !isOn(h.experimental)) && !(player && 'dmOnly' in h && h.dmOnly));

export const hotkeyAction = (id: MapHotkeyId): MapHotkey => MAP_HOTKEYS.find(action => action.id === id)!;
const runsWhileWidgetHeld = (action: MapHotkey): boolean => 'whileWidgetHeld' in action;
const selectsWidget = (action: MapHotkey): boolean => 'selectsWidget' in action;
/** A held-widget action may share its key with any other shortcut except the number keys that hold a widget. */
export function canShareHotkey(a: MapHotkeyId, b: MapHotkeyId): boolean {
  const [first, second] = [hotkeyAction(a), hotkeyAction(b)];
  return runsWhileWidgetHeld(first) !== runsWhileWidgetHeld(second) && !selectsWidget(first) && !selectsWidget(second);
}

/** Printable symbols are layout-aware; shifted digits preserve the familiar Shift+1/2 navigation. A letter of another script (Cyrillic, Greek…) counts as the Latin letter on the same physical key, so shortcuts work on any layout. */
export function hotkeyFromEvent(event: KeyboardEvent): string | null {
  if (event.isComposing || ['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Unidentified'].includes(event.key)) return null;
  let key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const physicalLetter = /^Key([A-Z])$/.exec(event.code)?.[1];
  if (physicalLetter && /^\p{L}$/u.test(key) && !/^[a-z]$/.test(key)) key = physicalLetter.toLowerCase();
  const shiftedDigit = event.shiftKey && /^Digit\d$/.test(event.code);
  if (shiftedDigit) key = event.code.slice(-1);
  const shift = event.shiftKey && (shiftedDigit || key.length !== 1 || /[a-z]/i.test(key));
  return `${event.ctrlKey || event.metaKey ? 'Mod+' : ''}${event.altKey ? 'Alt+' : ''}${shift ? 'Shift+' : ''}${key}`;
}
export function matchesHotkey(event: KeyboardEvent, binding: string, allowRepeat = false): boolean {
  return !!binding && (allowRepeat || !event.repeat) && !event.isComposing && hotkeyFromEvent(event) === binding;
}
export function matchesMapHotkey(event: KeyboardEvent, id: MapHotkeyId, settings?: SettingsService): boolean {
  return matchesHotkey(event, (settings?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS)[id]);
}
const UNASSIGNED_HOTKEY = t('hotkey.unassigned');
export function formatHotkey(binding: string): string {
  return binding ? binding.replace(/Mod\+/g, 'Ctrl/Cmd + ').replace(/Shift\+/g, 'Shift + ').replace(/Alt\+/g, 'Alt + ').replace(/(^| \+ )([a-z])$/, (_, prefix: string, key: string) => prefix + key.toUpperCase()) : UNASSIGNED_HOTKEY;
}
/** Whether a label `formatHotkey` wrote names a key, rather than saying none is assigned. */
export function namesHotkey(label: string): boolean {
  return label !== '' && label !== UNASSIGNED_HOTKEY;
}
export function canRunMapHotkeys(event: KeyboardEvent, viewId?: string): boolean {
  if (handledByAnotherControl(event) || event.isComposing || !isActiveAtlasLeaf(viewId)) return false;
  const target = event.target as Element | null;
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, [role="textbox"]')) return false;
  if (document.querySelector('.modal-container, .prompt, .suggestion-container, .menu, .atlas-asset-manager-modal, .atlas-command-palette-overlay, .atlas-onboarding-overlay, .atlas-hotkey-help, .atlas-text-dialog-backdrop, .atlas-dm-screen-wrapper, .atlas-grid-alignment-panel, [aria-modal="true"]')) return false;
  return true;
}
