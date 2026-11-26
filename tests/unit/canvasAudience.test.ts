// @vitest-environment jsdom
import { Sprite, type Application, type Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeptMeasure } from '../../src/app/measure/measureTypes';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { DrawingStroke, TokenEntity } from '../../src/app/types';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { fogRectangle } from '../helpers/fogOperations';
import { GRID, measureScene, type MeasureScene } from '../helpers/measureScene';
import { viewAudience, type ViewAudience } from '../helpers/viewAudience';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** What the canvas shows of what differs between the GM and the players. */
interface Look {
  /** How opaque the fog is drawn. */
  fog: 'gm' | 'opaque';
  /** A right-click on the fog opens its menu. */
  fogMenu: boolean;
  /** The drawing only the GM sees is drawn. */
  secretDrawing: boolean;
  /** The ruler the GM keeps to themselves is drawn. */
  privateRuler: boolean;
}

const GM: Look = { fog: 'gm', fogMenu: true, secretDrawing: true, privateRuler: true };
const PLAYERS: Look = { fog: 'opaque', fogMenu: false, secretDrawing: false, privateRuler: false };

interface Scene {
  s: MeasureScene;
  events: EventEmitter;
  view: ViewAudience;
  look(): Look;
  /** How many notices the audience sent since the last call. */
  notices(): number;
}

let destroy: (() => void) | null = null;
afterEach(() => {
  destroy?.();
  destroy = null;
});

const shown = (layer: Container | undefined): boolean => !!layer && layer.visible && layer.parent?.visible === true;

/**
 * A map view without tokens: the fog, the drawings and the measurements over one store, each
 * following the view's audience as the renderer builds them, with a hidden drawing, a ruler the GM
 * keeps to themselves and fog over the hall.
 */
function scene(): Scene {
  const s = measureScene();
  const events = new EventEmitter();
  const view = viewAudience(s.store, events);
  const fog = new FogOfWarRenderer(s.viewport, { canvas: createEl('canvas') } as unknown as Application, events, s.store, () => null, view.audience);
  s.viewport.addChild(fog.getContainer());
  const annotations = new AnnotationsRenderer({ viewport: s.viewport, store: s.store, grid: () => null, audience: view.audience });
  s.measure.playersView = measurePlayersView({ store: s.store, grid: { getOptions: () => ({ size: GRID }) } as never, tokens: () => undefined, lighting: () => undefined, audience: view.audience });
  const secret: DrawingStroke = { id: 'secret', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 500, y: 500 }, { x: 600, y: 500 }], color: '#ffffff', width: 4, opacity: 1, hidden: true };
  const ruler: KeptMeasure = { id: 'private', kind: 'measure', shape: 'ruler', points: [{ x: 35, y: 35 }, { x: 315, y: 35 }], hidden: true };
  s.store.setState((state) => ({
    isMapLoading: false,
    activeTool: 'select',
    objects: { ...state.objects, fog: { hall: fogRectangle({ id: 'hall', x: 0, y: 0, width: 400, height: 400 }) }, drawings: { secret }, measures: { private: ruler } },
  }));
  const picture = fog.getContainer().children.find((child) => child instanceof Sprite)!;
  let heard = 0;
  view.audience.onChange(() => heard++);
  destroy = () => {
    annotations.destroy();
    fog.destroy();
    s.destroy();
  };
  return {
    s, events, view,
    look: () => ({
      fog: picture.alpha < 1 ? 'gm' : 'opaque',
      fogMenu: fog.menuPointer().menuAt(100, 100),
      secretDrawing: shown(annotations.layer.node('drawing', 'secret')),
      privateRuler: s.parts().slice(2).every((part) => part.visible),
    }),
    notices: () => {
      const count = heard;
      heard = 0;
      return count;
    },
  };
}

describe('whom the canvas is drawn for, without a token renderer', () => {
  const players: Array<[string, (scene: Scene) => void, (scene: Scene) => void]> = [
    ['session view', ({ s }) => s.store.getState().setGMView(false), ({ s }) => s.store.getState().setGMView(true)],
    ['Table mode', ({ s }) => s.store.getState().enterTableMode(), ({ s }) => s.store.getState().leaveTableMode()],
    ['the command palette\'s player mode', ({ events }) => events.emit('player-mode-changed', true), ({ events }) => events.emit('player-mode-changed', false)],
    ['the peek', ({ view }) => view.peek(true), ({ view }) => view.peek(false)],
  ];

  it.each(players)('draws the fog, the drawings and the measurements for the players in %s, and for the GM again after it, with one notice each way', (_name, on, off) => {
    const view = scene();
    view.notices();
    expect(view.look()).toEqual(GM);
    on(view);
    expect(view.notices()).toBe(1);
    expect(view.look()).toEqual(PLAYERS);
    off(view);
    expect(view.notices()).toBe(1);
    expect(view.look()).toEqual(GM);
  });

  it('sends no notice for what does not change whom the canvas is drawn for', () => {
    const view = scene();
    view.notices();
    view.s.store.getState().setActiveTool('measure');
    view.s.store.getState().addToken({ id: 'goblin', kind: 'token', imagePath: '', size: 1, x: 105, y: 105 } as TokenEntity);
    view.view.audience.refresh();
    expect(view.notices()).toBe(0);
  });

  it('takes the players\' perspective in session view, Table mode and the palette\'s player mode, and leaves the peek the GM\'s', () => {
    const { s, events, view } = scene();
    const { audience } = view;
    const answer = (): [boolean, boolean] => [audience.showsPlayers(), audience.takesPlayersPerspective()];
    expect(answer()).toEqual([false, false]);
    view.peek(true);
    expect(answer()).toEqual([true, false]);
    view.peek(false);
    for (const [on, off] of [
      [() => s.store.getState().setGMView(false), () => s.store.getState().setGMView(true)],
      [() => s.store.getState().enterTableMode(), () => s.store.getState().leaveTableMode()],
      [() => events.emit('player-mode-changed', true), () => events.emit('player-mode-changed', false)],
    ] as const) {
      on();
      expect(answer()).toEqual([true, true]);
      off();
      expect(answer()).toEqual([false, false]);
    }
  });

  it('says the players see no token while none is drawn, and nothing at all in the GM\'s view', () => {
    const { s, view } = scene();
    s.store.getState().addToken({ id: 'goblin', kind: 'token', imagePath: '', size: 1, x: 105, y: 105 } as TokenEntity);
    expect(view.audience.seenOnCanvas()).toBeNull();
    view.peek(true);
    expect(view.audience.seenOnCanvas()?.('goblin')).toBe(false);
  });

  it('draws for the players from the first moment in a player view', () => {
    const store = createViewAtlasStore(createInMemoryApp().app, 'player-view', undefined, true);
    const { audience } = viewAudience(store);
    expect([audience.showsPlayers(), audience.takesPlayersPerspective()]).toEqual([true, true]);
    store.getState().setGMView(false);
    store.getState().setGMView(true);
    expect(audience.showsPlayers()).toBe(true);
  });

  it('lets go of its listeners, the store and the bus when it is destroyed', () => {
    const { s, events, view } = scene();
    const heard = vi.fn();
    view.audience.onChange(heard);
    view.audience.destroy();
    s.store.getState().setGMView(false);
    events.emit('player-mode-changed', true);
    expect(heard).not.toHaveBeenCalled();
    expect(view.audience.takesPlayersPerspective()).toBe(true);
    s.store.getState().setGMView(true);
    expect(view.audience.takesPlayersPerspective()).toBe(false);
  });
});
