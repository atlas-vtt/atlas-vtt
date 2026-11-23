// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glideScroll } from '../../src/app/initiative/motion/scrollGlide';
import { TURN_MOVE_MS } from '../../src/app/initiative/motion/turnMotion';
import { PlayerInitiativeStage } from '../../src/app/services/playerInitiativeStage';

/** A list whose scroll holds what it is given, as jsdom lays nothing out. */
function scrollingList(parent: HTMLElement, scrollTop = 0): HTMLElement {
  const list = parent.createDiv({ cls: 'atlas-initiative-panel__list' });
  let top = scrollTop;
  Object.defineProperty(list, 'scrollTop', { get: () => top, set: (value: number) => { top = value; }, configurable: true });
  return list;
}

const frames: FrameRequestCallback[] = [];
let now = 0;

/** Holds the frames `glideScroll` asks for, on a clock of our own. */
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame));
});

afterEach(() => {
  vi.restoreAllMocks();
  frames.length = 0;
  document.body.empty();
});

/** Runs the frames asked for, 16 ms apart, until none is asked for. */
function flush(): void {
  while (frames.length > 0) {
    now += 16;
    frames.shift()!(now);
  }
}

describe('the players\' list gliding to the combatant whose conditions the GM names', () => {
  it('starts where the list stood, settles where it was drawn, and moves the tip with the card', () => {
    const list = scrollingList(document.body, 200);
    const left: number[] = [];
    glideScroll(list, 0, 'y', (offset) => left.push(offset));
    expect(list.scrollTop).toBe(0);
    flush();
    expect(list.scrollTop).toBe(200);
    expect(left[0]).toBe(200);
    expect(left.at(-1)).toBe(0);
    // Eased: it covers most of the way early and settles over the rest
    expect(left[Math.round(TURN_MOVE_MS / 16 / 4)]!).toBeLessThan(100);
  });

  it('glides only when the GM began, stopped or moved on naming a combatant', () => {
    const stage = new PlayerInitiativeStage();
    const container = document.body.createDiv();
    const draw = (shown: string | undefined, top: number): HTMLElement => {
      stage.begin(container, true, true, () => false);
      const panel = container.createDiv({ cls: 'atlas-initiative-panel' });
      panel.dataset.edge = 'right';
      if (shown !== undefined) panel.dataset.conditionsShown = shown;
      scrollingList(panel, top);
      stage.add(panel);
      return panel;
    };
    const list = (panel: HTMLElement): HTMLElement => panel.querySelector<HTMLElement>('.atlas-initiative-panel__list')!;
    draw(undefined, 0);
    let before = stage.measure();
    const shown = draw('goblin', 300);
    stage.glide(before);
    expect(list(shown).scrollTop).toBe(0);
    flush();
    expect(list(shown).scrollTop).toBe(300);
    before = stage.measure();
    const same = draw('goblin', 120);
    stage.glide(before);
    expect(list(same).scrollTop).toBe(120);
  });
});
