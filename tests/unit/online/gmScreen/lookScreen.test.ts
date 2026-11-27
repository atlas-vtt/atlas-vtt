import { describe, expect, it } from 'vitest';
import { LOOK_SETTLE_MS, LookScreen } from '../../../../src/app/online/gmScreen/look/LookScreen.ts';
import type { GmScreenMessage, LookMessage } from '../../../../src/app/online/protocol/index.ts';
import { fakeTimers } from './fakeTimers.ts';

const PARCHMENT: LookMessage = { t: 'look', dark: false, colours: { '--background-primary': '#f5eddc', '--interactive-accent': '#dd4646' } };
const CANDLE: LookMessage = { t: 'look', dark: true, colours: { '--background-primary': '#201b15', '--interactive-accent': '#dd4646' } };

function rig(devices: string[] = ['phone']) {
  const timers = fakeTimers();
  const sent: Array<{ message: GmScreenMessage; to: string | undefined }> = [];
  let shown: LookMessage | null = PARCHMENT;
  let reads = 0;
  const screen = new LookScreen({
    read: () => (reads += 1, shown),
    outlet: { send: (message, to) => void sent.push({ message, to }), devices },
    timers,
  });
  return { timers, sent, screen, show: (look: LookMessage | null) => void (shown = look), reads: () => reads };
}

describe('Sidekick\'s look on Atlas\'s side', () => {
  it('sends a device the look once its channel opens, and again each time it opens anew', () => {
    const { sent, screen } = rig();
    screen.opened('phone');
    screen.opened('phone');
    expect(sent).toEqual([{ message: PARCHMENT, to: 'phone' }, { message: PARCHMENT, to: 'phone' }]);
  });

  it('sends every device one look per change, once Obsidian\'s announcements of it settle', () => {
    const { timers, sent, screen, show } = rig(['phone', 'tablet']);
    screen.opened('phone');
    screen.opened('tablet');
    sent.length = 0;
    show(CANDLE);
    screen.changed();
    timers.advance(LOOK_SETTLE_MS / 2);
    screen.changed();
    screen.changed();
    expect(sent).toEqual([]);
    timers.advance(LOOK_SETTLE_MS);
    expect(sent).toEqual([{ message: CANDLE, to: undefined }]);
  });

  it('sends nothing for an announcement that changed none of the look', () => {
    const { timers, sent, screen, show } = rig();
    screen.opened('phone');
    sent.length = 0;
    screen.changed();
    timers.advance(LOOK_SETTLE_MS);
    show({ ...PARCHMENT, colours: { ...PARCHMENT.colours } });
    screen.changed();
    timers.advance(LOOK_SETTLE_MS);
    expect(sent).toEqual([]);
    show(CANDLE);
    screen.changed();
    timers.advance(LOOK_SETTLE_MS);
    show(PARCHMENT);
    screen.changed();
    timers.advance(LOOK_SETTLE_MS);
    expect(sent.map(({ message }) => message)).toEqual([CANDLE, PARCHMENT]);
  });

  it('reads nothing while no device is connected, and the look of the moment for the next one', () => {
    const { timers, sent, screen, show, reads } = rig([]);
    show(CANDLE);
    screen.changed();
    timers.advance(LOOK_SETTLE_MS);
    expect(reads()).toBe(0);
    screen.opened('phone');
    expect(sent).toEqual([{ message: CANDLE, to: 'phone' }]);
  });

  it('sends nothing where Obsidian shows no colour it could read', () => {
    const { timers, sent, screen, show } = rig();
    show(null);
    screen.opened('phone');
    screen.changed();
    timers.advance(LOOK_SETTLE_MS);
    expect(sent).toEqual([]);
  });

  it('sends nothing once it is let go of, though a change was on its way', () => {
    const { timers, sent, screen, show } = rig();
    screen.opened('phone');
    sent.length = 0;
    show(CANDLE);
    screen.changed();
    screen.dispose();
    timers.advance(LOOK_SETTLE_MS * 2);
    expect(sent).toEqual([]);
  });
});
