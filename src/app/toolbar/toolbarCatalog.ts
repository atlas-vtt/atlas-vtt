// Type-only: that module imports SettingsService at runtime, which imports this catalog.
import type { ExperimentalFeatureId } from '../experimental/experimentalFeatures';
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
  /** Runtime gate: on only while the GM has the feature switched on. */
  experimental?: ExperimentalFeatureId;
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
    id: 'text', label: t('toolbarEdit.text.label'), hotkey: 'text', dmOnly: true, hideable: true,
    description: t('toolbarEdit.text.description'),
  },
  {
    id: 'measure', label: t('toolbarEdit.measure.label'), hotkey: 'measure', dmOnly: false, hideable: true,
    description: t('toolbarEdit.measure.description'),
  },
  {
    id: 'wall', label: t('toolbarEdit.wall.label'), hotkey: 'wall', dmOnly: true, hideable: true, experimental: 'dynamicLighting',
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
    id: 'loot', label: t('toolbarEdit.loot.label'), hotkey: 'lootRoller', dmOnly: true, hideable: true,
    description: t('toolbarEdit.loot.description'),
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
 * The undo/redo bar, which the editor hides and shows as one unit like a
 * control. It is a bar of its own left of the main toolbar, never part of the
 * main bar's order. Never rename its id: stored layouts use it.
 */
export const UNDO_BAR = {
  id: 'undo', label: t('toolbarEdit.undo.label'), hotkey: 'undo', dmOnly: true, hideable: true,
  description: t('toolbarEdit.undo.description'),
} as const satisfies ToolbarControlDefinition;

export const UNDO_BAR_ID = UNDO_BAR.id;

/** What the editor can hide and show: the main toolbar's controls and the undo/redo bar. */
export type ToolbarUnitId = ToolbarControlId | typeof UNDO_BAR_ID;

export const DEFAULT_TOOLBAR_ORDER: readonly ToolbarControlId[] = TOOLBAR_CONTROLS.map(control => control.id);

const CONTROLS_BY_ID = new Map<string, ToolbarControlDefinition>(TOOLBAR_CONTROLS.map(control => [control.id, control]));
const UNITS_BY_ID = new Map<string, ToolbarControlDefinition>([...CONTROLS_BY_ID, [UNDO_BAR_ID, UNDO_BAR]]);

export function isToolbarControlId(id: string): id is ToolbarControlId {
  return CONTROLS_BY_ID.has(id);
}

export function toolbarControl(id: ToolbarControlId): ToolbarControlDefinition {
  const control = CONTROLS_BY_ID.get(id);
  if (!control) throw new Error(`Unknown toolbar control: ${id}`);
  return control;
}

export function isToolbarUnitId(id: string): id is ToolbarUnitId {
  return UNITS_BY_ID.has(id);
}

/** A control of the main toolbar, or the undo/redo bar. */
export function toolbarUnit(id: ToolbarUnitId): ToolbarControlDefinition {
  const unit = UNITS_BY_ID.get(id);
  if (!unit) throw new Error(`Unknown toolbar unit: ${id}`);
  return unit;
}

/**
 * Whether the user may hide the control or the undo/redo bar; false for the
 * Command palette and for ids this version does not know.
 */
export function isHideableToolbarControl(id: string): boolean {
  return UNITS_BY_ID.get(id)?.hideable ?? false;
}

/** The controls a view offers, gated like its hotkeys (`availableHotkeys`). */
export function availableToolbarControls(player: boolean, isOn: (feature: ExperimentalFeatureId) => boolean): ReadonlySet<ToolbarControlId> {
  const offered = TOOLBAR_CONTROLS.filter((control: ToolbarControlDefinition) =>
    control.enabled !== false
    && (control.experimental === undefined || isOn(control.experimental))
    && !(player && control.dmOnly));
  return new Set(offered.map(control => control.id));
}
