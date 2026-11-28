import { levelObjects } from '../levels/levelObjects';
import { heldForSight } from '../lighting/sightOnDrop';
import { playerDoorSight, playerPointSight } from '../pixi/lighting/playerLightingLayers';
import type { SceneLightingView } from '../pixi/lighting/sceneLightingView';
import { shownRollTokens, type RollSceneState } from '../pixi/playerRollTokens';
import type { ShownRollToken } from '../services/playerRollSource';
import { mapTokens } from '../tokens/offMap';
import type { FogCoverage } from '../fog/fogCoverage';
import type { TokenEntity } from '../types';
import type { ViewState } from '../types/viewState';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { perceptionOptions } from '../vision/perception';
import { selectSight } from '../vision/selectSight';
import type { AmbientLight, LightReach, Sight } from '../vision/sight';
import type { SightRules } from '../vision/sightRules';
import { PerceptionMemo, tokenPerception, type TokenPerception } from '../vision/tokenPerception';
import type { SightPolicy } from '../vision/tokenSightPolicy';

/** A floor's lighting as the players' sight reads it: the party's sight, which every set of eyes is cut from, the ambient light and the lights' reaches. */
export interface PartyLighting {
  readonly sight: Sight;
  readonly ambient: AmbientLight;
  readonly reaches: LightReach[];
}

/**
 * How a floor is lit for the players now: unlit (sight hides nothing), or lit by `lighting`, which is null while it
 * cannot tell: its sight is another scene's or from before a lost graphics context, or its rules cannot be read.
 * Players then see nothing of a lit floor.
 */
export type FloorLight = { readonly lit: false } | { readonly lit: true; readonly lighting: PartyLighting | null };

export const UNLIT: FloorLight = { lit: false };
export const CANNOT_TELL: FloorLight = { lit: true, lighting: null };

/**
 * Where the players' picture of a floor is read from: the GM's canvas while it draws the floor (`canvasSightSource`,
 * Atlas's lighting view) or the floor worked out on the CPU (`FloorSight`).
 */
export interface SightSource {
  light(): FloorLight;
  /** How the players' frame shows each token under committed fog and the roof, given what `policy`'s eyes perceive by the lighting (none while unlit). */
  frame(lit: TokenPerception | undefined, policy: SightPolicy): TokenPerception | undefined;
  /** Whether a roof the source cannot read covers the floor: then no door, place or sensed token is seen. */
  roofed(): boolean;
  /** The tokens the source draws, by id; null while it draws none (a canvas without its token renderer). */
  drawn(): Readonly<Record<string, object | null>> | null;
}

/** The state of a floor as perception reads it: the shared scene with this floor shown. */
export type PerceivedState = RollSceneState & Pick<ViewState, 'lighting' | 'heldTokens' | 'objects'> & Partial<Pick<ViewState, 'levels' | 'viewedLevel'>>;

/** What players' perception of a floor reads besides its source. */
export interface PerceivedFloor {
  state(): PerceivedState;
  /** The map's rules of sight, or undefined while they cannot be read. */
  rules(): SightRules | undefined;
}

const NO_DOORS: ReadonlySet<string> = new Set();
const NO_TOKENS: ReadonlyMap<string, ShownRollToken> = new Map();
const UNSEEN: TokenPerception = () => 'unseen';

/**
 * What one set of eyes (`policy`: the party's, or one player's own characters) may see of a floor: the tokens they see
 * and those they only sense, the doors they see, and the places where their picture shows the map. Committed fog,
 * roofs, hidden tokens, tokens held for sight, and a lit floor whose lighting cannot tell are decided here alone; each
 * question asks a source (`SightSource`). The eyes' cut of the party's sight and what they perceive of each token are
 * kept from call to call while the party's sight is the same object; a policy that changes makes new perception.
 */
export class PlayersPerception {
  private cut: { readonly from: Sight; readonly sight: Sight } | null = null;

  /** `memo` keeps what tokens are perceived as; a canvas shares one with its own lighting, which asks the same. */
  constructor(readonly policy: SightPolicy, private readonly floor: PerceivedFloor, private readonly memo = new PerceptionMemo()) {}

  /** The party's lighting with these eyes' sight: what their memory records; null while the floor is unlit or its lighting cannot tell. */
  lighting(source: SightSource): PartyLighting | null {
    const light = source.light();
    return light.lit && light.lighting !== null ? { ...light.lighting, sight: this.sightOf(light.lighting.sight) } : null;
  }

  /** How these eyes perceive each token of the floor: every one unseen while a lit floor's lighting cannot tell. */
  tokens(source: SightSource): TokenPerception | undefined {
    const light = source.light();
    const state = this.floor.state();
    const options = perceptionOptions(this.floor.rules(), heldForSight(state), this.policy);
    if (!light.lit) return source.frame(undefined, options.policy);
    if (light.lighting === null) return UNSEEN;
    const { sight, ambient, reaches } = light.lighting;
    return source.frame(tokenPerception(this.sightOf(sight), ambient, reaches, mapTokens(levelObjects(state)), options, this.memo), options.policy);
  }

  /** The tokens among `tokenIds` (all without) these eyes see of the floor showing `mapPath`, drawn by the source: what rolls name and the table sends. */
  shown(source: SightSource, mapPath: string, tokenIds?: readonly string[]): ReadonlyMap<string, ShownRollToken> {
    const drawn = source.drawn();
    return drawn === null ? NO_TOKENS : shownRollTokens(this.floor.state(), mapPath, drawn, () => this.tokens(source), tokenIds);
  }

  /** The ids among `tokens` these eyes only sense, never a hidden one; null while the floor is unlit, its lighting cannot tell, or the source draws no token. */
  sensed(source: SightSource, tokens: Readonly<Record<string, TokenEntity>>): string[] | null {
    if (this.lighting(source) === null || source.drawn() === null) return null;
    const perception = source.roofed() ? undefined : this.tokens(source);
    if (perception === undefined) return [];
    return Object.entries(tokens).flatMap(([id, token]) => (token.isHidden === true || perception(id) !== 'sensed' ? [] : [id]));
  }

  /** The doors these eyes see now (`playerDoorSight`, with the committed fog); null while the floor is unlit or its lighting cannot tell. */
  doors(source: SightSource, walls: Readonly<Record<string, WallSegment>>, fog: FogCoverage | null): ReadonlySet<string> | null {
    const lighting = this.viewLighting(source);
    if (lighting === null) return null;
    return source.roofed() ? NO_DOORS : playerDoorSight(lighting, walls, fog);
  }

  /**
   * Which of `points` these eyes' picture shows the map at now: on a lit floor its sight by the door badges' rule
   * (`playerPointSight`), on an unlit one wherever committed fog does not cover them; fog that cannot be read covers
   * all. Null while a lit floor's lighting cannot tell.
   */
  places(source: SightSource, points: readonly Point[], fog: FogCoverage | null): boolean[] | null {
    if (!source.light().lit) return points.map((point) => fog !== null && !fog.covers(point));
    const lighting = this.viewLighting(source);
    if (lighting === null) return null;
    return source.roofed() ? points.map(() => false) : playerPointSight(lighting, points, fog);
  }

  /** What these eyes' sight is worked out from now, each the same object while it is the same; null as for the doors. */
  sightParts(source: SightSource): readonly unknown[] | null {
    const lighting = this.lighting(source);
    return lighting === null ? null : [lighting.sight, lighting.ambient, lighting.reaches];
  }

  /** The lighting as the door and place rules read it, with these eyes' sight; null as for the doors. */
  private viewLighting(source: SightSource): Pick<SceneLightingView, 'isEnabled' | 'currentSight' | 'ambientLight' | 'lightReaches'> | null {
    const lighting = this.lighting(source);
    if (lighting === null) return null;
    return { isEnabled: () => true, currentSight: () => lighting.sight, ambientLight: () => lighting.ambient, lightReaches: () => lighting.reaches };
  }

  /** These eyes' part of the party's sight, the same object while the party's is, so perception is kept from call to call. */
  private sightOf(party: Sight): Sight {
    if (this.cut?.from !== party) this.cut = { from: party, sight: selectSight(party, mapTokens(levelObjects(this.floor.state())), this.policy) };
    return this.cut.sight;
  }
}

/** What the players' picture reads of a map view's canvas: its lighting view and its token renderer, each null while the canvas has none. */
export interface CanvasSightPorts {
  lighting(): { readonly renderer: Pick<SceneLightingView, 'isEnabled' | 'sightIsCurrent' | 'currentSight' | 'ambientLight' | 'lightReaches'> } | null;
  tokens(): {
    /** How the players' frame shows each token, given what the lighting perceives: under committed fog and the drawn roof. */
    playerFramePerception(lit?: TokenPerception): TokenPerception | undefined;
    getTokenSprites(): Readonly<Record<string, object | null>>;
  } | null;
}

/**
 * A map view's canvas as the source of the players' picture of the floor it draws: Atlas's lighting view (the GPU
 * lighting, or its Canvas fallback), lit while its scene is and unlit without one; its sight cannot tell while it is
 * not the scene's (`sightIsCurrent`). The token renderer's players' frame lays committed fog and the drawn roof over it.
 */
export function canvasSightSource(ports: CanvasSightPorts): SightSource {
  return {
    light: (): FloorLight => {
      const lighting = ports.lighting()?.renderer;
      if (lighting === undefined || !lighting.isEnabled()) return UNLIT;
      if (!lighting.sightIsCurrent()) return CANNOT_TELL;
      return { lit: true, lighting: { sight: lighting.currentSight(), ambient: lighting.ambientLight(), reaches: lighting.lightReaches() } };
    },
    frame: (lit) => {
      const tokens = ports.tokens();
      return tokens === null ? UNSEEN : tokens.playerFramePerception(lit);
    },
    roofed: () => false,
    drawn: () => ports.tokens()?.getTokenSprites() ?? null,
  };
}
