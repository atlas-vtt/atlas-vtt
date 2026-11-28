// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasureRenderer } from '../../src/app/pixi/measure/MeasureRenderer';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { measuresPicture } from '../../src/app/pixi/picture/viewPictureParts';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';
import { bareMapView } from '../helpers/bareMapView';
import { playersFrame, picturesOf, scenePicture } from '../helpers/pictures';
import { FRAME } from '../mocks/playerFrameSource';

afterEach(() => vi.restoreAllMocks());

/** A view's captures with its measurements alone, whose one part shows by whether the players see the goblin. */
function harness(options: { tokens?: boolean } = {}) {
  const part = { visible: true };
  const sight = (id: string): 'seen' | 'unseen' => (id === 'hero' ? 'seen' : 'unseen');
  const seenInFrame = (id: string): boolean => id === 'hero';
  const playersSeeInFrame = vi.fn(() => seenInFrame);
  const getPlayerViewLayers = vi.fn((seen: (id: string) => boolean): LayerVisibility[] => [{ layer: part, visible: seen('goblin') }]);
  const measures = measuresPicture(
    { getPlayerViewLayers, getGmViewLayers: (): LayerVisibility[] => [{ layer: part, visible: true }], effects: { stillFor: () => () => undefined } },
    () => (options.tokens === false ? undefined : { playersSeeInFrame }),
  );
  return { measures, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers };
}

describe('a players\' frame and the measurements', () => {
  it('asks once per capture which tokens the players see, by the frame\'s sight, and hides measurements by it', () => {
    const { measures, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers } = harness();
    const during: boolean[] = [];
    picturesOf({ measures }).capture(playersFrame(FRAME, { sight }), () => during.push(part.visible));
    expect(playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(playersSeeInFrame).toHaveBeenCalledWith(sight);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(seenInFrame);
    expect(during).toEqual([false]);
    expect(part.visible).toBe(true);
  });

  it('sees no token while there is no token renderer, so no measurement from one shows', () => {
    const { measures, getPlayerViewLayers } = harness({ tokens: false });
    picturesOf({ measures }).capture(playersFrame(FRAME), () => undefined);
    const seen = getPlayerViewLayers.mock.calls[0]?.[0] as (id: string) => boolean;
    expect(['hero', 'goblin'].map(seen)).toEqual([false, false]);
  });

  it('keeps the measurements as the GM sees them in a picture of the scene', () => {
    const { measures, part } = harness();
    part.visible = false;
    expect(scenePicture({ measures }, { x: 0, y: 0, resolution: 1 }, () => part.visible)).toBe(true);
    expect(part.visible).toBe(false);
  });
});

describe('the measure renderer\'s wiring', () => {
  it('shows measurements by whom the canvas is drawn for, following each change once', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const refreshed = vi.spyOn(MeasureRenderer.prototype, 'refreshVisibility');
    const { store, destroy } = await bareMapView({ grid: { size: 70, enabled: true, color: 0xffffff } });
    refreshed.mockClear();
    store.getState().setGMView(false);
    expect(refreshed).toHaveBeenCalledTimes(1);
    store.getState().setGMView(true);
    expect(refreshed).toHaveBeenCalledTimes(2);
    destroy();
  });
});

describe('measurePlayersView', () => {
  const store = {
    getState: () => ({
      objects: { tokens: { goblin: { id: 'goblin', kind: 'token', imagePath: '', x: 100, y: 100, size: 1, isHidden: true } } },
      tokenSettings: { tokenRingSize: 1.5 },
    }),
  } as never;

  it('places every token at its sprite and ring size, and asks the tokens\' sight only when called', () => {
    const lighting = vi.fn(() => undefined);
    const seenOnCanvas = (): boolean => true;
    const tokens = {
      getTokenSprites: () => ({ goblin: { x: 120, y: 100 } }),
      playersSeeInFrame: vi.fn(() => () => false),
    };
    const audience = { seenOnCanvas: vi.fn(() => seenOnCanvas), onChange: () => () => undefined };
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => tokens as never, lighting, audience });
    expect(lighting).not.toHaveBeenCalled();
    const radius = (computeTokenPixelSize(70, 1) / 2) * 1.5;
    expect(view.footprints()).toEqual([{ id: 'goblin', x: 120, y: 100, radius }, { id: 'goblin', x: 100, y: 100, radius }]);
    view.seenAtStart();
    expect(lighting).toHaveBeenCalledTimes(1);
    expect(tokens.playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(view.seenOnCanvas()).toBe(seenOnCanvas);
  });

  it('fails closed without a token renderer: nothing seen in a frame', () => {
    const audience = { seenOnCanvas: () => null, onChange: () => () => undefined };
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => undefined, lighting: () => undefined, audience });
    expect(view.seenAtStart()('goblin')).toBe(false);
  });
});
