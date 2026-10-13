import { describe, expect, it } from 'vitest';
import { selectionHarness, tokenSprite, type SelectionHarness } from '../helpers/selectionManagerHarness';

/** A goblin the canvas shows at (100, 100) and a lurker it hides at (200, 100), as it hides unseen tokens with the GM view switch off. */
function setup(selectionMode: 'box' | 'lasso' = 'box'): SelectionHarness {
  return selectionHarness({ selectionMode, tokens: { goblin: tokenSprite(100, 100, true), lurker: tokenSprite(200, 100, false) } });
}

describe('SelectionManager and tokens the canvas hides', () => {
  it('leaves hidden tokens out of a box selection', () => {
    const { store, drag } = setup();
    drag([20, 20], [300, 200]);
    expect(store.getState().selectedIds).toEqual(['goblin']);
  });

  it('leaves hidden tokens out of a lasso selection', () => {
    const { store, drag } = setup('lasso');
    drag([20, 20], [20, 200], [[300, 20], [300, 200]]);
    expect(store.getState().selectedIds).toEqual(['goblin']);
  });

  it('draws no selection box around a selected token that is hidden', () => {
    const { store, overlay } = setup();
    store.setState({ selectedIds: ['lurker'] });
    expect(overlay.context.instructions).toHaveLength(0);
    store.setState({ selectedIds: ['goblin'] });
    expect(overlay.context.instructions.length).toBeGreaterThan(0);
  });
});
