import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { motionNativeAnimation, withMissingAnimationGuard } from '../../vite/motion-native-animation.mts';

const ANIMATOR = path.join(path.dirname(createRequire(import.meta.url).resolve('framer-motion/package.json')), 'dist/es/animation/animators/AcceleratedAnimation.mjs');
const START = 'const animation = startWaapiAnimation(';
const FIRST_USE = 'animation.startTime = startTime ?? this.calcStartTime();';
const GUARD = 'if (!animation) return false;';

type Transform = (code: string, id: string) => { code: string } | undefined;
type GenerateBundle = (this: { error: (message: string) => never; getModuleIds: () => IterableIterator<string> }) => void;

/** The plugin's hooks, in a build whose modules are `modules` (framer-motion's file among them unless told otherwise). */
function hooks(modules: readonly string[] = [ANIMATOR]): { transform: Transform; generateBundle: () => void } {
  const plugin = motionNativeAnimation();
  const fail = (message: string): never => { throw new Error(message); };
  return {
    transform: plugin.transform as Transform,
    generateBundle: () => (plugin.generateBundle as GenerateBundle).call({ error: fail, getModuleIds: () => modules.values() }),
  };
}

/**
 * The installed framer-motion takes whatever `element.animate()` answers for an animation, and
 * Chromium answers null for an element whose window is gone. The build puts one line into that
 * function; an update of the library that changes the function must not drop it unnoticed.
 */
describe('the guard the build puts into framer-motion', () => {
  const library = fs.readFileSync(ANIMATOR, 'utf8');

  it('stands in the installed library between asking the browser for the animation and using it', () => {
    const guarded = withMissingAnimationGuard(library);

    expect(guarded.split(GUARD)).toHaveLength(2);
    expect(guarded.indexOf(START)).toBeLessThan(guarded.indexOf(GUARD));
    expect(guarded.slice(guarded.indexOf(GUARD) + GUARD.length).trimStart().startsWith(FIRST_USE)).toBe(true);
    expect(guarded.replace(`${GUARD}\n        `, '')).toBe(library);
  });

  it('refuses a library whose function reads another way', () => {
    expect(() => withMissingAnimationGuard(library.replace(FIRST_USE, 'animation.startTime = startTime;'))).toThrow('review vite/motion-native-animation.mts');
    expect(() => withMissingAnimationGuard(library.replace(START, 'const animation = element.animate('))).toThrow('review vite/motion-native-animation.mts');
    expect(() => withMissingAnimationGuard(`${library}\n${FIRST_USE}`)).toThrow('review vite/motion-native-animation.mts');
    expect(() => withMissingAnimationGuard('')).toThrow('review vite/motion-native-animation.mts');
  });

  it('goes into that one file of the library, however the bundler names it, and into no other', () => {
    const { transform } = hooks();

    expect(transform(library, ANIMATOR)?.code).toBe(withMissingAnimationGuard(library));
    expect(transform(library, `${ANIMATOR.replaceAll('/', '\\')}?v=1`)?.code).toContain(GUARD);
    expect(transform(library, ANIMATOR.replace('AcceleratedAnimation', 'MainThreadAnimation'))).toBeUndefined();
    expect(transform(library, '/src/app/animation/animators/AcceleratedAnimation.mjs')).toBeUndefined();
    expect(transform(library, `\0${ANIMATOR}`)).toBeUndefined();
  });

  it('fails a build that never came by the library\'s file', () => {
    const missed = hooks();
    expect(() => missed.generateBundle()).toThrow('were not found in the bundle');

    const found = hooks();
    found.transform(library, ANIMATOR);
    expect(() => found.generateBundle()).not.toThrow();
  });

  it('leaves a build without the library alone: a test\'s own small bundle needs no guard', () => {
    expect(() => hooks(['/repo/tests/fixtures/desktop-runtime.ts']).generateBundle()).not.toThrow();
  });
});
