import type { Plugin } from 'vite';
import fs from 'node:fs';

/** The file of framer-motion that hands an animation to the browser's own engine. */
const ANIMATOR = /\/framer-motion\/dist\/es\/animation\/animators\/AcceleratedAnimation\.mjs$/;
/** Where the library asks the browser for the animation, and the first thing it does with the answer. */
const START = 'const animation = startWaapiAnimation(';
const FIRST_USE = 'animation.startTime = startTime ?? this.calcStartTime();';
/** What the library itself answers, a few lines earlier, for an element that has been unmounted. */
const GUARD = 'if (!animation) return false;';

function occurrences(code: string, text: string): number {
  return code.split(text).length - 1;
}

/**
 * The library's `AcceleratedAnimation.initPlayback` with one line more: no animation, no playback.
 *
 * Chromium's `element.animate()` answers null for an element whose window is gone: one made in
 * Obsidian's main window that sits in the document of a popout that has closed (a notice shown
 * there, a view moved there). The library took the answer for an animation and threw on its next
 * line, inside the list of keyframes it resolves on every later frame and render, where the
 * failed entry then stayed: one such element ended every animation of the plugin until a reload,
 * and the map's toolbar with them. Treated like the unmounted element the function already
 * provides for, the animation is simply not started.
 *
 * framer-motion handles this itself from 12.38 on (it falls back to animating in JavaScript).
 * Throws when the code is not as expected, so an update of the library cannot drop the guard
 * unnoticed: with a version that has its own, take this plugin out.
 */
export function withMissingAnimationGuard(code: string): string {
  if (occurrences(code, START) !== 1 || occurrences(code, FIRST_USE) !== 1 || code.indexOf(START) > code.indexOf(FIRST_USE)) {
    throw new Error('framer-motion starts its browser animations another way now; review vite/motion-native-animation.mts');
  }
  return code.replace(FIRST_USE, `${GUARD}\n        ${FIRST_USE}`);
}

function isAnimator(file: string): boolean {
  return ANIMATOR.test(file.replaceAll('\\', '/').split('?')[0] ?? '');
}

/**
 * Keeps an animation the browser refuses from taking every other one down (`withMissingAnimationGuard`),
 * in the bundle and in the dependencies Vite prepares for the browser tests. A build that never
 * came by the library's file fails.
 */
export function motionNativeAnimation(): Plugin {
  // Never reset: a rebuild in watch mode transforms only the files that changed
  let guarded = false;
  return {
    name: 'atlas-motion-native-animation',
    enforce: 'pre',
    config() {
      return {
        optimizeDeps: {
          esbuildOptions: {
            plugins: [{
              name: 'atlas-motion-native-animation',
              setup(build) {
                build.onLoad({ filter: /AcceleratedAnimation\.mjs$/ }, async ({ path }) => {
                  if (!isAnimator(path)) return null;
                  return { contents: withMissingAnimationGuard(await fs.promises.readFile(path, 'utf8')), loader: 'js' };
                });
              },
            }],
          },
        },
      };
    },
    transform(code, id) {
      if (id.startsWith('\0') || !isAnimator(id)) return;
      guarded = true;
      return { code: withMissingAnimationGuard(code), map: null };
    },
    generateBundle() {
      if (!guarded) this.error('framer-motion\'s browser animations were not found in the bundle; review vite/motion-native-animation.mts');
    },
  };
}
