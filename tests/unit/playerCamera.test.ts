import { describe, expect, it } from 'vitest';
import {
  cameraPlayersAreOn, cameraPlayersSee, FOLLOWING, nextPlayerCamera, outlinedCamera,
  type PlayerCamera, type PlayerCameraEvent, type PlayerCameraStep, type PlayerCameraWorld,
} from '../../src/app/services/playerCamera';
import type { PlayerCameraState } from '../../src/app/types/playerCamera';
import type { Size } from '../../src/app/types/playerFrame';

interface WorldState {
  /** The view's camera, without the rectangle its pane shows. */
  view?: PlayerCameraState;
  live?: boolean;
  held?: boolean;
  curtained?: boolean;
  screen?: Size;
  glideMs?: number;
  now?: number;
}

/** A window whose view looks through `view` on an 800 × 600 pane, renders the presented scene, and glides 800 ms. */
function world(state: WorldState = {}): PlayerCameraWorld {
  const { view, live = true, held = false, curtained = false, glideMs = 800, now = 0 } = state;
  const screen = 'screen' in state ? state.screen : { width: 800, height: 600 };
  return {
    view: () => view, live: () => live && !held, held: () => held, curtained: () => curtained, screen: () => screen, glideMs: () => glideMs, now: () => now,
  };
}

function step(camera: PlayerCamera, event: PlayerCameraEvent, state?: WorldState): PlayerCameraStep {
  return nextPlayerCamera(camera, event, world(state));
}

const SHOWN = { centerX: 10, centerY: 20, scale: 1, width: 800, height: 600 };
const SEEN: PlayerCamera = { ...FOLLOWING, shown: SHOWN };
const PINNED: PlayerCamera = { ...SEEN, frozen: { centerX: 500, centerY: 300, scale: 2, width: 400, height: 300 } };
const FRAME_B = { centerX: 300, centerY: 400, scale: 1, width: 1280, height: 720 };
const GM = { centerX: 50, centerY: 60, scale: 2 };

describe('freezing players', () => {
  it('pins them on what they were shown last, with its rectangle, and keeps it in the session', () => {
    expect(step(SEEN, { type: 'freeze' }, { view: GM })).toEqual({
      camera: { ...SEEN, frozen: SHOWN }, frozen: 'pinned', persist: true, moved: true,
    });
  });

  it('pins them on a camera given, taking the rectangle the GM\'s screen shows through it', () => {
    expect(step(SEEN, { type: 'freeze', camera: { centerX: 1, centerY: 2, scale: 4 } }).camera.frozen).toEqual({ centerX: 1, centerY: 2, scale: 4, width: 200, height: 150 });
  });

  it('pins them before their first frame on the view\'s own camera, where it renders the scene', () => {
    expect(step(FOLLOWING, { type: 'freeze' }, { view: GM }).camera.frozen).toEqual({ ...GM, width: 400, height: 300 });
  });

  it('has nothing to pin them on while the scene loads or a frame of another is held, and says they follow', () => {
    for (const state of [{ view: GM, live: false }, { view: GM, held: true }, {}]) {
      expect(step(FOLLOWING, { type: 'freeze' }, state)).toEqual({ camera: FOLLOWING, frozen: 'pinned', persist: true, moved: true });
    }
  });

  it('ends a glide', () => {
    const gliding = step(SEEN, { type: 'moveTo', camera: FRAME_B }).camera;
    expect(step(gliding, { type: 'freeze' }).camera).toEqual({ ...SEEN, frozen: SHOWN, glide: null });
  });
});

describe('letting players follow the GM again', () => {
  it('does nothing while they follow', () => {
    expect(step(SEEN, { type: 'unfreeze' }, { view: GM })).toEqual({ camera: SEEN });
  });

  it('dips them to black where the GM looks elsewhere', () => {
    expect(step(PINNED, { type: 'unfreeze' }, { view: GM })).toEqual({
      camera: SEEN, frozen: 'pinned', persist: true, moved: true, dip: true,
    });
  });

  it('dips them nowhere where the GM looks where they were held, or while a frame is held', () => {
    expect(step(PINNED, { type: 'unfreeze' }, { view: { centerX: 500, centerY: 300, scale: 2 } }).dip).toBe(false);
    expect(step(PINNED, { type: 'unfreeze' }, { view: GM, held: true }).dip).toBe(false);
  });
});

describe('sending players to a camera', () => {
  it('glides frozen players there from where they are', () => {
    const next = step(PINNED, { type: 'moveTo', camera: FRAME_B }, { now: 100 });
    expect(next).toEqual({ camera: { ...PINNED, glide: { from: PINNED.frozen, to: FRAME_B, start: 100, ms: 800 } } });
  });

  it('pins following players where they are at the first step, without the session, and glides from there', () => {
    const next = step(SEEN, { type: 'moveTo', camera: FRAME_B }, { view: GM });
    expect(next).toEqual({
      camera: { ...SEEN, frozen: SHOWN, glide: { from: SHOWN, to: FRAME_B, start: 0, ms: 800 } }, frozen: 'pinned', persist: false, moved: true,
    });
  });

  it('jumps without glide time, under the curtain, to the camera they are on, or where they were shown nothing', () => {
    const at = { camera: { ...SEEN, frozen: FRAME_B, glide: null }, frozen: 'pinned', persist: true, moved: true };
    expect(step(SEEN, { type: 'moveTo', camera: FRAME_B }, { glideMs: 0 })).toEqual(at);
    expect(step(SEEN, { type: 'moveTo', camera: FRAME_B }, { curtained: true })).toEqual(at);
    expect(step({ ...SEEN, frozen: FRAME_B }, { type: 'moveTo', camera: FRAME_B })).toEqual(at);
    expect(step(FOLLOWING, { type: 'moveTo', camera: FRAME_B }, { live: false }).camera).toEqual({ ...FOLLOWING, frozen: FRAME_B });
  });

  it('moves them on with each display frame and lands them on it, kept in the session', () => {
    const gliding = step(SEEN, { type: 'moveTo', camera: FRAME_B }).camera;
    const halfway = step(gliding, { type: 'tick', now: 400 });
    expect(halfway).toMatchObject({ frozen: 'glided', moved: true, camera: { glide: gliding.glide, frozen: { centerX: 155, centerY: 210 } } });
    expect(step(halfway.camera, { type: 'tick', now: 800 })).toEqual({ camera: { ...SEEN, frozen: FRAME_B, glide: null }, frozen: 'pinned', persist: true, moved: true });
    expect(step(SEEN, { type: 'tick', now: 800 })).toEqual({ camera: SEEN });
  });

  it('glides on from where a glide brought them when sent elsewhere halfway', () => {
    const halfway = step(step(SEEN, { type: 'moveTo', camera: FRAME_B }).camera, { type: 'tick', now: 400 }).camera;
    const elsewhere = { centerX: -300, centerY: -400, scale: 1, width: 1280, height: 720 };
    expect(step(halfway, { type: 'moveTo', camera: elsewhere }, { now: 400 }).camera.glide).toEqual({ from: halfway.frozen, to: elsewhere, start: 400, ms: 800 });
  });
});

describe('dragging the glass', () => {
  it('pins players on each step at once, without the session, and ends a glide', () => {
    const gliding = step(SEEN, { type: 'moveTo', camera: FRAME_B }).camera;
    const at = { centerX: 600, centerY: 700, scale: 1, width: 800, height: 600 };
    expect(step(gliding, { type: 'drag', camera: at })).toEqual({ camera: { ...SEEN, frozen: at, glide: null }, frozen: 'pinned', persist: false, moved: true });
  });
});

describe('presenting a scene', () => {
  const another = (event: Partial<Extract<PlayerCameraEvent, { type: 'present' }>> = {}): PlayerCameraEvent => ({ type: 'present', anotherScene: true, map: 'b.atlasmap', ...event });
  const same = (event: Partial<Extract<PlayerCameraEvent, { type: 'present' }>> = {}): PlayerCameraEvent => ({ type: 'present', anotherScene: false, map: 'a.atlasmap', ...event });

  it('leaves players who follow the GM following; on another scene they dip to it, and what they saw of the last one is forgotten', () => {
    expect(step(SEEN, same(), { view: GM })).toEqual({ camera: SEEN });
    expect(step(SEEN, another(), { view: GM })).toEqual({ camera: FOLLOWING, dip: true, forget: true });
  });

  it('forgets no camera for players frozen on another scene, and dips them all the same', () => {
    expect(step(PINNED, another(), { view: GM })).toMatchObject({ dip: true, frozen: 'pinned' });
    expect(step(PINNED, another(), { view: GM }).forget).toBeUndefined();
  });

  it('keeps a camera a scene is presented through as the frame of its map', () => {
    expect(step(SEEN, same({ camera: FRAME_B })).remember).toEqual({ map: 'a.atlasmap', camera: FRAME_B });
    expect(step(SEEN, another({ camera: FRAME_B })).remember).toEqual({ map: 'b.atlasmap', camera: FRAME_B });
    expect(step(SEEN, another()).remember).toBeUndefined();
  });

  it('returns players to a remembered frame only on another scene, never on the scene they see', () => {
    expect(step(SEEN, same({ remembered: FRAME_B }), { view: GM })).toEqual({ camera: SEEN });
  });

  it('carries a freeze over on the GM\'s framing: at once on another scene, gliding on the same', () => {
    expect(step(PINNED, another(), { view: GM }).camera).toEqual({ frozen: { ...GM, width: 400, height: 300 }, shown: null, glide: null });
    expect(step(PINNED, same(), { view: GM }).camera.glide).toMatchObject({ from: PINNED.frozen, to: GM });
    expect(step(PINNED, same(), { view: GM, glideMs: 0 }).camera.frozen).toEqual({ ...GM, width: 400, height: 300 });
  });

  it('lets frozen players go where another scene\'s view has no camera to carry the freeze over on', () => {
    expect(step(PINNED, another()).camera).toEqual(FOLLOWING);
  });

  it('returns players to the frame the GM set on a map before, frozen or not', () => {
    for (const camera of [SEEN, PINNED]) {
      expect(step(camera, another({ remembered: FRAME_B }), { view: GM }).camera).toEqual({ frozen: FRAME_B, shown: null, glide: null });
    }
  });

  it('pins players on a camera given: at once on another scene, gliding on the same', () => {
    const at = { centerX: 300, centerY: 400, scale: 1.5 };
    expect(step(SEEN, another({ camera: at, remembered: FRAME_B })).camera).toEqual({ frozen: { ...at, width: 800 / 1.5, height: 400 }, shown: null, glide: null });
    expect(step(SEEN, same({ camera: FRAME_B })).camera).toMatchObject({ frozen: SHOWN, glide: { from: SHOWN, to: FRAME_B } });
  });
});

describe('the frames players are shown', () => {
  it('are what they saw last, and a move only where the camera changed', () => {
    expect(step(SEEN, { type: 'shown', camera: { ...SHOWN } })).toEqual({ camera: SEEN, moved: false });
    expect(step(SEEN, { type: 'shown', camera: FRAME_B })).toEqual({ camera: { ...SEEN, shown: FRAME_B }, moved: true });
  });
});

describe('a frozen camera without its rectangle', () => {
  const older: PlayerCamera = { ...SEEN, frozen: { centerX: 300, centerY: 400, scale: 2 } };

  it('takes what the GM\'s screen shows through it when a view is attached, which forgets what players saw', () => {
    expect(step(older, { type: 'attach' })).toEqual({ camera: { ...FOLLOWING, frozen: { centerX: 300, centerY: 400, scale: 2, width: 400, height: 300 } }, frozen: 'framed' });
    expect(step(SEEN, { type: 'attach' })).toEqual({ camera: FOLLOWING });
  });

  it('takes it from the view players come back to after a held frame, and one with its own keeps it', () => {
    expect(step(older, { type: 'pin' }, { screen: { width: 1000, height: 500 } }).camera.frozen).toEqual({ centerX: 300, centerY: 400, scale: 2, width: 500, height: 250 });
    expect(step(PINNED, { type: 'pin' }, { screen: { width: 1000, height: 500 } })).toEqual({ camera: PINNED });
    expect(step(older, { type: 'pin' }, { screen: undefined })).toEqual({ camera: older });
  });
});

describe('the camera players see', () => {
  it('is what they were shown last, else the view\'s own while it renders the presented scene', () => {
    expect(cameraPlayersSee(SEEN, world({ view: GM }))).toBe(SHOWN);
    expect(cameraPlayersSee(SEEN, world({ view: GM, held: true }))).toBe(SHOWN);
    expect(cameraPlayersSee(FOLLOWING, world({ view: GM }))).toBe(GM);
    expect(cameraPlayersSee(FOLLOWING, world({ view: GM, live: false }))).toBeNull();
    expect(cameraPlayersSee(FOLLOWING, world({ view: GM, held: true }))).toBeNull();
  });

  it('is, for what players are on, the pinned camera first', () => {
    expect(cameraPlayersAreOn(PINNED, world({ view: GM }))).toBe(PINNED.frozen);
    expect(cameraPlayersAreOn(SEEN, world({ view: GM }))).toBe(SHOWN);
    expect(cameraPlayersAreOn(FOLLOWING, world({ view: GM, live: false }))).toBeNull();
  });

  it('is outlined on the GM\'s map through the frozen camera, else the view\'s own, which the next frame is rendered through', () => {
    expect(outlinedCamera(PINNED, world({ view: GM }))).toBe(PINNED.frozen);
    expect(outlinedCamera(SEEN, world({ view: GM }))).toBe(GM);
    expect(outlinedCamera(SEEN, world({ view: GM, live: false }))).toBe(SHOWN);
  });
});
