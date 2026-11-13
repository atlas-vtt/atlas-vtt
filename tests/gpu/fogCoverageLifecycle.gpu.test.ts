import { describe, expect, it, vi } from 'vitest';
import { fogRect, fogScenes } from '../helpers/fogCoverageScene';
import { migrateMapFile } from '../../src/app/services/MapPersistence';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';

vi.mock('../../src/app/fog/fogCoverage', { spy: true });

const { scene } = fogScenes();

describe('fog renderer lifecycle', () => {
  it('keeps new-map coverage read by an earlier store subscriber across A to B to A', async () => {
    let read: (() => FogCoverage | null) | undefined;
    const early: Array<FogCoverage | null> = [];
    const s = await scene({ paint: fogRect() }, store => store.subscribe((state, previous) => {
      if (state.mapPath !== previous.mapPath && read) early.push(read());
    }));
    read = (): FogCoverage | null => s.fog.getCommittedCoverage();
    const initial = read();
    vi.mocked(fogCoverage).mockClear();
    // The same record can be restored in another map; map identity still resets history.
    s.store.setState({ mapPath: 'maps/b.atlasmap' });
    expect(early[0]).not.toBe(initial);
    expect(read()).toBe(early[0]);
    expect(s.read(32, 32)).toBe(0);
    expect(fogCoverage).toHaveBeenCalledTimes(1);
    s.store.setState({ mapPath: 'maps/a.atlasmap' });
    expect(early[1]).not.toBe(early[0]);
    expect(read()).toBe(early[1]);
    expect(s.read(32, 32)).toBe(0);
    expect(fogCoverage).toHaveBeenCalledTimes(2);
  });

  it('shares committed coverage with readers and keeps live erase previews separate', async () => {
    const s = await scene({ paint: fogRect() });
    const committed = s.fog.getCommittedCoverage();
    vi.mocked(fogCoverage).mockClear();
    expect(committed?.covers({ x: 48, y: 32 })).toBe(true);
    s.store.getState().setActiveTool('eraser');
    s.store.getState().setFogTool({ brushSize: 16 });
    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 64, 32);
    expect(s.read(48, 32)).toBe(255);
    expect(s.fog.getCommittedCoverage()).toBe(committed);
    expect(committed?.covers({ x: 48, y: 32 })).toBe(true);
    expect(fogCoverage).not.toHaveBeenCalled();
  });

  it('exposes invalid committed coverage explicitly and recovers with valid saved geometry', async () => {
    const s = await scene({ paint: fogRect() });
    s.setFog({ paint: { ...fogRect(), timestamp: Number.NaN } });
    expect(s.fog.getCommittedCoverage()).toBeNull();
    expect(s.read(100, 100)).toBe(0);
    s.setFog({});
    expect(s.fog.getCommittedCoverage()?.shape).toEqual([]);
    expect(s.read(100, 100)).toBe(255);
  });

  it('shows preloaded fog and preserves GM opacity across player captures', async () => {
    const s = await scene({ paint: fogRect() });
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(32, 32, false)).toBeCloseTo(128, -1);
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(100, 100)).toBe(255);
  });

  it('draws the GM\'s fog as opaque as the GM set it, and the players\' opaque as ever', async () => {
    const s = await scene({ paint: fogRect() });
    s.fog.setGmOpacity(0.25);
    expect(s.read(32, 32, false)).toBeCloseTo(191, -1);
    expect(s.read(32, 32)).toBe(0);
    s.fog.setGmOpacity(1);
    expect(s.read(32, 32, false)).toBe(0);
    expect(s.read(100, 100, false)).toBe(255);
  });

  it('shows a rectangle and a lasso as the fog they will leave while they are drawn, and commits just that', async () => {
    const s = await scene();
    s.store.getState().setActiveTool('fog');
    s.store.getState().setFogTool({ shape: 'rectangle' });
    // The rectangle's corners snap to the 70 px grid's.
    s.pointer('pointerdown', 5, 5);
    s.pointer('pointermove', 66, 66);
    expect(s.read(48, 48)).toBe(0);
    expect(s.read(100, 100)).toBe(255);
    expect(s.store.getState().objects.fog).toEqual({});
    s.pointer('pointerup', 66, 66);
    expect(Object.values(s.store.getState().objects.fog)).toMatchObject([{ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 70, height: 70 }]);
    expect(s.read(48, 48)).toBe(0);

    // Revealing with the lasso: the hole shows before the release.
    s.store.getState().setActiveTool('eraser');
    s.store.getState().setFogTool({ shape: 'lasso' });
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 60, 20);
    expect(s.read(40, 30)).toBe(0);
    s.pointer('pointermove', 60, 60);
    s.pointer('pointermove', 20, 60);
    expect(s.read(40, 40)).toBe(255);
    expect(s.read(10, 10)).toBe(0);
    expect(Object.values(s.store.getState().objects.fog)).toHaveLength(1);
    s.pointer('pointerup', 20, 60);
    expect(Object.values(s.store.getState().objects.fog)).toHaveLength(2);
    expect(s.read(40, 40)).toBe(255);
    expect(s.read(10, 10)).toBe(0);
  });

  it('drops the stroke under way on Escape and turns it around on Alt, by the keys of the canvas\'s window', async () => {
    const s = await scene({ paint: fogRect() });
    const key = (type: 'keydown' | 'keyup', name: string): KeyboardEvent => {
      const event = new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event;
    };
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    try {
      s.store.getState().setActiveTool('eraser');
      s.store.getState().setFogTool({ shape: 'rectangle' });
      // The rectangle's corners snap to the 70 px grid's.
      s.pointer('pointerdown', 5, 5);
      s.pointer('pointermove', 66, 66);
      expect(s.read(48, 48)).toBe(255);
      expect(key('keydown', 'Escape').defaultPrevented).toBe(true);
      // The map's shortcuts never hear the key, and the fog is as the scene holds it.
      expect(heard).not.toHaveBeenCalled();
      expect(s.read(48, 48)).toBe(0);
      s.pointer('pointermove', 30, 66);
      s.pointer('pointerup', 30, 66);
      expect(Object.keys(s.store.getState().objects.fog)).toEqual(['paint']);
      // No stroke: Escape is the map's again.
      key('keydown', 'Escape');
      expect(heard).toHaveBeenCalledTimes(1);

      // Alt held while the pointer rests: the revealing tool hides, where no fog lay.
      s.pointer('pointerdown', 75, 75);
      s.pointer('pointermove', 125, 125);
      expect(s.read(100, 100)).toBe(255);
      key('keydown', 'Alt');
      expect(s.read(100, 100)).toBe(0);
      s.pointer('pointerup', 125, 125);
      key('keyup', 'Alt');
      expect(Object.values(s.store.getState().objects.fog)).toMatchObject([{ id: 'paint' }, { type: 'rectangle', isErasing: false, x: 70, y: 70, width: 70, height: 70 }]);
      expect(s.read(100, 100)).toBe(0);
    } finally {
      window.removeEventListener('keydown', heard);
    }
  });

  it('follows append, undo, redo and clear through the actual store history', async () => {
    const s = await scene({ paint: fogRect() });
    s.setFog({ ...s.store.getState().objects.fog, erase: { ...fogRect('erase', 2, true), x: 32, y: 32, width: 16, height: 16 } });
    expect(s.read(40, 40)).toBe(255);
    s.store.temporal.getState().undo();
    expect(s.read(40, 40)).toBe(0);
    s.store.temporal.getState().redo();
    expect(s.read(40, 40)).toBe(255);
    s.setFog({});
    expect(s.read(24, 24)).toBe(255);
  });

  it('moves committed fog by its saved offset', async () => {
    const s = await scene({ paint: fogRect() });
    s.setFog({ paint: { ...fogRect(), offsetX: 32 } });
    expect(s.read(24, 32)).toBe(255);
    expect(s.read(96, 32)).toBe(0);
  });

  it('restores each map after A to B to A changes without a loading transition', async () => {
    const a = { paint: fogRect() };
    const s = await scene(a);
    s.store.setState(state => ({ mapPath: 'maps/b.atlasmap', objects: { ...state.objects, fog: {} } }));
    expect(s.read(32, 32)).toBe(255);
    s.store.setState(state => ({ mapPath: 'maps/a.atlasmap', objects: { ...state.objects, fog: a } }));
    expect(s.read(32, 32)).toBe(0);
  });

  it('redraws after bounds changes without changing saved fog', async () => {
    const s = await scene({ paint: fogRect() });
    const fog = s.store.getState().objects.fog;
    s.showMapImage({ x: -32, y: -32, width: 256, height: 256 });
    expect(s.store.getState().objects.fog).toBe(fog);
    expect(s.read(32, 32)).toBe(0);
    s.store.setState({ isGMView: false });
    expect(s.read(32, 32, false)).toBe(0);
  });

  it('discards a live erase when the tool changes and keeps saved fog', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setActiveTool('eraser');
    s.store.getState().setFogTool({ brushSize: 16 });
    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 64, 32);
    expect(s.read(48, 32)).toBe(255);
    s.store.getState().setActiveTool('select');
    expect(s.read(48, 32)).toBe(0);
    expect(Object.keys(s.store.getState().objects.fog)).toEqual(['paint']);
  });

  it('commits a brush through public pointer events', async () => {
    const s = await scene();
    s.store.getState().setActiveTool('fog');
    s.store.getState().setFogTool({ brushSize: 16 });
    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 64, 32);
    s.pointer('pointerup', 64, 32);
    expect(Object.values(s.store.getState().objects.fog)).toHaveLength(1);
    expect(s.read(48, 32)).toBe(0);
    s.store.getState().setActiveTool('select');
    expect(s.read(48, 32)).toBe(0);
  });

  it('shows saved edits skipped during a lasso when changing the drawing mode', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setActiveTool('fog');
    s.store.getState().setFogTool({ shape: 'lasso' });
    s.pointer('pointerdown', 96, 96);
    s.pointer('pointermove', 112, 112);
    s.setFog({});
    s.store.getState().setFogTool({ shape: 'rectangle' });
    expect(s.read(32, 32)).toBe(255);
    expect(Object.keys(s.store.getState().objects.fog)).toEqual([]);
  });

  it('shows the completed map after loading and does not retain the previous map coverage', async () => {
    const s = await scene({ paint: fogRect() });
    s.store.setState({ isMapLoading: true, mapPath: 'maps/b.atlasmap' });
    expect(s.fog.getContainer().visible).toBe(false);
    s.setFog({ paint: { ...fogRect(), offsetX: 32 } });
    s.store.setState({ isMapLoading: false });
    expect(s.read(24, 32)).toBe(255);
    expect(s.read(96, 32)).toBe(0);
  });

  it('keeps invalid saved geometry opaque until valid geometry arrives', async () => {
    const s = await scene();
    s.setFog({ paint: { ...fogRect(), timestamp: Number.NaN } });
    expect(s.read(100, 100)).toBe(0);
    expect(s.read(32, 32)).toBe(0);
    s.setFog({ paint: fogRect() });
    expect(s.read(100, 100)).toBe(255);
    expect(s.read(32, 32)).toBe(0);
  });

  it('holds nothing in its layer but the picture and the tool\'s marks, whatever fog the scene holds', async () => {
    const s = await scene({ paint: fogRect(), more: { ...fogRect('more', 2), x: 80 }, hole: fogRect('hole', 3, true) });
    const layers = s.fog.getContainer().children.length;
    s.setFog({});
    expect(s.fog.getContainer().children).toHaveLength(layers);
    expect(s.fog.getContainer().interactiveChildren).toBe(false);
  });

  it.each([false, true])('covers malformed saved points during bounds calculation (preloaded: %s)', async preloaded => {
    const saved = migrateMapFile({ objects: { fog: { broken: {
      kind: 'fog', id: 'broken', type: 'lasso', timestamp: 1,
      isErasing: false, points: [null, { x: 64, y: 32 }, { x: 32, y: 64 }],
    } } } }).objects.fog;
    expect(Object.keys(saved)).toEqual(['broken']);
    const s = await scene(preloaded ? saved : {});
    if (!preloaded) s.setFog(saved);
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(100, 100)).toBe(0);
    s.setFog({ paint: fogRect() });
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(100, 100)).toBe(255);
  });


  it.each(['mode', 'tool', 'release', 'erase'])('updates bounds for saved edits after canceling a stroke by %s', async cancel => {
    const s = await scene({ paint: fogRect() });
    s.store.getState().setActiveTool('fog');
    s.store.getState().setFogTool({ shape: 'lasso' });
    s.pointer('pointerdown', 96, 96);
    s.setFog({ paint: { ...fogRect(), offsetX: 1000, offsetY: 1000, width: 256, height: 256 } });
    if (cancel === 'mode') s.store.getState().setFogTool({ shape: 'rectangle' });
    else if (cancel === 'tool') s.store.getState().setActiveTool('select');
    else if (cancel === 'erase') s.store.getState().setActiveTool('eraser');
    else s.pointer('pointerup', 96, 96);
    s.lookAt(1000, 1000);
    expect(s.read(32, 32)).toBe(0);
    expect(s.read(8, 8)).toBe(255);
  });

});
