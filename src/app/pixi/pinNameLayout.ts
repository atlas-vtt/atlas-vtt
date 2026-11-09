import type { Container } from 'pixi.js';
import { pinSize } from '../styles/designTokens';
import { uncoveredLabels, type LabelBox } from '../utils/labelDeclutter';
import type { PinNameLabel } from './pinNameLabel';

/** Room kept clear around a name, in the badge's units, so two names never touch. */
const CLEARANCE = 3;

/** A box around a pin group's point, from a box in the group's units at the group's `scale`. */
function onMap(group: Container, box: { left: number; top: number; right: number; bottom: number }, scale: number, grow = 0): Omit<LabelBox, 'id'> {
  return {
    left: group.x + (box.left - grow) * scale,
    top: group.y + (box.top - grow) * scale,
    right: group.x + (box.right + grow) * scale,
    bottom: group.y + (box.bottom + grow) * scale,
  };
}

/** Which pins' names show at the pins' `scale`: those that cover no other name and no other pin's badge, in the pins' order. */
export function pinNameBoxes(names: ReadonlyMap<string, PinNameLabel>, groups: Readonly<Record<string, Container>>, scale: number): Set<string> {
  const badge = { left: -pinSize.badgeRadius, top: -pinSize.badgeRadius, right: pinSize.badgeRadius, bottom: pinSize.badgeRadius };
  const markers: LabelBox[] = [];
  for (const [id, group] of Object.entries(groups)) {
    if (group.visible) markers.push({ id, ...onMap(group, badge, scale) });
  }
  const labels: LabelBox[] = [];
  for (const [id, label] of names) {
    const group = groups[id];
    if (group?.visible) labels.push({ id, ...onMap(group, label.box(), scale, CLEARANCE) });
  }
  return uncoveredLabels(labels, markers);
}
