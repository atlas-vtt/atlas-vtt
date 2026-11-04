// Frozen from 3c23746a6f54b67b442646ea8ff912c914c2447a src/app/pixi/lighting/playerLightingLayers.ts. Only import paths are adapted.
import type { TokenEntity } from '../../../src/app/types';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { doorsInSight } from '../../../src/app/vision/doorSight';
import { wallList } from '../../../src/app/vision/wallList';
import { movedWhileHeld } from '../../../src/app/lighting/sightOnDrop';
import { lightLevelAt } from '../../../src/app/vision/lightLevels';
import { perceive, targetOf, withinReach, type Perception, type PerceptionOptions } from './perception';
import type { AmbientLight, LightReach, Sight } from './sight';
import { tokenEffects } from '../../../src/app/vision/sightRules';
import type { HideableLayer, LayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
import type { SceneLightingView } from '../../../src/app/pixi/lighting/sceneLightingView';

/** Things only the GM may see. A type, not an interface, so `Object.values` knows its layers. */
export type GmOverlays = {
  /** Wall lines and their handles, shown with the lighting tool. */
  wallEditor: HideableLayer;
  /** The light zones' outlines and handles, shown in the lighting tool's zone mode. */
  lightZones: HideableLayer;
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

/** How the players perceive each token. */
export type TokenPerception = (tokenId: string) => Perception;

/**
 * How the vision tokens perceive each token, by its centre, the light there and its conditions.
 * A token with vision is always shown, whatever its conditions and the light: the players'
 * window is one shared screen, and they are the party. `tokens` is the record the positions are
 * read from, so a caller may pass tokens at other places than the store's.
 *
 * A token with vision that is dragged while sight waits for the drop (`held`: `heldForSight`)
 * shows only where the sight that stayed behind still reaches, by any sense, lit or not. Beyond
 * it the players' picture is dark or remembered, and the token goes with its nameplate, bars
 * and conditions rather than leaving them over the darkness.
 */
// The `held` rule is sight on drop's and must survive a rework of this function: without it a
// dragged vision token's nameplate and bars stand over the darkness that covers its sprite.
export function tokenPerception(
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
  options: PerceptionOptions = {},
  memo?: PerceptionMemo,
): TokenPerception {
  const { conditions = [], held = {} } = options;
  // Every consumer of a frame asks about every token: each is worked out once, and with a memo once for all frames.
  const known = memo?.of(sight, ambient, lights, options) ?? new WeakMap<TokenEntity, Perception>();
  const perceived = (token: TokenEntity): Perception => {
    const at = { x: token.x, y: token.y };
    if (token.vision?.enabled) return !movedWhileHeld(token, held) || withinReach(at, sight) ? 'seen' : 'unseen';
    return perceive(at, sight, () => lightLevelAt(at, ambient, lights), targetOf(tokenEffects(token, conditions)));
  };
  return (tokenId) => {
    const token = tokens[tokenId];
    if (!token) return 'unseen';
    let perception = known.get(token);
    if (!perception) known.set(token, perception = perceived(token));
    return perception;
  };
}

/**
 * What `tokenPerception` worked out, kept from one call to the next while the sight, the light,
 * the conditions and the held tokens are the same objects: a mirrored frame then looks every
 * token up. Each answer is kept by its token, and the store hands out a new token whenever one
 * changes, so only a changed token is worked out again.
 */
export class PerceptionMemo {
  private inputs: readonly unknown[] = [];
  private known = new WeakMap<TokenEntity, Perception>();

  of(sight: Sight, ambient: AmbientLight, lights: readonly LightReach[], { conditions, held }: PerceptionOptions): WeakMap<TokenEntity, Perception> {
    const inputs = [sight, ambient, lights, conditions, held];
    if (inputs.some((input, i) => input !== this.inputs[i])) {
      this.inputs = inputs;
      this.known = new WeakMap();
    }
    return this.known;
  }
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

/** The doors the players see by a scene's lighting (`doorsInSight`): those whose badges their view shows. None while the scene is unlit. */
export function playerDoorSight(
  lighting: Pick<SceneLightingView, 'isEnabled' | 'currentSight' | 'ambientLight' | 'lightReaches'>,
  walls: Record<string, WallSegment>,
): ReadonlySet<string> {
  if (!lighting.isEnabled()) return NO_DOORS;
  return doorsInSight(wallList(walls), lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches());
}
