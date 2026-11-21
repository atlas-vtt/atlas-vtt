import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS } from '../../../src/app/input/longPress';
import type { FingerMode, GestureEffects, GestureHost } from '../../../src/app/pixi/input/gestureTypes';
import { lightingTapPlacing, type LightingToolOptions } from '../../../src/app/lighting/lightingTool';
import { fingerModeOf, tapPlacingOf } from '../../../src/app/pixi/input/mapGestureHost';
import { PAIR_HOLD_MS, SETTLE_MS, TouchGestures } from '../../../src/app/pixi/input/touchGestures';
import { DOUBLE_TAP_MS } from '../../../src/app/pixi/input/touchTaps';
import { FakeClock } from './fakeGestureClock';

interface Scene {
  clock: FakeClock;
  gestures: TouchGestures;
  /** What the gestures did, in order. */
  log: string[];
  host: { mode: FingerMode; empty: boolean; menu: boolean };
}

function scene(mode: FingerMode = 'tool', empty = false, menu = false): Scene {
  const clock = new FakeClock();
  const log: string[] = [];
  const host = { mode, empty, menu };
  const say = (name: string) => (...args: unknown[]): void => { log.push(args.length ? `${name} ${args.join(' ')}` : name); };
  const effects: GestureEffects = {
    press: say('press'), cancelPress: say('cancelPress'), secondaryClick: say('secondaryClick'),
    beginNavigation: say('beginNavigation'), pan: say('pan'), pinch: say('pinch'), endNavigation: say('endNavigation'),
    zoomStep: say('zoomStep'), undo: say('undo'), redo: say('redo'), showRing: say('showRing'), hideRing: say('hideRing'),
  };
  const gestureHost: GestureHost = { fingerMode: () => host.mode, pressedEmptyMap: () => host.empty, menuAt: () => host.menu };
  return { clock, log, host, gestures: new TouchGestures(gestureHost, effects, clock) };
}

/** Lands a finger and lets its press settle. */
function land(s: Scene, id = 1, x = 100, y = 100): void {
  s.gestures.down(id, x, y);
  s.clock.advance(SETTLE_MS);
}

describe('one finger in a tool', () => {
  it('holds the press back a moment, then hands it to the tools with its moves and its release', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    expect(s.log).toEqual([]);
    s.clock.advance(SETTLE_MS);
    expect(s.log).toEqual(['press 1']);
    expect(s.gestures.move(1, 140, 100)).toBe(true);
    expect(s.gestures.up(1, 140, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('hands the press on at once when the finger moves: a stroke starts where it came down', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    expect(s.gestures.move(1, 104, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('is a tap when lifted before the press has settled: the tools get the press and the release', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    expect(s.gestures.up(1, 100, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('never pans, however far it goes', () => {
    const s = scene('tool');
    land(s);
    for (let x = 100; x < 400; x += 20) expect(s.gestures.move(1, x, 100)).toBe(true);
    expect(s.log.some((entry) => entry.startsWith('pan') || entry === 'beginNavigation')).toBe(false);
  });

  it('leaves events of fingers it never saw come down to whoever they are for', () => {
    const s = scene('tool');
    expect(s.gestures.move(7, 10, 10)).toBe(true);
    expect(s.gestures.up(7, 10, 10)).toBe(true);
  });
});

describe('one finger with the move tool', () => {
  it('on a token is the tool: its drag moves the token and the map stays', () => {
    const s = scene('objects', false);
    land(s);
    expect(s.gestures.move(1, 160, 100)).toBe(true);
    expect(s.gestures.up(1, 160, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('on the empty map pans once it has gone 8 px, and what the tools were handed is taken back', () => {
    const s = scene('objects', true);
    land(s);
    expect(s.gestures.move(1, 105, 100)).toBe(false);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350']);
    expect(s.gestures.move(1, 110, 100)).toBe(false);
    expect(s.gestures.move(1, 130, 104)).toBe(false);
    expect(s.gestures.up(1, 130, 104)).toBe(false);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350', 'hideRing', 'cancelPress 1 false', 'beginNavigation', 'pan 20 4', 'endNavigation true']);
  });

  it('on the empty map a tap stays a tap', () => {
    const s = scene('objects', true);
    land(s);
    expect(s.gestures.move(1, 103, 101)).toBe(false);
    expect(s.gestures.up(1, 103, 101)).toBe(true);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350', 'hideRing']);
  });

  it('a double tap on the empty map zooms in about the point', () => {
    const s = scene('objects', true);
    land(s);
    s.gestures.up(1, 100, 100);
    s.clock.advance(120);
    land(s, 2, 104, 98);
    s.gestures.up(2, 104, 98);
    expect(s.log.filter((entry) => entry.startsWith('zoomStep'))).toEqual(['zoomStep 104 98 1']);
    // A third tap is the first of another pair
    s.clock.advance(120);
    land(s, 3, 104, 98);
    s.gestures.up(3, 104, 98);
    expect(s.log.filter((entry) => entry.startsWith('zoomStep'))).toHaveLength(1);
  });

  it('two taps far apart in time or place are two taps', () => {
    const s = scene('objects', true);
    land(s);
    s.gestures.up(1, 100, 100);
    s.clock.advance(DOUBLE_TAP_MS + 1);
    land(s, 2);
    s.gestures.up(2, 100, 100);
    s.clock.advance(50);
    land(s, 3, 300, 300);
    s.gestures.up(3, 300, 300);
    expect(s.log.some((entry) => entry.startsWith('zoomStep'))).toBe(false);
  });

  it('two taps on what a tap acts on, though its press is the empty map\'s, are two taps and no zoom', () => {
    const s = scene('objects', true);
    // A linked hex: its tap opens its note, and a drag from it still pans
    s.gestures.setHost({ fingerMode: () => 'objects', pressedEmptyMap: () => true, menuAt: () => false, tapActsAt: (x) => x < 200 });
    land(s);
    s.gestures.up(1, 100, 100);
    s.clock.advance(100);
    land(s, 2);
    s.gestures.up(2, 100, 100);
    expect(s.log.filter((entry) => entry.startsWith('press') || entry.startsWith('zoomStep'))).toEqual(['press 1', 'press 2']);
    // Beside it the map is empty: a double tap zooms, and a tap on the hex is no half of it
    s.clock.advance(100);
    land(s, 3, 300, 100);
    s.gestures.up(3, 300, 100);
    s.clock.advance(100);
    land(s, 4, 302, 100);
    s.gestures.up(4, 302, 100);
    expect(s.log.filter((entry) => entry.startsWith('zoomStep'))).toEqual(['zoomStep 302 100 1']);
    // A finger that moves from the hex still pans
    land(s, 5);
    s.gestures.move(5, 130, 100);
    expect(s.log).toContain('beginNavigation');
  });

  it('a tap on a token is no half of a double tap', () => {
    const s = scene('objects', false);
    land(s);
    s.gestures.up(1, 100, 100);
    s.clock.advance(100);
    land(s, 2);
    s.gestures.up(2, 100, 100);
    expect(s.log).toEqual(['press 1', 'press 2']);
  });
});

describe('two fingers', () => {
  it('landing together press nothing and navigate, in any tool', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    s.clock.advance(20);
    s.gestures.down(2, 200, 100);
    s.clock.advance(SETTLE_MS);
    expect(s.log).toEqual(['beginNavigation']);
  });

  it('pan and zoom about the point between them, from where they are once they move', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 100);
    // The move that takes them past the tolerance arms the pinch without a jump
    expect(s.gestures.move(2, 210, 100)).toBe(false);
    expect(s.gestures.move(2, 230, 100)).toBe(false);
    expect(s.gestures.move(1, 100, 120)).toBe(false);
    expect(s.log).toEqual([
      'beginNavigation',
      'pinch 155 100 110 165 100 130',
      `pinch 165 100 130 165 110 ${Math.hypot(130, 20)}`,
    ]);
  });

  it('take back what one finger began in a tool, then navigate', () => {
    const s = scene('tool');
    land(s);
    s.gestures.move(1, 150, 100);
    s.gestures.down(2, 300, 100);
    expect(s.log).toEqual(['press 1', 'cancelPress 1 false', 'beginNavigation']);
    // The first finger's moves are the pinch's now, not the tool's
    expect(s.gestures.move(1, 170, 100)).toBe(false);
  });

  it('end navigation when one lifts, and the finger that stays does nothing until it is lifted', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 100);
    s.gestures.move(2, 230, 100);
    s.gestures.move(2, 240, 100);
    expect(s.gestures.up(2, 240, 100)).toBe(false);
    const after = s.log.length;
    expect(s.log[after - 1]).toBe('endNavigation true');
    expect(s.gestures.move(1, 300, 300)).toBe(false);
    s.clock.advance(LONG_PRESS_MS * 2);
    expect(s.gestures.up(1, 300, 300)).toBe(false);
    expect(s.log).toHaveLength(after);
  });

  it('go on from a one-finger pan without the map stopping', () => {
    const s = scene('objects', true);
    land(s);
    s.gestures.move(1, 120, 100);
    s.gestures.down(2, 220, 100);
    s.gestures.move(2, 230, 100);
    expect(s.log.filter((entry) => entry === 'beginNavigation')).toHaveLength(1);
    expect(s.log.some((entry) => entry.startsWith('endNavigation'))).toBe(false);
    expect(s.log[s.log.length - 1]).toBe('pinch 170 100 100 175 100 110');
  });

  it('a third finger changes nothing about the two that navigate', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 100);
    s.gestures.down(3, 150, 200);
    s.gestures.move(2, 220, 100);
    expect(s.gestures.move(3, 150, 260)).toBe(false);
    s.gestures.move(2, 230, 100);
    expect(s.log).toEqual(['beginNavigation', 'pinch 160 100 120 165 100 130']);
  });
});

describe('a long press', () => {
  it('on something with a menu takes the press back, clicks the secondary button there and is no tap', () => {
    const s = scene('objects', false, true);
    land(s);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350']);
    s.clock.advance(LONG_PRESS_MS - SETTLE_MS);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350', 'hideRing', 'cancelPress 1 false', 'secondaryClick 1']);
    expect(s.gestures.move(1, 200, 200)).toBe(false);
    expect(s.gestures.up(1, 200, 200)).toBe(false);
    expect(s.log).toHaveLength(5);
  });

  it('on the empty map with the move tool draws the marquee from where the finger came down, and opens no menu', () => {
    const s = scene('objects', true, false);
    land(s);
    s.clock.advance(LONG_PRESS_MS - SETTLE_MS);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350', 'hideRing']);
    expect(s.gestures.move(1, 180, 160)).toBe(true);
    expect(s.gestures.up(1, 180, 160)).toBe(true);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350', 'hideRing']);
  });

  it('on fog or a linked hex under the move tool opens their menu, not the marquee', () => {
    const s = scene('objects', true, true);
    land(s);
    s.clock.advance(LONG_PRESS_MS - SETTLE_MS);
    expect(s.log.slice(-2)).toEqual(['cancelPress 1 false', 'secondaryClick 1']);
    expect(s.gestures.move(1, 180, 160)).toBe(false);
  });

  it('does nothing in a tool that has no menu there: a finger may rest before it draws, and no ring shows', () => {
    const s = scene('tool', false, false);
    land(s);
    s.clock.advance(LONG_PRESS_MS);
    expect(s.gestures.move(1, 180, 160)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('never fires for a finger that moved 8 px, and its ring goes', () => {
    const s = scene('tool', false, true);
    land(s);
    s.gestures.move(1, 100, 109);
    s.clock.advance(LONG_PRESS_MS);
    expect(s.log).toEqual(['press 1', 'showRing 100 100 350', 'hideRing']);
  });

  it('never fires once a second finger is down', () => {
    const s = scene('objects', false, true);
    land(s);
    s.gestures.down(2, 200, 100);
    s.clock.advance(LONG_PRESS_MS);
    expect(s.log.includes('secondaryClick 1')).toBe(false);
  });
});

describe('taps of several fingers', () => {
  const tap = (s: Scene, fingers: number): void => {
    for (let id = 1; id <= fingers; id++) s.gestures.down(id, 100 * id, 100);
    s.clock.advance(80);
    for (let id = 1; id <= fingers; id++) s.gestures.up(id, 100 * id, 100);
  };

  it('two fingers take the last step back, once it is clear no second tap follows', () => {
    const s = scene('tool');
    tap(s, 2);
    expect(s.log.includes('undo')).toBe(false);
    s.clock.advance(DOUBLE_TAP_MS);
    expect(s.log.filter((entry) => entry === 'undo')).toHaveLength(1);
  });

  it('two fingers twice zoom out about the point between them, and undo nothing', () => {
    const s = scene('tool');
    tap(s, 2);
    s.clock.advance(100);
    tap(s, 2);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    expect(s.log.filter((entry) => entry.startsWith('zoomStep'))).toEqual(['zoomStep 150 100 -1']);
    expect(s.log.includes('undo')).toBe(false);
  });

  it('three fingers take the step forward again', () => {
    const s = scene('tool');
    tap(s, 3);
    s.clock.advance(DOUBLE_TAP_MS);
    expect(s.log.filter((entry) => entry === 'redo' || entry === 'undo')).toEqual(['redo']);
  });

  it('are no tap at the end of a pinch, or when the fingers rested', () => {
    const pinch = scene('tool');
    pinch.gestures.down(1, 100, 100);
    pinch.gestures.down(2, 200, 100);
    pinch.gestures.move(2, 215, 100);
    pinch.gestures.up(1, 100, 100);
    pinch.gestures.up(2, 215, 100);
    pinch.clock.advance(DOUBLE_TAP_MS);
    expect(pinch.log.includes('undo')).toBe(false);

    const rest = scene('tool');
    rest.gestures.down(1, 100, 100);
    rest.gestures.down(2, 200, 100);
    rest.clock.advance(500);
    rest.gestures.up(1, 100, 100);
    rest.gestures.up(2, 200, 100);
    rest.clock.advance(DOUBLE_TAP_MS);
    expect(rest.log.includes('undo')).toBe(false);
  });

  it('never move the map', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 100);
    s.gestures.move(1, 103, 102);
    s.gestures.move(2, 198, 97);
    s.gestures.up(1, 103, 102);
    s.gestures.up(2, 198, 97);
    expect(s.log).toEqual(['beginNavigation', 'endNavigation false']);
  });
});

describe('fingers set to pan beside a pen', () => {
  it('pan in a drawing tool without the tool ever being pressed', () => {
    const s = scene('navigate');
    land(s);
    s.gestures.move(1, 120, 100);
    s.gestures.move(1, 150, 100);
    expect(s.gestures.up(1, 150, 100)).toBe(false);
    expect(s.log).toEqual(['beginNavigation', 'pan 30 0', 'endNavigation true']);
  });

  it('still tap: the tool gets a click where the finger tapped', () => {
    const s = scene('navigate');
    land(s);
    expect(s.gestures.up(1, 100, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('do nothing while the pen is down: a hand rests on the glass', () => {
    const s = scene('tool');
    s.gestures.setPenDown(true);
    land(s);
    expect(s.gestures.move(1, 200, 200)).toBe(false);
    s.gestures.down(2, 300, 300);
    s.gestures.move(2, 350, 300);
    expect(s.gestures.up(1, 200, 200)).toBe(false);
    expect(s.log).toEqual([]);
  });

  it('a finger whose press has not reached the tools is dropped when the pen lands', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    s.gestures.setPenDown(true);
    s.clock.advance(SETTLE_MS * 2);
    expect(s.gestures.up(1, 100, 100)).toBe(false);
    expect(s.log).toEqual([]);
  });
});

describe('a finger that is lost', () => {
  it('ends what the tools were handed, without telling the browser what it said itself', () => {
    const s = scene('tool');
    land(s);
    s.gestures.move(1, 150, 100);
    s.gestures.cancel(1);
    expect(s.log).toEqual(['press 1', 'cancelPress 1 true']);
    expect(s.gestures.tracks(1)).toBe(false);
  });

  it('is no tap of several fingers', () => {
    const s = scene('tool');
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 100);
    s.gestures.cancel(1);
    s.gestures.up(2, 200, 100);
    s.clock.advance(DOUBLE_TAP_MS);
    expect(s.log.includes('undo')).toBe(false);
  });

  it('when the window loses focus every finger is, and a pan stops where it is', () => {
    const s = scene('objects', true);
    land(s);
    s.gestures.move(1, 130, 100);
    s.gestures.reset();
    expect(s.log.slice(-1)).toEqual(['endNavigation false']);
    expect(s.gestures.tracks(1)).toBe(false);
  });
});

describe('a press something took before the tools', () => {
  it('is never held back or sent again, and a second finger still takes it back', () => {
    const s = scene('direct');
    s.gestures.down(1, 100, 100);
    s.clock.advance(LONG_PRESS_MS);
    expect(s.log).toEqual([]);
    expect(s.gestures.move(1, 130, 100)).toBe(true);
    s.gestures.down(2, 200, 100);
    expect(s.log).toEqual(['cancelPress 1 false', 'beginNavigation']);
  });
});

describe('what one finger does, tool by tool', () => {
  it.each([
    ['move', 'objects'], ['select', 'objects'],
    ['laser-pointer', 'tool'], ['fog', 'tool'], ['eraser', 'tool'], ['draw', 'tool'], ['measure', 'tool'],
    ['wall', 'tool'], ['note-pin', 'tool'], ['audio', 'tool'], ['stairs', 'tool'],
  ] as const)('%s: %s', (tool, mode) => {
    expect(fingerModeOf(tool, false, 'tool')).toBe(mode);
  });

  it('pans in the drawing tools where fingers are set to pan, and takes tokens with the move tool all the same', () => {
    expect(fingerModeOf('fog', false, 'pan')).toBe('navigate');
    expect(fingerModeOf('draw', false, 'pan')).toBe('navigate');
    expect(fingerModeOf('move', false, 'pan')).toBe('objects');
  });

  it('is the placement while tokens are placed by hand', () => {
    expect(fingerModeOf('move', true, 'pan')).toBe('direct');
  });
});

describe('one finger in a tool whose press places something', () => {
  it('holds the press back while the finger rests: a second finger finds nothing placed, and nothing to take back', () => {
    const s = scene('place');
    land(s);
    s.clock.advance(200);
    expect(s.log).toEqual([]);
    s.gestures.down(2, 300, 100);
    expect(s.log).toEqual(['beginNavigation']);
    s.gestures.move(2, 340, 100);
    s.gestures.up(1, 100, 100);
    s.gestures.up(2, 340, 100);
    expect(s.log.some((entry) => entry.startsWith('press') || entry.startsWith('cancelPress'))).toBe(false);
  });

  it('is a tap when lifted in place: the tools get the press and the release together', () => {
    const s = scene('place');
    land(s);
    s.clock.advance(120);
    expect(s.gestures.up(1, 102, 101)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('is the tools\' drag once it has gone 8 px, from where it came down, and never a pan', () => {
    const s = scene('place');
    land(s);
    expect(s.gestures.move(1, 105, 100)).toBe(false);
    expect(s.log).toEqual([]);
    expect(s.gestures.move(1, 110, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
    expect(s.gestures.move(1, 160, 100)).toBe(true);
    expect(s.gestures.up(1, 160, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('opens the menu of what it rests on, with a ring, and no press was ever handed on', () => {
    const s = scene('place', false, true);
    land(s);
    s.clock.advance(LONG_PRESS_MS);
    expect(s.log).toEqual(['showRing 100 100 350', 'hideRing', 'secondaryClick 1']);
    expect(s.gestures.up(1, 100, 100)).toBe(false);
  });
});

describe('a tool that places by taps', () => {
  it('pans under a finger where a shape is placed tap by tap, and holds the press back where a press places at once', () => {
    expect(fingerModeOf('fog', false, 'tool', 'taps')).toBe('navigate');
    expect(fingerModeOf('wall', false, 'tool', 'press')).toBe('place');
    expect(fingerModeOf('wall', false, 'pan', 'press')).toBe('navigate');
    expect(fingerModeOf('wall', false, 'tool', null)).toBe('tool');
  });

  it('never stands before the tokens of the move tool or a placement by hand', () => {
    expect(fingerModeOf('move', false, 'tool', 'taps')).toBe('objects');
    expect(fingerModeOf('wall', true, 'tool', 'taps')).toBe('direct');
  });

  it('between two taps of a shape, two fingers pan and the tools hear of neither', () => {
    const s = scene('navigate');
    land(s);
    expect(s.gestures.up(1, 100, 100)).toBe(true);
    s.clock.advance(300);
    land(s, 2, 200, 200);
    s.clock.advance(100);
    s.gestures.down(3, 320, 200);
    s.gestures.move(2, 240, 200);
    s.gestures.move(3, 360, 200);
    expect(s.gestures.up(2, 240, 200)).toBe(false);
    expect(s.gestures.up(3, 360, 200)).toBe(false);
    s.clock.advance(300);
    land(s, 4, 400, 300);
    expect(s.gestures.up(4, 400, 300)).toBe(true);
    expect(s.log.filter((entry) => entry.startsWith('press') || entry.startsWith('cancelPress'))).toEqual(['press 1', 'press 4']);
  });
});

describe('what a tap places, tool by tool', () => {
  const fog = (shape: 'brush' | 'polygon', activeTool = 'fog'): Parameters<typeof tapPlacingOf>[0] => ({ activeTool, fogTool: { shape, brushSize: 50 }, drawTool: { mode: 'pen' } });

  it('is a corner of the fog tool\'s polygon, with either fog tool, and nothing of its other shapes', () => {
    expect(tapPlacingOf(fog('polygon'))).toBe('taps');
    expect(tapPlacingOf(fog('polygon', 'eraser'))).toBe('taps');
    expect(tapPlacingOf(fog('brush'))).toBeNull();
  });

  it('is the lighting tool\'s to say with that tool, and no other tool is asked', () => {
    expect(tapPlacingOf(fog('polygon', 'wall'), () => 'press')).toBe('press');
    expect(tapPlacingOf(fog('polygon', 'wall'))).toBeNull();
    expect(tapPlacingOf(fog('polygon', 'draw'), () => 'taps')).toBeNull();
  });

  it('with the lighting tool is a corner while a chain, a zone or an opening is under way, else held back, and nothing where a press begins a stroke', () => {
    const tool = (mode: LightingToolOptions['mode'], drawMode: LightingToolOptions['drawMode'] = 'point-to-point'): LightingToolOptions => ({ mode, drawMode, lightPreset: null });
    expect(lightingTapPlacing(tool('draw'), true)).toBe('taps');
    expect(lightingTapPlacing(tool('light-zone'), true)).toBe('taps');
    for (const mode of ['draw', 'place-light', 'light-zone', 'level-surface'] as const) expect(lightingTapPlacing(tool(mode), false)).toBe('press');
    expect(lightingTapPlacing(tool('draw', 'freeform'), false)).toBeNull();
    expect(lightingTapPlacing(tool('rooms'), false)).toBeNull();
    expect(lightingTapPlacing(tool('explored-memory'), false)).toBeNull();
  });
});

describe('a map that is only looked at (Table mode)', () => {
  /** A scene whose effects also tell when two fingers were held. */
  function looking(): Scene {
    const s = scene('look', true, true);
    const held = (): void => { s.log.push('pairHeld'); };
    const { clock, log } = s;
    const say = (name: string) => (...args: unknown[]): void => { log.push(args.length ? `${name} ${args.join(' ')}` : name); };
    const effects: GestureEffects = {
      press: say('press'), cancelPress: say('cancelPress'), secondaryClick: say('secondaryClick'),
      beginNavigation: say('beginNavigation'), pan: say('pan'), pinch: say('pinch'), endNavigation: say('endNavigation'),
      zoomStep: say('zoomStep'), undo: say('undo'), redo: say('redo'), showRing: say('showRing'), hideRing: say('hideRing'),
      pairHeld: held,
    };
    const host: GestureHost = { fingerMode: () => s.host.mode, pressedEmptyMap: () => s.host.empty, menuAt: () => s.host.menu };
    return { ...s, gestures: new TouchGestures(host, effects, clock) };
  }

  it('one finger pans wherever it lands, and the tools hear nothing of it', () => {
    const s = looking();
    land(s);
    expect(s.gestures.move(1, 130, 104)).toBe(false);
    expect(s.gestures.move(1, 150, 104)).toBe(false);
    expect(s.gestures.up(1, 150, 104)).toBe(false);
    expect(s.log).toEqual(['beginNavigation', 'pan 20 0', 'endNavigation true']);
  });

  it('a tap is no click and a rest no long press: nothing is pressed, no menu opens, no ring shows', () => {
    const s = looking();
    land(s);
    expect(s.gestures.up(1, 100, 100)).toBe(false);
    land(s, 2, 300, 300);
    s.clock.advance(LONG_PRESS_MS * 3);
    expect(s.gestures.up(2, 300, 300)).toBe(false);
    expect(s.log).toEqual([]);
  });

  it('a double tap still zooms in', () => {
    const s = looking();
    land(s);
    s.gestures.up(1, 100, 100);
    s.clock.advance(120);
    land(s, 2, 104, 98);
    s.gestures.up(2, 104, 98);
    expect(s.log).toEqual(['zoomStep 104 98 1']);
  });

  it('two fingers pinch as ever, and a pinch never ends the looking', () => {
    const s = looking();
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 100);
    s.gestures.move(2, 230, 100);
    s.gestures.move(2, 260, 100);
    s.clock.advance(PAIR_HOLD_MS * 2);
    s.gestures.up(1, 100, 100);
    s.gestures.up(2, 260, 100);
    expect(s.log).toContain('pinch 165 100 130 180 100 160');
    expect(s.log).not.toContain('pairHeld');
  });

  it('two fingers held still end the looking, once, with the ring closing around them', () => {
    const s = looking();
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 120);
    expect(s.log).toEqual(['beginNavigation', `showRing 150 110 ${PAIR_HOLD_MS}`]);
    s.clock.advance(PAIR_HOLD_MS - 1);
    expect(s.log).not.toContain('pairHeld');
    s.clock.advance(1);
    expect(s.log).toEqual(['beginNavigation', `showRing 150 110 ${PAIR_HOLD_MS}`, 'hideRing', 'endNavigation false', 'pairHeld']);
    // The fingers that held do nothing more, lifted or moved; no undo follows as after a tap of two
    s.gestures.move(1, 160, 100);
    s.gestures.up(1, 160, 100);
    s.gestures.up(2, 200, 120);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    expect(s.log.filter((entry) => entry === 'pairHeld')).toHaveLength(1);
    expect(s.log).not.toContain('undo');
  });

  it('fingers lifted early, a third finger or a finger that moves away leave the looking as it is', () => {
    const lifted = looking();
    lifted.gestures.down(1, 100, 100);
    lifted.gestures.down(2, 200, 100);
    lifted.clock.advance(PAIR_HOLD_MS - 50);
    lifted.gestures.up(2, 200, 100);
    lifted.clock.advance(PAIR_HOLD_MS);
    expect(lifted.log).not.toContain('pairHeld');

    const third = looking();
    third.gestures.down(1, 100, 100);
    third.gestures.down(2, 200, 100);
    third.gestures.down(3, 300, 100);
    third.clock.advance(PAIR_HOLD_MS * 2);
    expect(third.log).not.toContain('pairHeld');

    const moved = looking();
    moved.gestures.down(1, 100, 100);
    moved.gestures.down(2, 200, 100);
    moved.clock.advance(PAIR_HOLD_MS / 2);
    moved.gestures.move(2, 215, 100);
    moved.clock.advance(PAIR_HOLD_MS);
    expect(moved.log).not.toContain('pairHeld');
    expect(moved.log).toContain('hideRing');
  });

  it('is asked for only while the view is in Table mode, and outside it two resting fingers do nothing', () => {
    expect(fingerModeOf('move', false, 'tool', null, true)).toBe('look');
    expect(fingerModeOf('fog', true, 'pan', 'taps', true)).toBe('look');
    const s = scene('objects', true);
    s.gestures.down(1, 100, 100);
    s.gestures.down(2, 200, 100);
    s.clock.advance(PAIR_HOLD_MS * 2);
    expect(s.log).toEqual(['beginNavigation']);
  });
});
