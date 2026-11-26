import type { SensedMark } from '../protocol/index.ts';
import { fogSparesToken } from '../../characters/partyTokens';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import { levelObjects } from '../../levels/levelObjects';
import { levelForeground } from '../../levels/levelEdits';
import { levelMapKey, viewedLevelId } from '../../levels/sceneLevels';
import { mapTokens } from '../../tokens/offMap';
import type { TokenEntity } from '../../types';
import { SceneModelBuilder } from '../../vision/sceneModel';
import type { TokenPerception } from '../../vision/tokenPerception';
import type { SightPolicy } from '../../vision/tokenSightPolicy';
import { isLit, type LightingSource } from './atlasLighting.ts';
import type { SceneState } from './atlasView.ts';
import type { PartyLighting, PictureBasis } from './eyesSight.ts';
import type { MapSize } from './moveCheck.ts';
import { roundPlace } from './scenePicture.ts';

/** The world sight without a range reaches over where the floor's map size is not known. */
const UNKNOWN_MAP: MapSize = { width: 8192, height: 8192 };

/** What a floor's picture is worked out from besides the store. */
export interface FloorSightPorts {
  /** The floor's state: the shared scene with this floor shown. */
  state(): SceneState;
  /** The size of the floor's map, or null while it is not known. */
  map(): MapSize | null;
  /** Where the GM's lighting reads its rules and measurement, or null while it cannot be read. */
  lightingSource(): LightingSource | null;
  /** The grid's cell, which a sensed token's outline is sized by. */
  cell(): number;
}

/**
 * The players' picture of a floor the GM's view does not show, worked out on the CPU as Atlas's own
 * lighting works it out (`SceneModelBuilder`; `EyesSight` reads it as `tokenPerception`) with the floor's
 * committed fog. A floor with a roof is read failing closed, since the roof's pieces are known only where
 * the GM's view draws it: players see the tokens their eyes always see there and nothing else of what a
 * roof could hide.
 */
export class FloorSight implements PictureBasis {
  private readonly builder = new SceneModelBuilder({ reflectedLight: false });
  private readonly fog = new FogCoverageCache();

  constructor(private readonly ports: FloorSightPorts) {}

  /** The floor's lighting worked out now, or null while the scene is unlit or its rules cannot be read. */
  lighting(): PartyLighting | null {
    const state = this.ports.state();
    const source = this.ports.lightingSource();
    if (!isLit(state) || source === null) return null;
    const { model } = this.builder.update(state, this.ports.map() ?? UNKNOWN_MAP, () => source.measurement(), () => source.rules());
    return { sight: model.sight, ambient: model.ambient, reaches: model.reaches };
  }

  /** `lit` under the floor's committed fog, which never takes a token of the party's, failing closed under a roof. */
  frame(lit: TokenPerception | undefined, policy: SightPolicy): TokenPerception | undefined {
    const state = this.ports.state();
    const objects = levelObjects(state);
    const tokens = mapTokens(objects);
    const coverage = this.fog.get(objects.fog, levelMapKey(state.mapPath, state));
    const fogged = coverage === null || coverage.shape.length > 0;
    const roofed = this.roofed();
    if (!fogged && !roofed) return lit;
    return (id) => {
      const token = tokens[id];
      if (token === undefined || (fogged && !fogSparesToken(token) && (coverage === null || coverage.covers(token)))) return 'unseen';
      if (roofed && !policy.alwaysSeen(token)) return 'unseen';
      return lit?.(id) ?? 'seen';
    };
  }

  /** Whether the floor has a roof, which only the GM's view of it can tell players' tokens from. */
  roofed(): boolean {
    const state = this.ports.state();
    return levelForeground(state, viewedLevelId(state)) !== null;
  }

  drawn(): Readonly<Record<string, object | null>> {
    return mapTokens(levelObjects(this.ports.state()));
  }

  /** A sensed token's outline: its stored place, `cell`-sized for each unit of its size. */
  outline(_tokenId: string, token: TokenEntity): SensedMark | null {
    if (!Number.isFinite(token.x) || !Number.isFinite(token.y)) return null;
    const size = typeof token.size === 'number' && token.size > 0 && Number.isFinite(token.size) ? token.size : 1;
    return { x: roundPlace(token.x), y: roundPlace(token.y), size: size * this.ports.cell() };
  }
}
