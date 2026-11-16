import { describe, expect, it } from 'vitest';
import { playerViewScenes, samePixels, type PlayerViewScene } from '../helpers/playerViewScene';
import { MapFeatureInteraction } from '../../src/app/pixi/mapFeatures/MapFeatureInteraction';
import type { MapFeature } from '../../src/app/types/mapFeatureTypes';

const { scene: createScene } = playerViewScenes();

const statue: MapFeature = {
  id: 'statue', kind: 'map-feature', name: 'Statue', terrain: { cover: 'total' },
  polygon: [{ x: 40, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 120 }, { x: 40, y: 120 }],
};

/** A scene whose map holds a statue, with the GM's hover label wired as the renderer wires it. */
async function sceneWithStatue(): Promise<{ scene: PlayerViewScene; hover: MapFeatureInteraction }> {
  const scene = await createScene();
  scene.store.setState((state) => ({ activeTool: 'select', objects: { ...state.objects, mapFeatures: { statue } } }));
  const hover = new MapFeatureInteraction(scene.store, scene.app.canvas);
  scene.tokens.setMapFeatureHandlers(hover);
  return { scene, hover };
}

const label = (): HTMLElement | null => document.querySelector('.atlas-map-feature-label');
const labelShown = (): boolean => !!label() && !label()!.hidden;
const afterHoverDelay = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 350));

describe('the GM\'s hover label over map features', () => {
  it('shows the feature for the GM, and never on the canvas while it shows the players\' view', async () => {
    const { scene, hover } = await sceneWithStatue();
    try {
      scene.pointer('pointermove', 80, 80);
      await afterHoverDelay();
      expect(labelShown()).toBe(true);
      expect(label()!.textContent).toBe('StatueTotal cover');

      scene.peek(true);
      expect(labelShown()).toBe(false);
      scene.pointer('pointermove', 82, 82);
      await afterHoverDelay();
      expect(labelShown()).toBe(false);
      scene.peek(false);

      scene.store.setState({ isGMView: false });
      scene.pointer('pointermove', 80, 80);
      await afterHoverDelay();
      expect(labelShown()).toBe(false);
    } finally {
      hover.destroy();
    }
  });

  it('is no part of any picture of the map: the players\' frame and a thumbnail are the same with it shown', async () => {
    const { scene, hover } = await sceneWithStatue();
    try {
      await scene.settle();
      const frame = scene.frame();
      const thumbnail = scene.thumbnail();
      scene.pointer('pointermove', 80, 80);
      await afterHoverDelay();
      expect(labelShown()).toBe(true);
      expect(scene.app.canvas.contains(label())).toBe(false);
      expect(samePixels(scene.frame(), frame)).toBe(true);
      expect(samePixels(scene.thumbnail(), thumbnail)).toBe(true);
    } finally {
      hover.destroy();
    }
  });
});
