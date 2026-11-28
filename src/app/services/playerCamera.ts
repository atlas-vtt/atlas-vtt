import { framedCamera } from './playerFrame';
import { sameCamera } from './playerGlass';
import { glideCamera } from './tableTv';
import type { PlayerCameraState } from '../types/playerCamera';
import type { Size } from '../types/playerFrame';

/** Players on their way from one camera to another, `ms` long from `start`: each display frame moves them on. */
export interface PlayerGlide {
  readonly from: PlayerCameraState;
  readonly to: PlayerCameraState;
  readonly start: number;
  readonly ms: number;
}

/** Which camera players are framed through: one the GM pinned them on, else the GM's own. */
export interface PlayerCamera {
  /** The camera the GM pinned players on, null while they follow the GM's; the presented scene is still rendered live through it. */
  readonly frozen: PlayerCameraState | null;
  /** The camera of the last frame players were shown of the presented scene; none until a frame of that scene came. */
  readonly shown: PlayerCameraState | null;
  readonly glide: PlayerGlide | null;
}

/** Players follow the GM and were shown nothing yet: a window just opened, or closed. */
export const FOLLOWING: PlayerCamera = { frozen: null, shown: null, glide: null };

/** What the player window knows when an event comes, read only where a decision needs it. */
export interface PlayerCameraWorld {
  /** The camera of the view players' frames come from, as it is now; none without a view. */
  view(): PlayerCameraState | undefined;
  /** Whether that view renders the presented scene for players now: no frame is held, and the scene is loaded. */
  live(): boolean;
  /** Whether players are held on a still frame while the GM works on another scene tab. */
  held(): boolean;
  /** The GM's screen, which a camera without the world rectangle it frames takes that rectangle from. */
  screen(): Size | undefined;
  /** How long players glide to another camera, in ms; 0 where they jump: no glide time, reduced motion, the curtain down. */
  glideMs(): number;
  now(): number;
}

export type PlayerCameraEvent =
  /** Pin players on `camera`, by default the one they see now. */
  | { type: 'freeze'; camera?: PlayerCameraState | undefined }
  | { type: 'unfreeze' }
  /** Pin players on `camera`, gliding there from the camera they see, pinned or following. */
  | { type: 'moveTo'; camera: PlayerCameraState }
  /** Pin players on `camera` at once: a step of the glass being dragged. */
  | { type: 'drag'; camera: PlayerCameraState }
  /** A scene is presented: `camera` to frame it through, `remembered` the frame the GM set on its map before. */
  | { type: 'present'; anotherScene: boolean; camera?: PlayerCameraState | undefined; remembered?: PlayerCameraState | undefined }
  /** Players were shown a frame through `camera`. */
  | { type: 'shown'; camera: PlayerCameraState }
  /** A display frame at `now` moves a glide on. */
  | { type: 'tick'; now: number }
  /** The window is attached to a view: what players were shown is forgotten, and a frozen camera takes its rectangle. */
  | { type: 'attach' }
  /** A frozen camera takes its rectangle from the view players come back to. */
  | { type: 'pin' };

/** The camera players are framed through next, and what the window does about it. */
export interface PlayerCameraStep {
  readonly camera: PlayerCamera;
  /**
   * How the frozen camera changed: `pinned`, players were pinned or let go, which the window shows
   * and, with `persist`, keeps in its session; `glided`, a step of a glide, for the next frame only;
   * `framed`, a frozen camera took the world rectangle it frames, which the session keeps.
   */
  readonly frozen?: 'pinned' | 'glided' | 'framed';
  readonly persist?: boolean;
  /** The camera players see through moved, so whatever follows it (the glass on the GM's map) is told. */
  readonly moved?: boolean;
  /** Players dip through black to what they see next, as to another scene. */
  readonly dip?: boolean;
}

/**
 * The camera players see the presented scene through now: that of its last frame, else the view's
 * own while it renders the scene. Never a camera of another scene: the one players saw before this
 * scene was presented frames a rectangle of that scene's map; while a frame is held the view shows
 * the scene the GM browses; and while the scene loads the view's camera is not the scene's yet.
 * With none of its own, there is nothing to freeze on yet.
 */
export function cameraPlayersSee(camera: PlayerCamera, world: PlayerCameraWorld): PlayerCameraState | null {
  return camera.shown ?? (world.live() ? world.view() ?? null : null);
}

/**
 * The camera the glass on the GM's map is placed through: pinned, the frozen one; following, the
 * view's own, which the outline is drawn through and the next frame is rendered through (the last
 * frame's would trail the GM's pans by a frame); else what players were shown last.
 */
export function outlinedCamera(camera: PlayerCamera, world: PlayerCameraWorld): PlayerCameraState | null {
  return camera.frozen ?? (world.live() ? world.view() : undefined) ?? cameraPlayersSee(camera, world);
}

export function nextPlayerCamera(camera: PlayerCamera, event: PlayerCameraEvent, world: PlayerCameraWorld): PlayerCameraStep {
  switch (event.type) {
    case 'freeze':
      return pinned(camera, event.camera ?? cameraPlayersSee(camera, world), world);
    case 'unfreeze':
      return unfrozen(camera, world);
    case 'moveTo':
      return movedTo(camera, event.camera, world);
    case 'drag':
      return pinned(camera, event.camera, world, false);
    case 'present':
      return presented(camera, event, world);
    case 'shown':
      return { camera: { ...camera, shown: event.camera }, moved: !sameCamera(event.camera, camera.shown) };
    case 'tick':
      return glided(camera, event.now, world);
    case 'attach':
      return framed({ ...camera, shown: null }, world);
    case 'pin':
      return framed(camera, world);
  }
}

/** Pins players on `to`, with the world rectangle the GM's screen shows through it now, or lets them follow (null); a glide ends. */
function pinned(camera: PlayerCamera, to: PlayerCameraState | null, world: PlayerCameraWorld, persist = true): PlayerCameraStep {
  const frozen = to ? framedCamera({ ...to }, world.screen()) : null;
  return { camera: { ...camera, frozen, glide: null }, frozen: 'pinned', persist, moved: true };
}

/** Lets players follow the GM again. Where that shows them another place they dip through black to it, never jump. */
function unfrozen(camera: PlayerCamera, world: PlayerCameraWorld): PlayerCameraStep {
  const { frozen } = camera;
  if (!frozen) return { camera };
  const following = world.view();
  const samePlace = following && following.centerX === frozen.centerX && following.centerY === frozen.centerY && following.scale === frozen.scale;
  return { ...pinned(camera, null, world), dip: !samePlace && !world.held() };
}

/** Pins players on `to`, gliding there from the camera they see, frozen or following. */
function movedTo(camera: PlayerCamera, to: PlayerCameraState, world: PlayerCameraWorld): PlayerCameraStep {
  const from = camera.frozen ?? cameraPlayersSee(camera, world);
  const ms = from && !sameCamera(from, to) ? world.glideMs() : 0;
  if (!from || !(ms > 0)) return pinned(camera, to, world);
  // Players who followed the GM stop doing so here, not when the glide lands
  const step = camera.frozen ? { camera } : pinned(camera, from, world, false);
  const start = step.camera.frozen ?? from;
  return { ...step, camera: { ...step.camera, glide: { from: start, to, start: world.now(), ms } } };
}

function glided(camera: PlayerCamera, now: number, world: PlayerCameraWorld): PlayerCameraStep {
  const { glide } = camera;
  if (!glide) return { camera };
  const t = Math.min(1, (now - glide.start) / glide.ms);
  if (t >= 1) return pinned(camera, glide.to, world);
  return { camera: { ...camera, frozen: glideCamera(glide.from, glide.to, t) }, frozen: 'glided', moved: true };
}

/**
 * Where a scene is presented: with a camera, players are pinned on it, gliding there on the scene
 * they see; else a map the GM framed before returns them to that frame; else a freeze carries over,
 * on the GM's framing, gliding there on the same scene, at once on another. Players who follow keep following.
 */
function presented(camera: PlayerCamera, event: Extract<PlayerCameraEvent, { type: 'present' }>, world: PlayerCameraWorld): PlayerCameraStep {
  const { anotherScene, camera: to, remembered } = event;
  // The camera players saw the scene before through says nothing about this one
  const current = anotherScene ? { ...camera, shown: null } : camera;
  if (to) return anotherScene ? pinned(current, to, world) : movedTo(current, to, world);
  if (remembered) return pinned(current, remembered, world);
  if (!current.frozen) return { camera: current };
  const framing = world.view() ?? null;
  return framing && !anotherScene ? movedTo(current, framing, world) : pinned(current, framing, world);
}

/**
 * A frozen camera that came without the world rectangle it frames (one an older Atlas saved, or one
 * frozen before a scene was attached) takes what the GM's screen shows through it now, and keeps that.
 */
function framed(camera: PlayerCamera, world: PlayerCameraWorld): PlayerCameraStep {
  if (!camera.frozen) return { camera };
  const frozen = framedCamera(camera.frozen, world.screen());
  return frozen === camera.frozen ? { camera } : { camera: { ...camera, frozen }, frozen: 'framed' };
}
