import { describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { zoomToTokenWithHighlight } from '../../../src/app/pixi/utils/tokenHighlight';
import type { AtlasView } from '../../../src/app/atlas-view';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('pixi-filters', () => ({ OutlineFilter: class {} }));

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

function viewOf(viewed: string): { view: AtlasView; viewport: { setZoom: ReturnType<typeof vi.fn>; moveCenter: ReturnType<typeof vi.fn> }; viewedLevel: () => string | null | undefined } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `token-level-focus-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, levels: LEVELS, viewedLevel: viewed,
    objects: { ...store.getState().objects, tokens: {
      knight: { id: 'knight', kind: 'token', x: 10, y: 20, imagePath: 'k.png' },
      mage: { id: 'mage', kind: 'token', x: 30, y: 40, imagePath: 'm.png', level: 'upper' },
    } },
  });
  const viewport = { setZoom: vi.fn(), moveCenter: vi.fn() };
  const renderer = { getViewportInstance: () => viewport, getTokenRenderer: () => ({ getTokenSprites: () => ({}) }), getAppInstance: () => null };
  const view = { getStore: () => store, renderer } as unknown as AtlasView;
  return { view, viewport, viewedLevel: () => store.getState().viewedLevel };
}

describe('finding a token from the initiative tracker or the DM screen', () => {
  it('shows the level the token stands on before the camera goes to it', () => {
    const { view, viewport, viewedLevel } = viewOf('ground');

    zoomToTokenWithHighlight(view, 'mage', { x: 30, y: 40 });

    expect(viewedLevel()).toBe('upper');
    expect(viewport.moveCenter).toHaveBeenCalledWith(30, 40);
  });

  it('stays on the level shown when the token stands on it', () => {
    const { view, viewedLevel } = viewOf('upper');
    zoomToTokenWithHighlight(view, 'mage', { x: 30, y: 40 });
    expect(viewedLevel()).toBe('upper');
  });
});
