import { isDeepStrictEqual } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TINT_TO_WHITE } from '../../src/app/lighting/lightingConstants';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { srgbToLinear } from '../../src/app/lighting/srgb';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import { ambientLevel } from '../../src/app/vision/lightLevels';
import type * as VisibilityModule from '../../src/app/vision/visibility';
import type { StepMismatch, StepRecord } from '../helpers/sceneModelCompare';
import { LIGHT_REACHES, LIGHT_SOURCES } from '../helpers/sceneModelCurrent';
import type { Builder, Model, Subject } from '../helpers/sceneModelFrozen';
import type { SceneSequence } from '../helpers/sceneModelSteps';
import type { SequenceTrait } from '../helpers/sceneModelTraits';
import type * as LightReachesModule from '../oracles/sceneModelBaseline/lightReaches';
import type * as LightSourcesModule from '../oracles/sceneModelBaseline/lightSources';

/**
 * Each test breaks one thing the scene model promises, by wrapping the builder under test or by
 * swapping one of its modules, and requires the comparison to name what broke. None of them reads
 * the trial count: they stop at the first difference within the default run.
 */

vi.mock('../../src/app/vision/visibility', async (importOriginal) => {
  const actual = await importOriginal<typeof VisibilityModule>();
  return { ...actual, computeVisibility: vi.fn(actual.computeVisibility) };
});

afterEach(() => {
  vi.doUnmock(LIGHT_SOURCES);
  vi.doUnmock(LIGHT_REACHES);
  vi.resetModules();
});

type Update = Builder['update'];
type Current = Subject & typeof import('../helpers/sceneModelCurrent').current;
type Accept = (sequence: SceneSequence, before: readonly StepRecord[]) => boolean;
type Wanted = string | ((mismatch: StepMismatch) => boolean);

const taking = (wanted: Wanted): ((mismatch: StepMismatch) => boolean) => (typeof wanted === 'string' ? (mismatch) => mismatch.output === wanted : wanted);

/** The first difference `wanted` takes (an output's name, or a test) that the comparison finds once every builder under test is wrapped by `tamper`. */
async function firstWith(wanted: Wanted, tamper: (inner: Builder, current: Current) => Update, accept?: Accept): Promise<StepMismatch | null> {
  const { firstMismatch } = await import('../helpers/sceneModelCompare');
  const { current } = await import('../helpers/sceneModelCurrent');
  const subject: Subject = {
    spots: current.spots,
    builder: () => {
      const inner = current.builder();
      return { reset: () => inner.reset(), update: tamper(inner, current) };
    },
  };
  return firstMismatch(taking(wanted), subject, accept);
}

/** The first difference `wanted` takes that the comparison finds with the modules as they are now, swapped ones included. */
async function firstIn(wanted: Wanted): Promise<StepMismatch | null> {
  const { firstMismatch } = await import('../helpers/sceneModelCompare');
  return firstMismatch(taking(wanted));
}

/** Sequences that show `trait`. */
async function showing(trait: SequenceTrait): Promise<Accept> {
  const { sequenceTraits } = await import('../helpers/sceneModelTraits');
  return (sequence, before) => sequenceTraits(sequence, before).has(trait);
}

/** A tampered model per model, so that an update that built nothing still returns the object it returned before. */
function once(change: (model: Model) => Model): (model: Model) => Model {
  const changed = new WeakMap<Model, Model>();
  return (model) => {
    if (!changed.has(model)) changed.set(model, change(model));
    return changed.get(model)!;
  };
}

/** A light's colour from channels divided in double precision. */
function plainColour(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  const linear = (channel: number): number => srgbToLinear(1 + (channel / 255 - 1) * TINT_TO_WHITE);
  return [linear((value >> 16) & 0xff), linear((value >> 8) & 0xff), linear(value & 0xff)];
}

/** For a control that requires no difference at all: the comparison then walks every sequence, which takes seconds on a busy machine. */
const WHOLE_RUN_TIMEOUT = 60_000;

describe('the scene model comparison notices what a broken scene model would change', () => {
  it('fails when an update that built nothing returns a copy of the model', async () => {
    const found = await firstWith('identity of the model', (inner) => (...args) => {
      const { model, rebuilt } = inner.update(...args);
      return { model: { ...model }, rebuilt };
    });
    expect(found).not.toBeNull();
  });

  it('fails when the players\' sight is an equal copy of the GM\'s', async () => {
    const copied = once((model) => ({ ...model, sight: { ...model.sight, regions: [...model.sight.regions] } }));
    const found = await firstWith('identity of the players\' sight being the GM\'s', (inner) => (...args) => {
      const { model, rebuilt } = inner.update(...args);
      return { model: model.sight === model.gmSight ? copied(model) : model, rebuilt };
    });
    expect(found).not.toBeNull();
  });

  it('fails on rebuilt, and on no sweep, when the builder is reset before every update', async () => {
    const reset = (inner: Builder): Update => (...args) => {
      inner.reset();
      return inner.update(...args);
    };
    expect(await firstWith('rebuilt', reset)).not.toBeNull();
    // A reset builds anew from what the builder still holds: the sight it worked out and the reaches it traced.
    expect(await firstWith('sweeps', reset)).toBeNull();
  }, WHOLE_RUN_TIMEOUT);

  it.each(['rebuilt', 'sweeps'])('fails on %s when every update is given a new builder', async (output) => {
    expect(await firstWith(output, (inner, current) => (...args) => current.builder().update(...args))).not.toBeNull();
  });

  it('fails when a light\'s colour comes from a plain division, also where single precision hides it', async () => {
    vi.doMock(LIGHT_SOURCES, async (importOriginal) => {
      const actual = await importOriginal<typeof LightSourcesModule>();
      return { ...actual, engineLight: (...args: Parameters<typeof actual.engineLight>) => ({ ...actual.engineLight(...args), color: plainColour(args[0].emission.color) }) };
    });
    expect(await firstIn('model lights')).not.toBeNull();
    const { colourMismatches, coloursOf } = await import('../helpers/lightColourCompare');
    expect(colourMismatches()).toContain('#880000');
    const { now, before } = coloursOf('#880000');
    expect([now[0], before[0]]).toEqual([0.5488626804504491, 0.5488627027469221]);
    expect(Math.fround(now[0])).toBe(Math.fround(before[0]));
  });

  it.each(['model lights', 'model reaches'])('fails on %s when a light put out by a darkness is kept', async (output) => {
    const { LightReaches } = await import('../oracles/sceneModelBaseline/lightReaches');
    const found = await firstWith(output, (inner, current) => {
      // The model with its quenched lights is returned again while the builder builds nothing.
      const withQuenched = new WeakMap<Model, Model>();
      return (state, bounds, measurement, rules) => {
        const { model, rebuilt } = inner.update(state, bounds, measurement, rules);
        if (rebuilt) {
          const scale = unitScaleOf(measurement(), state.grid);
          const shining = current.activeLights(state.objects.lights, state.objects.tokens, model.ambient).map((light) => current.engineLight(light, scale));
          if (shining.length > model.lights.length) withQuenched.set(model, { ...model, lights: shining, reaches: new LightReaches().sync(shining, model.walls) });
        }
        return { model: withQuenched.get(model) ?? model, rebuilt };
      };
    }, await showing('a quenched light'));
    expect(found).not.toBeNull();
  });

  it('fails on identity and sweeps, and on no value, when every light is traced anew at each build', async () => {
    vi.doMock(LIGHT_REACHES, async (importOriginal) => {
      const actual = await importOriginal<typeof LightReachesModule>();
      class Forgetful {
        sync(...args: Parameters<LightReachesModule.LightReaches['sync']>): ReturnType<LightReachesModule.LightReaches['sync']> {
          return new actual.LightReaches().sync(...args);
        }
      }
      return { ...actual, LightReaches: Forgetful };
    });
    expect(await firstIn('identity of each reach polygon')).not.toBeNull();
    expect(await firstIn('sweeps')).not.toBeNull();
    expect(await firstIn((mismatch) => mismatch.output.startsWith('model ') || mismatch.output === 'rebuilt')).toBeNull();
  }, WHOLE_RUN_TIMEOUT);

  it('fails when the builder is not told which tokens the pointer holds', async () => {
    const found = await firstWith('rebuilt', (inner) => (state, ...rest) => inner.update({ ...state, heldTokens: {} }, ...rest), await showing('a drag that builds nothing'));
    expect(found?.kind).toBe('a held token moved while sight waits for the drop');
  });

  it('fails when the builder is not told of an ambient light that wakes a lamp', async () => {
    const { sceneSequence } = await import('../helpers/sceneModelSteps');
    // A lamp is all that changes there: the ambient light stays on its side of the scene's thresholds.
    const onlyALamp = ({ seed, step, kind, output }: StepMismatch): boolean => {
      if (output !== 'rebuilt' || kind !== 'the ambient light crossing a lamp\'s level') return false;
      const { steps } = sceneSequence(seed);
      return ambientLevel(steps[step - 1]!.state.lighting) === ambientLevel(steps[step]!.state.lighting);
    };
    const found = await firstWith(onlyALamp, (inner) => {
      let told: SceneLighting | undefined;
      const options = ({ ambient: _level, ...rest }: SceneLighting): Omit<SceneLighting, 'ambient'> => rest;
      return (state, ...rest) => {
        // Only the ambient light differs from what the builder was told last: it is told nothing new.
        if (told && isDeepStrictEqual(options(told), options(state.lighting))) return inner.update({ ...state, lighting: told }, ...rest);
        told = state.lighting;
        return inner.update(state, ...rest);
      };
    }, await showing('a lamp that changes state'));
    expect(found).not.toBeNull();
  });
});
