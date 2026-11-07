import { viewBounds, type ArtScene } from '../../art/artScene';
import { hash2, valueNoise } from '../../art/noise';
import { clipFloors, traceRings } from '../../art/outline';
import { runsPath } from '../../art/paths';
import type { Vec } from '../../geometry';
import type { Pens } from '../../engraved/pens';
import { withAlpha } from '../../palette';
import type { StoneColours } from '../../stone/colours';

/** Fractures belong to the whole floor, not to its rooms or the drawing's window. */
function fractures(scene: ArtScene): Vec[][] {
  const { dungeon } = scene.env;
  const seed = dungeon.model.seed + dungeon.index * 101;
  const faults = dungeon.floor.cave?.faults ?? [];
  const b = viewBounds(scene.frame, 4);
  const runs: Vec[][] = [];
  const step = 3;
  for (let j = Math.floor(b.minY / step); j <= b.maxY / step; j++) {
    for (let i = Math.floor(b.minX / step); i <= b.maxX / step; i++) {
      if (hash2(i, j, seed) < 0.35) continue;
      const x = (i + hash2(i, j, seed + 1)) * step;
      const y = (j + hash2(i, j, seed + 2)) * step;
      if (dungeon.field.distance(x, y) > 2) continue;
      const fault = faults[Math.floor(hash2(i, j, seed + 3) * faults.length)];
      const angle = (fault?.angle ?? 0.6) + (hash2(i, j, seed + 4) - 0.5) * 0.6;
      const length = 0.9 + hash2(i, j, seed + 5) * 2.1;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const run: Vec[] = [];
      for (let k = 0; k <= 8; k++) {
        const along = (k / 8 - 0.5) * length;
        const drift = (valueNoise(x * 2 + k * 0.7, y * 2, seed + 6) - 0.5) * 0.22;
        run.push({ x: x + dx * along - dy * drift, y: y + dy * along + dx * drift });
      }
      runs.push(run);
      if (hash2(i, j, seed + 7) > 0.6) {
        const a = run[5]!;
        runs.push([a, { x: a.x + dx * 0.2 + dy * 0.2, y: a.y + dy * 0.2 - dx * 0.2 }, { x: a.x + dx * 0.4 + dy * 0.28, y: a.y + dy * 0.4 - dx * 0.28 }]);
      }
    }
  }
  return runs;
}

/** Broad worn patches, nearly the floor's value; their contours are visible in SVG too. */
function mineralWash(scene: ArtScene, c: StoneColours): void {
  const { ctx, dungeon } = scene.env;
  const seed = dungeon.model.seed;
  const b = viewBounds(scene.frame, 5);
  for (const light of [false, true]) {
    ctx.beginPath();
    for (let j = Math.floor(b.minY / 4); j <= b.maxY / 4; j++) {
      for (let i = Math.floor(b.minX / 4); i <= b.maxX / 4; i++) {
        if ((hash2(i, j, seed + 15) > 0.5) !== light) continue;
        const x = (i + hash2(i, j, seed + 16)) * 4;
        const y = (j + hash2(i, j, seed + 17)) * 4;
        if (dungeon.field.distance(x, y) > 3) continue;
        const poly = Array.from({ length: 10 }, (_, k) => {
          const angle = k * Math.PI / 5;
          const r = 1.2 + valueNoise(x + Math.cos(angle), y + Math.sin(angle), seed + 18) * 1.6;
          return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r * 0.65 };
        });
        const last = poly[9]!;
        ctx.moveTo((last.x + poly[0]!.x) / 2, (last.y + poly[0]!.y) / 2);
        for (let k = 0; k < poly.length; k++) {
          const p = poly[k]!;
          const q = poly[(k + 1) % poly.length]!;
          ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
        }
        ctx.closePath();
      }
    }
    let colour = c.light;
    if (!light) colour = c.dark ? '#000000' : c.line;
    ctx.fillStyle = withAlpha(colour, c.mono ? 0.018 : 0.025);
    ctx.fill();
  }
}

export function stoneFloor(scene: ArtScene, c: StoneColours): void {
  const { ctx } = scene.env;
  ctx.save();
  ctx.beginPath();
  traceRings(ctx, scene.floorRings);
  ctx.fillStyle = c.floor;
  ctx.fill();
  clipFloors(scene);
  mineralWash(scene, c);
  ctx.beginPath();
  runsPath(fractures(scene))(ctx);
  ctx.strokeStyle = withAlpha(c.line, c.dark ? 0.13 : 0.15);
  ctx.lineWidth = 0.007;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export function engravedFloor(scene: ArtScene, pens: Pens): void {
  const { ctx } = scene.env;
  ctx.save();
  ctx.beginPath();
  traceRings(ctx, scene.floorRings);
  ctx.fillStyle = pens.floor;
  ctx.fill();
  ctx.restore();
  engravedFractures(scene, pens);
}

/** The faults of a cave's floor as short burin strokes, over whatever its floor is. */
export function engravedFractures(scene: ArtScene, pens: Pens): void {
  const { ctx } = scene.env;
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  // Short burin strokes suggest the same faults without cutting closed paving joints.
  for (const run of fractures(scene)) runsPath([run.slice(0, 3), run.slice(4, 6), run.slice(7)])(ctx);
  ctx.strokeStyle = withAlpha(pens.ink, 0.16);
  ctx.lineWidth = 0.009;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}
