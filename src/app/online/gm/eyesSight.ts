import type { SensedMark } from '../protocol/index.ts';
import { PlayersPerception, type PartyLighting, type PerceivedFloor, type SightSource } from '../../perception/playersPerception';
import type { TokenEntity } from '../../types';
import type { SightPolicy } from '../../vision/tokenSightPolicy';
import type { MapLayerSource } from './atlasMapLayers.ts';
import type { PlayerTokenSource } from './atlasView.ts';

/**
 * What the pictures of a floor are worked out from, whoever looks: the GM's canvas while it draws the floor
 * (`pictureBasisOf`), or the floor worked out on the CPU (`FloorSight`); and where a token the players only sense is
 * outlined on their page.
 */
export interface PictureBasis extends SightSource {
  /** Where the players' frame outlines a token they only sense; null where it draws none. */
  outline(tokenId: string, token: TokenEntity): SensedMark | null;
}

/**
 * The picture of a floor one set of eyes sees (`PlayersPerception`, by `policy`), read through a basis and handed to
 * the shares as their token source and map layers. Its perception holds for one policy: a policy that changes makes new eyes.
 */
export class EyesSight {
  private readonly perceived: PlayersPerception;

  constructor(readonly policy: SightPolicy, context: PerceivedFloor) {
    this.perceived = new PlayersPerception(policy, context);
  }

  /** The players' token source of these eyes, sized by the grid of `grid`. */
  tokens(basis: PictureBasis, grid: Pick<PlayerTokenSource, 'getGridOptions'>): PlayerTokenSource {
    return {
      playerRollTokens: (mapPath, tokenIds) => this.perceived.shown(basis, mapPath, tokenIds),
      getGridOptions: () => grid.getGridOptions(),
    };
  }

  /** The map layers' source of these eyes: their doors, places and sensed tokens, the grid, rules and presets of `base`. */
  layers(basis: PictureBasis, base: MapLayerSource): MapLayerSource {
    return {
      grid: () => base.grid(),
      rules: () => base.rules(),
      presets: () => base.presets(),
      doorsSeen: (walls, fog) => this.perceived.doors(basis, walls, fog),
      pointsSeen: (points, fog) => this.perceived.places(basis, points, fog),
      sightParts: () => this.perceived.sightParts(basis),
      sensed: (tokens) => this.perceived.sensed(basis, tokens)?.flatMap((id) => {
        const token = tokens[id];
        return (token === undefined ? null : basis.outline(id, token)) ?? [];
      }) ?? null,
    };
  }

  /** What these eyes see of the floor now, in the party's light: what their own memory records; null while the basis has no lighting. */
  seen(basis: PictureBasis): PartyLighting | null {
    return this.perceived.lighting(basis);
  }
}
