import type { SoundContext } from './audioNodes';

/** The Audio Session API: WebKit only, and not yet in TypeScript's DOM types. */
interface AudioSessionNavigator {
  audioSession?: { type: string };
}

/**
 * Lets a page's sound start. Everything happens synchronously inside the user's gesture, which is what
 * iOS requires: `playback` keeps the sound through the silent switch, and a one-frame silent buffer
 * started here is what unlocks the output. Resuming is started here and not waited for, since it may
 * never settle; the watchdog judges the clock.
 */
export function unlockInGesture(context: SoundContext & { resume(): Promise<void> }, nav: object = navigator): void {
  const session = (nav as AudioSessionNavigator).audioSession;
  if (session) session.type = 'playback';
  context.resume().catch(() => undefined);
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, 1, context.sampleRate);
  source.connect(context.destination);
  source.start(0);
}
