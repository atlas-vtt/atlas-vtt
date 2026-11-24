import type { SensedMark } from '../protocol/index.ts';
import { levelObjects } from '../../levels/levelObjects';
import { heldForSight } from '../../lighting/sightOnDrop';
import { playerDoorSight, playerPointSight } from '../../pixi/lighting/playerLightingLayers';
import { shownRollTokens } from '../../pixi/playerRollTokens';
import { mapTokens } from '../../tokens/offMap';
import type { TokenEntity } from '../../types';
import { perceptionOptions } from '../../vision/perception';
import { selectSight } from '../../vision/selectSight';
import type { AmbientLight, LightReach, Sight } from '../../vision/sight';
import type { SightRules } from '../../vision/sightRules';
import { PerceptionMemo, tokenPerception, type TokenPerception } from '../../vision/tokenPerception';
import type { SightPolicy } from '../../vision/tokenSightPolicy';
import { isLit } from './atlasLighting.ts';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { PlayerTokenSource, SceneState } from './atlasView.ts';

/** The party's lighting of a floor, which every player's own sight is cut from (`selectSight`). */
export interface PartyLighting {
  readonly sight: Sight;
  readonly ambient: AmbientLight;
  readonly reaches: LightReach[];
}

/**
 * What the pictures of a floor are worked out from, whoever looks: the GM's view of the floor it shows,
 * or the CPU's of another (`FloorSight`).
 */
export interface PictureBasis {
  /** The party's lighting, or null while the scene is unlit or its lighting cannot be read. */
  lighting(): PartyLighting | null;
  /** How the players' frame shows each token, given what `policy`'s eyes perceive by the lighting (none while unlit): under committed fog and a roof. */
  frame(lit: TokenPerception | undefined, policy: SightPolicy): TokenPerception | undefined;
  /** Whether a roof the basis cannot read hides the map: then no door, point or outline is seen. */
  roofed(): boolean;
  /** The tokens the basis draws, by id. */
  drawn(): Readonly<Record<string, object | null>>;
  /** Where the players' frame outlines a token they only sense; null where it draws none. */
  outline(tokenId: string, token: TokenEntity): SensedMark | null;
}

/** What one set of eyes reads of its floor besides the basis. */
export interface EyesContext {
  /** The floor's state: the shared scene with this floor shown. */
  state(): SceneState;
  /** The map's sight rules, or undefined while they cannot be read. */
  rules(): SightRules | undefined;
}

/** The lighting as the door and pin rules read it. */
interface EyesLighting {
  isEnabled(): boolean;
  currentSight(): Sight;
  ambientLight(): AmbientLight;
  lightReaches(): LightReach[];
}

/**
 * The picture of a floor one set of eyes sees: the regions of `policy`'s tokens cut from the party's sight,
 * read through a basis as Atlas's player frame reads its own. The party's eyes (`PLAYER_SIGHT_POLICY`) keep
 * the party's sight as it is. Its memos hold for one policy: a policy that changes makes new eyes.
 */
export class EyesSight {
  private readonly memo = new PerceptionMemo();
  private cut: { readonly from: Sight; readonly sight: Sight } | null = null;

  constructor(readonly policy: SightPolicy, private readonly context: EyesContext) {}

  /** The players' token source of these eyes, sized by the grid of `grid`. */
  tokens(basis: PictureBasis, grid: Pick<PlayerTokenSource, 'getGridOptions'>): PlayerTokenSource {
    return {
      playerRollTokens: (mapPath, tokenIds) => shownRollTokens(this.context.state(), mapPath, basis.drawn(), () => this.perception(basis), tokenIds),
      getGridOptions: () => grid.getGridOptions(),
    };
  }

  /** The map layers' source of these eyes: their doors, points and sensed tokens, the grid and rules of `base`. */
  layers(basis: PictureBasis, base: MapLayerSource): MapLayerSource {
    return {
      grid: () => base.grid(),
      rules: () => base.rules(),
      doorsSeen: (walls, fog) => {
        const lighting = this.lighting(basis);
        if (lighting === null) return null;
        return basis.roofed() ? new Set() : playerDoorSight(lighting, { ...walls }, fog);
      },
      pointsSeen: (points, fog) => {
        const lighting = this.lighting(basis);
        if (lighting === null) return null;
        return basis.roofed() ? points.map(() => false) : playerPointSight(lighting, points, fog);
      },
      sightParts: () => {
        const lighting = this.lighting(basis);
        return lighting === null ? null : [lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches()];
      },
      sensed: (tokens) => {
        if (this.lighting(basis) === null) return null;
        const perception = basis.roofed() ? undefined : this.perception(basis);
        if (perception === undefined) return [];
        return Object.entries(tokens).flatMap(([id, token]) => {
          const outline = token.isHidden === true || perception(id) !== 'sensed' ? null : basis.outline(id, token);
          return outline === null ? [] : [outline];
        });
      },
    };
  }

  /** How these eyes perceive each token of the floor: by its lighting where lit, as the basis's frame shows it. */
  perception(basis: PictureBasis): TokenPerception | undefined {
    const state = this.context.state();
    const tokens = mapTokens(levelObjects(state));
    const sceneLit = isLit(state);
    const lighting = sceneLit ? this.lighting(basis) : null;
    const options = perceptionOptions(this.context.rules(), heldForSight(state), this.policy);
    const lit = lighting === null ? undefined : tokenPerception(lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches(), { ...tokens }, options, this.memo);
    // Lit, but its lighting cannot be read: nothing is seen
    if (sceneLit && lit === undefined) return () => 'unseen';
    return basis.frame(lit, options.policy);
  }

  /** The basis's lighting with these eyes' sight, or null while it has none. */
  private lighting(basis: PictureBasis): EyesLighting | null {
    const party = basis.lighting();
    if (party === null) return null;
    const sight = this.sightOf(party.sight);
    return { isEnabled: () => true, currentSight: () => sight, ambientLight: () => party.ambient, lightReaches: () => party.reaches };
  }

  /** These eyes' part of the party's sight, the same object while the party's is, so perception is kept from call to call. */
  private sightOf(party: Sight): Sight {
    if (this.cut?.from !== party) this.cut = { from: party, sight: selectSight(party, mapTokens(levelObjects(this.context.state())), this.policy) };
    return this.cut.sight;
  }
}
