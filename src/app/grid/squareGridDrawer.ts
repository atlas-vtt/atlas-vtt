import { drawDashedSegment, drawVertexMarker, gridMarkerArmLength } from './gridLineStyle';
import type { GridBounds, GridLineType, GridPath } from './gridLineStyle';

const CROSS_ARMS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

/**
 * Draws a square grid into `graphics` using coordinates local to `bounds.minX/minY`.
 * Lines are placed on world positions `offset + n * size`. The dotted style adds
 * one cross-shaped marker per intersection; the caller fills instead of strokes.
 */
export function drawSquareGrid(
  graphics: GridPath,
  bounds: GridBounds,
  size: number,
  offsetX: number,
  offsetY: number,
  lineType: GridLineType,
  markerThickness: number = 1,
  markerArm: number = gridMarkerArmLength(size),
): void {
  const { minX, minY, maxX, maxY } = bounds;
  const localWidth = maxX - minX;
  const localHeight = maxY - minY;

  const firstLine = (min: number, offset: number): number => {
    const start = Math.floor((min - offset) / size) * size + offset;
    return start > min ? start - size : start;
  };
  const startWorldX = firstLine(minX, offsetX);
  const startWorldY = firstLine(minY, offsetY);

  if (lineType === 'dotted') {
    for (let worldX = startWorldX; worldX <= maxX; worldX += size) {
      const localX = worldX - minX;
      if (localX < 0 || localX > localWidth) continue;
      for (let worldY = startWorldY; worldY <= maxY; worldY += size) {
        const localY = worldY - minY;
        if (localY < 0 || localY > localHeight) continue;
        drawVertexMarker(graphics, localX, localY, CROSS_ARMS, markerArm, markerThickness);
      }
    }
    return;
  }

  for (let worldX = startWorldX; worldX <= maxX; worldX += size) {
    const localX = worldX - minX;
    if (localX < 0 || localX > localWidth) continue;
    if (lineType === 'solid') {
      graphics.moveTo(localX, 0).lineTo(localX, localHeight);
      continue;
    }
    // Dashes are centred on each cell edge, from one crossing line to the next.
    for (let worldY = startWorldY; worldY < maxY; worldY += size) {
      drawDashedSegment(graphics, localX, Math.max(worldY - minY, 0), localX, Math.min(worldY - minY + size, localHeight));
    }
  }

  for (let worldY = startWorldY; worldY <= maxY; worldY += size) {
    const localY = worldY - minY;
    if (localY < 0 || localY > localHeight) continue;
    if (lineType === 'solid') {
      graphics.moveTo(0, localY).lineTo(localWidth, localY);
      continue;
    }
    for (let worldX = startWorldX; worldX < maxX; worldX += size) {
      drawDashedSegment(graphics, Math.max(worldX - minX, 0), localY, Math.min(worldX - minX + size, localWidth), localY);
    }
  }
}
