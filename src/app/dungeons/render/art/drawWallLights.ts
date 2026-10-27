import { wallLightsOf } from '../wallLights/wallLightSites';
import { WALL_LIGHT_GLYPHS } from '../wallLights/wallLightGlyphs';
import { drawGlyph } from './glyph';
import type { Hand } from './hand';
import { clipFloors } from './outline';

/**
 * The lights a lived-in dungeon hangs on its walls (`wallLightsOf`), where the view shows pieces:
 * each burning on its wall's face, in a cave clipped to the floor as drawn, as its props are.
 */
export function drawWallLights(hand: Hand, water: string, cloth: string): void {
  const { scene } = hand;
  const { dungeon, view, ctx } = scene.env;
  if (!view.props) return;
  const lights = wallLightsOf(dungeon);
  if (lights.length === 0) return;
  const cave = dungeon.floor.cave !== undefined;
  if (cave) {
    ctx.save();
    clipFloors(scene);
  }
  for (const light of lights) drawGlyph(hand, { ...light, scale: 1, fit: { along: 0.4, out: 0.3 } }, WALL_LIGHT_GLYPHS[light.kind], water, cloth);
  if (cave) ctx.restore();
}
