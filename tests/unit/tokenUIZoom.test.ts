// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text, type Container } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { computeTokenPixelSize, restingTokenUIScale, selectedTokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import type { Character } from '../../src/app/types';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };
const SPRITE = computeTokenPixelSize(70, 1);

let restoreGraphics: (() => void) | undefined;
let made: TokenUIRenderer | undefined;
afterEach(() => {
  made?.destroy();
  made = undefined;
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

const goblin = (more: Partial<Character> = {}): Character => ({
  id: 'goblin', kind: 'character', name: 'Goblin', imagePath: '', x: 0, y: 0, ...more,
});

/** A token's UI on a 70 px grid at `zoom()`, with what it told the controls of its scale. */
function tokenUI(zoom: () => number): { ui: TokenUIRenderer; told: number[] } {
  restoreGraphics = stubJsdomGraphics();
  // Reduced motion: a selected token's UI takes its size at once
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 60, height: 20 } as ReturnType<Text['getLocalBounds']>);
  const store = createStore(() => ({ tokenSettings: { showNameplates: true }, grid: { size: 70 } }));
  const ui = new TokenUIRenderer(store as unknown as ConstructorParameters<typeof TokenUIRenderer>[0]);
  made = ui;
  ui.measurementProvider = () => FEET;
  ui.zoomProvider = zoom;
  const told: number[] = [];
  ui.onScaleChange = (scale) => told.push(scale);
  return { ui, told };
}

describe('a token\'s UI on zoom', () => {
  it('lets a zoom step pass a resting token by, and takes the zoom up once the token is selected', () => {
    let zoom = 1;
    const { ui, told } = tokenUI(() => zoom);
    ui.update(goblin(), SPRITE);
    const resting = restingTokenUIScale(70);
    expect(ui.getUIScale()).toBeCloseTo(resting);
    told.length = 0;
    zoom = 0.25;
    ui.refreshScale();
    expect(told).toEqual([]);
    expect(ui.getUIScale()).toBeCloseTo(resting);
    ui.setSelectionState(true);
    expect(ui.getUIScale()).toBeCloseTo(selectedTokenUIScale(resting, 0.25));
    told.length = 0;
    zoom = 0.5;
    ui.refreshScale();
    expect(told.at(-1)).toBeCloseTo(selectedTokenUIScale(resting, 0.5));
  });

  it('stands a height chip that shows after a zoom at that zoom\'s size', () => {
    let zoom = 1;
    const { ui } = tokenUI(() => zoom);
    ui.update(goblin({ elevation: 30 }), SPRITE);
    const chip = ui.getContainer().getChildByLabel('heightChip') as Container;
    const onScreen = chip.scale.x * zoom;
    ui.setHeld(true);
    expect(chip.visible).toBe(false);
    zoom = 4;
    ui.refreshScale();
    ui.setHeld(false);
    expect(chip.visible).toBe(true);
    expect(chip.scale.x * zoom).toBeCloseTo(onScreen);
  });
});
