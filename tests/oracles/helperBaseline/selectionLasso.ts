// Frozen from 29c9495a src/app/pixi/SelectionManager.ts:345-357 (a private method there), as an exported free function for the comparison.

// Helper method to check if a point is inside a polygon
export function isPointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]?.x ?? 0, yi = polygon[i]?.y ?? 0;
      const xj = polygon[j]?.x ?? 0, yj = polygon[j]?.y ?? 0;
      
      const intersect = ((yi > y) != (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
}
