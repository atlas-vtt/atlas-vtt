import { parseHex } from '../palette';
import { layerOf, type ArtScene } from '../art/artScene';
import { noiseSampler } from '../art/noise';
import { clipFloors } from '../art/outline';
import { drawGridCanvas, fieldOf, rgbaCanvas } from '../art/raster';
import { paintLayer } from '../art/strips';
import type { StoneColours } from './colours';

/**
 * Light and age on the floor: occlusion gathered at the foot of every wall and whatever stands, the
 * shadows the one light casts, and faint stains of wear, multiplied onto the floor (laid over a
 * dark one) and cut to it. Drawn before what stands, which covers its own foot.
 */
export function drawShade(scene: ArtScene, c: StoneColours): void {
  if (!scene.raster) return;
  const { grid, env } = scene;
  const seed = env.dungeon.model.seed;
  const broad = noiseSampler(seed + 31, 9, 3, 4);
  const fine = noiseSampler(seed + 32, 2.5, 4, 3);
  const strength = env.style.shadow.strength;
  const shadows = env.view.shadow;
  const alpha = fieldOf(grid, (x, y) => {
    if (scene.sdfAt(x, y) > 0.06) return 0;
    const stain = Math.max(0, broad(x, y) - 0.5) * 0.16 + Math.max(0, fine(x, y) - 0.55) * 0.1;
    if (!shadows) return stain;
    const occ = scene.occlusionAt(x, y);
    return Math.min(0.85, (0.5 * occ ** 1.25 + 0.55 * scene.shadowAt(x, y)) * strength * 1.6 + stain);
  });
  const shade = rgbaCanvas(grid, parseHex(c.shadow), alpha);
  paintLayer(layerOf(scene), c.dark ? 'source-over' : 'multiply', layer => {
    clipFloors(scene, layer);
    drawGridCanvas(layer, grid, shade);
  });
}
