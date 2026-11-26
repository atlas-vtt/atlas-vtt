import { describe, expect, it } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { LookOnlyPointer } from '../../../src/app/pixi/input/lookOnlyPointer';

function scene(): { pointer: LookOnlyPointer; log: string[]; send: (type: string, x: number, y: number, id?: number) => void } {
  const log: string[] = [];
  const pointer = new LookOnlyPointer({
    begin: () => { log.push('begin'); },
    pan: (dx, dy) => { log.push(`pan ${dx} ${dy}`); },
    end: (glide) => { log.push(`end ${glide}`); },
  });
  const send = (type: string, x: number, y: number, id = 1): void => pointer.hear({ type, pointerId: id, global: { x, y } } as unknown as FederatedPointerEvent);
  return { pointer, log, send };
}

describe('a mouse or pen on a map that is only looked at', () => {
  it('pans by its drag, whatever button is down, and coasts when released', () => {
    const { log, send } = scene();
    send('pointerdown', 100, 100);
    send('pointermove', 120, 110);
    send('pointermove', 125, 110);
    send('pointerup', 125, 110);
    expect(log).toEqual(['begin', 'pan 20 10', 'pan 5 0', 'end true']);
  });

  it('does nothing while it only moves over the map, or for another pointer', () => {
    const { log, send } = scene();
    send('pointermove', 50, 50);
    send('pointerdown', 100, 100);
    send('pointermove', 300, 300, 2);
    send('pointerupoutside', 100, 100);
    expect(log).toEqual(['begin', 'end true']);
  });

  it('a press whose release was never heard ends when the next one begins', () => {
    const { log, send } = scene();
    send('pointerdown', 100, 100);
    send('pointerdown', 200, 200);
    send('pointermove', 210, 200);
    expect(log).toEqual(['begin', 'end false', 'begin', 'pan 10 0']);
  });
});
