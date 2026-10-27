import { propLift, tracePropSilhouette } from '../propShapes';
import type { RenderEnv } from '../renderEnv';
import { cellRings } from '../terrain/cellRings';
import { footprint, HEIGHT } from '../terrain/footprints';
import { shownPieces } from '../terrain/pieces';
import type { Stand } from './heights';
import { polysPath } from './paths';
import { groundsStands } from '../grounds/groundsShapes';

/** How tall a prop stands per unit of its lift. */
const PROP_HEIGHT = 0.6;
/** A raised floor's height per step of elevation. */
const RAISED = 0.4;

/** Everything that stands on a floor, for the shadows and occlusion of the scene: columns, props and terrain. */
export function standsOf(env: RenderEnv): Stand[] {
  const { dungeon, view } = env;
  const stands: Stand[] = [];
  for (const c of dungeon.floor.columns) {
    if (c.shattered || dungeon.field.distance(c.x, c.y) >= 0) continue;
    stands.push({
      height: 1,
      path: path => {
        if (c.square) path.rect(c.x - c.radius, c.y - c.radius, c.radius * 2, c.radius * 2);
        else {
          path.moveTo(c.x + c.radius, c.y);
          path.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        }
      },
    });
  }
  if (view.props) {
    const house = dungeon.floor.walls === 'edges';
    for (const prop of dungeon.floor.props) {
      const lift = propLift(prop.kind, house);
      if (lift <= 0 || !dungeon.roomShapes.has(prop.room)) continue;
      stands.push({
        height: Math.min(1, lift * PROP_HEIGHT * prop.scale),
        path: ctx => {
          // The silhouette is traced in the prop's own frame at its fit; the path keeps the frame it was traced in.
          ctx.save();
          ctx.translate(prop.x, prop.y);
          ctx.rotate(prop.rotation);
          ctx.scale(prop.scale, prop.scale);
          tracePropSilhouette(prop, ctx, house);
          ctx.restore();
        },
      });
    }
  }
  for (const piece of shownPieces(env)) {
    if (piece.kind === 'platform' || piece.kind === 'ledge') {
      stands.push({ height: RAISED * (piece.traits.elevation ?? 1), path: polysPath(cellRings(piece.cells)) });
      continue;
    }
    const height = HEIGHT[piece.kind];
    const path = footprint(piece);
    if (height && path) stands.push({ height, path });
  }
  stands.push(...groundsStands(dungeon.floor));
  return stands;
}
