import type { MapHotkeyId } from '../keyboard/mapHotkeys';
import { AMBIENT_AUDIO_ENABLED } from '../featureFlags';
import { t } from '../i18n';

/** One control of the main toolbar, as the settings and the toolbar editor know it. */
export interface ToolbarControlDefinition {
  id: string;
  /** Heading of the editor's card and the name screen readers hear in the editor. */
  label: string;
  /** One plain sentence for the editor's card. */
  description: string;
  hotkey: MapHotkeyId;
  /** Only in the GM's bar; the player view's bar has move, measure and dice. */
  dmOnly: boolean;
  /** Build gate, as `MAP_HOTKEYS` writes it. */
  enabled?: boolean;
  /** Every control can be hidden except the way into the editor. */
  hideable: boolean;
}

/** The main toolbar's controls in their default order. Never rename an id: stored layouts use them. */
export const TOOLBAR_CONTROLS = [
  {
    id: 'move', label: t('toolbarEdit.move.label'), hotkey: 'move', dmOnly: false, hideable: true,
    description: t('toolbarEdit.move.description'),
  },
  {
    id: 'fog', label: t('toolbarEdit.fog.label'), hotkey: 'fog', dmOnly: true, hideable: true,
    description: t('toolbarEdit.fog.description'),
  },
  {
    id: 'draw', label: t('toolbarEdit.draw.label'), hotkey: 'draw', dmOnly: true, hideable: true,
    description: t('toolbarEdit.draw.description'),
  },
  {
    id: 'measure', label: t('toolbarEdit.measure.label'), hotkey: 'measure', dmOnly: false, hideable: true,
    description: t('toolbarEdit.measure.description'),
  },
  {
    id: 'wall', label: t('toolbarEdit.wall.label'), hotkey: 'wall', dmOnly: true, hideable: true,
    description: t('toolbarEdit.wall.description'),
  },
  {
    id: 'pin', label: t('toolbarEdit.pin.label'), hotkey: 'pin', dmOnly: true, hideable: true,
    description: t('toolbarEdit.pin.description'),
  },
  {
    id: 'audio', label: t('toolbarEdit.audio.label'), hotkey: 'audio', dmOnly: true, hideable: true, enabled: AMBIENT_AUDIO_ENABLED,
    description: t('toolbarEdit.audio.description'),
  },
  {
    id: 'dice', label: t('toolbarEdit.dice.label'), hotkey: 'diceTray', dmOnly: false, hideable: true,
    description: t('toolbarEdit.dice.description'),
  },
  {
    id: 'loot', label: 'Random tables', hotkey: 'lootRoller', dmOnly: true, hideable: true,
    description: 'Roll on the random tables in your notes and loot bases.',
  },
  {
    id: 'assets', label: t('toolbarEdit.assets.label'), hotkey: 'assets', dmOnly: true, hideable: true,
    description: t('toolbarEdit.assets.description'),
  },
  {
    id: 'palette', label: t('toolbarEdit.palette.label'), hotkey: 'palette', dmOnly: true, hideable: false,
    description: t('toolbarEdit.palette.description'),
  },
] as const satisfies readonly ToolbarControlDefinition[];

export type ToolbarControlId = (typeof TOOLBAR_CONTROLS)[number]['id'];

/**
 * A bar of its own beside the main toolbar that the editor hides and shows as one unit, like a
 * control, but never part of the main bar's order: each keeps its own place.
 */
export interface SideBarDefinition extends Omit<ToolbarControlDefinition, 'hotkey' | 'dmOnly'> {
  /** The key that works the bar while it is hidden; the online play button has none. */
  hotkey?: MapHotkeyId
}

/**
 * The bars beside the main toolbar, left to right: online play's button at the row's start, the
 * undo/redo bar left of the main toolbar, the keyboard shortcuts button at the row's end. All are
 * the GM's. Never rename an id: stored layouts use them.
 */
export const UNDO_BAR = {
  id: 'undo', label: t('toolbarEdit.undo.label'), hotkey: 'undo', hideable: true,
  description: t('toolbarEdit.undo.description'),
} as const satisfies SideBarDefinition

export const HELP_BAR = {
  id: 'help', label: t('toolbarEdit.help.label'), hotkey: 'help', hideable: true,
  description: t('toolbarEdit.help.description'),
} as const satisfies SideBarDefinition

export const ONLINE_BAR = {
  id: 'online', label: t('toolbarEdit.online.label'), hideable: true,
  description: t('toolbarEdit.online.description'),
} as const satisfies SideBarDefinition

export const SIDE_BARS = [ONLINE_BAR, UNDO_BAR, HELP_BAR] as const satisfies readonly SideBarDefinition[]

export type SideBarId = (typeof SIDE_BARS)[number]['id']

export const SIDE_BAR_IDS: readonly SideBarId[] = SIDE_BARS.map(bar => bar.id)

export const UNDO_BAR_ID = UNDO_BAR.id

/** What the editor can hide and show: the main toolbar's controls and the bars beside it. */
export type ToolbarUnitId = ToolbarControlId | SideBarId

/** A control or a side bar, as the editor's card and announcements read it. */
export type ToolbarUnitDefinition = ToolbarControlDefinition | SideBarDefinition

export const DEFAULT_TOOLBAR_ORDER: readonly ToolbarControlId[] = TOOLBAR_CONTROLS.map(control => control.id);

const CONTROLS_BY_ID = new Map<string, ToolbarControlDefinition>(TOOLBAR_CONTROLS.map(control => [control.id, control]));
const SIDE_BARS_BY_ID = new Map<string, SideBarDefinition>(SIDE_BARS.map(bar => [bar.id, bar]));
const UNITS_BY_ID = new Map<string, ToolbarUnitDefinition>([...CONTROLS_BY_ID, ...SIDE_BARS_BY_ID]);

export function isToolbarControlId(id: string): id is ToolbarControlId {
  return CONTROLS_BY_ID.has(id);
}

export function toolbarControl(id: ToolbarControlId): ToolbarControlDefinition {
  const control = CONTROLS_BY_ID.get(id);
  if (!control) throw new Error(`Unknown toolbar control: ${id}`);
  return control;
}

export function isSideBarId(id: string): id is SideBarId {
  return SIDE_BARS_BY_ID.has(id);
}

export function isToolbarUnitId(id: string): id is ToolbarUnitId {
  return UNITS_BY_ID.has(id);
}

/** A control of the main toolbar, or a bar beside it. */
export function toolbarUnit(id: ToolbarUnitId): ToolbarUnitDefinition {
  const unit = UNITS_BY_ID.get(id);
  if (!unit) throw new Error(`Unknown toolbar unit: ${id}`);
  return unit;
}

/**
 * Whether the user may hide the control or the bar beside the toolbar; false for the
 * Command palette and for ids this version does not know.
 */
export function isHideableToolbarControl(id: string): boolean {
  return UNITS_BY_ID.get(id)?.hideable ?? false;
}

/** The controls a view offers, gated like its hotkeys (`availableHotkeys`). */
export function availableToolbarControls(player: boolean): ReadonlySet<ToolbarControlId> {
  const offered = TOOLBAR_CONTROLS.filter((control: ToolbarControlDefinition) =>
    control.enabled !== false && !(player && control.dmOnly));
  return new Set(offered.map(control => control.id));
}
