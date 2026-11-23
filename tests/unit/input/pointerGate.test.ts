import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, Rectangle, type EventSystem } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PointerGate } from '../../../src/app/pixi/input/pointerGate';

interface Scene {
  boundary: EventBoundary;
  gate: PointerGate;
  map: Container;
  /** What the map heard, in order. */
  heard: string[];
  /** Whether the tools get the events that follow. */
  admit: { now: boolean };
  /** An event of a finger as PIXI makes it of the browser's, sent the way PIXI sends it. */
  send(type: string, id: number): void;
  /** The display objects PIXI remembers as pressed by the pointer, over every button. */
  pressTargets(id: number): number;
}

function scene(): Scene {
  const root = new Container();
  const map = new Container();
  map.eventMode = 'static';
  map.hitArea = new Rectangle(0, 0, 800, 600);
  root.addChild(map);
  const boundary = new EventBoundary(root);
  const heard: string[] = [];
  for (const type of ['pointerdown', 'pointerup', 'pointerupoutside', 'pointercancel', 'pointertap']) map.on(type, () => heard.push(type));
  const admit = { now: false };
  const gate = new PointerGate({ rootBoundary: boundary } as unknown as EventSystem, map, () => admit.now);
  const send = (type: string, id: number): void => {
    const event = new FederatedPointerEvent(boundary);
    event.nativeEvent = {} as PointerEvent;
    event.type = type;
    event.pointerType = 'touch';
    event.pointerId = id;
    event.button = 0;
    event.buttons = type === 'pointerdown' ? 1 : 0;
    event.global.set(100, 100);
    boundary.mapEvent(event);
  };
  const pressTargets = (id: number): number => Object.keys(boundary['trackingData'](id).pressTargetsByButton).length;
  return { boundary, gate, map, heard, admit, send, pressTargets };
}

describe('what PIXI keeps of a finger\'s press', () => {
  it('is let go of when a press that was taken back lifts: the release never reaches PIXI', () => {
    const s = scene();
    s.send('pointerdown', 7);
    s.gate.press(7);
    expect(s.pressTargets(7)).toBe(1);
    // A pan began: the tools are told the press is lost, and the finger's release is not theirs
    s.gate.cancel(7);
    s.send('pointerup', 7);
    s.gate.forget(7);
    expect(s.pressTargets(7)).toBe(0);
    expect(s.heard).toEqual(['pointerdown', 'pointercancel']);
  });

  it('is let go of after a long press that opened a menu', () => {
    const s = scene();
    s.send('pointerdown', 8);
    s.gate.secondaryClick(8);
    expect(s.pressTargets(8)).toBe(1);
    s.send('pointerup', 8);
    s.gate.forget(8);
    expect(s.pressTargets(8)).toBe(0);
  });

  it('is kept until PIXI has made the tap of a release the tools get, and let go of then', () => {
    const s = scene();
    s.send('pointerdown', 9);
    s.gate.press(9);
    // The window hears the release first and says the tools get it; PIXI maps it after
    s.gate.forget(9, true);
    expect(s.pressTargets(9)).toBe(1);
    s.admit.now = true;
    s.send('pointerup', 9);
    expect(s.heard).toEqual(['pointerdown', 'pointerup', 'pointertap']);
    expect(s.pressTargets(9)).toBe(0);
  });

  it('tells the map of no release outside when it lets go', () => {
    const s = scene();
    s.send('pointerdown', 10);
    s.gate.press(10);
    s.gate.cancel(10);
    s.gate.forget(10);
    expect(s.heard).not.toContain('pointerupoutside');
  });
});

describe('a mouse at the gate', () => {
  it('passes as it comes, and PIXI keeps what it kept', () => {
    const s = scene();
    const press = new FederatedPointerEvent(s.boundary);
    press.nativeEvent = {} as PointerEvent;
    press.type = 'pointerdown';
    press.pointerType = 'mouse';
    press.pointerId = 1;
    press.button = 0;
    press.global.set(100, 100);
    s.boundary.mapEvent(press);
    press.type = 'pointerup';
    s.boundary.mapEvent(press);
    expect(s.heard).toEqual(['pointerdown', 'pointerup', 'pointertap']);
    expect(s.pressTargets(1)).toBe(1);
  });
});
