import type { TokenEntity } from '../../types';
import type { WallSegment } from '../../types/wallTypes';
import type { FogCoverage } from '../../fog/fogCoverage';
import { doorMiddle, doorsInSight, mapShownAt } from '../../vision/doorSight';
import type { Point } from '../../types/visionTypes';
import { wallList } from '../../vision/wallList';
import type { PerceptionOptions } from '../../vision/perception';
import { tokenPerception, type PerceptionMemo, type TokenPerception } from '../../vision/tokenPerception';
import type { HideableLayer, LayerVisibility } from '../playerSafeFrame';
import type { SceneLightingView } from './sceneLightingView';

/** Things only the GM may see. A type, not an interface, so `Object.values` knows its layers. */
export type GmOverlays = {
  /** Wall lines and their handles, shown with the lighting tool. */
  wallEditor: HideableLayer;
  /** The light zones' outlines and handles, shown in the lighting tool's zone mode. */
  lightZones: HideableLayer;
  /** The openings and floors of the level shown, shown in the lighting tool's openings mode. */
  levelSurfaces: HideableLayer;
  /** What the scene remembers, tinted, and the stroke that edits it: shown in the lighting tool's explored-memory mode. */
  exploredMemory: HideableLayer;
  doorBadges: HideableLayer;
  /** The badges on placed lights. */
  lightMarkers: HideableLayer;
  /** The range rings of the light whose popover is open. */
  rangeRings: HideableLayer;
  /** The ranges of the selected vision tokens and the marks on tokens the players do not see (`GmSightAids`). */
  sightAids: HideableLayer;
};

export interface PlayerLightingInput {
  enabled: boolean;
  /** `LightingRenderer.modeLayer`: visible renders the player's view. */
  modeLayer: HideableLayer;
  gmOverlays: GmOverlays;
  /** The outlines of tokens the players sense without seeing them; only the players' view shows them. */
  sensedOutlines?: HideableLayer | undefined;
  /** The badges of the doors the players see (`DoorIcons.playerView`); only the players' view shows them. */
  playerDoorBadges?: HideableLayer | undefined;
}

/**
 * Layer changes for the players' view: the GM's overlays never show; with lighting on, the
 * player's view, the outlines of the tokens they only sense and the badges of the doors they
 * see. The one list of them: a player frame applies it for one capture, the GM's own canvas
 * holds it in session view (`SessionLighting`).
 */
export function playerLightingLayers({ enabled, modeLayer, gmOverlays, sensedOutlines, playerDoorBadges }: PlayerLightingInput): LayerVisibility[] {
  const hidden = Object.values<HideableLayer>(gmOverlays).map((layer) => ({ layer, visible: false }));
  const players = [sensedOutlines, playerDoorBadges].flatMap((layer) => (layer ? [{ layer, visible: enabled }] : []));
  return enabled ? [{ layer: modeLayer, visible: true }, ...players, ...hidden] : [...players, ...hidden];
}

/**
 * How the players perceive the tokens by a scene's lighting, for their frame and for the GM's
 * canvas in session view alike. Undefined while the scene is unlit: sight hides nothing then.
 */
export function playerTokenSight(
  lighting: Pick<SceneLightingView, 'isEnabled' | 'currentSight' | 'ambientLight' | 'lightReaches'>,
  tokens: Record<string, TokenEntity>,
  options?: PerceptionOptions,
  memo?: PerceptionMemo,
): TokenPerception | undefined {
  if (!lighting.isEnabled()) return undefined;
  return tokenPerception(lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches(), tokens, options, memo);
}

const NO_DOORS: ReadonlySet<string> = new Set();

/**
 * Ordinary doors in current sight with an uncovered midpoint: neither committed fog nor a drawn roof
 * (`roofed`) covers it. None while unlit or fog is invalid.
 */
export function playerDoorSight(
  lighting: Pick<SceneLightingView, 'isEnabled' | 'currentSight' | 'ambientLight' | 'lightReaches'>,
  walls: Record<string, WallSegment>,
  fog?: FogCoverage | null,
  roofed?: (point: Point) => boolean,
): ReadonlySet<string> {
  if (!lighting.isEnabled() || fog === null) return NO_DOORS;
  const list = wallList(walls);
  const seen = doorsInSight(list, lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches());
  for (const wall of list) {
    if (!seen.has(wall.id)) continue;
    const middle = doorMiddle(wall);
    if (fog?.covers(middle) || roofed?.(middle)) seen.delete(wall.id);
  }
  return seen;
}

/**
 * Which of `points` the players' picture of a lit scene shows now (`mapShownAt`, the door badges'
 * rule): none where committed fog covers them, none at all while the fog cannot be read (`null`)
 * or the lighting is off.
 */
export function playerPointSight(
  lighting: Pick<SceneLightingView, 'isEnabled' | 'currentSight' | 'ambientLight' | 'lightReaches'>,
  points: readonly Point[],
  fog?: FogCoverage | null,
): boolean[] {
  if (!lighting.isEnabled() || fog === null) return points.map(() => false);
  const shows = mapShownAt(lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches());
  return points.map((point) => !(fog?.covers(point) ?? false) && shows(point));
}
