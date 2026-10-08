/**
 * `@atlas-vtt/shared/grid`: Atlas's grid geometry for drawing and local previews outside Atlas
 * (decision: authoritative snapping is `tokens.snapPoint`). PIXI-, Obsidian- and React-free (tests/api/sharedBoundary.test.ts).
 */
export * from '../app/grid/hexGeometry';
export * from '../app/grid/hexLattice';
export * from '../app/grid/squareLattice';
export * from '../app/grid/gridDistance';
export * from '../app/grid/gridPlacement';
export * from '../app/grid/cellNumbering';
export * from '../app/grid/measurementFormat';
