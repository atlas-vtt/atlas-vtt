import { JOIN_CODE_PATTERN, shownJoinCode } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { ARM_MS, freeGate, FULL_NOTE_MS, gateFrame, newGate, newJoinCode, readGate, TableGate, type GateFrame, type GateSettings } from '../../../../src/app/online/gm/joinGate.ts';
import { readSavedTable } from '../../../../src/app/online/gm/savedTable.ts';

const MIRA = { id: 'm'.repeat(20), name: 'Mira' };
const NOOR = { id: 'n'.repeat(20), name: 'Noor' };
const SETTINGS: GateSettings = { code: '483912', requireCode: true, askToJoin: true };

/** The gates of a table with a clock and timers the test moves. */
function gate(settings: GateSettings = SETTINGS, taken: ReadonlySet<string> = new Set()): {
  gate: TableGate; sent: GateFrame[]; answers: [string, boolean][]; saved: GateSettings[]; changes: { count: number }; told: { count: number }; advance(ms: number): void; clock: { now: number }; timers(): number;
} {
  const sent: GateFrame[] = [];
  const answers: [string, boolean][] = [];
  const saved: GateSettings[] = [];
  const changes = { count: 0 };
  const told = { count: 0 };
  const clock = { now: 1_000_000 };
  const timers = new Map<number, { at: number; run: () => void }>();
  let nextTimer = 1;
  let draws = 0;
  const made = new TableGate(settings, {
    send: (frame) => void sent.push(frame),
    answer: (id, admit) => void answers.push([id, admit]),
    save: (next) => void saved.push(next),
    changed: () => void (changes.count += 1),
    paused: () => void (told.count += 1),
    timers: {
      now: () => clock.now,
      setTimer: (run, ms) => {
        timers.set(nextTimer, { at: clock.now + ms, run });
        return nextTimer++;
      },
      clearTimer: (timer) => void timers.delete(timer),
    },
    // Each new code is another: 100000, 100001, …
    random: () => 100_000 + draws++,
    taken: () => taken,
  });
  /** Moves the clock on, running every timer when it is due, those set meanwhile too. */
  const advance = (ms: number): void => {
    const end = clock.now + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      timers.delete(due[0]);
      clock.now = Math.max(clock.now, due[1].at);
      due[1].run();
    }
    clock.now = end;
  };
  return { gate: made, sent, answers, saved, changes, told, advance, clock, timers: () => timers.size };
}

describe('a join code', () => {
  it('is six digits from the random source, leading zeros kept', () => {
    expect(newJoinCode(() => 483_912)).toBe('483912');
    expect(newJoinCode(() => 42)).toBe('000042');
    expect(newJoinCode(() => 3_000_000_007)).toBe('000007');
    for (let index = 0; index < 200; index += 1) expect(newJoinCode()).toMatch(JOIN_CODE_PATTERN);
  });

  it('is as likely as any other: a number past the last whole million is drawn again', () => {
    const draws = [4_294_967_295, 4_294_000_000, 4_293_999_999];
    expect(newJoinCode(() => draws.shift() ?? 0)).toBe('999999');
    expect(draws).toEqual([]);
  });

  it('is never one of the codes it is told are taken', () => {
    const seq = (...draws: number[]): (() => number) => () => draws.shift() ?? 0;
    expect(newJoinCode(seq(5, 7), new Set(['000005']))).toBe('000007');
    expect(newGate(seq(5, 7), new Set(['000005'])).code).toBe('000007');
  });

  it('of a table that comes back is made anew only where a player\'s own code is now the same', () => {
    const seq = (...draws: number[]): (() => number) => () => draws.shift() ?? 0;
    expect(freeGate(SETTINGS, new Set(['111111']))).toBe(SETTINGS);
    expect(freeGate(SETTINGS, new Set(['483912', '000005']), seq(483_912, 5, 7))).toEqual({ ...SETTINGS, code: '000007' });
  });

  it('is shown in two groups', () => {
    expect(shownJoinCode('483912')).toBe('483 912');
  });
});

describe('a table\'s gates as kept', () => {
  it('start with a fresh code and both switches on', () => {
    expect(newGate(() => 7)).toEqual({ code: '000007', requireCode: true, askToJoin: true });
  });

  it('are read back field by field, and a table saved before it had gates gets new ones, both on', () => {
    expect(readGate({ code: '483912', requireCode: false, askToJoin: false })).toEqual({ code: '483912', requireCode: false, askToJoin: false });
    for (const none of [undefined, null, 'gate', 7]) expect(readGate(none, () => 7)).toEqual({ code: '000007', requireCode: true, askToJoin: true });
    expect(readGate({ code: '48391', requireCode: 'no', askToJoin: 0 }, () => 7)).toEqual({ code: '000007', requireCode: true, askToJoin: true });
    const saved = readSavedTable({ code: 'a'.repeat(26), secret: 's'.repeat(43), campaignId: 'c1', mapPath: null, maxPlayers: 4 });
    expect(saved?.gate).toMatchObject({ requireCode: true, askToJoin: true });
    expect(saved?.gate.code).toMatch(JOIN_CODE_PATTERN);
    expect(readSavedTable({ code: 'a'.repeat(26), secret: 's'.repeat(43), campaignId: 'c1', gate: { code: '111111', requireCode: true, askToJoin: false } })?.gate).toEqual({ code: '111111', requireCode: true, askToJoin: false });
  });

  it('tell the relay the code only while it is asked for', () => {
    expect(gateFrame(SETTINGS)).toEqual({ code: '483912', ask: true });
    expect(gateFrame({ ...SETTINGS, requireCode: false })).toEqual({ code: null, ask: true });
    expect(gateFrame({ ...SETTINGS, askToJoin: false })).toEqual({ code: '483912', ask: false });
  });
});

describe('the gates of a running table', () => {
  it('show the code and both switches, and no code while none is asked for', () => {
    const table = gate();
    expect(table.gate.view()).toEqual({ code: '483912', requireCode: true, askToJoin: true, waiting: [], paused: false, pauseArmed: false });
    table.gate.setRequireCode(false);
    expect(table.gate.view()).toMatchObject({ code: null, requireCode: false });
  });

  it('send every choice to the relay at once and keep it with the table', () => {
    const table = gate();
    table.gate.setAskToJoin(false);
    table.gate.setRequireCode(false);
    table.gate.setRequireCode(true);
    table.gate.newCode();
    expect(table.sent).toEqual([{ code: '483912', ask: false }, { code: null, ask: false }, { code: '483912', ask: false }, { code: '100000', ask: false }]);
    expect(table.saved.at(-1)).toEqual({ code: '100000', requireCode: true, askToJoin: false });
    expect(table.saved).toHaveLength(4);
    expect(table.gate.frame()).toEqual({ code: '100000', ask: false });
  });

  it('never make a new code that is a player\'s own code', () => {
    const table = gate(SETTINGS, new Set(['100000', '100001']));
    table.gate.newCode();
    expect(table.gate.settings.code).toBe('100002');
  });

  it('keep the code while it is switched off, so switching it on again shows the one the players have', () => {
    const table = gate();
    table.gate.setRequireCode(false);
    expect(table.gate.settings.code).toBe('483912');
    table.gate.setRequireCode(true);
    expect(table.gate.view().code).toBe('483912');
  });

  it('list who knocks, in the order they came, and take a card away when its knock is gone', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.knocked(NOOR);
    // A knock told twice is one card, in its first place.
    table.gate.knocked(MIRA);
    expect(table.gate.view().waiting.map((player) => player.name)).toEqual(['Mira', 'Noor']);
    table.gate.gone(MIRA.id, false);
    expect(table.gate.view().waiting).toEqual([{ ...NOOR, answered: false, full: false, armed: false }]);
    table.gate.gone('x'.repeat(20), false);
    expect(table.gate.view().waiting).toHaveLength(1);
  });

  it('take the relay\'s welcome as who waits now', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.welcomed([NOOR]);
    expect(table.gate.view().waiting).toEqual([{ ...NOOR, answered: false, full: false, armed: false }]);
    table.gate.welcomed([]);
    expect(table.gate.view().waiting).toEqual([]);
  });

  it('answer a knock once: the card is marked until the relay takes it away, and a second press sends nothing', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.knocked(NOOR);
    table.advance(ARM_MS);
    table.gate.admit(MIRA.id);
    table.gate.admit(MIRA.id);
    table.gate.decline(MIRA.id);
    table.gate.decline(NOOR.id);
    table.gate.admit('x'.repeat(20));
    expect(table.answers).toEqual([[MIRA.id, true], [NOOR.id, false]]);
    expect(table.gate.view().waiting.map((player) => player.answered)).toEqual([true, true]);
    table.gate.gone(MIRA.id, false);
    table.gate.gone(NOOR.id, false);
    expect(table.gate.view().waiting).toEqual([]);
  });

  it('say on the card that the table was full, for a moment, when an admitted player found no seat', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.advance(ARM_MS);
    table.gate.admit(MIRA.id);
    table.gate.gone(MIRA.id, true);
    expect(table.gate.view().waiting).toEqual([{ ...MIRA, answered: true, full: true, armed: true }]);
    table.advance(FULL_NOTE_MS - 1);
    expect(table.gate.view().waiting).toHaveLength(1);
    table.advance(1);
    expect(table.gate.view().waiting).toEqual([]);
  });

  it('show a pause until the relay\'s time, by the time left on the relay\'s clock, and never longer than a pause lasts', () => {
    const table = gate();
    table.gate.paused(table.clock.now + 60_000);
    expect(table.gate.view().paused).toBe(true);
    table.advance(59_999);
    expect(table.gate.view().paused).toBe(true);
    table.advance(1);
    expect(table.gate.view().paused).toBe(false);
    table.gate.paused(table.clock.now + 60 * 60_000);
    table.advance(10 * 60_000);
    expect(table.gate.view().paused).toBe(false);
    table.gate.paused(table.clock.now - 1);
    expect(table.gate.view().paused).toBe(false);
  });

  it('tell the GM of a pause once, however often the relay says it, and again of the next one', () => {
    const table = gate();
    table.gate.paused(table.clock.now + 60_000);
    // The relay says it again on every welcome.
    table.gate.paused(table.clock.now + 60_000);
    table.gate.paused(table.clock.now + 50_000);
    expect(table.told.count).toBe(1);
    table.gate.paused(table.clock.now - 1);
    expect(table.told.count).toBe(1);
    table.advance(60_000);
    table.gate.paused(table.clock.now + 60_000);
    expect(table.told.count).toBe(2);
    table.gate.newCode();
    table.gate.paused(table.clock.now + 60_000);
    expect(table.told.count).toBe(3);
  });

  it('arm the line of a pause once it has stood, through the relay saying it again, and anew for the next pause', () => {
    const table = gate();
    table.gate.paused(table.clock.now + 60_000);
    expect(table.gate.view()).toMatchObject({ paused: true, pauseArmed: false });
    const shown = table.changes.count;
    table.advance(400);
    // Told again inside the window: the line's time neither starts anew nor is skipped.
    table.gate.paused(table.clock.now + 59_600);
    table.advance(ARM_MS - 400 - 1);
    expect(table.gate.view().pauseArmed).toBe(false);
    table.advance(1);
    expect(table.gate.view().pauseArmed).toBe(true);
    expect(table.changes.count).toBe(shown + 2);
    table.gate.paused(table.clock.now + 50_000);
    expect(table.gate.view().pauseArmed).toBe(true);
    table.gate.newCode();
    expect(table.gate.view()).toMatchObject({ paused: false, pauseArmed: false });
    table.gate.paused(table.clock.now + 60_000);
    expect(table.gate.view().pauseArmed).toBe(false);
    // A pause that ran out while its line was not armed leaves no timer behind.
    table.gate.paused(table.clock.now - 1);
    table.gate.dispose();
    expect(table.timers()).toBe(0);
  });

  it('never arm a pause\'s line by the time of the pause before it: a short pause that ran out leaves nothing pending', () => {
    const table = gate();
    // Told with less left than the arming time (the GM's socket came back near its end): it runs out unarmed.
    table.gate.paused(table.clock.now + 300);
    table.advance(300);
    expect(table.gate.view()).toMatchObject({ paused: false, pauseArmed: false });
    expect(table.timers()).toBe(0);
    // Ten more wrong codes at once: the next pause's line appears, and New code must wait its own time.
    table.advance(100);
    table.gate.paused(table.clock.now + 60_000);
    expect(table.timers()).toBe(2);
    table.advance(300);
    // 700 ms after the first pause began, 300 ms after this one did.
    expect(table.gate.view()).toMatchObject({ paused: true, pauseArmed: false });
    table.advance(ARM_MS - 300 - 1);
    expect(table.gate.view().pauseArmed).toBe(false);
    table.advance(1);
    expect(table.gate.view().pauseArmed).toBe(true);
    // A pause that ran its whole time is over in every part, and the one after it starts unarmed.
    table.advance(60_000);
    expect(table.gate.view()).toMatchObject({ paused: false, pauseArmed: false });
    expect(table.timers()).toBe(0);
    table.gate.paused(table.clock.now + 200);
    table.advance(250);
    table.gate.paused(table.clock.now + 60_000);
    table.advance(100);
    table.gate.dispose();
    expect(table.timers()).toBe(0);
  });

  it('end a pause with a new code or with the code switched off, and not with the other switch', () => {
    const table = gate();
    table.gate.paused(table.clock.now + 60_000);
    table.gate.setAskToJoin(false);
    expect(table.gate.view().paused).toBe(true);
    table.gate.newCode();
    expect(table.gate.view().paused).toBe(false);
    table.gate.paused(table.clock.now + 60_000);
    table.gate.setRequireCode(false);
    expect(table.gate.view().paused).toBe(false);
    table.advance(60_000);
    expect(table.gate.view().paused).toBe(false);
  });

  it('tell the panels of every change, and leave no timer running once the table is over', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.paused(table.clock.now + 60_000);
    table.gate.gone(MIRA.id, true);
    const before = table.changes.count;
    expect(before).toBeGreaterThanOrEqual(3);
    table.gate.dispose();
    expect(table.timers()).toBe(0);
    table.advance(60 * 60_000);
    expect(table.changes.count).toBe(before);
  });
});

/**
 * Whoever knocks chooses the moment their card appears. A card therefore takes no answer until it has
 * stood for `ARM_MS`, counted from the knock and kept with it, whatever is drawn in between.
 */
describe('a card that just appeared', () => {
  const armed = (table: ReturnType<typeof gate>): boolean[] => table.gate.view().waiting.map((player) => player.armed);

  it('takes no answer inside the arming time, and takes one after it', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    expect(armed(table)).toEqual([false]);
    table.gate.admit(MIRA.id);
    table.gate.decline(MIRA.id);
    table.advance(ARM_MS - 1);
    table.gate.admit(MIRA.id);
    table.gate.decline(MIRA.id);
    expect(table.answers).toEqual([]);
    expect(table.gate.view().waiting[0]).toMatchObject({ answered: false, armed: false });
    table.advance(1);
    expect(armed(table)).toEqual([true]);
    table.gate.admit(MIRA.id);
    expect(table.answers).toEqual([[MIRA.id, true]]);
  });

  it('keeps its time through every redraw and a knock told again: the time neither starts anew nor is skipped', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.advance(400);
    // What a redraw reads, a repeated frame, another setting changed, a pause told: none of them is the knock.
    for (let draw = 0; draw < 5; draw += 1) table.gate.view();
    table.gate.knocked(MIRA);
    table.gate.setAskToJoin(false);
    table.gate.paused(table.clock.now + 60_000);
    expect(armed(table)).toEqual([false]);
    table.gate.admit(MIRA.id);
    table.advance(ARM_MS - 400 - 1);
    table.gate.view();
    table.gate.admit(MIRA.id);
    expect(table.answers).toEqual([]);
    table.advance(1);
    table.gate.admit(MIRA.id);
    expect(table.answers).toEqual([[MIRA.id, true]]);
  });

  it('goes after the earlier cards and leaves them their place and their time', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.advance(600);
    table.gate.knocked(NOOR);
    expect(table.gate.view().waiting.map((player) => player.name)).toEqual(['Mira', 'Noor']);
    table.advance(100);
    expect(armed(table)).toEqual([true, false]);
    table.gate.admit(NOOR.id);
    expect(table.answers).toEqual([]);
    table.advance(ARM_MS - 100);
    expect(armed(table)).toEqual([true, true]);
    table.gate.decline(NOOR.id);
    expect(table.answers).toEqual([[NOOR.id, false]]);
  });

  it('is told to the panels once when it appears and once when it is armed, however many came together', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.knocked(NOOR);
    expect(table.changes.count).toBe(2);
    table.advance(ARM_MS);
    expect(armed(table)).toEqual([true, true]);
    expect(table.changes.count).toBe(3);
    table.advance(60_000);
    expect(table.changes.count).toBe(3);
    expect(table.timers()).toBe(0);
  });

  it('starts again when a card left: the others close up, and one may lie under the press that answered it', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.knocked(NOOR);
    table.advance(5_000);
    table.gate.admit(MIRA.id);
    table.gate.gone(MIRA.id, false);
    expect(table.gate.view().waiting).toEqual([{ ...NOOR, answered: false, full: false, armed: false }]);
    // The second click of a double click, or a key still held.
    table.gate.admit(NOOR.id);
    table.advance(ARM_MS - 1);
    table.gate.admit(NOOR.id);
    expect(table.answers).toEqual([[MIRA.id, true]]);
    table.advance(1);
    table.gate.admit(NOOR.id);
    expect(table.answers).toEqual([[MIRA.id, true], [NOOR.id, true]]);
  });

  it('starts again when the card of a full table goes after its moment, and when a knock times out', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.knocked(NOOR);
    table.advance(ARM_MS);
    table.gate.admit(MIRA.id);
    table.gate.gone(MIRA.id, true);
    // The card still stands, saying so: nothing moved yet.
    expect(armed(table)).toEqual([true, true]);
    table.advance(FULL_NOTE_MS);
    expect(armed(table)).toEqual([false]);
    table.advance(ARM_MS);
    expect(armed(table)).toEqual([true]);
  });

  it('starts again when the control says its cards moved, with one redraw however often it says so', () => {
    const table = gate();
    table.gate.moved();
    expect(table.changes.count).toBe(0);
    table.gate.knocked(MIRA);
    table.advance(ARM_MS);
    const before = table.changes.count;
    // The control grows over a third of a second, a frame at a time.
    for (let frame = 0; frame < 20; frame += 1) {
      table.gate.moved();
      table.advance(16);
    }
    expect(armed(table)).toEqual([false]);
    expect(table.changes.count).toBe(before + 1);
    table.gate.admit(MIRA.id);
    table.advance(ARM_MS - 17);
    expect(armed(table)).toEqual([false]);
    table.gate.admit(MIRA.id);
    expect(table.answers).toEqual([]);
    table.advance(1);
    expect(armed(table)).toEqual([true]);
    expect(table.changes.count).toBe(before + 2);
    table.gate.admit(MIRA.id);
    expect(table.answers).toEqual([[MIRA.id, true]]);
  });

  it('is never armed by the time of a card before it: one timer at most, whatever came and went inside the window', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.advance(300);
    // The knock is withdrawn and made again, and another joins: nothing of the first window is left.
    table.gate.gone(MIRA.id, false);
    expect(table.timers()).toBe(0);
    table.advance(100);
    table.gate.knocked(MIRA);
    table.gate.knocked(NOOR);
    expect(table.timers()).toBe(1);
    table.advance(300);
    // 700 ms after the first knock, 300 ms after this one.
    expect(armed(table)).toEqual([false, false]);
    table.gate.admit(MIRA.id);
    expect(table.answers).toEqual([]);
    table.advance(ARM_MS - 300);
    expect(armed(table)).toEqual([true, true]);
    expect(table.timers()).toBe(0);
    table.gate.moved();
    table.gate.gone(NOOR.id, false);
    table.gate.welcomed([MIRA]);
    expect(table.timers()).toBe(1);
    table.gate.dispose();
    expect(table.timers()).toBe(0);
  });

  it('keeps its time through a welcome where it keeps its place, and starts again where it does not', () => {
    const table = gate();
    table.gate.knocked(MIRA);
    table.gate.knocked(NOOR);
    table.advance(ARM_MS);
    table.gate.admit(MIRA.id);
    // The GM's socket came back: the same two, the answer under way void.
    table.gate.welcomed([MIRA, NOOR]);
    expect(table.gate.view().waiting).toEqual([{ ...MIRA, answered: false, full: false, armed: true }, { ...NOOR, answered: false, full: false, armed: true }]);
    table.gate.welcomed([NOOR, MIRA]);
    expect(armed(table)).toEqual([false, false]);
    table.advance(ARM_MS);
    table.gate.welcomed([NOOR, { id: 'r'.repeat(20), name: 'Ravi' }]);
    expect(armed(table)).toEqual([true, false]);
  });
});
