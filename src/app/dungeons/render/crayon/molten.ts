import type { ArtScene } from '../art/artScene';
import { moltenHeat } from '../art/lavaField';
import { clipFloors } from '../art/outline';
import { polysPath, runsPath, smoothstep, type Field } from '../art/paths';
import { depthField } from '../art/pools';
import type { Vec } from '../geometry';
import { CRAYONS } from './colours';
import type { CrayonBox } from './crayonBox';
import { crayonPaint } from './tooth';

/** How wide the cooled crust along a flow's banks is, in cells: the umber pressed in there. */
const CRUST = 0.2;
/** How wide the faint glow on the floor beside lava reaches, in cells, and how heavily it is laid. */
const GLOW_REACH = 0.45;
const GLOW_COVER = 0.32;

/**
 * Molten rock as a hand colours it: flame over the whole of it and ember over that, light over its
 * core and heavier down its flow, where it has cooled, umber along its banks where its crust has set, and a
 * faint band of flame on the floor beside it, as its glow. Acid is one acid-green crayon.
 */
export function crayonMolten(scene: ArtScene, box: CrayonBox, pools: readonly Vec[][], tint: 'lava' | 'acid', flow?: Vec): void {
  const { ctx } = scene.env;
  // On the floor only, as its ink is: a flow running into its wall never colours the rock.
  ctx.save();
  clipFloors(scene);
  colourMolten(scene, box, pools, tint, flow);
  ctx.restore();
}

function colourMolten(scene: ArtScene, box: CrayonBox, pools: readonly Vec[][], tint: 'lava' | 'acid', flow?: Vec): void {
  const path = polysPath(pools);
  if (tint === 'acid') {
    box.colourIn(path, { colour: CRAYONS.acid, cover: 0.9, passes: 3 });
    return;
  }
  const depth = depthField(scene, path, pools.flat());
  const heat = moltenHeat(pools, depth, flow);
  glowBeside(scene, pools);
  const core: Field = (x, y) => smoothstep(0.04, heat.core, depth(x, y)) * (1 - heat.cooled(x, y) * 1.6);
  const crust: Field = (x, y) => 1 - smoothstep(0, CRUST, depth(x, y));
  // Crayon only darkens what lies under it: the flame goes first, the ember over it heaviest where the rock has cooled.
  box.colourIn(path, { colour: CRAYONS.flame, cover: 0.95, passes: 3 });
  box.colourIn(path, { colour: CRAYONS.ember, cover: 0.95, passes: 3 }, (x, y) => 1 - 0.85 * core(x, y));
  box.colourIn(path, { colour: CRAYONS.umber, cover: 0.6, passes: 2 }, crust);
}

/** Flame laid along the shore on the floor outside it, wide and faint, then narrower and a little stronger: a glow fading out from the lava. */
function glowBeside(scene: ArtScene, pools: readonly Vec[][]): void {
  if (scene.env.view.monochrome) return;
  const { ctx } = scene.env;
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  polysPath(pools)(ctx);
  ctx.clip('evenodd');
  ctx.globalCompositeOperation = scene.raster ? 'multiply' : 'source-over';
  ctx.strokeStyle = scene.raster ? crayonPaint(ctx, CRAYONS.flame) : CRAYONS.flame;
  ctx.lineJoin = 'round';
  const shores = runsPath(pools, true);
  for (const [width, cover] of [[GLOW_REACH * 2, GLOW_COVER * 0.5], [GLOW_REACH, GLOW_COVER * 0.6]] as const) {
    ctx.globalAlpha = cover;
    ctx.lineWidth = width;
    ctx.beginPath();
    shores(ctx);
    ctx.stroke();
  }
  ctx.restore();
}
