import type { FederatedPointerEvent } from 'pixi.js';
import { isHandled, isHandledTap } from '../../../src/app/pixi/utils/handledEvents';
import { setCtrlClickIsSecondary } from '../../../src/app/pixi/utils/pointerButtons';
import type { PointerOutcome } from './mapPointerCases';
import { AT, type PointerCase, type PointerWorld } from './pointerWorld';

/** The map's pointer as a test drives it: the events a view hands on, and the questions the touch gestures ask. */
export interface PointerDriver {
  /** Puts the view in the state of `world.current`: the tool, the selection, the view shown, tokens placed. */
  arrange(world: PointerWorld): void;
  press(event: FederatedPointerEvent): void;
  release(event: FederatedPointerEvent): void;
  move(event: FederatedPointerEvent): void;
  cancel(event: FederatedPointerEvent): void;
  doubleClick(): void;
  leave(): void;
  menuAt(x: number, y: number): boolean;
  tapActsAt(x: number, y: number): boolean;
  pressActsAt(x: number, y: number): boolean;
  /** The cursor the last move set; `RESET_CURSOR` when it set none. */
  cursor(): string;
  /** Whether the press let go of the selection the case began with. */
  selectionCleared(world: PointerWorld): boolean;
}

export const RESET_CURSOR = 'unset';

/** What `driver` does with case `c`, each gesture from the case's state. */
export function outcomeOf(driver: PointerDriver, world: PointerWorld, c: PointerCase): PointerOutcome {
  const restorePlatform = setCtrlClickIsSecondary(c.mac ?? false);
  try {
    world.reset(c);
    driver.arrange(world);
    const down = world.event('down');
    driver.press(down);
    if (driver.selectionCleared(world)) world.log('selection:cleared');
    const press = world.take();
    const claimed = isHandled(down);
    const tapClaimed = isHandledTap(world.event('up'));
    driver.release(world.event('up'));
    const release = world.take();

    world.reset(c);
    driver.arrange(world);
    const menuAt = driver.menuAt(AT.x, AT.y);
    const tapActs = driver.tapActsAt(AT.x, AT.y);
    const pressActs = driver.pressActsAt(AT.x, AT.y);

    world.reset(c);
    driver.arrange(world);
    driver.move(world.event('move'));
    return { press, claimed, tapClaimed, release, menuAt, tapActs, pressActs, cursor: driver.cursor(), hovered: [...world.hovered].sort(), moves: world.take() };
  } finally {
    restorePlatform();
  }
}

/** Only the parts of `outcome` that `expected` names. */
export function named(outcome: PointerOutcome, expected: Partial<PointerOutcome>): Partial<PointerOutcome> {
  const picked: Partial<Record<keyof PointerOutcome, unknown>> = {};
  for (const key of Object.keys(expected) as (keyof PointerOutcome)[]) {
    picked[key] = key === 'hovered' ? [...outcome.hovered].sort() : outcome[key];
  }
  return picked as Partial<PointerOutcome>;
}

/** Whether `outcome` opened a menu, at the press or at its release. */
export function openedMenu(outcome: PointerOutcome): boolean {
  return [...outcome.press, ...outcome.release].some((action) => action.endsWith(':menu'));
}
