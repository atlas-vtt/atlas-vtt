/**
 * `@atlas-vtt/shared/dice3d`: the 3D dice renderer and its presentation helpers (three is an external dependency).
 */
export * from '../app/dice3d/DiceRenderer';
export * from '../app/dice3d/dieArtwork';
export * from '../app/dice3d/dieGeometry';
export * from '../app/dice3d/dieMotion';
export * from '../app/dice3d/dieTour';
export * from '../app/dice3d/stagePool';
export * from '../app/dice3d/throwChain';
export * from '../app/dice3d/throwSeed';
export * from '../app/react/components/dice3d/diceRollText';
// The dice create their canvases through a DOM host Atlas installs at start; a page outside Obsidian installs its own
// (the plain browser's: `doc.createElement('canvas')`, `parent.appendChild`, `node.ownerDocument.defaultView`, `document`).
export { installDomHost, type DomHost } from '../app/host/dom';
// The light part (display, roll scenes, tray icons), also its own entry without three.js.
export * from './diceDisplay';
