import { expect, it } from 'vitest';
import { fogRectangle } from '../helpers/fogOperations';
import { playerViewScenes, samePixels, type PlayerViewScene } from '../helpers/playerViewScene';

/**
 * The GM's picture of scenes the player view treats specially, as a digest to compare between
 * versions, and unchanged by everything the player view does in between.
 */
const { scene } = playerViewScenes();

async function digest(pixels: Uint8ClampedArray): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels.slice().buffer));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The GM's canvas, unchanged by a frame, a session-view round trip and a peek. */
async function gmPicture(s: PlayerViewScene, name: string): Promise<void> {
  await s.settle();
  const gm = s.canvas();
  s.frame();
  expect(samePixels(s.canvas(), gm)).toBe(true);
  s.store.getState().setGMView(false);
  s.frame();
  s.store.getState().setGMView(true);
  expect(samePixels(s.canvas(), gm)).toBe(true);
  s.peek(true);
  s.peek(false);
  expect(samePixels(s.canvas(), gm)).toBe(true);
  console.info(`GM_DIGEST ${name} ${await digest(gm)}`);
}

it('twins, one hidden and one under fog', async () => {
  const s = await scene();
  await s.add({ id: 'a', x: 60, y: 60 }, { id: 'b', x: 140, y: 60, isHidden: true }, { id: 'c', x: 60, y: 180 });
  s.setFog({ paint: fogRectangle({ x: 30, y: 150, width: 60, height: 60 }) });
  await gmPicture(s, 'twins-hidden-fogged');
});

it('three twins', async () => {
  const s = await scene();
  await s.add({ id: 'a', x: 60, y: 60 }, { id: 'b', x: 140, y: 60 }, { id: 'c', x: 220, y: 60 });
  await gmPicture(s, 'three-twins');
});

it('a live ruler from a hidden token', async () => {
  const s = await scene();
  await s.add({ id: 'goblin', x: 60, y: 60, isHidden: true }, { id: 'hero', x: 180, y: 60 });
  s.measureFrom(60, 60, 60, 220, true);
  await gmPicture(s, 'live-ruler-hidden-token');
});

it('kept rulers after a session-view round trip', async () => {
  const s = await scene();
  await s.add({ id: 'goblin', x: 60, y: 60, isHidden: true }, { id: 'hero', x: 180, y: 60 });
  s.events.emit('measure-persistence-changed', true);
  s.measureFrom(60, 60, 60, 220);
  s.measureFrom(180, 60, 220, 220);
  s.store.getState().setGMView(false);
  s.store.getState().setGMView(true);
  await gmPicture(s, 'kept-rulers-round-trip');
});

it('three twins, the middle one hidden, after a session-view round trip', async () => {
  const s = await scene();
  await s.add({ id: 'a', x: 60, y: 60 }, { id: 'b', x: 140, y: 60, isHidden: true }, { id: 'c', x: 220, y: 60 });
  s.store.getState().setGMView(false);
  await s.settle();
  s.store.getState().setGMView(true);
  await gmPicture(s, 'three-twins-middle-hidden');
});
