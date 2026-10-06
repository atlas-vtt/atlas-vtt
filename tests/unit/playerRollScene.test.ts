import { describe, expect, it, vi } from 'vitest';
import { PlayerRollScene } from '../../src/app/services/PlayerRollScene';
import type { PlayerRollSources, ShownRollToken } from '../../src/app/services/playerRollSource';
import type { DiceRollOrigin } from '../../src/app/types/diceRollOrigin';

const A = 'maps/a.atlasmap';
const B = 'maps/b.atlasmap';
const C = 'maps/c.atlasmap';

/** A view whose store holds the scene `holds`, showing the players `shown` there. */
interface FakeView { viewId: string; holds: string | null; shown: Record<string, ShownRollToken> }

const look = (name: string): ShownRollToken => ({ name, imagePath: `tokens/${name}.webp`, showRing: true, ringColor: undefined });

/**
 * A view's renderer answering for the scene `mapPath`: what its store holds now decides,
 * as `PixiRendererOrchestrator.playerRollTokens` does.
 */
function sourcesFor(view: FakeView, mapPath: string): PlayerRollSources & { shownTokens: ReturnType<typeof vi.fn> } {
  return {
    viewId: view.viewId,
    mapPath,
    shownTokens: vi.fn((ids?: readonly string[]) => new Map(
      view.holds !== mapPath ? [] : Object.entries(view.shown).filter(([id]) => !ids || ids.includes(id)),
    )),
  };
}

/** Every object and function a value holds, through objects, arrays and maps. */
function everythingReachable(root: object): unknown[] {
  const seen: unknown[] = [];
  const visit = (value: unknown): void => {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.includes(value)) return;
    seen.push(value);
    const children = value instanceof Map ? [...value.keys(), ...value.values()] : Object.values(value);
    children.forEach(visit);
  };
  Object.values(root).forEach(visit);
  return seen;
}

const origin = (mapPath: string, tokenId = 'wolf', viewId = 'view-1'): DiceRollOrigin => ({ viewId, mapPath, tokenId });

describe('the scene a player window names rolls from', () => {
  it('answers live from the presented scene, for its view and map only', () => {
    const view: FakeView = { viewId: 'view-1', holds: A, shown: { wolf: look('Wolf A') } };
    const scene = new PlayerRollScene();
    scene.present(sourcesFor(view, A));
    expect(scene.shownToken(origin(A))).toEqual(look('Wolf A'));
    expect(scene.shownToken(origin(A, 'bear'))).toBeNull();
    expect(scene.shownToken(origin(B))).toBeNull();
    expect(scene.shownToken(origin(A, 'wolf', 'view-2'))).toBeNull();

    // Live: a token that goes out of sight is no longer named.
    view.shown = {};
    expect(scene.shownToken(origin(A))).toBeNull();
    // Another scene loading into the same store answers nothing for the bound one.
    view.shown = { wolf: look('Wolf B') };
    view.holds = B;
    expect(scene.shownToken(origin(A))).toBeNull();
    expect(scene.shownToken(origin(B))).toBeNull();
  });

  it('names nobody without a presented scene, or after it was released', () => {
    const view: FakeView = { viewId: 'view-1', holds: A, shown: { wolf: look('Wolf A') } };
    const scene = new PlayerRollScene();
    expect(scene.shownToken(origin(A))).toBeNull();
    scene.present(undefined);
    expect(scene.shownToken(origin(A))).toBeNull();
    scene.present(sourcesFor(view, A));
    scene.hold();
    scene.release();
    expect(scene.shownToken(origin(A))).toBeNull();
  });

  it('keeps the first held picture while the GM browses scene after scene', () => {
    const view: FakeView = { viewId: 'view-1', holds: A, shown: { wolf: look('Wolf A') } };
    const sources = sourcesFor(view, A);
    const scene = new PlayerRollScene();
    scene.present(sources);
    scene.hold();
    expect(sources.shownTokens).toHaveBeenCalledTimes(1);

    // B and then C load into the same store, with a token of the same id and other art
    view.holds = B;
    view.shown = { wolf: look('Wolf B') };
    scene.hold();
    view.holds = C;
    view.shown = { wolf: look('Wolf C') };
    scene.hold();
    expect(sources.shownTokens).toHaveBeenCalledTimes(1);

    expect(scene.shownToken(origin(A))).toEqual(look('Wolf A'));
    expect(scene.shownToken(origin(B))).toBeNull();
    expect(scene.shownToken(origin(C))).toBeNull();
    expect(sources.shownTokens).toHaveBeenCalledTimes(1);
  });

  it('holds what the scene showed, not what it shows later, until a scene is presented again', () => {
    const view: FakeView = { viewId: 'view-1', holds: A, shown: { wolf: look('Wolf A') } };
    const scene = new PlayerRollScene();
    scene.present(sourcesFor(view, A));
    scene.hold();
    view.shown = {};
    expect(scene.shownToken(origin(A))).toEqual(look('Wolf A'));

    // Back on A, rendered again: live once more
    scene.present(sourcesFor(view, A));
    expect(scene.shownToken(origin(A))).toBeNull();
    view.shown = { wolf: look('Wolf A2') };
    expect(scene.shownToken(origin(A))).toEqual(look('Wolf A2'));
  });

  it('holds nothing when the scene was already gone at the hold', () => {
    const view: FakeView = { viewId: 'view-1', holds: B, shown: { wolf: look('Wolf B') } };
    const scene = new PlayerRollScene();
    scene.present(sourcesFor(view, A));
    scene.hold();
    view.holds = A;
    expect(scene.shownToken(origin(A))).toBeNull();
  });

  it('keeps no live source in a held picture', () => {
    const view: FakeView = { viewId: 'view-1', holds: A, shown: { wolf: look('Wolf A') } };
    const sources = sourcesFor(view, A);
    const scene = new PlayerRollScene();
    scene.present(sources);
    scene.hold();
    const reachable = everythingReachable(scene);
    expect(reachable).not.toContain(sources);
    expect(reachable.some((value) => typeof value === 'function')).toBe(false);
    expect(reachable).toContainEqual(look('Wolf A'));
  });
});
