import type { App } from 'obsidian';
import { readFogEdge, type FogEdge } from '../../fog/fogEdge';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { SettingsService } from '../../services/SettingsService';
import { resolveLaserPointerSettings, type LaserPointerSettings } from '../../tools/laserPointerSettings';
import type { SightRules } from '../../vision/sightRules';
import type { SceneState } from './atlasView.ts';

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
  /** Whether the GM's initiative lists start at the turn during a fight (the `initiativeLayout` preference); false when it cannot be read. */
  readonly initiativeFromTurn?: boolean;
  /** The edge the GM docked the initiative lists at (the `initiativeLayout` preference); the right one when it cannot be read. */
  readonly initiativeDock?: 'left' | 'right';
  /** Whether a turn change shows the turn banner (the `initiativeTurnOptions` preference); on when it cannot be read. */
  readonly turnBanner?: boolean;
  /** Whether players move tokens that fight only on their turn (the `initiativeTurnOptions` preference); off when it cannot be read. */
  readonly movesOnTurn?: boolean;
  /** Whether players may draw on the map (the player view's setting); off when it cannot be read. */
  readonly playersDraw?: boolean;
  /** Whether players may ask to open doors (the player view's setting); off when it cannot be read. */
  readonly playersOpenDoors?: boolean;
  /** Whether every player sees through every player character's vision (the player view's setting); off, each through their own characters' alone, and off when it cannot be read. */
  readonly sharedVision?: boolean;
  /** How the fog's edge looks (the Maps setting), for players as for the GM; unset when it cannot be read, which players see as a hard edge. */
  readonly fogEdge?: FogEdge;
}

/** Calls `listener` whenever Atlas's settings change; without its settings nothing is told. Returns what stops it. */
export function followAtlasSettings(app: App, listener: () => void): () => void {
  return SettingsService.forApp(app)?.onChange(() => listener()) ?? ((): void => undefined);
}

/** Atlas's own settings, as its settings service holds them; each as said above while they cannot be read. */
export function atlasPlayerSettings(app: App): AtlasPlayerSettings {
  const settings = SettingsService.forApp(app);
  const view = settings?.get('localPlayerView');
  const turn = settings?.get('initiativeTurnOptions');
  const fogEdge = settings === undefined ? undefined : readFogEdge(settings.get('fogEdge'));
  return {
    showNames: view?.showTokenNameplates === true,
    showDiceRolls: view?.showDiceRolls === true,
    showInitiative: view?.showInitiative === true,
    showWidgets: view?.showWidgets === true,
    showCursors: view?.showCursors === true,
    initiativeFromTurn: settings?.get('initiativeLayout').fromTurn === true,
    initiativeDock: 'right',
    turnBanner: turn?.banner !== false,
    movesOnTurn: turn?.movesOnTurn === true,
    playersDraw: view?.playersDraw === true,
    playersOpenDoors: view?.playersOpenDoors === true,
    sharedVision: view?.sharedVision === true,
    ...(fogEdge !== undefined && { fogEdge }),
  };
}

/** The GM's laser colour and size from Atlas's settings, as Atlas reads them (its default when they cannot be read). */
export function atlasLaserLook(app: App): LaserPointerSettings {
  return resolveLaserPointerSettings(SettingsService.forApp(app)?.get('laserPointer'));
}

/** The theme's accent colour as `#rrggbb`, resolved by the document itself; null when it gives none. */
export function accentColour(doc: Document): string | null {
  const probe = doc.body.createSpan({ cls: 'atlas-color-probe atlas-color-probe--accent' });
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
