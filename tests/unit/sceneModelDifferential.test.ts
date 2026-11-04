import { describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type * as VisibilityModule from '../../src/app/vision/visibility';
import { compareSequence, runSequence, type StepMismatch, type StepRecord } from '../helpers/sceneModelCompare';
import { current } from '../helpers/sceneModelCurrent';
import { FIRST_BUILD, sceneSequence, type SceneSequence, type SceneStep } from '../helpers/sceneModelSteps';
import { SequenceTally, sequenceTraits } from '../helpers/sceneModelTraits';
import { sceneTrials, seedBlocks, sightScene } from '../helpers/sightScenes';

vi.mock('../../src/app/vision/visibility', async (importOriginal) => {
  const actual = await importOriginal<typeof VisibilityModule>();
  return { ...actual, computeVisibility: vi.fn(actual.computeVisibility) };
});

const TRIALS = sceneTrials();
const tally = new SequenceTally();
const blocks = seedBlocks(TRIALS, 25).map((seeds) => ({ first: seeds[0]!, last: seeds[seeds.length - 1]!, seeds }));

const BOUNDS = { width: 1000, height: 1000 };
const light = (id: string, x: number, bright = 10): LightSource => ({ id, kind: 'light', x, y: 500, emission: { bright, dim: 20, color: '#ff8800', intensity: 1, animation: 'none' } });
const party = (x: number): TokenEntity => ({ id: 'party', kind: 'token', imagePath: '', x, y: 200, size: 1, vision: { enabled: true, range: 30 } });

type State = SceneStep['state'];

/** A scene written by hand and the states that follow it, run by the scene model under test. */
function run(first: Pick<State, 'objects' | 'lighting' | 'heldTokens'>, ...changes: ((state: State) => State)[]): StepRecord[] {
  const { state, rules, measurement } = sightScene(1);
  const steps: SceneStep[] = [{ kind: FIRST_BUILD, state: { ...state, ...first }, rules, reset: false }];
  for (const change of changes) steps.push({ kind: 'a new state object with the same records', state: change(steps[steps.length - 1]!.state), rules, reset: false });
  const sequence: SceneSequence = { seed: 0, bounds: BOUNDS, measurement, steps };
  return runSequence(current, sequence);
}

const objects = (tokens: Record<string, TokenEntity>, lights: Record<string, LightSource>): State['objects'] => ({ ...sightScene(1).state.objects, tokens, walls: {}, lights, lightZones: {} });

describe('the scene model compared with its previous version', () => {
  it.each(blocks)('sequences $first to $last give the same models, rebuilds, identities, sweeps and footprints', ({ seeds }) => {
    const mismatches: StepMismatch[] = [];
    for (const seed of seeds) {
      const sequence = sceneSequence(seed);
      const result = compareSequence(sequence);
      tally.add(sequenceTraits(sequence, result.before));
      mismatches.push(...result.mismatches);
    }
    expect(mismatches).toEqual([]);
  });

  it('runs every sequence, every kind of step and every kind of scene often enough', () => {
    expect(tally.floorProblems(TRIALS)).toEqual([]);
  });
});

describe('what an update of the scene model costs', () => {
  it('builds nothing while a held token moves and sight waits for the drop', () => {
    // A move keeps everything of the token but its place, as the store's own moves do.
    const drag = (x: number): ((state: State) => State) => (state) => ({ ...state, objects: { ...state.objects, tokens: { party: { ...state.objects.tokens.party!, x } } }, heldTokens: { party: { x: 200, y: 200 } } });
    const [first, held, further, dropped] = run(
      { objects: objects({ party: party(200) }, { a: light('a', 300) }), lighting: { enabled: true, ambient: 1, sightOnDrop: true }, heldTokens: {} },
      drag(400), drag(600), (state) => ({ ...state, heldTokens: {} }),
    );
    expect(first).toMatchObject({ rebuilt: true, sweeps: 2 });
    expect(held).toMatchObject({ rebuilt: false, sweeps: 0 });
    expect(further).toMatchObject({ rebuilt: false, sweeps: 0 });
    expect(further!.model).toBe(first!.model);
    expect(dropped).toMatchObject({ rebuilt: true, sweeps: 1 });
  });

  it('traces only the light that moved', () => {
    const lights = { a: light('a', 200), b: light('b', 500), c: light('c', 800) };
    const [first, moved] = run(
      { objects: objects({}, lights), lighting: { enabled: true, ambient: 0 }, heldTokens: {} },
      (state) => ({ ...state, objects: { ...state.objects, lights: { ...lights, b: light('b', 540) } } }),
    );
    expect(first).toMatchObject({ rebuilt: true, sweeps: 3 });
    expect(moved).toMatchObject({ rebuilt: true, sweeps: 1 });
    expect(moved!.identities!['each reach polygon']).toEqual([0, -1, 2]);
  });

  it('keeps every reach polygon when only a bright radius changes', () => {
    const lights = { a: light('a', 200), b: light('b', 500), c: light('c', 800) };
    const [, brighter] = run(
      { objects: objects({}, lights), lighting: { enabled: true, ambient: 0 }, heldTokens: {} },
      (state) => ({ ...state, objects: { ...state.objects, lights: { ...lights, b: light('b', 500, 15) } } }),
    );
    expect(brighter).toMatchObject({ rebuilt: true, sweeps: 0 });
    expect(brighter!.identities!['each reach polygon']).toEqual([0, 1, 2]);
    expect(brighter!.identities!['each reach']).toEqual([0, -1, 2]);
  });
});
