// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keysStateOf } from '../../../../src/app/online/gmScreen/keys/keysMessages.ts';
import { KEEPALIVE_MS, KEEPALIVE_PING, parseKeysMessage } from '../../../../src/app/online/protocol/index.ts';
import type { RemoteCommand } from '../../../../src/app/soundRemote/remoteProtocol';
import { allowedDevice, heardOf, keysRig, settleUntil, soundWorld, type SoundWorld } from './keysRig.ts';
import { deviceId, RelaySocket } from './sessionRig.ts';

const PHONE = deviceId('p');
const TABLET = deviceId('t');

beforeEach(() => {
  RelaySocket.all = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Every command a device may press, one of each type: a command added to the remote fails to compile here until it is listed. */
const COMMANDS = {
  mood: { type: 'mood', id: 'mood-1' },
  nextMood: { type: 'nextMood' },
  stopAll: { type: 'stopAll' },
  pause: { type: 'pause' },
  nextTrack: { type: 'nextTrack' },
  previousTrack: { type: 'previousTrack' },
  shuffle: { type: 'shuffle' },
  repeat: { type: 'repeat' },
  muteMusic: { type: 'muteMusic' },
  combat: { type: 'combat' },
  rollInitiative: { type: 'rollInitiative' },
  present: { type: 'present' },
  freeze: { type: 'freeze' },
  curtain: { type: 'curtain' },
  takeBackHandout: { type: 'takeBackHandout' },
  showHoveredImage: { type: 'showHoveredImage' },
  roll: { type: 'roll', id: 'attack' },
  dice: { type: 'dice', formula: '2d6+3' },
  shareRolls: { type: 'shareRolls' },
  level: { type: 'level', channel: 'ambience', deltaDb: -3 },
} as const satisfies { [K in RemoteCommand['type']]: Extract<RemoteCommand, { type: K }> };


/** Every intent Atlas was asked for, by name, with its arguments; reading what the keys show is none. */
function intents(world: SoundWorld): Record<string, unknown[][]> {
  const { director, table } = world;
  const { presented: _read, ...map } = table.map;
  const spies = { ...director.desk, press: director.press, pressNext: director.pressNext, setChannelLevels: director.setChannelLevels, ...table.player, ...map, startCombat: table.state.startCombat, endCombat: table.state.endCombat, setShown: table.shareRolls.setShown };
  return Object.fromEntries(Object.entries(spies).flatMap(([name, spy]) => (vi.isMockFunction(spy) && spy.mock.calls.length > 0 ? [[name, spy.mock.calls]] : [])));
}

/** A world where every command has something to act on: a handout shown, an image under the pointer, a fight's combatants, a player window. */
function busyWorld(): SoundWorld {
  const world = soundWorld();
  world.table.window.handout = true;
  world.table.window.hoveringImage = true;
  return world;
}

describe('the Keys screen on Atlas\'s side', () => {
  it('does for every command pressed on a device what the Stream Deck\'s does, and answers it', async () => {
    for (const command of Object.values(COMMANDS)) {
      RelaySocket.all = [];
      const streamDeck = busyWorld();
      const control = streamDeck.control();
      const refused = control.run(command);
      const rig = await keysRig(busyWorld());
      const phone = await allowedDevice(rig, PHONE);
      await rig.press(phone, 7, command);
      expect(heardOf(phone, 'press-answer'), command.type).toEqual([{ t: 'press-answer', id: 7, refused }]);
      expect(intents(rig.world), command.type).toEqual(intents(streamDeck));
      rig.tick(1000);
      // The state the phone holds once it settled is the Stream Deck's after the same press.
      const expected = JSON.stringify(keysStateOf(control.state(), false));
      await settleUntil(rig, () => JSON.stringify(heardOf(phone, 'keys').at(-1)?.state) === expected);
      control.dispose();
    }
  });

  it('sends the state a press left after the press\'s answer', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    phone.heard.length = 0;
    await rig.press(phone, 1, COMMANDS.combat);
    rig.tick(0);
    await settleUntil(rig, () => heardOf(phone, 'keys').length > 0);
    expect(phone.heard.map((message) => message.t)).toEqual(['press-answer', 'keys']);
    expect(heardOf(phone, 'keys')[0]?.state.combat).toMatchObject({ active: true, round: 1 });
  });

  it('refuses commands it does not know and a formula over the dice tool\'s limits, and says why', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    await rig.press(phone, 1, { type: 'teleport' });
    await rig.press(phone, 2, { type: 'level', channel: 'master', db: 'loud' });
    await rig.press(phone, 3, { type: 'dice', formula: '101d6' });
    expect(heardOf(phone, 'press-answer')).toEqual([
      { t: 'press-answer', id: 1, refused: 'unknown-command' },
      { t: 'press-answer', id: 2, refused: 'unknown-command' },
      { t: 'press-answer', id: 3, refused: 'bad-formula' },
    ]);
    expect(rig.world.table.map.rollFormula).not.toHaveBeenCalled();
    // Each refusal is a name the page's parser reads.
    for (const answer of heardOf(phone, 'press-answer')) expect(parseKeysMessage({ ...answer })).toEqual(answer);
  });

  it('runs a burst of presses in order, each once', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    const levels = [-10, -11, -12, -13, -14, -15];
    for (const [index, db] of levels.entries()) expect(await phone.say({ t: 'press', id: index + 1, command: { type: 'level', channel: 'music', db } })).toBe(true);
    await settleUntil(rig, () => heardOf(phone, 'press-answer').length === levels.length);
    expect(rig.world.director.desk.setMusicLevel.mock.calls.map(([db]) => db)).toEqual(levels);
    expect(heardOf(phone, 'press-answer').map((answer) => answer.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('hands a device that opens the moods and the state, and nothing more while nothing a key shows changes', { timeout: 60_000 }, async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    expect(phone.heard.map((message) => message.t)).toEqual(['your-code', 'moods', 'keys']);
    const socket = rig.socket();
    const before = socket.sent.length;
    // Ten minutes in which nothing changes: the sound remote looks every second and finds nothing to send.
    for (let second = 0; second < 600; second += 1) {
      rig.tick(1000);
      rig.timers.advance(700);
      await rig.settle();
    }
    // Only the room's own keep-alive, every 30 s, as any table's.
    expect(new Set(socket.sent.slice(before))).toEqual(new Set([KEEPALIVE_PING]));
    expect(socket.sent.length - before).toBeLessThanOrEqual(600_000 / KEEPALIVE_MS + 1);
    expect(socket.readyState).toBe(RelaySocket.OPEN);
  });

  it('shows on a device what Atlas changes itself, and what the Stream Deck presses, within a second', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    rig.world.director.desk.setMusicLevel(-20);
    rig.tick(0);
    await settleUntil(rig, () => heardOf(phone, 'keys').at(-1)?.state.levels.musicDb === -20);
    // The Stream Deck runs its own control; the table tells nobody it changed, so the next look finds it.
    const streamDeck = rig.world.control();
    expect(streamDeck.run({ type: 'curtain' })).toBeNull();
    rig.tick(1000);
    await settleUntil(rig, () => heardOf(phone, 'keys').at(-1)?.state.player.hidden === true);
    expect(heardOf(phone, 'keys').at(-1)?.state).toEqual(keysStateOf(streamDeck.state(), false));
    streamDeck.dispose();
  });

  it('makes the commands and state when the first device opens and lets them go when the last one leaves', async () => {
    const rig = await keysRig();
    expect(rig.opened).toHaveLength(0);
    await allowedDevice(rig, PHONE);
    await allowedDevice(rig, TABLET, 'Tablet');
    expect(rig.opened).toHaveLength(1);
    rig.socket().receive({ t: 'player-left', id: PHONE });
    await rig.settle();
    expect(rig.disposed).toHaveLength(0);
    rig.socket().receive({ t: 'player-left', id: TABLET });
    await rig.settle();
    expect(rig.disposed).toHaveLength(1);
    // Nobody connected: no look at the sound and no frame.
    const before = rig.socket().sent.length;
    rig.world.director.desk.setMusicLevel(-30);
    rig.tick(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(rig.socket().sent.slice(before).filter((text) => text.startsWith('{'))).toEqual([]);
  });
});
