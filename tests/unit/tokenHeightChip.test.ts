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
    // Its lower edge clears a condition badge on the top of the ring, by less than a badge.
    expect(chip().position.x).toBe(0);
    expect(lowerEdge(chip())).toBeLessThan(-(RING + BADGE_REACH));
    expect(lowerEdge(chip())).toBeGreaterThan(-(RING + BADGE_REACH + 4));

    made.update(flier({ elevation: -10 }), SPRITE);
    expect(text()).toBe('↓ 10ft');
  });

  it('shows nothing for a token on the floor, in a map of range bands, or without the map\'s rules', () => {
    const grounded = renderer();
    grounded.ui.update(flier({ elevation: undefined }), SPRITE);
    expect(grounded.chip().visible).toBe(false);
    expect(grounded.ui.getContainer().visible).toBe(false);
    grounded.ui.update(flier(), SPRITE);
    expect(grounded.chip().visible).toBe(true);
    grounded.ui.update(flier({ elevation: 0 }), SPRITE);
    expect(grounded.chip().visible).toBe(false);
    grounded.ui.destroy();

    const bands = renderer({ ...FEET, mode: 'abstract' });
    bands.ui.update(flier(), SPRITE);
    expect(bands.chip().visible).toBe(false);
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
    expect(lowerEdge(chip())).toBeLessThan(-(RING + RESIZE_HANDLE_SIZE / 2));
    expect(lowerEdge(chip())).toBeGreaterThan(-(RING + RESIZE_HANDLE_SIZE / 2 + 4));
    made.setSelectionState(false);
    expect(lowerEdge(chip())).toBeGreaterThan(-(RING + BADGE_REACH + 4));
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
