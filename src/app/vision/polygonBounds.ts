import type { Point } from '../types/visionTypes';
import type { LightReach } from './sight';
import type { Polygon } from './visibility';

/** An axis-aligned box, in world pixels. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
const polygonBoxes = new WeakMap<Polygon, Box>();
const reachBoxes = new WeakMap<LightReach, Box>();

function grow(box: Box, other: Box): Box {
  return { minX: Math.min(box.minX, other.minX), minY: Math.min(box.minY, other.minY), maxX: Math.max(box.maxX, other.maxX), maxY: Math.max(box.maxY, other.maxY) };
}

/** The box around `polygon`, worked out once per polygon (polygons are never changed in place). */
export function polygonBox(polygon: Polygon): Box {
  let box = polygonBoxes.get(polygon);
  if (!box) {
    box = { ...EMPTY };
    for (const { x, y } of polygon) {
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    }
    polygonBoxes.set(polygon, box);
  }
  return box;
}

export function inBox(point: Point, box: Box): boolean {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
}

/**
 * The box around everything `light` lights as the rule counts it: its reach's polygon (an area
 * light's area), every traced part of an area light and its reflection. A point outside it gets
 * nothing from the light, so the rule asks no polygon about it.
 */
export function reachBox(light: LightReach): Box {
  let box = reachBoxes.get(light);
  if (!box) {
    box = polygonBox(light.polygon);
    for (const part of light.parts ?? []) box = grow(box, polygonBox(part.polygon));
    for (const part of light.reflection ?? []) box = grow(box, polygonBox(part.polygon));
    reachBoxes.set(light, box);
  }
  return box;
}
