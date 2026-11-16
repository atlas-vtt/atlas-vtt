/** A box on the map, in one unit for all boxes compared (world pixels). */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A label's box, named by the marker it belongs to. */
export interface LabelBox extends Box {
  readonly id: string;
}

const overlaps = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Which labels show, as a map app does when markers crowd: in the order given, each one that covers
 * no label shown before it and no other marker (`markers`, by the same ids; a label never collides
 * with its own marker). Zooming in spreads the markers and brings the hidden names back. Pure.
 */
export function uncoveredLabels(labels: readonly LabelBox[], markers: readonly LabelBox[] = []): Set<string> {
  const shown: LabelBox[] = [];
  for (const label of labels) {
    if (markers.some((marker) => marker.id !== label.id && overlaps(label, marker))) continue;
    if (shown.some((other) => overlaps(label, other))) continue;
    shown.push(label);
  }
  return new Set(shown.map(({ id }) => id));
}
