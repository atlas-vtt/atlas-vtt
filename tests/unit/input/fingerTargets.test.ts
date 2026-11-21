// @vitest-environment jsdom
import '../../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { watchInput } from '../../../src/app/packages/components/primitives/lastInput';
import { BAR_BUTTON_SIZE, type ResourceSlot } from '../../../src/app/pixi/token-renderer/resources/ResourceStack';
import { barButtonSpan, FINGER_STEPPER_SIZE, stepperLayout, type StepperLayout } from '../../../src/app/pixi/token-renderer/resources/stepperLayout';
import { wheelAnchor } from '../../../src/app/pixi/token-renderer/resources/wheelAnchor';
import { wheelSlot } from '../../../src/app/pixi/token-renderer/resources/wheelGeometry';
import { SELECTED_TOKEN_UI_SCREEN_SCALE } from '../../../src/app/pixi/token-renderer/tokenSizing';
import { HandleHitArea } from '../../../src/app/pixi/utils/handleHitArea';
import { emptyViewRoot } from '../../../src/app/platform/viewRoot';

function use(kind: 'mouse' | 'touch'): void {
  const event = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: kind });
  document.body.dispatchEvent(event);
}

let stopWatching: () => void = () => undefined;
beforeEach(() => {
  stopWatching = watchInput(document);
  use('mouse');
});
afterEach(() => {
  use('mouse');
  stopWatching();
});

describe('a handle on a token\'s ring', () => {
  /** A token 80 px across on screen with handles of radius 10 on its ring, at the right and at the top. */
  function token(radius = 40): { right: Container; top: Container; hits: (handle: Container, x: number, y: number) => boolean } {
    const group = new Container();
    const make = (x: number, y: number): Container => {
      const handle = new Container({ label: 'tokenHandle' });
      handle.position.set(x, y);
      handle.hitArea = new HandleHitArea(handle, 10, 'tokenHandle');
      group.addChild(handle);
      return handle;
    };
    const right = make(radius, 0);
    const top = make(0, -radius);
    group.updateLocalTransform();
    for (const handle of [right, top]) {
      handle.updateLocalTransform();
      handle.worldTransform.copyFrom(handle.localTransform);
    }
    // A point of the token's own space, asked of a handle in the handle's
    const hits = (handle: Container, x: number, y: number): boolean => handle.hitArea!.contains(x - handle.x, y - handle.y);
    return { right, top, hits };
  }

  it('takes a mouse only where it is drawn', () => {
    const { right, hits } = token();
    expect(hits(right, 49, 0)).toBe(true);
    expect(hits(right, 52, 0)).toBe(false);
    expect(hits(right, 28, 0)).toBe(false);
  });

  it('takes a finger 22 px from its middle outside the token, and inside it only as far as the token\'s middle is farther', () => {
    const { right, hits } = token();
    use('touch');
    expect(hits(right, 61, 0)).toBe(true);
    expect(hits(right, 63, 0)).toBe(false);
    // Inside the token: 19 px from the handle, 21 from the token's middle
    expect(hits(right, 21, 0)).toBe(true);
    // 21 px from the handle, 19 from the middle: clearly on the token
    expect(hits(right, 19, 0)).toBe(false);
  });

  it('leaves a smaller token its middle: the handle\'s wider reach ends halfway to it', () => {
    const { right, hits } = token(30);
    use('touch');
    // 13 px from the handle's middle, 17 from the token's
    expect(hits(right, 17, 0)).toBe(true);
    // 17 px from the handle's middle, within a finger's reach of it, yet 13 from the token's
    expect(hits(right, 13, 0)).toBe(false);
    // What is drawn is the handle's, whatever lies under it
    expect(hits(token(16).right, 7, 0)).toBe(true);
  });

  it('gives a finger between two handles of a small token the nearer one', () => {
    const { right, top, hits } = token(16);
    use('touch');
    // On the ring between the two, a little nearer the right one
    expect(hits(right, 13, -9)).toBe(true);
    expect(hits(top, 13, -9)).toBe(false);
    expect(hits(top, 9, -13)).toBe(true);
    expect(hits(right, 9, -13)).toBe(false);
  });
});

describe('where the +/- buttons stand', () => {
  const bar = (top: number): ResourceSlot => ({ key: 'bar', kind: 'bar', left: -32, top, width: 64, height: 10 });
  interface Box { left: number; top: number; right: number; bottom: number }
  const boxes = ({ size, minusX, minusY, plusX, plusY }: StepperLayout): Box[] =>
    [[minusX, minusY], [plusX, plusY]].map(([x, y]) => ({ left: x! - size / 2, top: y! - size / 2, right: x! + size / 2, bottom: y! + size / 2 }));
  const slotBox = (slot: ResourceSlot): Box => ({ left: slot.left, top: slot.top, right: slot.left + slot.width, bottom: slot.top + slot.height });
  const meet = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  it('is beside the bar, level with it and a bar tall, for a mouse', () => {
    const layout = stepperLayout(bar(2), 0, false);
    expect(layout).toEqual({ size: BAR_BUTTON_SIZE, minusX: -39, minusY: 7, plusX: 39, plusY: 7 });
    // The second bar's buttons stand level with it, whatever bars lie above
    expect(stepperLayout(bar(14), 1, false).minusX).toBe(-39);
  });

  it('is a finger\'s size for a finger: 45 px on screen at a selected token\'s least scale', () => {
    expect(FINGER_STEPPER_SIZE * SELECTED_TOKEN_UI_SCREEN_SCALE).toBeGreaterThanOrEqual(44);
    expect(stepperLayout(bar(2), 0, true).size).toBe(FINGER_STEPPER_SIZE);
  });

  it('keeps a finger\'s buttons of two bars off the bars, off each other and below the bars\' top line', () => {
    const slots = [bar(2), bar(14)];
    const all = slots.flatMap((slot, column) => boxes(stepperLayout(slot, column, true)));
    for (const box of all) {
      for (const slot of slots) expect(meet(box, slotBox(slot))).toBe(false);
      expect(box.top).toBeGreaterThanOrEqual(2);
    }
    all.forEach((box, i) => all.forEach((other, j) => { if (i < j) expect(meet(box, other)).toBe(false); }));
    // Each hangs from its own bar's top line
    expect(all[0]!.top).toBe(2);
    expect(all[2]!.top).toBe(14);
  });

  it('keeps a finger\'s steppers of both wheels of a side off the wheels and off each other, - before +', () => {
    for (const first of [2, 4]) {
      const wheels = [wheelSlot('upper', first), wheelSlot('lower', first + 1)];
      const layouts = wheels.map((slot) => stepperLayout(slot, 0, true));
      const all = layouts.flatMap(boxes);
      for (const box of all) for (const slot of wheels) expect(meet(box, slotBox(slot))).toBe(false);
      all.forEach((box, i) => all.forEach((other, j) => { if (i < j) expect(meet(box, other)).toBe(false); }));
      for (const layout of layouts) expect(layout.minusX).toBeLessThan(layout.plusX);
    }
  });

  it('makes the wheels beside the token stand clear of a finger\'s buttons', () => {
    const anchor = (span: number | undefined): number => wheelAnchor({
      spriteSize: 70, gridSize: 70, ringScale: 1, uiScale: 2.25, barsBottom: 24, barButtons: 1, nameplateHalfWidth: 0, barButtonSpan: span,
    }).x;
    expect(barButtonSpan(2, false)).toBe(12);
    expect(barButtonSpan(1, true)).toBe(22);
    expect(barButtonSpan(2, true)).toBe(44);
    // The outer button of two bars ends 32 + 44 units from the token's middle: the wheels' column starts there
    expect(anchor(barButtonSpan(2, true))).toBeCloseTo((32 + 44) * 2.25, 5);
    expect(anchor(undefined)).toBe(anchor(barButtonSpan(2, false)));
  });
});

describe('the leaf a view takes over', () => {
  function leaf(): HTMLElement {
    const root = document.body.createDiv();
    root.createDiv({ cls: 'view-header' });
    root.createDiv({ cls: 'view-content' });
    root.createEl('canvas');
    return root;
  }

  it('is emptied whole on desktop, Obsidian\'s header with it', () => {
    const root = leaf();
    emptyViewRoot(root, false);
    expect(root.children).toHaveLength(0);
    root.remove();
  });

  it('keeps Obsidian\'s header on mobile and nothing else', () => {
    const root = leaf();
    emptyViewRoot(root, true);
    expect(Array.from(root.children).map((child) => child.className)).toEqual(['view-header']);
    // Opened again, the header is still the one Obsidian made
    root.createDiv({ cls: 'atlas-react-ui-container' });
    emptyViewRoot(root, true);
    expect(Array.from(root.children).map((child) => child.className)).toEqual(['view-header']);
    root.remove();
  });
});
