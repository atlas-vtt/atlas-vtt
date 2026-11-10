// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { syncStatblockVitals, toTokenVitals } from '../../src/app/services/statblockVitalsSync';

/** Mirrors the DOM shape produced by Fantasy Statblocks' Daggerheart HP/stress callback. */
function renderBlocks(specs: Array<{ hp: number; stress: number }>): HTMLElement {
  const root = document.createElement('div');
  for (const spec of specs) {
    const block = document.createElement('div');
    block.classList.add('stat-line');

    const nameEl = document.createElement('span');
    nameEl.classList.add('adversary-name');
    nameEl.innerText = 'CREATURE #1: ';
    block.append(nameEl);

    for (const [kind, count] of [['hp', spec.hp], ['stress', spec.stress]] as const) {
      const label = document.createElement('span');
      label.classList.add('stat-name');
      block.append(label);
      for (let i = 0; i < count; i++) {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.classList.add(`${kind}-${i}`, 'stat-value');
        block.append(box);
      }
    }
    root.append(block);
  }
  return root;
}

function boxes(root: HTMLElement, kind: 'hp' | 'stress', blockIndex = 0): HTMLInputElement[] {
  const block = root.querySelectorAll<HTMLElement>('.stat-line')[blockIndex]!;
  return Array.from(block.querySelectorAll<HTMLInputElement>('input.stat-value')).filter((box) =>
    Array.from(box.classList).some((name) => name.startsWith(`${kind}-`)),
  );
}

describe('syncStatblockVitals', () => {
  it('marks HP boxes for damage taken and leaves remaining HP unmarked', () => {
    const root = renderBlocks([{ hp: 8, stress: 3 }]);

    syncStatblockVitals(root, [{ resources: { hp: { current: 5, max: 8 } } }]);

    expect(boxes(root, 'hp').map((b) => b.checked)).toEqual([
      true, true, true, false, false, false, false, false,
    ]);
  });

  it('marks stress boxes for stress spent', () => {
    const root = renderBlocks([{ hp: 8, stress: 3 }]);

    syncStatblockVitals(root, [{ resources: { stress: { current: 2, max: 3 } } }]);

    expect(boxes(root, 'stress').map((b) => b.checked)).toEqual([true, true, false]);
  });

  it('locks every box against editing', () => {
    const root = renderBlocks([{ hp: 2, stress: 1 }]);

    syncStatblockVitals(root, [{ resources: { hp: { current: 2, max: 2 } } }]);

    expect([...boxes(root, 'hp'), ...boxes(root, 'stress')].every((b) => b.disabled)).toBe(true);
  });

  it('locks boxes without altering them when no token backs the block', () => {
    const root = renderBlocks([{ hp: 3, stress: 1 }]);

    syncStatblockVitals(root, []);

    expect(boxes(root, 'hp').map((b) => b.checked)).toEqual([false, false, false]);
    expect(boxes(root, 'hp').every((b) => b.disabled)).toBe(true);
  });

  it('resizes the track when the token max differs from the statblock', () => {
    const root = renderBlocks([{ hp: 8, stress: 3 }]);

    syncStatblockVitals(root, [{ resources: { hp: { current: 1, max: 3 } } }]);

    expect(boxes(root, 'hp').map((b) => b.checked)).toEqual([true, true, false]);
    // The stress track must survive the HP resize untouched.
    expect(boxes(root, 'stress')).toHaveLength(3);
  });

  it('syncs each block to its own token', () => {
    const root = renderBlocks([
      { hp: 4, stress: 2 },
      { hp: 4, stress: 2 },
    ]);

    syncStatblockVitals(root, [
      { name: 'Burrower A', resources: { hp: { current: 4, max: 4 } } },
      { name: 'Burrower B', resources: { hp: { current: 1, max: 4 } } },
    ]);

    expect(boxes(root, 'hp', 0).map((b) => b.checked)).toEqual([false, false, false, false]);
    expect(boxes(root, 'hp', 1).map((b) => b.checked)).toEqual([true, true, true, false]);
    expect(root.querySelectorAll('.adversary-name')[1]!.textContent).toBe('BURROWER B: ');
  });

  it('keeps only vitals and identity fields when narrowing a token entity', () => {
    expect(toTokenVitals({ id: 'tok-1', x: 5, name: 'Goblin', resources: { hp: { current: 3, max: 7 } }, overriddenMax: ['hp'] })).toEqual({
      id: 'tok-1',
      name: 'Goblin',
      resources: { hp: { current: 3, max: 7 } },
      overriddenMax: ['hp'],
    });
  });
});
