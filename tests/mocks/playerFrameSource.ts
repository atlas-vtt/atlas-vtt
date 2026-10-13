import { vi } from 'vitest';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import type { FramePiece, PlayerFrame, Screen } from '../../src/app/types/playerFrame';

/** The DM's pane in these tests. */
export const PANE: Screen = { width: 800, height: 600, resolution: 1 };
/** The layout size `sizePlayerWindow` gives the player window's canvas. */
export const PLAYER_WINDOW = { width: 1280, height: 720 };

/** A rendered frame in one piece, as a view hands it out. */
export function framePiece(frame: PlayerFrame, image: HTMLCanvasElement = document.createElement('canvas')): FramePiece {
  return { image, x: 0, y: 0, width: frame.width, height: frame.height, left: 0, top: 0 };
}

/**
 * What a map view offers the player window: the DM looks at the world's origin through `PANE`,
 * and every frame asked for is rendered in one piece. `overrides` replace any part.
 */
export function frameSource(overrides: Partial<PlayerFrameSource> = {}): PlayerFrameSource {
  return {
    getCamera: () => ({ centerX: 0, centerY: 0, scale: 1, width: PANE.width, height: PANE.height }),
    getScreen: () => PANE,
    withPlayerSafeFrame: (copy, _settings, frame) => copy(framePiece(frame)),
    ...overrides,
  };
}

/**
 * jsdom lays nothing out, so a canvas measures 0 × 0 and the player window would have no size
 * to render a frame for. Gives every element `PLAYER_WINDOW`'s size until mocks are restored.
 */
export function sizePlayerWindow({ width, height } = PLAYER_WINDOW): void {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(height);
}

/** A players' frame of 1280 × 720 on the world's origin. */
export const FRAME: PlayerFrame = { width: 1280, height: 720, resolution: 1, antialias: true, centerX: 0, centerY: 0, scale: 1 };

/**
 * What stands in for the frame texture in a test of `PixiRendererOrchestrator.withPlayerSafeFrame`
 * (`playerFrames`): `render` is the frame's render, and the frame comes in one piece.
 */
export function fakePlayerFrames(render: () => void = () => undefined): {
  canRender(): boolean; render(): void; copy(copy: (piece: FramePiece) => void): void; release(): void; destroy(): void;
} {
  return { canRender: () => true, render, copy: (copy) => copy(framePiece(FRAME)), release: vi.fn(), destroy: vi.fn() };
}

/** The part of a viewport a players' frame moves. */
export function fakeViewport(): { position: { x: number; y: number; set(x: number, y: number): void }; scale: { x: number; y: number; set(x: number, y: number): void } } {
  const point = (x: number, y: number): { x: number; y: number; set(nx: number, ny: number): void } => ({ x, y, set(nx, ny) { this.x = nx; this.y = ny; } });
  return { position: point(0, 0), scale: point(1, 1) };
}
