import { EASE_CONTROL_POINTS, MOTION_EASE_OUT, MOTION_SLOW_MS, prefersReducedMotion } from '../utils/motion';

/** Images grow into place from slightly smaller, never from nothing. */
const ENTER_SCALE = 0.96;

/**
 * Shows an image overlay: the scrim fades in and the image grows into place.
 * When `replacing`, the scrim is already dark (the previous image leaves above it),
 * so only the image enters. The entrance waits on its first frame until `image` is
 * decoded, otherwise a large image would pop in partway through. Resolves when it starts.
 */
export async function playImageEnter(
  container: HTMLElement,
  stage: HTMLElement,
  image: HTMLImageElement,
  replacing: boolean,
): Promise<void> {
  const timing: KeyframeAnimationOptions = { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT };
  const from: Keyframe = prefersReducedMotion(stage) ? { opacity: 0 } : { opacity: 0, transform: `scale(${ENTER_SCALE})` };
  const entrance = [stage.animate([from, { opacity: 1, transform: 'none' }], timing)];
  if (!replacing) entrance.push(container.animate([{ opacity: 0 }, { opacity: 1 }], timing));
  // A paused animation keeps showing its first keyframe
  for (const animation of entrance) animation.pause();
  await image.decode().catch(() => undefined);
  // Closed while it decoded: the exit took the entrance over (`holdWhereItStands`)
  for (const animation of entrance) if (animation.playState !== 'idle') animation.play();
}

/** Stops whatever moves `elements` now and keeps them where that left them, so the next animation starts from there and nothing below it can move on. */
function holdWhereItStands(elements: readonly HTMLElement[]): void {
  for (const element of elements) {
    for (const animation of element.getAnimations()) {
      try {
        animation.commitStyles();
      } catch {
        // Not rendered (a window being closed): there is nothing on screen to keep
      }
      animation.cancel();
    }
  }
}

/**
 * How a shown image leaves the players' screen. The image dissolves first, settling back a
 * little as it goes, and the dark behind it lifts just after, so what was under it (the map, or
 * the curtain) comes back once the image is nearly gone rather than through it. Both ease gently
 * at either end: an ease-out front-loads a fade-out, which then reads as the image vanishing.
 */
export const IMAGE_EXIT = {
  image: { ms: 360, scale: 0.97 },
  scrim: { ms: 440, delayMs: 80 },
  /** A replaced image leaves above the new one as long as the new one takes to enter. */
  replacedMs: MOTION_SLOW_MS,
  easing: `cubic-bezier(${EASE_CONTROL_POINTS.join(', ')})`,
} as const;

/**
 * Takes an image overlay away, starting from wherever its entrance currently is, so closing
 * mid-entrance never jumps. When `replaced`, the next image is entering beneath it, so the whole
 * overlay crossfades away in the entrance's time. Resolves once it is invisible.
 */
export async function playImageExit(container: HTMLElement, stage: HTMLElement, replaced = false): Promise<void> {
  const { image, scrim, replacedMs, easing } = IMAGE_EXIT;
  const still = prefersReducedMotion(stage);
  holdWhereItStands([container, stage]);
  if (replaced) {
    await container.animate({ opacity: 0 }, { duration: replacedMs, easing, fill: 'forwards' }).finished.catch(() => undefined);
    return;
  }
  // Single keyframes start from where the overlay stands; `forwards` keeps the image gone while the dark still lifts
  stage.animate(still ? { opacity: 0 } : { opacity: 0, transform: `scale(${image.scale})` }, { duration: image.ms, easing, fill: 'forwards' });
  const lift = container.animate({ opacity: 0 }, { duration: scrim.ms, delay: scrim.delayMs, easing, fill: 'forwards' });
  await lift.finished.catch(() => undefined);
}
