// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { lightingPicture, tokensPicture } from '../../src/app/pixi/picture/viewPictureParts';
import { bareMapView } from '../helpers/bareMapView';
import { picturesOf, playersFrame } from '../helpers/pictures';
import { FRAME } from '../mocks/playerFrameSource';

const SETTINGS = { showTokenNameplates: true } as never;

afterEach(() => vi.restoreAllMocks());

/** A view's captures with its lighting and tokens alone; the lighting sees the hero and nobody else. */
function harness() {
  const overlay = { visible: true };
  const modeLayer = { visible: false };
  const isSeen = (tokenId: string): 'seen' | 'unseen' => (tokenId === 'hero' ? 'seen' : 'unseen');
  const getPlayerViewLayers = vi.fn((): LayerVisibility[] => []);
  const prepareBelow = vi.fn();
  const renderGmFrame = vi.fn();
  const lighting = lightingPicture({
    playerLayers: () => [{ layer: modeLayer, visible: true }, { layer: overlay, visible: false }],
    gmOverlays: () => ({ wallEditor: overlay, doorBadges: overlay, lightMarkers: overlay, rangeRings: overlay, sightAids: overlay }),
    playerOnlyLayers: () => [],
    renderer: { renderForFrame: (_frame, render) => render(), prepareBelow },
  });
  const pictures = picturesOf({ lighting, tokens: tokensPicture({ getPlayerViewLayers, getGmViewLayers: () => [] }) }, { renderGmFrame });
  return { pictures, overlay, modeLayer, isSeen, getPlayerViewLayers, prepareBelow, renderGmFrame };
}

describe('a players\' frame and the lighting', () => {
  it('applies the lighting\'s player layers for the capture and puts the GM\'s back', () => {
    const { pictures, overlay, modeLayer, renderGmFrame } = harness();
    const seen: boolean[] = [];
    pictures.capture(playersFrame(FRAME), () => seen.push(modeLayer.visible, overlay.visible));
    expect(seen).toEqual([true, false]);
    expect(modeLayer.visible).toBe(false);
    expect(overlay.visible).toBe(true);
    // The frame's pieces went through the canvas: the GM's own frame is rendered again
    expect(renderGmFrame).toHaveBeenCalledTimes(1);
  });

  it('draws the levels below in the players\' look, at the frame\'s size in points, before the frame\'s render', () => {
    const { pictures, prepareBelow } = harness();
    const rendered: number[] = [];
    pictures.capture(playersFrame({ ...FRAME, width: 2560, height: 1440, resolution: 2 }), () => rendered.push(prepareBelow.mock.calls.length));
    expect(prepareBelow).toHaveBeenCalledWith({ key: 'frame', width: 1280, height: 720, mode: 'player' });
    expect(rendered).toEqual([1]);
  });

  it('puts the GM\'s layers back when the players\' frame fails', () => {
    const { pictures, overlay, renderGmFrame } = harness();
    expect(() => pictures.capture(playersFrame(FRAME), () => { throw new Error('failed'); })).toThrow('failed');
    expect(overlay.visible).toBe(true);
    expect(renderGmFrame).toHaveBeenCalledTimes(1);
  });

  it('hides tokens by the frame\'s sight', () => {
    const { pictures, isSeen, getPlayerViewLayers } = harness();
    pictures.capture(playersFrame(FRAME, { settings: SETTINGS, sight: isSeen }), () => undefined);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(SETTINGS, isSeen);
  });

  it('hides nothing by sight in a frame without one', () => {
    const { pictures, getPlayerViewLayers } = harness();
    pictures.capture(playersFrame(FRAME, { settings: SETTINGS }), () => undefined);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(SETTINGS, undefined);
  });
});

describe('a map view\'s players\' frame', () => {
  it('renders the frame, hands it on in pieces through the canvas, and renders the GM\'s frame again', async () => {
    const { renderer, render, destroy } = await bareMapView();
    const copy = vi.fn();
    renderer.withPlayerSafeFrame(copy, SETTINGS, FRAME);
    // 1280 × 720 is one piece of the canvas
    expect(copy).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(3);
    destroy();
  });

  it('leaves the GM\'s frame to the render that follows, where one does', async () => {
    const { renderer, render, destroy } = await bareMapView();
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS, FRAME, true);
    expect(render).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('renders and copies nothing while the graphics context is lost', async () => {
    const { renderer, render, destroy } = await bareMapView({ contextLost: true });
    const copy = vi.fn();
    renderer.withPlayerSafeFrame(copy, SETTINGS, FRAME);
    expect(copy).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    destroy();
  });
});
