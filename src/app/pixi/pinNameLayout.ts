import type { Container } from 'pixi.js';
import { pinSize } from '../styles/designTokens';
import { uncoveredLabels, type LabelBox } from '../utils/labelDeclutter';
import type { PinNameLabel } from './pinNameLabel';

/** Room kept clear around a name, in the badge's units, so two names never touch. */
const CLEARANCE = 3;

/**
 * The widest a name may be next to the map, as a share of the map's width: a map shown small has
 * no room for names, so they wait until zooming in makes it large enough to carry them.
 */
export const MAX_MAP_SHARE = 0.25;

/** A box around a pin group's point, from a box in the group's units at the group's `scale`. */
function onMap(group: Container, box: { left: number; top: number; right: number; bottom: number }, scale: number, grow = 0): Omit<LabelBox, 'id'> {
  return {
    left: group.x + (box.left - grow) * scale,
    top: group.y + (box.top - grow) * scale,
    right: group.x + (box.right + grow) * scale,
    bottom: group.y + (box.bottom + grow) * scale,
  };
}

/**
 * Which pins' names show at the pins' `scale` on a map `mapWidth` wide (world pixels; null while it
 * has no size): those no wider than their share of the map that cover no other name and no other
 * pin's badge, in the pins' order.
 */
export function pinNameBoxes(names: ReadonlyMap<string, PinNameLabel>, groups: Readonly<Record<string, Container>>, scale: number, mapWidth: number | null): Set<string> {
  if (mapWidth === null || !(mapWidth > 0)) return new Set();
  const badge = { left: -pinSize.badgeRadius, top: -pinSize.badgeRadius, right: pinSize.badgeRadius, bottom: pinSize.badgeRadius };
  const markers: LabelBox[] = [];
  for (const [id, group] of Object.entries(groups)) {
    if (group.visible) markers.push({ id, ...onMap(group, badge, scale) });
  }
  const labels: LabelBox[] = [];
  for (const [id, label] of names) {
    const group = groups[id];
    if (!group?.visible) continue;
    const box = onMap(group, label.box(), scale);
    if (box.right - box.left > MAX_MAP_SHARE * mapWidth) continue;
    labels.push({ id, ...onMap(group, label.box(), scale, CLEARANCE) });
  }
  return uncoveredLabels(labels, markers);
}
