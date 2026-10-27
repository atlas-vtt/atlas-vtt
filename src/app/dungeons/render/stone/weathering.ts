import { parseHex } from '../palette';
import { layerOf, type ArtScene } from '../art/artScene';
import { noiseSampler } from '../art/noise';
import { grownRings, traceRings } from '../art/outline';
import { drawGridCanvas, fieldOf, rgbaCanvas } from '../art/raster';
import { paintLayer } from '../art/strips';
import { BAND } from './walls';

/**
 * What a look's dungeon is overgrown with (`DungeonStyle.weathering`): moss, frost, soot or slime,
 * thickest at the foot of the walls and in the corners, creeping out across the floor in patches.
 */
export function drawWeathering(scene: ArtScene): void {
  const { env, grid } = scene;
  const weathering = env.style.weathering;
  if (!weathering || !scene.raster || env.view.monochrome) return;
  const seed = env.dungeon.model.seed;
  const patches = noiseSampler(seed + 51, 5, 3, 4);
  const tufts = noiseSampler(seed + 52, 0.8, 4, 3);
  const alpha = fieldOf(grid, (x, y) => {
    const d = scene.sdfAt(x, y);
    if (d > BAND) return 0;
    // Against the wall and in corners, then patches where the floor lies damp.
    const foot = Math.exp(-Math.abs(d) / 0.22) * 0.8 + scene.occlusionAt(x, y) * 0.9;
    const patch = Math.max(0, patches(x, y) - 0.55) * 2.2;
    const grain = 0.55 + 0.45 * tufts(x, y);
    return Math.min(1, (foot * 0.75 + patch) * grain) * weathering.amount;
  });
  const canvas = rgbaCanvas(grid, parseHex(weathering.color), alpha);
  paintLayer(layerOf(scene), 'source-over', layer => {
    // On the floor and the wall's course, never out on the rock.
    layer.beginPath();
    traceRings(layer, grownRings(scene, BAND));
    layer.clip();
    drawGridCanvas(layer, grid, canvas);
  });
}
