// Frozen from c2d0d849fbb09f316ca017a3fd2fa6bbb62274c3 src/app/PixiRendererOrchestrator.ts: the bodies of
// `playersSeeMapAt` and `playerRollTokens`, as functions of the parts of the view they read. Only import paths are adapted.
import type { FogCoverage } from '../../../src/app/fog/fogCoverage';
import { playerPointSight } from '../../../src/app/pixi/lighting/playerLightingLayers';
import type { SceneLightingView } from '../../../src/app/pixi/lighting/sceneLightingView';
import type { ShownRollToken } from '../../../src/app/services/playerRollSource';
import type { Point } from '../../../src/app/types/visionTypes';
import type { TokenPerception } from '../../../src/app/vision/tokenPerception';
import { shownRollTokens, type RollSceneState } from './playerRollTokens.ts';

/** What the two methods read of the view: its fog, lighting, token renderer and store. */
export interface FrozenView {
  readonly fogRenderer?: { getCommittedCoverage(): FogCoverage | null };
  readonly lighting?: { readonly renderer: Pick<SceneLightingView, 'isEnabled' | 'sightIsCurrent' | 'currentSight' | 'ambientLight' | 'lightReaches'>; playerSight(): TokenPerception | undefined };
  readonly tokenRenderer?: { getTokenSprites(): Readonly<Record<string, object | null>>; playerFramePerception(lighting?: TokenPerception): TokenPerception | undefined };
  readonly store: { getState(): RollSceneState };
}

export function playersSeeMapAt(view: FrozenView, points: readonly Point[]): readonly boolean[] | null {
  const fog = view.fogRenderer?.getCommittedCoverage() ?? null;
  const lighting = view.lighting?.renderer;
  if (lighting?.isEnabled()) return lighting.sightIsCurrent() ? playerPointSight(lighting, points, fog) : null;
  return points.map((point) => fog !== null && !fog.covers(point));
}

export function playerRollTokens(view: FrozenView, mapPath: string, tokenIds?: readonly string[]): ReadonlyMap<string, ShownRollToken> {
  const tokens = view.tokenRenderer;
  if (!tokens || view.lighting?.renderer.sightIsCurrent() === false) return new Map();
  return shownRollTokens(view.store.getState(), mapPath, tokens.getTokenSprites(), () => tokens.playerFramePerception(view.lighting?.playerSight()), tokenIds);
}
