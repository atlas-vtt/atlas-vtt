// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { CONDITION_BADGE_RADIUS } from '../../src/app/pixi/token-renderer/ConditionBadge';
import { getTokenRingCenterRadius } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, NAMEPLATE_HEIGHT, RESIZE_HANDLE_SIZE } from '../../src/app/pixi/token-renderer/tokenSizing';
import type { Character } from '../../src/app/types';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };
const SPRITE = computeTokenPixelSize(70, 1);
const RING = getTokenRingCenterRadius(SPRITE, 4, 1);
/** How far a condition badge on the ring reaches from the ring's middle, with its bezel, on a 70 px grid. */
const BADGE_REACH = CONDITION_BADGE_RADIUS + 1;
/** How far the ring's band reaches past its middle: half the grid stroke on a 70 px grid. */
const BAND = 2;
/** Between the pill and what it clears, in screen pixels: world units at zoom 1. */
const GAP = 4;
/** Where the pill's lower edge lies, in world units from the token's centre. */
const lowerEdge = (chip: Container): number => chip.position.y + (NAMEPLATE_HEIGHT / 2) * chip.scale.y;

let restoreGraphics: (() => void) | undefined;
let ui: TokenUIRenderer | undefined;
afterEach(() => {
  ui?.destroy();
  ui = undefined;
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

const flier = (more: Partial<Character> = {}): Character => ({ id: 'wyvern', kind: 'character', name: 'Wyvern', imagePath: '', x: 0, y: 0, elevation: 30, ...more });

function renderer(settings: MeasurementSettings | null = FEET): { ui: TokenUIRenderer; chip: () => Container; text: () => string } {
  restoreGraphics = stubJsdomGraphics();
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 60, height: 20 } as ReturnType<Text['getLocalBounds']>);
  const store = createStore(() => ({ tokenSettings: { showNameplates: false }, grid: { size: 70 } }));
  ui = new TokenUIRenderer(store as unknown as ConstructorParameters<typeof TokenUIRenderer>[0]);
  ui.resourceDefsProvider = () => [];
  if (settings) ui.measurementProvider = () => settings;
  const made = ui;
  const chip = (): Container => {
    const found = made.getContainer().getChildByLabel('heightChip');
    if (!found) throw new Error('no chip');
    return found;
  };
  return { ui: made, chip, text: () => chip().children.find((child): child is Text => child instanceof Text)!.text };
}

describe('the height chip of a token', () => {
  it('says how far off the floor the token stands, over the top of its ring', () => {
    const { ui: made, chip, text } = renderer();
    made.update(flier(), SPRITE);
    expect(chip().visible).toBe(true);
    expect(made.getContainer().visible).toBe(true);
    expect(text()).toBe('↑ 30ft');
    // It stands just over the ring's outer edge
    expect(chip().position.x).toBe(0);
    expect(lowerEdge(chip())).toBeCloseTo(-(RING + BAND + GAP));
    // With conditions, whose badges fan out up to the top, its lower edge clears them
    made.update(flier({ conditions: ['poisoned'] }), SPRITE);
    expect(lowerEdge(chip())).toBeCloseTo(-(RING + BADGE_REACH + GAP));

    made.update(flier({ elevation: -10 }), SPRITE);
    expect(text()).toBe('↓ 10ft');
  });

  it('shows nothing for a token on the floor or without the map\'s rules, and names the band in a map of range bands', () => {
    const grounded = renderer();
    grounded.ui.update(flier({ elevation: undefined }), SPRITE);
    expect(grounded.chip().visible).toBe(false);
    expect(grounded.ui.getContainer().visible).toBe(false);
    grounded.ui.update(flier(), SPRITE);
    expect(grounded.chip().visible).toBe(true);
    grounded.ui.update(flier({ elevation: 0 }), SPRITE);
    expect(grounded.chip().visible).toBe(false);
    grounded.ui.destroy();

    // 30 up at 5 a square is six squares: Close.
    const bands = renderer({ ...FEET, mode: 'abstract', rangeBands: [{ name: 'Melee', maxSquares: 1 }, { name: 'Close', maxSquares: 6 }, { name: 'Far', maxSquares: 12 }] });
    bands.ui.update(flier(), SPRITE);
    expect(bands.chip().visible).toBe(true);
    expect(bands.chip().children.map((child) => ('text' in child ? child.text : '')).join('')).toContain('Close');
    bands.ui.destroy();

    const bare = renderer(null);
    bare.ui.update(flier(), SPRITE);
    expect(bare.chip().visible).toBe(false);
  });

  it('hides with its token, and stays hidden through an update', () => {
    const { ui: made, chip } = renderer();
    made.update(flier(), SPRITE);
    made.setHiddenWithToken(true);
    expect(made.getContainer().visible).toBe(false);
    made.update(flier({ elevation: 45 }), SPRITE);
    expect(made.getContainer().visible).toBe(false);
    made.setHiddenWithToken(false);
    expect(made.getContainer().visible).toBe(true);
    expect(chip().visible).toBe(true);
  });

  it('is drawn again only when its text is another', () => {
    const { ui: made, chip } = renderer();
    made.update(flier(), SPRITE);
    const pill = chip().children.find((child): child is Graphics => child instanceof Graphics)!;
    const clear = vi.spyOn(pill, 'clear');
    made.update(flier({ x: 140, y: 70 }), SPRITE);
    made.update(flier({ name: 'Old wyvern' }), SPRITE);
    made.setHoverState(true);
    made.update(flier({ name: 'Old wyvern' }), SPRITE);
    expect(clear).not.toHaveBeenCalled();
    made.update(flier({ elevation: 35 }), SPRITE);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('keeps a resting token\'s size on a selected token and stands clear of its rotate button', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const { ui: made, chip } = renderer();
    made.zoomProvider = () => 1;
    made.update(flier(), SPRITE);
    const resting = chip().scale.x;
    made.setSelectionState(true);
    made.update(flier(), SPRITE);
    expect(chip().scale.x).toBeCloseTo(resting);
    // The rotate button is a disc of RESIZE_HANDLE_SIZE on the top of the ring; the pill's lower edge lies above it.
    expect(lowerEdge(chip())).toBeCloseTo(-(RING + RESIZE_HANDLE_SIZE / 2 + GAP));
    made.setSelectionState(false);
    expect(lowerEdge(chip())).toBeCloseTo(-(RING + BAND + GAP));
  });

  it('keeps one size on screen at any zoom and on any token, like the condition card', () => {
    const { ui: made, chip } = renderer();
    let zoom = 1;
    made.zoomProvider = () => zoom;
    made.update(flier(), SPRITE);
    const onScreen = chip().scale.x;
    zoom = 4;
    made.refreshScale();
    expect(chip().scale.x * zoom).toBeCloseTo(onScreen);
    // The gap is in screen pixels too; the ring's band is the token's
    expect(lowerEdge(chip())).toBeCloseTo(-(RING + BAND + GAP / zoom));
    // A size 2 token is three cells across: a larger ring, badges three times as large, the same chip
    const large = computeTokenPixelSize(70, 2);
    const ring = getTokenRingCenterRadius(large, 4, 1);
    made.update(flier({ conditions: ['poisoned'] }), large);
    expect(chip().scale.x * zoom).toBeCloseTo(onScreen);
    expect(lowerEdge(chip())).toBeCloseTo(-(ring + 3 * BADGE_REACH + GAP / zoom));
  });

  it('shows only while its token is hovered or selected, like the wheels', async () => {
    const { ui: made, chip } = renderer();
    made.update(flier(), SPRITE);
    expect(chip().alpha).toBe(0);
    made.setHoverState(true);
    await vi.waitFor(() => expect(chip().alpha).toBe(1));
    made.setHoverState(false);
    await vi.waitFor(() => expect(chip().alpha).toBe(0));
    made.setSelectionState(true);
    await vi.waitFor(() => expect(chip().alpha).toBe(1));
  });

  it('is hidden while its token is resized or turned', () => {
    const { ui: made, chip } = renderer();
    made.update(flier(), SPRITE);
    window.dispatchEvent(new CustomEvent('atlas-token-rotation-started', { detail: { tokenIds: ['wyvern'] } }));
    expect(chip().visible).toBe(false);
    window.dispatchEvent(new CustomEvent('atlas-token-rotation-ended', { detail: { tokenIds: ['wyvern'] } }));
    expect(chip().visible).toBe(true);
  });
});
