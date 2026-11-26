// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { tokenMovement, type TokenMovement } from '../../src/app/pixi/token-renderer/tokenMovement';
import type { MovementRules } from '../../src/app/measure/movementRules';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';

const GOBLIN = 'Bestiary/Goblin.md';
const FEET = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 } as MeasurementSettings;
const METRES = { ...FEET, unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5 } as MeasurementSettings;
const STEPS: MovementRules = { steps: [{ name: 'Move', multiple: 1, color: '#22c55e' }], countPerTurn: false };

/** The canvas's reader of movement over a real creature index: what a drag is handed. */
describe('tokenMovement', () => {
  let current: CreatureVault;
  let rules: MovementRules;
  let measurement: MeasurementSettings;
  let movement: TokenMovement;
  const goblin = { statblockPath: GOBLIN };
  const read = (): Promise<void> => vi.waitFor(() => expect(CreatureIndex.forApp(current.app).get(GOBLIN)).toBeTruthy());

  beforeEach(() => {
    current = creatureVault();
    current.frontmatter[GOBLIN]!.speed = '30 ft., climb 20 ft.';
    rules = STEPS;
    measurement = FEET;
    movement = tokenMovement(current.app, () => rules, () => measurement);
  });

  afterEach(() => {
    CreatureIndex.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    vi.restoreAllMocks();
  });

  it('knows no speed for a statblock nobody has read, and reads none itself', async () => {
    const request = vi.spyOn(CreatureIndex.forApp(current.app), 'request');
    expect(movement.speedOf(goblin)).toBeNull();
    expect(movement.choicesOf(goblin)).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(CreatureIndex.forApp(current.app).get(GOBLIN)).toBeUndefined();
  });

  it('has a statblock read ahead of the drag, and then gives its speed in what the map measures in', async () => {
    movement.prepare([goblin]);
    await read();
    expect(movement.speedOf(goblin)).toBe(30);
    expect(movement.speedOf({ ...goblin, speedKind: 'climb' })).toBe(20);
    expect(movement.choicesOf(goblin).map((choice) => [choice.name, choice.speed])).toEqual([[null, 30], ['climb', 20]]);
    measurement = METRES;
    expect(movement.speedOf(goblin)).toBe(9);
  });

  it('gives a token its own speed without its statblock, and offers it no other', async () => {
    const request = vi.spyOn(CreatureIndex.forApp(current.app), 'request');
    const fast = { ...goblin, speed: 45 };
    movement.prepare([fast, {}]);
    expect(request).not.toHaveBeenCalled();
    expect(movement.speedOf(fast)).toBe(45);
    expect(movement.speedOf({})).toBeNull();
    CreatureIndex.forApp(current.app).request([GOBLIN]);
    await read();
    expect(movement.choicesOf(fast)).toEqual([]);
  });

  it('gives a token that states no speed the one the rules give such creatures', async () => {
    rules = { ...STEPS, speed: 40 };
    expect(movement.speedOf({})).toBe(40);
    expect(movement.speedOf({ speed: 45 })).toBe(45);
    // The goblin's statblock states 30 ft: unread it is not known yet, read it wins.
    expect(movement.speedOf(goblin)).toBeNull();
    movement.prepare([goblin]);
    await read();
    expect(movement.speedOf(goblin)).toBe(30);
    // A statblock that says nothing of its speed.
    delete current.frontmatter[GOBLIN]!.speed;
    current.metadata.trigger('changed', current.app.vault.getAbstractFileByPath(GOBLIN));
    await vi.waitFor(() => expect(movement.speedOf(goblin)).toBe(40));
    // A link that leads to no statblock at all.
    CreatureIndex.forApp(current.app).request(['Notes/Plain.md']);
    await vi.waitFor(() => expect(movement.speedOf({ statblockPath: 'Notes/Plain.md' })).toBe(40));
  });

  it('has nothing read where the collection names no movement steps', () => {
    rules = { steps: [], countPerTurn: true };
    const request = vi.spyOn(CreatureIndex.forApp(current.app), 'request');
    movement.prepare([goblin]);
    expect(request).not.toHaveBeenCalled();
  });
});
