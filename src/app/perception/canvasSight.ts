import type { SceneLightingView } from '../pixi/lighting/sceneLightingView';
import type { TokenPerception } from '../vision/tokenPerception';
import { CANNOT_TELL, UNLIT, type FloorLight, type SightSource } from './playersPerception';

/** What the players' picture reads of a map view's canvas: its lighting view and its token renderer, each null while the canvas has none. */
export interface CanvasSightPorts {
  lighting(): { readonly renderer: Pick<SceneLightingView, 'isEnabled' | 'sightIsCurrent' | 'currentSight' | 'ambientLight' | 'lightReaches'> } | null;
  tokens(): {
    /** How the players' frame shows each token, given what the lighting perceives: under committed fog and the drawn roof. */
    playerFramePerception(lit?: TokenPerception): TokenPerception | undefined;
    getTokenSprites(): Readonly<Record<string, object | null>>;
  } | null;
}

const UNSEEN: TokenPerception = () => 'unseen';

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
