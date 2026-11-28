// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { bareMapView, type BareMapView } from '../helpers/bareMapView';
import { FRAME } from '../mocks/playerFrameSource';

/** Settings an older Atlas saved, with its own grid switch for players: no longer read. */
const OLD_SETTINGS = { showGrid: true, showTokenNameplates: true } as never;

const views: BareMapView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A map view with its grid, as Atlas builds it, the GM showing or hiding the grid. */
async function mapWithGrid(enabled: boolean): Promise<BareMapView> {
  // jsdom has no canvas; the token and text renderers built with the grid only need it for icons
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const view = await bareMapView({ grid: { size: 70, enabled, color: 0xff0000 } });
  views.push(view);
  view.renderer.getGridSystem()!.setEnabled(enabled);
  return view;
}

/** Whether the players' frame shows the grid, and the grid it shows. */
function playersSee({ renderer }: BareMapView, settings = OLD_SETTINGS): { shown: boolean; sprite: unknown } | null {
  let seen: { shown: boolean; sprite: unknown } | null = null;
  renderer.withPlayerSafeFrame(() => {
    const sprite = renderer.getGridSystem()?.getGridSprite();
    seen = { shown: sprite?.visible === true, sprite };
  }, settings, FRAME);
  return seen;
}

it('shows players no grid while the GM hides it, whatever an older player view switch says', async () => {
  const view = await mapWithGrid(false);
  expect(playersSee(view)?.shown).toBe(false);
  expect(view.renderer.getGridSystem()?.getGridSprite()?.visible).toBe(false);
});

it('shows players the grid while the GM shows it, also where an older switch hid it for them', async () => {
  const view = await mapWithGrid(true);
  expect(playersSee(view, { showGrid: false, showTokenNameplates: true } as never)?.shown).toBe(true);
});

it('follows the GM switching the grid and changing its look', async () => {
  const view = await mapWithGrid(true);
  vi.useFakeTimers();
  const grid = view.renderer.getGridSystem()!;
  grid.setEnabled(false);
  expect(playersSee(view)?.shown).toBe(false);

  grid.setEnabled(true);
  grid.updateOptions({ color: 0x00ff00, alpha: 0.4, lineType: 'dashed' });
  vi.runAllTimers();
  const { shown, sprite } = playersSee(view)!;
  expect(shown).toBe(true);
  // The players' frame draws the GM's own grid, so it has the GM's look
  expect(sprite).toBe(grid.getGridSprite());
  expect(grid.getOptions()).toMatchObject({ color: 0x00ff00, alpha: 0.4, lineType: 'dashed' });
});
