import { describe, expect, it } from 'vitest';
import { holdReveal, takeReveal, type PendingReveal } from '../../../src/app/dungeons/reveal/pendingReveals';
import { scaledPlan, type RevealPlan } from '../../../src/app/dungeons/reveal/revealPlan';

const seed = { x: 100, y: 50, radius: 40, start: 0.1, grow: 0.3, phase: [0, 1, 2] as [number, number, number] };
const plan: RevealPlan = { seeds: [seed], wave: { ...seed, start: 0.5 }, durationMs: 1500, feather: 6 };

function storage(): { loadLocalStorage: (key: string) => unknown; saveLocalStorage: (key: string, data: unknown) => void } {
  const held = new Map<string, unknown>();
  return { loadLocalStorage: (key) => held.get(key) ?? null, saveLocalStorage: (key, data) => held.set(key, data) };
}

const reveal = (levels: PendingReveal['levels']): PendingReveal => ({ width: 400, height: 200, levels });

describe('pending dungeon reveals', () => {
  it('plays once: the scene is forgotten when its plan is taken', () => {
    const local = storage();
    holdReveal(local, 'Cave.atlasmap', reveal({ '': plan }));
    expect(takeReveal(local, 'Cave.atlasmap', null)).toEqual({ plan, width: 400, height: 200 });
    expect(takeReveal(local, 'Cave.atlasmap', null)).toBeNull();
  });

  it('takes the plan of the level the scene opens on', () => {
    const local = storage();
    const deep = { ...plan, durationMs: 2000 };
    holdReveal(local, 'Halls.atlasmap', reveal({ a: plan, b: deep }));
    expect(takeReveal(local, 'Halls.atlasmap', 'b')?.plan).toBe(deep);
  });

  it('forgets the oldest scenes past twenty', () => {
    const local = storage();
    for (let i = 0; i < 21; i++) holdReveal(local, `Scene ${i}.atlasmap`, reveal({ '': plan }));
    expect(takeReveal(local, 'Scene 0.atlasmap', null)).toBeNull();
    expect(takeReveal(local, 'Scene 20.atlasmap', null)).not.toBeNull();
  });

  it('scales a plan to the picture it is played on', () => {
    const half = scaledPlan(plan, 0.5, 0.5);
    expect(half.seeds[0]).toMatchObject({ x: 50, y: 25, radius: 20, start: 0.1 });
    expect(half.feather).toBe(3);
  });
});
