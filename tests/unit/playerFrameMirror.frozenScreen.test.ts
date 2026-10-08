import { describe, expect, it, vi } from 'vitest';
import type { PlayerCameraState } from '../../src/app/local-player-view';
import { PlayerFrameMirror, type PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import type { AtlasSettings } from '../../src/app/services/SettingsService';

const SETTINGS = { showGrid: true } as AtlasSettings['localPlayerView'];
const DM_CAMERA: PlayerCameraState = { centerX: 1, centerY: 2, scale: 1 };
const FROZEN: PlayerCameraState = { centerX: 1000, centerY: 500, scale: 2 };

interface Harness {
  target: HTMLCanvasElement;
  state: { frozen: PlayerCameraState | null };
  onFrame: ReturnType<typeof vi.fn>;
  /** The DM's pane takes this size, as when a sidebar opens or closes. */
  resizePane(width: number, height: number): void;
  /** Mirrors one frame; returns the camera it was rendered through and what was copied of the canvas. */
  frame(): { camera: PlayerCameraState | undefined; copied: unknown[] };
}

/** A mirror on a DM canvas that is captured on every display frame, in a pane of 800 × 600. */
function setup(): Harness {
  const canvas = document.createElement('canvas');
  let screen = { width: 800, height: 600 };
  const resizePane = (width: number, height: number): void => {
    screen = { width, height };
    Object.assign(canvas, screen);
  };
  resizePane(screen.width, screen.height);

  let camera: PlayerCameraState | undefined;
  const source: PlayerFrameSource = {
    canvas,
    getCamera: () => DM_CAMERA,
    getScreen: () => ({ ...screen, resolution: 1 }),
    withPlayerSafeFrame: (capture, _settings, through) => { camera = through; capture(); },
  };
  const state: Harness['state'] = { frozen: null };
  const target = document.createElement('canvas');
  const drawImage = vi.fn();
  const onFrame = vi.fn();
  const mirror = new PlayerFrameMirror(target, { clearRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D, {
    source: () => source,
    heldFrame: () => null,
    frozenCamera: () => state.frozen,
    settings: () => SETTINGS,
    onFrame,
  }, () => 0);
  return {
    target, state, onFrame, resizePane,
    frame: () => {
      drawImage.mockClear();
      mirror.frame();
      return { camera, copied: (drawImage.mock.calls[0] as unknown[]).slice(1) };
    },
  };
}

function sizeOf(canvas: HTMLCanvasElement): number[] {
  return [canvas.width, canvas.height];
}

describe('PlayerFrameMirror while players are frozen and the DM\'s pane changes size', () => {
  it('keeps the players\' canvas and copies the middle of a pane that grew', () => {
    const { target, state, resizePane, frame, onFrame } = setup();
    state.frozen = FROZEN;
    expect(frame()).toEqual({ camera: FROZEN, copied: [0, 0] });
    expect(sizeOf(target)).toEqual([800, 600]);

    resizePane(1000, 600);

    expect(frame()).toEqual({ camera: FROZEN, copied: [100, 0, 800, 600, 0, 0, 800, 600] });
    expect(sizeOf(target)).toEqual([800, 600]);
    expect(onFrame).toHaveBeenLastCalledWith(FROZEN);
  });

  it('zooms out in a pane that shrank and still fills the players\' canvas', () => {
    const { target, state, resizePane, frame, onFrame } = setup();
    state.frozen = FROZEN;
    frame();

    resizePane(400, 600);

    expect(frame()).toEqual({
      camera: { centerX: 1000, centerY: 500, scale: 1 },
      copied: [0, 150, 400, 300, 0, 0, 800, 600],
    });
    expect(sizeOf(target)).toEqual([800, 600]);
    // The camera that is saved for the next session is the one players were frozen on
    expect(onFrame).toHaveBeenLastCalledWith(FROZEN);
  });

  it('copies the whole canvas again once the pane has its size back', () => {
    const { target, state, resizePane, frame } = setup();
    state.frozen = FROZEN;
    frame();
    resizePane(1000, 600);
    frame();

    resizePane(800, 600);

    expect(frame()).toEqual({ camera: FROZEN, copied: [0, 0] });
    expect(sizeOf(target)).toEqual([800, 600]);
  });

  it('follows the pane again when players are released, and freezes them on the pane as it is then', () => {
    const { target, state, resizePane, frame } = setup();
    state.frozen = FROZEN;
    frame();
    resizePane(1000, 600);
    frame();

    state.frozen = null;
    expect(frame()).toEqual({ camera: undefined, copied: [0, 0] });
    expect(sizeOf(target)).toEqual([1000, 600]);

    state.frozen = { ...FROZEN };
    expect(frame()).toEqual({ camera: FROZEN, copied: [0, 0] });
    resizePane(1200, 600);
    expect(frame().copied).toEqual([100, 0, 1000, 600, 0, 0, 1000, 600]);
    expect(sizeOf(target)).toEqual([1000, 600]);
  });
});
