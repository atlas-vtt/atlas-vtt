import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PlayerPins, type PlayerPinsDeps } from '../../src/app/pixi/playerPins';
import type { NotePin } from '../../src/app/types';
import type { PinNameLabel } from '../../src/app/pixi/pinNameLabel';

const pin = (id: string, x: number, extra: Partial<NotePin> = {}): NotePin => ({ id, kind: 'pin', x, y: 0, notePath: `Places/${id}.md`, ...extra });

function players(pins: Record<string, NotePin>): { layer: PlayerPins; drawn: string[]; set: (next: Record<string, NotePin>) => void } {
  let current = pins;
  const drawn: string[] = [];
  const deps: PlayerPinsDeps = {
    pins: () => current,
    place: (p) => ({ x: p.x, y: p.y }),
    draw: (p) => {
      drawn.push(p.id);
      return { view: new Container(), name: null, fitTo: () => undefined, whole: () => true };
    },
    scale: () => 1,
    zoom: () => 1,
    mapSize: () => ({ width: 2000, height: 2000 }),
  };
  return { layer: new PlayerPins(deps), drawn, set: (next) => { current = next; } };
}

describe('the pins the players\' picture shows', () => {
  it('are those the GM shows to players, where the players see the map', () => {
    const { layer } = players({
      shown: pin('shown', 10, { readable: true }),
      dark: pin('dark', 90, { readable: true }),
      gm: pin('gm', 20),
      scene: pin('scene', 30, { readable: true, notePath: 'Keep.atlasmap' }),
    });
    layer.setSight((points) => points.map((point) => point.x < 50));
    layer.refresh();
    expect(layer.view.children.map((child) => child.label)).toEqual(['player-pin-shown']);
  });

  it('shows none until the players\' sight can be read', () => {
    const { layer } = players({ shown: pin('shown', 10, { readable: true }) });
    layer.refresh();
    expect(layer.view.children).toHaveLength(0);
    layer.setSight(() => null);
    layer.refresh();
    expect(layer.view.children).toHaveLength(0);
  });

  it('draws a pin again only when it changed, and moves it where it moved', () => {
    const first = pin('a', 10, { readable: true });
    const world = players({ a: first });
    world.layer.setSight((points) => points.map(() => true));
    world.layer.refresh();
    world.layer.refresh();
    expect(world.drawn).toEqual(['a']);
    world.set({ a: { ...first, showName: true } });
    world.layer.refresh();
    expect(world.drawn).toEqual(['a', 'a']);
    expect(world.layer.view.children).toHaveLength(1);
  });
});

describe('the names of the pins the players see', () => {
  const fakeName = (): PinNameLabel => ({ view: new Container(), draw: () => undefined, box: () => ({ left: -5, top: 25, right: 5, bottom: 30 }) }) as unknown as PinNameLabel;

  it('stand above the fog, and only for pins out of it', () => {
    const named = pin('inn', 10, { readable: true, showName: true });
    const fogged = pin('crypt', 90, { readable: true, showName: true });
    const layer = new PlayerPins({
      pins: () => ({ inn: named, crypt: fogged }),
      place: (p) => ({ x: p.x, y: p.y }),
      draw: () => ({ view: new Container(), name: fakeName(), fitTo: () => undefined, whole: () => true }),
      scale: () => 1,
      zoom: () => 1,
      mapSize: () => ({ width: 2000, height: 2000 }),
    });
    layer.setSight((points) => points.map((point) => point.x < 50));
    layer.refresh();
    expect(layer.names.view.zIndex).toBeGreaterThan(1000);
    expect(layer.names.view.children.map((holder) => holder.label)).toEqual(['pin-name-inn']);
    expect(layer.names.view.children[0]!.position.x).toBe(10);

    layer.setSight(() => [false, false]);
    layer.refresh();
    expect(layer.names.view.children).toHaveLength(0);
  });
});
