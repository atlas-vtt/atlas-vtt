import { afterEach, describe, expect, it } from 'vitest';
import { CURSOR_FADE_MS, CURSOR_STALE_MS, RemoteCursors } from '../../../../src/app/online/marks/RemoteCursors.ts';
import { GM_MARKS, MARKS_INTERVAL_MS, playerTone, type SharedCursor } from '../../../../src/app/online/protocol/index.ts';

const ANA = 'a'.repeat(20);
const CAMERA = { x: 10, y: 20, scale: 2 };

const layer = document.body.createDiv();
afterEach(() => layer.empty());

const cursors = (): RemoteCursors => new RemoteCursors(layer, (cursor) => cursor.name ?? 'GM', MARKS_INTERVAL_MS);
const element = (): HTMLElement | null => layer.querySelector('.atlas-online-cursor');
const ana = (changes: Partial<SharedCursor> = {}): SharedCursor => ({ who: ANA, name: 'Ana', at: [100, 100], pts: [], ...changes });

describe('RemoteCursors', () => {
  it('draws a cursor in its owner\'s colour with their name, where the camera puts its place, the same size at every zoom', () => {
    const drawn = cursors();
    drawn.update([ana()], 0);
    drawn.tick(500, CAMERA, 1, true);
    const cursor = element();
    expect(cursor?.classList.contains(`atlas-online-colour-${String(playerTone(ANA))}`)).toBe(true);
    expect(cursor?.classList.contains('is-shown')).toBe(true);
    expect(cursor?.querySelector('.atlas-online-cursor__label')?.textContent).toBe('Ana');
    expect(cursor?.style.transform).toBe('translate3d(210px, 220px, 0)');
  });

  it('labels the GM\'s cursor as its caller names it, in the accent', () => {
    const drawn = cursors();
    drawn.update([{ who: GM_MARKS, at: [0, 0], pts: [] }], 0);
    drawn.tick(500, CAMERA, 1, true);
    expect(element()?.classList.contains('atlas-online-colour-gm')).toBe(true);
    expect(element()?.textContent).toBe('GM');
  });

  it('moves between messages on every frame, a moment behind them, and comes to rest on the device\'s pixels', () => {
    const drawn = cursors();
    drawn.update([ana({ at: [0, 0] })], 0);
    drawn.update([ana({ at: [130, 0], pts: [], span: MARKS_INTERVAL_MS })], MARKS_INTERVAL_MS);
    const places: number[] = [];
    for (let now = MARKS_INTERVAL_MS; now <= 6 * MARKS_INTERVAL_MS; now += 8) {
      drawn.tick(now, { x: 0, y: 0, scale: 1 }, 2, true);
      places.push(Number(/translate3d\(([-\d.]+)px/.exec(element()?.style.transform ?? '')?.[1]));
    }
    const between = places.filter((x) => x > 0 && x < 130);
    expect(between.length).toBeGreaterThan(1);
    expect(places.every((x, index) => index === 0 || x >= (places[index - 1] ?? 0))).toBe(true);
    // On its way it lies where it falls, so it keeps its place on a map that moves in fractions of a pixel.
    expect(between.some((x) => !Number.isInteger(x * 2))).toBe(true);
    expect(places.at(-1)).toBe(130);
  });

  it('stays where the camera puts it while the camera moves, and goes onto the device\'s pixels once it settled', () => {
    const drawn = cursors();
    drawn.update([ana({ at: [10.3, 0] })], 0);
    drawn.tick(500, { x: 0.3, y: 0, scale: 1 }, 1, false);
    expect(element()?.style.transform).toBe('translate3d(10.6px, 0px, 0)');
    drawn.tick(516, { x: 0.3, y: 0, scale: 1 }, 1, true);
    expect(element()?.style.transform).toBe('translate3d(11px, 0px, 0)');
  });

  it('fades a cursor that is no longer named once what it sent is played, then removes it', () => {
    const drawn = cursors();
    drawn.update([ana()], 0);
    drawn.tick(500, CAMERA, 1, true);
    drawn.update([], 600);
    drawn.tick(1000, CAMERA, 1, true);
    expect(element()?.classList.contains('is-shown')).toBe(false);
    expect(drawn.size).toBe(1);
    drawn.tick(1000 + CURSOR_FADE_MS, CAMERA, 1, true);
    expect(element()).toBeNull();
    expect(drawn.size).toBe(0);
  });

  it('shows a cursor again that comes back while it fades', () => {
    const drawn = cursors();
    drawn.update([ana()], 0);
    drawn.tick(500, CAMERA, 1, true);
    drawn.update([ana({ at: null })], 600);
    drawn.tick(1000, CAMERA, 1, true);
    expect(element()?.classList.contains('is-shown')).toBe(false);
    drawn.update([ana({ at: [300, 300], pts: [300, 300] })], 1050);
    drawn.tick(1500, CAMERA, 1, true);
    expect(element()?.classList.contains('is-shown')).toBe(true);
    expect(element()?.style.transform).toBe('translate3d(610px, 620px, 0)');
  });

  it('keeps a cursor the GM names now and then, and lets one go that nothing named for long, as when the GM went silent', () => {
    const drawn = cursors();
    drawn.update([ana()], 0);
    drawn.tick(500, CAMERA, 1, true);
    drawn.update([ana()], CURSOR_STALE_MS - 100);
    drawn.tick(CURSOR_STALE_MS + 50, CAMERA, 1, true);
    expect(element()?.classList.contains('is-shown')).toBe(true);
    drawn.tick(2 * CURSOR_STALE_MS, CAMERA, 1, true);
    drawn.tick(2 * CURSOR_STALE_MS + CURSOR_FADE_MS, CAMERA, 1, true);
    expect(drawn.size).toBe(0);
  });

  it('writes nothing to a cursor at rest', () => {
    const drawn = cursors();
    drawn.update([ana()], 0);
    drawn.tick(500, CAMERA, 1, true);
    const cursor = element();
    if (cursor === null) throw new Error('no cursor');
    let writes = 0;
    new MutationObserver((records) => void (writes += records.length)).observe(cursor, { attributes: true, subtree: true, childList: true });
    drawn.update([ana()], 600);
    drawn.tick(700, CAMERA, 1, true);
    drawn.tick(716, CAMERA, 1, true);
    return Promise.resolve().then(() => expect(writes).toBe(0));
  });
});
