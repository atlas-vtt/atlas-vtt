// Type-only: that module imports SettingsService at runtime, which imports this catalog.
import type { ExperimentalFeatureId } from '../experimental/experimentalFeatures';
import type { MapHotkeyId } from '../keyboard/mapHotkeys';
import { AMBIENT_AUDIO_ENABLED, TV_VIEWPORT_ENABLED } from '../featureFlags';

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
  /** Starts in the editor's tray, not on the bar: for a control most tables do not use. The GM adds it from the tray. */
  hiddenByDefault?: boolean;
}

/** The main toolbar's controls in their default order. Never rename an id: stored layouts use them. */
export const TOOLBAR_CONTROLS = [
  {
    id: 'move', label: 'Move and select', hotkey: 'move', dmOnly: false, hideable: true,
    description: 'Select and move tokens, or point at the map with the laser pointer.',
  },
  {
    id: 'fog', label: 'Fog of war', hotkey: 'fog', dmOnly: true, hideable: true,
    description: 'Hide parts of the map from your players and reveal them as they explore.',
  },
  {
    id: 'draw', label: 'Draw', hotkey: 'draw', dmOnly: true, hideable: true,
    description: 'Draw lines and place icons on the map, and erase them again.',
  },
  {
    id: 'text', label: 'Text', hotkey: 'text', dmOnly: true, hideable: true,
    description: 'Write labels and short notes straight onto the map.',
  },
  {
    id: 'measure', label: 'Measure', hotkey: 'measure', dmOnly: false, hideable: true,
    description: "Measure a distance, or the reach of a circle or cone, in your grid's units.",
  },
  {
    id: 'wall', label: 'Lighting', hotkey: 'wall', dmOnly: true, hideable: true, experimental: 'dynamicLighting',
    description: 'Draw walls and doors, place lights, and decide what each token can see.',
  },
  {
    id: 'pin', label: 'Note pin', hotkey: 'pin', dmOnly: true, hideable: true,
    description: 'Pin a note or a link to another scene onto a spot on the map.',
  },
  {
    id: 'audio', label: 'Ambient sound', hotkey: 'audio', dmOnly: true, hideable: true, enabled: AMBIENT_AUDIO_ENABLED,
    description: 'Place sounds on the map that grow louder as tokens come near.',
  },
  {
    id: 'viewport', label: 'TV viewport', hotkey: 'viewport', dmOnly: true, hideable: true, hiddenByDefault: true, enabled: TV_VIEWPORT_ENABLED,
    description: 'Frame the part of the map a table TV shows, sized so its squares match your miniatures.',
  },
  {
    id: 'dice', label: 'Dice', hotkey: 'diceTray', dmOnly: false, hideable: true,
    description: 'Roll any mix of dice and show the result to everyone at the table.',
  },
  {
    id: 'loot', label: 'Loot roller', hotkey: 'lootRoller', dmOnly: true, hideable: true,
    description: 'Roll random loot from the item notes in your collection.',
  },
  {
    id: 'assets', label: 'Asset manager', hotkey: 'assets', dmOnly: true, hideable: true,
    description: 'Find and place your maps, tokens, scenes and encounters.',
  },
  {
    id: 'palette', label: 'Command palette', hotkey: 'palette', dmOnly: true, hideable: false,
    description: 'Find any Atlas command or setting by typing its name.',
  },
] as const satisfies readonly ToolbarControlDefinition[];

export type ToolbarControlId = (typeof TOOLBAR_CONTROLS)[number]['id'];

/**
 * The undo/redo bar, which the editor hides and shows as one unit like a
 * control. It is a bar of its own left of the main toolbar, never part of the
 * main bar's order. Never rename its id: stored layouts use it.
 */
export const UNDO_BAR = {
  id: 'undo', label: 'Undo and redo', hotkey: 'undo', dmOnly: true, hideable: true,
  description: 'Step back through your changes on the map, or forward again.',
} as const satisfies ToolbarControlDefinition;

export const UNDO_BAR_ID = UNDO_BAR.id;

/** What the editor can hide and show: the main toolbar's controls and the undo/redo bar. */
export type ToolbarUnitId = ToolbarControlId | typeof UNDO_BAR_ID;

export const DEFAULT_TOOLBAR_ORDER: readonly ToolbarControlId[] = TOOLBAR_CONTROLS.map(control => control.id);

/** The controls that start in the tray until the GM adds them to the bar. */
export const DEFAULT_HIDDEN_CONTROLS: readonly ToolbarControlId[] = TOOLBAR_CONTROLS
  .filter((control: ToolbarControlDefinition) => control.hiddenByDefault === true)
  .map(control => control.id);

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
