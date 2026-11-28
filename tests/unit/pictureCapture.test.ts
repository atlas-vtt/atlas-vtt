import { describe, expect, it, vi } from 'vitest';
import type { GmOverlays } from '../../src/app/pixi/lighting/playerLightingLayers';
import type { SceneFrame } from '../../src/app/pixi/lighting/engine/types';
import { gmTokenLayers, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import type { PicturePart } from '../../src/app/pixi/picture/picture';
import { lightingPicture } from '../../src/app/pixi/picture/viewPictureParts';
import { FRAME as PLAYER_FRAME, fakeViewport } from '../mocks/playerFrameSource';
import { picturesOf, playersFrame, scenePicture } from '../helpers/pictures';

const FRAME: SceneFrame = { x: 300, y: 200, resolution: 0.5 };

function setup(wallEditorShown = true) {
  const pins = { visible: true };
  const hexLinks = { visible: true };
  const overlay = (visible = true): { visible: boolean } => ({ visible });
  const gmOverlays: GmOverlays = {
    wallEditor: overlay(wallEditorShown), lightZones: overlay(), levelSurfaces: overlay(), exploredMemory: overlay(), rooms: overlay(),
    doorBadges: overlay(), lightMarkers: overlay(), rangeRings: overlay(), sightAids: overlay(),
  };
  const playerDoorBadges = { visible: true };
  const layers = [pins, hexLinks, ...Object.values(gmOverlays)];
  const shown = (): boolean[] => layers.map((layer) => layer.visible);
  const markers: PicturePart = { layersFor: () => [{ layer: pins, visible: false }, { layer: hexLinks, visible: false }] };
  const litFrames: SceneFrame[] = [];
  const renderForFrame = <T,>(frame: SceneFrame, render: () => T): T => {
    litFrames.push(frame);
    return render();
  };
  const lighting = lightingPicture({ gmOverlays: () => gmOverlays, playerLayers: () => [], playerOnlyLayers: () => [playerDoorBadges], renderer: { renderForFrame } });
  return { markers, lighting, litFrames, shown, playerDoorBadges };
}

describe('a picture of the scene', () => {
  it('renders without the GM markers and overlays (range rings included), lit for the frame, and has them back afterwards', () => {
    const { markers, lighting, litFrames, shown } = setup();
    const picture = scenePicture({ pins: markers, lighting }, FRAME, () => shown());
    expect(picture).toEqual(Array(11).fill(false));
    expect(litFrames).toEqual([FRAME]);
    expect(shown()).toEqual(Array(11).fill(true));
  });

  it('leaves a layer hidden that was hidden before, such as the wall editor without its tool', () => {
    const { markers, lighting, shown } = setup(false);
    scenePicture({ pins: markers, lighting }, FRAME, () => undefined);
    expect(shown()).toEqual([true, true, false, ...Array(8).fill(true)]);
  });

  it('has the layers back when the render throws', () => {
    const { markers, lighting, shown } = setup();
    expect(() => scenePicture({ pins: markers, lighting }, FRAME, () => { throw new Error('Render failed'); })).toThrow('Render failed');
    expect(shown()).toEqual(Array(11).fill(true));
  });

  it('renders a view without lighting as it is, without its markers', () => {
    const { markers, shown } = setup();
    expect(scenePicture({ pins: markers }, FRAME, () => shown().slice(0, 2))).toEqual([false, false]);
    expect(shown().slice(0, 2)).toEqual([true, true]);
  });

  it('leaves out the door badges only the players\' view shows, which session view has on the canvas, and puts them back', () => {
    const { lighting, playerDoorBadges } = setup();
    expect(scenePicture({ lighting }, FRAME, () => playerDoorBadges.visible)).toBe(false);
    expect(playerDoorBadges.visible).toBe(true);
  });

  it('returns the result of a render with nothing to change', () => {
    expect(scenePicture({}, FRAME, () => 'picture')).toBe('picture');
  });

  it('shows tokens as the GM view does while the canvas is in session view, and puts the canvas back', () => {
    // Session view: the hidden ghost and the orc out of the players' sight are off the canvas
    const sprites = { hero: { visible: true, alpha: 1 }, ghost: { visible: false, alpha: 1 }, orc: { visible: false, alpha: 1 }, gone: null };
    const tokens = { hero: {}, ghost: { isHidden: true }, orc: {} };
    const look = (): unknown => ({ hero: { ...sprites.hero }, ghost: { ...sprites.ghost }, orc: { ...sprites.orc } });
    const onCanvas = look();
    const picture = scenePicture({ tokens: { layersFor: () => gmTokenLayers(tokens, sprites) } }, FRAME, look);
    expect(picture).toEqual({ hero: { visible: true, alpha: 1 }, ghost: { visible: true, alpha: 0.5 }, orc: { visible: true, alpha: 1 } });
    expect(look()).toEqual(onCanvas);
  });

  it('changes nothing for tokens while the canvas is in GM view', () => {
    const sprites = { hero: { visible: true, alpha: 1 }, ghost: { visible: true, alpha: 0.5 } };
    const writes: string[] = [];
    const watched = Object.fromEntries(Object.entries(sprites).map(([id, sprite]) => [id, new Proxy(sprite, {
      set: (target, key, value) => (writes.push(`${id}.${String(key)}`), Reflect.set(target, key, value)),
    })]));
    scenePicture({ tokens: { layersFor: () => gmTokenLayers({ hero: {}, ghost: { isHidden: true } }, watched) } }, FRAME, () => undefined);
    expect(writes).toEqual([]);
  });

  it('renders no frame of the GM\'s: the canvas keeps it', () => {
    const renderGmFrame = vi.fn();
    picturesOf({}, { renderGmFrame }).capture({ kind: 'scene', frame: FRAME, view: null }, () => undefined);
    expect(renderGmFrame).not.toHaveBeenCalled();
  });
});

describe('a players\' frame', () => {
  /** A part that notes when it changes the stage and puts it back. */
  const noting = (name: string, events: string[], layers: LayerVisibility[] = []): PicturePart => ({
    showFor: () => {
      events.push(`show:${name}`);
      return () => events.push(`back:${name}`);
    },
    layersFor: () => {
      events.push(`layers:${name}`);
      return layers;
    },
    renderFor: <T,>(_picture: unknown, render: () => T): T => {
      events.push(`around:${name}`);
      return render();
    },
  });

  it('makes every part\'s change for the render, puts them back in the reverse order, then renders the GM\'s frame again', () => {
    const events: string[] = [];
    const layer = { visible: true };
    const pictures = picturesOf({ mapImage: noting('map', events), lighting: noting('lighting', events, [{ layer, visible: false }]) }, { renderGmFrame: () => events.push('gm') });
    pictures.capture(playersFrame(PLAYER_FRAME), () => events.push(`render:${layer.visible}`));
    expect(events).toEqual(['show:map', 'show:lighting', 'layers:map', 'layers:lighting', 'around:map', 'around:lighting', 'render:false', 'back:lighting', 'back:map', 'gm']);
    expect(layer.visible).toBe(true);
  });

  it('leaves the GM\'s frame to the render that follows, where one does', () => {
    const renderGmFrame = vi.fn();
    picturesOf({}, { renderGmFrame }).capture(playersFrame(PLAYER_FRAME, { renderFollows: true }), () => undefined);
    expect(renderGmFrame).not.toHaveBeenCalled();
  });

  describe('on a path that fails', () => {
    /** Three parts and a layer, and the GM's render: what each did, in order. */
    function failing(more: Partial<Record<'roofs' | 'liquids', PicturePart>> = {}) {
      const events: string[] = [];
      const layer = { visible: true };
      const pictures = picturesOf({
        mapImage: noting('map', events),
        tokens: { layersFor: () => [{ layer, visible: false }] },
        annotations: noting('drawings', events),
        ...more,
      }, { renderGmFrame: () => events.push('gm') });
      return { events, layer, pictures };
    }

    it('puts every part back and renders the GM\'s frame again when the render throws', () => {
      const { events, layer, pictures } = failing();
      expect(() => pictures.capture(playersFrame(PLAYER_FRAME), () => { throw new Error('failed'); })).toThrow('failed');
      expect(layer.visible).toBe(true);
      expect(events.slice(-3)).toEqual(['back:drawings', 'back:map', 'gm']);
    });

    it('puts back the parts it changed before a part\'s change threw, and renders the GM\'s frame again', () => {
      const { events, layer, pictures } = failing({ liquids: { showFor: () => { throw new Error('no stage'); } } });
      expect(() => pictures.capture(playersFrame(PLAYER_FRAME), () => events.push('render'))).toThrow('no stage');
      expect(events).toEqual(['show:map', 'back:map', 'gm']);
      expect(layer.visible).toBe(true);
    });

    it('puts every other part back when one part\'s restore throws, renders the GM\'s frame again, and throws that error after', () => {
      const { events, layer, pictures } = failing({ roofs: { showFor: () => () => { throw new Error('roof stuck'); } } });
      expect(() => pictures.capture(playersFrame(PLAYER_FRAME), () => events.push('render'))).toThrow('roof stuck');
      expect(events).toEqual(['show:map', 'show:drawings', 'layers:map', 'layers:drawings', 'around:map', 'around:drawings', 'render', 'back:drawings', 'back:map', 'gm']);
      expect(layer.visible).toBe(true);
    });

    it('throws the render\'s error, not a restore\'s that followed it', () => {
      const { events, pictures } = failing({ roofs: { showFor: () => () => { throw new Error('roof stuck'); } } });
      expect(() => pictures.capture(playersFrame(PLAYER_FRAME), () => { throw new Error('failed'); })).toThrow('failed');
      expect(events.slice(-3)).toEqual(['back:drawings', 'back:map', 'gm']);
    });

    it('leaves the GM\'s frame to the render that follows, also when the render throws', () => {
      const { events, pictures } = failing();
      expect(() => pictures.capture(playersFrame(PLAYER_FRAME, { renderFollows: true }), () => { throw new Error('failed'); })).toThrow('failed');
      expect(events).not.toContain('gm');
      expect(events.slice(-2)).toEqual(['back:drawings', 'back:map']);
    });

    it('throws the first error in time when the GM\'s re-render throws too, and the re-render\'s when it alone throws', () => {
      const parts = { mapImage: noting('map', []) };
      const failingGm = { renderGmFrame: () => { throw new Error('canvas lost'); } };
      expect(() => picturesOf(parts, failingGm).capture(playersFrame(PLAYER_FRAME), () => { throw new Error('failed'); })).toThrow('failed');
      expect(() => picturesOf(parts, failingGm).capture(playersFrame(PLAYER_FRAME), () => 'frame')).toThrow('canvas lost');
    });

    it('throws the first of two restores that throw, the later part\'s, which is put back first', () => {
      const stuck = (message: string): PicturePart => ({ showFor: () => () => { throw new Error(message); } });
      const { events, pictures } = failing({ roofs: stuck('roof stuck'), liquids: stuck('liquids stuck') });
      expect(() => pictures.capture(playersFrame(PLAYER_FRAME), () => events.push('render'))).toThrow('liquids stuck');
      expect(events.slice(-3)).toEqual(['back:drawings', 'back:map', 'gm']);
    });

    it('puts every layer back when the players\' camera cannot be, and the camera and the other layers when a layer cannot be', () => {
      const events: string[] = [];
      const viewport = fakeViewport();
      const setScale = viewport.scale.set.bind(viewport.scale);
      let sets = 0;
      // The first set turns the camera to the frame; the second, putting the GM's back, fails.
      viewport.scale.set = (x, y): void => {
        if (++sets === 2) throw new Error('camera stuck');
        setScale(x, y);
      };
      const shown = { visible: true };
      const pictures = picturesOf({ mapImage: noting('map', events), tokens: { layersFor: () => [{ layer: shown, visible: false }] } }, { camera: () => viewport, renderGmFrame: () => events.push('gm') });
      expect(() => pictures.capture(playersFrame(PLAYER_FRAME), () => undefined)).toThrow('camera stuck');
      expect(shown.visible).toBe(true);
      expect(events.slice(-2)).toEqual(['back:map', 'gm']);

      let locked = false;
      const lockable = { get visible(): boolean { return !locked; }, set visible(value: boolean) { if (value && locked) throw new Error('layer stuck'); locked = !value; } };
      const other = { visible: true };
      const camera = fakeViewport();
      camera.position.set(-40, 30);
      const layered = picturesOf({ tokens: { layersFor: () => [{ layer: lockable, visible: false }, { layer: other, visible: false }] } }, { camera: () => camera });
      expect(() => layered.capture(playersFrame(PLAYER_FRAME), () => undefined)).toThrow('layer stuck');
      expect(other.visible).toBe(true);
      expect([camera.position.x, camera.position.y]).toEqual([-40, 30]);
    });

    it('puts every part back after a picture of the scene that fails, in a part\'s change or in the render, and renders no frame of the GM\'s', () => {
      const { events, layer, pictures } = failing({ liquids: { showFor: (picture) => (picture.kind === 'scene' ? (() => { throw new Error('no stage'); })() : () => undefined) } });
      expect(() => pictures.capture({ kind: 'scene', frame: FRAME, view: null }, () => events.push('render'))).toThrow('no stage');
      expect(events).toEqual(['show:map', 'back:map']);

      events.length = 0;
      const { events: rendered, layer: hidden, pictures: plain } = failing();
      expect(() => plain.capture({ kind: 'scene', frame: FRAME, view: null }, () => { throw new Error('failed'); })).toThrow('failed');
      expect(rendered.slice(-2)).toEqual(['back:drawings', 'back:map']);
      expect(rendered).not.toContain('gm');
      expect([layer.visible, hidden.visible]).toEqual([true, true]);
    });
  });

  it('renders through its own camera, centred in its own size, and puts the GM\'s camera back', () => {
    const viewport = fakeViewport();
    viewport.position.set(-40, 30);
    viewport.scale.set(2, 2);
    const during: number[] = [];
    picturesOf({}, { camera: () => viewport }).capture(
      playersFrame({ ...PLAYER_FRAME, width: 2560, height: 1440, resolution: 2, centerX: 100, centerY: 50, scale: 0.5 }),
      () => during.push(viewport.position.x, viewport.position.y, viewport.scale.x),
    );
    // 2560 × 1440 pixels at two to a point are 1280 × 720 points
    expect(during).toEqual([640 - 100 * 0.5, 360 - 50 * 0.5, 0.5]);
    expect([viewport.position.x, viewport.position.y, viewport.scale.x]).toEqual([-40, 30, 2]);
  });

  it('reads every part\'s layers before it sets any: of two parts that differ from the canvas on one layer, the later decides', () => {
    const layer = { visible: true, alpha: 1 };
    const seen: number[] = [];
    const pictures = picturesOf({
      pins: { layersFor: () => [{ layer, visible: true, alpha: 0.5 }] },
      tokens: { layersFor: () => (seen.push(layer.alpha), []) },
      fog: { layersFor: () => [{ layer, visible: true, alpha: 0.3 }] },
    });
    expect(pictures.capture(playersFrame(PLAYER_FRAME), () => layer.alpha)).toBe(0.3);
    expect(seen).toEqual([1]);
    expect(layer.alpha).toBe(1);
  });

  it('keeps what the player window\'s frame shows ready in every part that draws by detail, until released', () => {
    const released: string[] = [];
    const keeps = (name: string): PicturePart => ({ keepReady: () => () => released.push(name) });
    const release = picturesOf({ mapImage: keeps('map'), roofs: keeps('roofs'), annotations: keeps('annotations'), tokens: {} }).keepReady({ rect: { x: 0, y: 0, width: 10, height: 10 }, worldPerScreenPixel: 1 });
    expect(released).toEqual([]);
    release();
    expect(released).toEqual(['map', 'roofs', 'annotations']);
  });
});
