import type { Vec } from '../geometry';
import { pointsBounds } from '../geometry';
import type { Hand, Material } from '../art/hand';
import { TO_LIGHT } from '../art/light';
import { polyPath } from '../art/paths';

/**
 * A block seen from above whose top is cut back into a smaller one: four sloping faces, each as
 * dark as it looks away from the light. Pillars, an obelisk's point and a statue's plinth use it.
 */
export function facetedBlock(hand: Hand, box: { cx: number; cy: number; w: number; h: number }, top: number, material: Material, apex = false): void {
  const { cx, cy, w, h } = box;
  const outer: Vec[] = [{ x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy + h / 2 }, { x: cx - w / 2, y: cy + h / 2 }];
  const tw = apex ? 0 : w * top;
  const th = apex ? 0 : h * top;
  const inner: Vec[] = [{ x: cx - tw / 2, y: cy - th / 2 }, { x: cx + tw / 2, y: cy - th / 2 }, { x: cx + tw / 2, y: cy + th / 2 }, { x: cx - tw / 2, y: cy + th / 2 }];
  hand.surface(polyPath(outer), material);
  const outward: Vec[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  for (let k = 0; k < 4; k++) {
    const face = [outer[k]!, outer[(k + 1) % 4]!, inner[(k + 1) % 4]!, inner[k]!];
    const lit = outward[k]!.x * TO_LIGHT.x + outward[k]!.y * TO_LIGHT.y;
    hand.tone(() => 0.22 - 0.2 * lit, pointsBounds(face), polyPath(face), 'shade');
  }
  const lines: Vec[][] = [0, 1, 2, 3].map(k => [outer[k]!, inner[k]!]);
  if (!apex) lines.push([...inner, inner[0]!]);
  hand.line(lines, 'fine');
  hand.edges(outer, true);
}
