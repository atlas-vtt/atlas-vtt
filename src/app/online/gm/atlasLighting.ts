import type { App } from 'obsidian';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { resolveLaserPointerSettings, type LaserPointerSettings } from '../../tools/laserPointerSettings';
import type { SightRules } from '../../vision/sightRules';
import type { SceneState } from './atlasView.ts';

/** The plugin id of Atlas, whose instance holds its settings. */
export const ATLAS_PLUGIN_ID = 'atlas-vtt';

/**
 * What the GM's own lighting of a tab works its scene out by: the sight rules of the map's
 * collection (its senses and conditions, and how each token perceives, statblocks included) and
 * its measurement. The players' picture is built from the same, so it is the GM's player picture.
 */
export interface LightingSource {
  rules(): SightRules;
  measurement(): MeasurementSettings;
}

/** The Atlas settings the companion follows. */
export interface AtlasPlayerSettings {
  /** Whether players see token names (the player view's nameplate setting); false when it cannot be read. */
  readonly showNames: boolean;
  /** Whether players see the GM's dice rolls (the player view's setting); false when it cannot be read. */
  readonly showDiceRolls: boolean;
  /** Whether players see the initiative list (the player view's setting); false when it cannot be read. */
  readonly showInitiative: boolean;
  /** Whether players see the scene's widgets (the player view's setting); false when it cannot be read. */
  readonly showWidgets: boolean;
  /** Whether everyone at the table sees everyone else's cursor (the player view's setting); false when it cannot be read. */
  readonly showCursors: boolean;
  /** Whether the GM's initiative lists start at the turn during a fight (`initiativeLayout`); false when it cannot be read. */
  readonly initiativeFromTurn?: boolean;
  /** The edge the GM docked the initiative lists at (`initiativeLayout`); the right one when it cannot be read. */
  readonly initiativeDock?: 'left' | 'right';
  /** Whether a turn change shows the turn banner (`initiativeTurnOptions`); on when it cannot be read. */
  readonly turnBanner?: boolean;
  /** Whether players move tokens that fight only on their turn (`initiativeTurnOptions`); off when it cannot be read. */
  readonly movesOnTurn?: boolean;
}

/** A field of an object by name, unchecked; undefined for anything that has none. */
export function field(target: unknown, name: string): unknown {
  return typeof target === 'object' && target !== null && name in target ? (target as Record<string, unknown>)[name] : undefined;
}

/**
 * The lighting source of an Atlas tab's renderer (`PixiRendererOrchestrator`): its lighting
 * controller's sight aids read the rules and measurement its lighting is built with. Null when
 * the path is not there (another Atlas version): a lit scene is then not shared at all.
 */
export function lightingSourceOf(renderer: unknown): LightingSource | null {
  const controller = field(renderer, 'lighting');
  const deps = field(field(controller, 'sightAids'), 'deps');
  const rules = field(deps, 'rules');
  const measurement = field(deps, 'measurement');
  if (typeof rules !== 'function' || typeof measurement !== 'function') return null;
  return { rules: () => (rules as () => SightRules)(), measurement: () => (measurement as () => MeasurementSettings)() };
}

/** Atlas's own settings as its plugin instance holds them (`settingsService`). */
export function atlasPlayerSettings(app: App): AtlasPlayerSettings {
  // Obsidian keeps the loaded plugins by id in `app.plugins.plugins`.
  const settings = field(field(field(field(app, 'plugins'), 'plugins'), ATLAS_PLUGIN_ID), 'settingsService');
  const playerView = field(settings, 'getLocalPlayerViewSettings');
  const view: unknown = typeof playerView === 'function' ? (playerView as () => unknown).call(settings) : undefined;
  const readLayout = field(settings, 'initiativeLayout');
  const layout: unknown = typeof readLayout === 'function' ? (readLayout as () => unknown).call(settings) : undefined;
  const readTurn = field(settings, 'initiativeTurnOptions');
  const turn: unknown = typeof readTurn === 'function' ? (readTurn as () => unknown).call(settings) : undefined;
  return {
    showNames: field(view, 'showTokenNameplates') === true,
    showDiceRolls: field(view, 'showDiceRolls') === true,
    showInitiative: field(view, 'showInitiative') === true,
    showWidgets: field(view, 'showWidgets') === true,
    showCursors: field(view, 'showCursors') === true,
    initiativeFromTurn: field(layout, 'fromTurn') === true,
    initiativeDock: field(layout, 'dock') === 'left' ? 'left' : 'right',
    turnBanner: field(turn, 'banner') !== false,
    movesOnTurn: field(turn, 'movesOnTurn') === true,
  };
}

/** The GM's laser colour and size from Atlas's settings, as Atlas reads them (its default when they cannot be read). */
export function atlasLaserLook(app: App): LaserPointerSettings {
  const settings = field(field(field(field(app, 'plugins'), 'plugins'), ATLAS_PLUGIN_ID), 'settingsService');
  const read = field(settings, 'getLaserPointerSettings');
  const raw: unknown = typeof read === 'function' ? (read as () => unknown).call(settings) : undefined;
  return resolveLaserPointerSettings(typeof raw === 'object' && raw !== null ? raw : undefined);
}

/**
 * How the GM's own ruler labels distances on the tab's map: its measure renderer's provider (the
 * map's collection settings). Null when the renderer has none (another Atlas version) or it fails.
 */
export function measurementOf(renderer: unknown): MeasurementSettings | null {
  const measure = field(renderer, 'measureRenderer');
  const provider = field(measure, 'measurementSettingsProvider');
  if (typeof provider !== 'function') return null;
  try {
    return (provider as () => MeasurementSettings).call(measure);
  } catch {
    return null;
  }
}

/** The theme's accent colour as `#rrggbb`, resolved by the document itself; null when it gives none. */
export function accentColour(doc: Document): string | null {
  const probe = doc.body.createSpan();
  probe.setCssProps({ color: 'var(--interactive-accent)' });
  const resolved = doc.defaultView?.getComputedStyle(probe).color ?? '';
  probe.remove();
  const channels = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(resolved)?.slice(1, 4);
  return channels === undefined ? null : `#${channels.map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** Why a lit scene cannot be shared: the GM's lighting cannot be read, so players would see the map unlit. */
export const LIGHTING_REFUSAL = 'Atlas Online cannot read this scene\'s lighting, so players see nothing of it.';

/** Whether players see the scene lit: its dynamic lighting is on. */
export function isLit(state: SceneState): boolean {
  return state.lighting.enabled;
}

/** The version of the Atlas plugin loaded now, or null. */
export function atlasVersion(app: App): string | null {
  const version = field(field(field(field(field(app, 'plugins'), 'plugins'), ATLAS_PLUGIN_ID), 'manifest'), 'version');
  return typeof version === 'string' && /^[\w.+-]{1,30}$/.test(version) ? version : null;
}
