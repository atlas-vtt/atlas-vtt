import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT } from '../../src/app/stores/history';
import { RIGHT_ROOM, forget, memoryScenes, reveal } from './exploredMemoryScene';

describe('undoing and redoing edits of the explored memory', () => {
  const { scene } = memoryScenes();

  it('undoes and redoes memory edits among the store\'s own steps, in the order they were made', async () => {
    const { lighting, store, history, redAt, travels } = await scene();
    const walls = (): number => Object.keys(store.getState().objects.walls).length;
    /** The right room's memory at the brush's spot and away from it, and the walls on the map. */
    const state = (): string => `${redAt(200, 128)} ${redAt(240, 40)} ${walls()} walls`;

    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addObject('walls', { type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    expect(state()).toBe('0 255 2 walls');
    expect(history().pastStates).toHaveLength(3);

    history().undo();
    expect(state()).toBe('255 255 2 walls');
    history().undo();
    expect(state()).toBe('255 255 1 walls');
    history().undo();
    expect(state()).toBe('0 0 1 walls');
    expect(history().pastStates).toHaveLength(0);

    history().redo();
    expect(state()).toBe('255 255 1 walls');
    history().redo();
    expect(state()).toBe('255 255 2 walls');
    history().redo();
    expect(state()).toBe('0 255 2 walls');
    expect(history().futureStates).toHaveLength(0);
    // The overlay's owner heard of each memory step that went back or forth, and of none of the wall's or the edits themselves.
    expect(travels).toEqual([true, true, false, false]);
  });

  it('gives the memory back texel for texel, soft edges and what sight recorded before included', async () => {
    const { lighting, store, history, texels, textureHash: texture } = await scene({ lighting: { ambient: 1 } });
    // By day the token has seen its room up to 70 px: a round, soft-edged memory.
    expect(texels().some((value, i) => i % 4 === 0 && value > 20 && value < 235)).toBe(true);
    const seen = texture();

    lighting.editExplored(forget({ type: 'brush', brushRadius: 30, points: [{ x: 30, y: 100 }, { x: 110, y: 160 }] }));
    const forgotten = texture();
    expect(forgotten).not.toBe(seen);
    lighting.editExplored(reveal({ type: 'lasso', points: [{ x: 5, y: 5 }, { x: 250, y: 40 }, { x: 100, y: 250 }] }));
    const revealed = texture();
    expect(revealed).not.toBe(forgotten);

    history().undo();
    expect(texture()).toBe(forgotten);
    history().undo();
    expect(texture()).toBe(seen);
    history().redo();
    history().redo();
    expect(texture()).toBe(revealed);
    expect(store.getState().exploredEdits).toBe(2);
  });

  it('drops the redo of an edit when a new edit follows an undo', async () => {
    const { lighting, history, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    history().undo();
    lighting.editExplored(reveal({ type: 'rectangle', x: 0, y: 0, width: 50, height: 50 }));
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(redAt(20, 20)).toBe(0);
    expect(redAt(200, 128)).toBe(0);
    history().redo();
    expect(redAt(20, 20)).toBe(255);
    expect(redAt(200, 128)).toBe(0);
  });

  it('takes back only the texels its stroke changed: what the party sees afterwards inside the stroke\'s rectangle stays remembered', async () => {
    const { lighting, store, history, redAt } = await scene();
    // A thin stroke from corner to corner: the rectangle around it is nearly the whole map.
    lighting.editExplored(reveal({ type: 'brush', brushRadius: 6, points: [{ x: 20, y: 20 }, { x: 236, y: 236 }] }));
    expect(redAt(200, 200)).toBe(255);
    expect(redAt(40, 150)).toBe(0);
    // Day breaks: the token's sight is recorded in the left room, 77 px off the stroke at (40, 150).
    store.getState().setSceneLighting({ ambient: 1 });
    expect(redAt(40, 150)).toBe(255);

    history().undo();
    expect(redAt(200, 200)).toBe(0);
    expect(redAt(40, 150)).toBe(255);
    history().redo();
    expect(redAt(200, 200)).toBe(255);
    expect(redAt(40, 150)).toBe(255);
    history().undo();
    expect(redAt(40, 150)).toBe(255);
  });

  it('never takes away by an undo what the party has really seen since: a revealed texel it then saw stays explored', async () => {
    const { lighting, store, history, redAt } = await scene();
    lighting.editExplored(reveal({ type: 'brush', brushRadius: 6, points: [{ x: 20, y: 20 }, { x: 236, y: 236 }] }));
    // The token at (60, 128) sees 70 px by day: the stroke at (80, 80) lies in its sight, at (200, 200) it does not.
    store.getState().setSceneLighting({ ambient: 1 });
    history().undo();
    expect(redAt(80, 80)).toBe(255);
    expect(redAt(200, 200)).toBe(0);
    expect(redAt(22, 22)).toBe(0);
  });

  it('brings back what a whole-map forget took, keeps what was explored in between, and forgets by a redo only what was not seen since', async () => {
    const { lighting, store, history, redAt } = await scene({ lighting: { ambient: 1 } });
    /** In the circle the party sees by day, in the room the GM revealed, and where no one has looked. */
    const memory = (): number[] => [redAt(60, 190), redAt(200, 128), redAt(20, 20)];
    lighting.editExplored(reveal(RIGHT_ROOM));
    expect(memory()).toEqual([255, 255, 0]);
    lighting.resetExplored();
    expect(memory()).toEqual([0, 0, 0]);
    // Play goes on: night falls and day breaks, and the party sees its surroundings again.
    store.getState().setSceneLighting({ ambient: 0 });
    store.getState().setSceneLighting({ ambient: 1 });
    expect(memory()).toEqual([255, 0, 0]);

    history().undo();
    expect(memory()).toEqual([255, 255, 0]);
    history().redo();
    // Forgotten again: the room the party has not seen since. What it saw after the forget stays.
    expect(memory()).toEqual([255, 0, 0]);
    history().undo();
    expect(memory()).toEqual([255, 255, 0]);
  });

  it('keeps what sight recorded before an edit out of that rule: a forget takes it, and its redo takes it again', async () => {
    const { lighting, history, redAt, moveParty } = await scene({ lighting: { ambient: 1 } });
    lighting.editExplored(reveal(RIGHT_ROOM));
    // Seen after the first edit and before the second.
    moveParty(60, 60);
    expect(redAt(60, 10)).toBe(255);
    lighting.resetExplored();
    expect(redAt(60, 10)).toBe(0);
    history().undo();
    expect(redAt(60, 10)).toBe(255);
    history().redo();
    expect(redAt(60, 10)).toBe(0);
    expect(redAt(200, 128)).toBe(0);
  });

  it('never leaves a step that does nothing, however many edits a scene sees', async () => {
    const { lighting, history, textureHash } = await scene();
    for (let i = 0; i < 300; i++) lighting.editExplored(i % 2 ? forget(RIGHT_ROOM) : reveal(RIGHT_ROOM));
    expect(history().pastStates.length).toBeGreaterThan(0);
    while (history().pastStates.length > 0) {
      const before = textureHash();
      history().undo();
      expect(textureHash()).not.toBe(before);
    }
  });

  it('keeps a step for every step the undo history keeps', async () => {
    const { lighting, history, redAt } = await scene();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) lighting.editExplored(reveal({ type: 'rectangle', x: 4 * i, y: 0, width: 4, height: 4 }));
    expect(history().pastStates).toHaveLength(HISTORY_LIMIT);
    while (history().pastStates.length > 0) history().undo();
    // The five oldest edits left the history; every one it still held went back.
    expect(redAt(4 * 4 + 2, 2)).toBe(255);
    expect(redAt(4 * 5 + 2, 2)).toBe(0);
    expect(redAt(4 * (HISTORY_LIMIT + 4) + 2, 2)).toBe(0);
  });
});
