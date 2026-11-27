import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import type { GmScreen } from '../../../../src/app/online/gmScreen/index.ts';
import { CLOSE, readGmScreenLink, type DeviceMessage } from '../../../../src/app/online/protocol/index.ts';
import { deviceId, RelaySocket, sessionRig, type Rig } from './sessionRig.ts';

const PHONE = deviceId('p');
const TABLET = deviceId('t');

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

/** Starts the session and lets the relay welcome it. */
async function started(rig: Rig = sessionRig()): Promise<Rig> {
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  return rig;
}

/** A device that knocks as `id`, is allowed, joins and has its channel open. */
async function allowed(rig: Rig, id: string, name = 'Phone'): Promise<Awaited<ReturnType<Rig['device']>>> {
  const device = await rig.device(id);
  rig.socket().receive({ t: 'knock', id, name });
  await rig.settle();
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(id)).toBe(true);
  rig.socket().receive({ t: 'player-joined', id, name });
  await rig.settle();
  return device;
}

describe('the GM screen\'s session at a room of its own', () => {
  it('contacts nothing before it is started', async () => {
    const rig = sessionRig();
    rig.timers.advance(60_000);
    await rig.settle();
    expect(rig.created).toEqual([]);
    expect(RelaySocket.all).toEqual([]);
    expect(rig.session.view().status).toBe('stopped');
  });

  it('asks for the room at a lasting code, connects with its secret, and shows the link with the key in its fragment', async () => {
    const rig = await started();
    const record = rig.saved.at(-1);
    expect(rig.created).toEqual([record?.link.code]);
    const socket = rig.socket();
    expect(socket.room).toBe(record?.link.code);
    expect(socket.frames()[0]).toMatchObject({ t: 'hello', role: 'gm', secret: record?.secret });
    // The room always asks: no code, and the GM answers every newcomer.
    expect(socket.framesOf('gate')).toEqual([{ v: 1, t: 'gate', code: null, ask: true }]);
    const view = rig.session.view();
    expect(view.status).toBe('online');
    expect(view.link?.startsWith(`${'https://relay.example'}/gm-screen/#`)).toBe(true);
    expect(readGmScreenLink(view.link)).toEqual(record?.link);
  });

  it('asks the GM about a knock with the number the device shows, and takes no answer before the prompt stood a moment', async () => {
    const rig = await started();
    const device = await rig.device(PHONE);
    rig.socket().receive({ t: 'knock', id: PHONE, name: 'Mira\'s phone' });
    await rig.settle();
    const knock = rig.session.view().knock;
    expect(knock).toMatchObject({ id: PHONE, name: 'Mira\'s phone', armed: false });
    expect(knock?.check).toBe(await device.check(PHONE));
    expect(rig.session.allow(PHONE)).toBe(false);
    expect(rig.socket().framesOf('admit')).toEqual([]);
    rig.timers.advance(ARM_MS);
    expect(rig.session.view().knock?.armed).toBe(true);
    expect(rig.session.allow(PHONE)).toBe(true);
    expect(rig.socket().framesOf('admit')).toEqual([{ v: 1, t: 'admit', id: PHONE }]);
    expect(rig.session.view().knock).toBeNull();
  });

  it('gives an allowed device a code of its own, on the roster and through its channel, and lists it as connected', async () => {
    const rig = await started();
    const device = await allowed(rig, PHONE);
    const code = rig.saved.at(-1)?.devices[0]?.code;
    expect(code).toMatch(/^\d{6}$/);
    expect(rig.socket().framesOf('players').at(-1)).toEqual({ v: 1, t: 'players', players: [{ id: PHONE, name: 'Phone', code }] });
    expect(device.heard).toEqual([{ t: 'your-code', code, first: true }]);
    expect(rig.session.view().devices).toEqual([expect.objectContaining({ id: PHONE, name: 'Phone', connected: true })]);
  });

  it('turns a refused device away and keeps no record of it', async () => {
    const rig = await started();
    rig.socket().receive({ t: 'knock', id: PHONE, name: 'Stranger' });
    await rig.settle();
    rig.session.refuse(PHONE);
    await rig.settle();
    expect(rig.socket().framesOf('decline')).toEqual([{ v: 1, t: 'decline', id: PHONE }]);
    expect(rig.session.view().devices).toEqual([]);
    expect(rig.session.view().knock).toBeNull();
  });

  it('asks about one device at a time, in the order they knocked', async () => {
    const rig = await started();
    rig.socket().receive({ t: 'knock', id: PHONE, name: 'Phone' });
    rig.socket().receive({ t: 'knock', id: TABLET, name: 'Tablet' });
    await rig.settle();
    expect(rig.session.view()).toMatchObject({ knock: { id: PHONE }, waiting: 2 });
    rig.timers.advance(ARM_MS);
    expect(rig.session.allow(TABLET)).toBe(false);
    rig.session.refuse(PHONE);
    await rig.settle();
    expect(rig.session.view()).toMatchObject({ knock: { id: TABLET, armed: false }, waiting: 1 });
  });

  it('lets a known device come back next session by its own code, without asking', async () => {
    const rig = await started();
    await allowed(rig, PHONE);
    rig.session.stop();
    expect(rig.session.view().status).toBe('stopped');
    await rig.session.start();
    const second = rig.socket();
    second.welcome();
    await rig.settle();
    const code = rig.saved.at(-1)?.devices[0]?.code;
    // The roster goes before anything else on every welcome.
    expect(second.framesOf('players')).toEqual([{ v: 1, t: 'players', players: [{ id: PHONE, name: 'Phone', code }] }]);
    const device = await rig.device(PHONE);
    second.receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
    await rig.settle();
    expect(device.heard).toEqual([{ t: 'your-code', code, first: false }]);
    expect(rig.session.view().knock).toBeNull();
    expect(rig.session.view().devices[0]?.connected).toBe(true);
  });

  it('removes a device at once: it leaves the roster, is kicked, and nothing it sends is read any more', async () => {
    const rig = await started();
    const heard: [string, DeviceMessage][] = [];
    rig.session.plug({ takes: ['press'], opened: () => undefined, message: (from, message) => void heard.push([from, message]) });
    const device = await allowed(rig, PHONE);
    rig.session.remove(PHONE);
    const socket = rig.socket();
    expect(socket.framesOf('players').at(-1)).toEqual({ v: 1, t: 'players', players: [] });
    expect(socket.framesOf('kick')).toEqual([{ v: 1, t: 'kick', id: PHONE }]);
    await device.say({ t: 'press', id: 1, command: { type: 'stopAll' } });
    await rig.settle();
    expect(heard).toEqual([]);
    expect(rig.session.view().devices).toEqual([]);
    expect(rig.saved.at(-1)?.devices).toEqual([]);
  });

  it('makes a new link: a new code and key, no devices, and the old room ended', async () => {
    const rig = await started();
    await allowed(rig, PHONE);
    const old = rig.saved.at(-1);
    const oldSocket = rig.socket();
    rig.session.newLink();
    await rig.settle();
    expect(oldSocket.framesOf('end')).toHaveLength(1);
    const fresh = rig.saved.at(-1);
    expect(fresh?.link.code).not.toBe(old?.link.code);
    expect(fresh?.link.key).not.toBe(old?.link.key);
    expect(fresh?.devices).toEqual([]);
    expect(rig.created.at(-1)).toBe(fresh?.link.code);
    expect(rig.socket().room).toBe(fresh?.link.code);
    expect(readGmScreenLink(rig.session.view().link)).toEqual(fresh?.link);
  });

  it('stops: the room is ended, the secret forgotten, and nothing is contacted once the room is seen ended', async () => {
    const rig = await started();
    await allowed(rig, PHONE);
    const socket = rig.socket();
    rig.session.stop();
    expect(socket.framesOf('end')).toHaveLength(1);
    expect(socket.closedByGm).toBe(true);
    expect(rig.saved.at(-1)?.secret).toBeNull();
    // The link and the devices stay for the next start.
    expect(rig.saved.at(-1)?.devices.map((device) => device.id)).toEqual([PHONE]);
    // A connection of its own sees the room ended: the relay knows it no more.
    rig.socket().drop(CLOSE.ended);
    await rig.settle();
    expect(rig.saved.at(-1)?.ending).toEqual([]);
    rig.timers.advance(10 * 60_000);
    await rig.settle();
    expect(RelaySocket.all).toHaveLength(2);
    expect(rig.created).toHaveLength(1);
  });

  it('stops for certain when its connection died unnoticed: the end it sent went nowhere, and a connection of its own ends the room', async () => {
    const rig = await started();
    await allowed(rig, PHONE);
    const { secret } = rig.saved.at(-1) ?? {};
    const dead = rig.socket();
    rig.session.stop();
    expect(dead.framesOf('end')).toHaveLength(1);
    expect(rig.saved.at(-1)?.ending).toEqual([{ code: rig.saved.at(-1)?.link.code, secret }]);
    // The room is still there: the relay never got that end.
    const again = rig.socket();
    expect(again).not.toBe(dead);
    again.welcome();
    await rig.settle();
    expect(again.framesOf('hello')).toEqual([expect.objectContaining({ secret }) as unknown]);
    expect(again.framesOf('end')).toHaveLength(1);
    expect(rig.saved.at(-1)?.ending).toEqual([]);
    expect(rig.session.view().status).toBe('stopped');
  });

  it('comes back after the connection dropped, with its devices and their channels', async () => {
    const rig = await started();
    const device = await allowed(rig, PHONE);
    rig.socket().drop();
    expect(rig.session.view()).toMatchObject({ status: 'connecting', devices: [{ id: PHONE, connected: false }] });
    // The first retry comes within a second.
    rig.timers.advance(1_000);
    const again = rig.socket();
    expect(RelaySocket.all).toHaveLength(2);
    again.welcome([{ id: PHONE, name: 'Phone' }]);
    await rig.settle();
    expect(rig.session.view()).toMatchObject({ status: 'online', devices: [{ id: PHONE, connected: true }] });
    // A new exchange, and the code again over it.
    expect(device.heard.at(-1)).toMatchObject({ t: 'your-code', first: false });
    expect(rig.created).toHaveLength(1);
  });

  it('comes back after Atlas reloads to the same room, without asking the relay for a new one', async () => {
    const first = await started();
    await allowed(first, PHONE);
    const kept = first.saved.at(-1) ?? null;
    first.session.close();
    expect(first.socket().framesOf('end')).toEqual([]);
    RelaySocket.all = [];
    const rig = sessionRig(kept);
    await rig.session.resume();
    rig.socket().welcome([{ id: PHONE, name: 'Phone' }]);
    expect(rig.created).toEqual([]);
    expect(rig.socket().frames()[0]).toMatchObject({ t: 'hello', secret: kept?.secret });
    expect(rig.session.view()).toMatchObject({ status: 'online', devices: [{ id: PHONE, connected: true }] });
  });

  it('ends here when started elsewhere, says so once, and does not try again', async () => {
    const rig = await started();
    rig.socket().drop(CLOSE.superseded);
    expect(rig.session.view().status).toBe('stopped');
    expect(rig.notices).toHaveLength(1);
    expect(rig.session.view().problem).toBe(rig.notices[0]);
    expect(rig.saved.at(-1)?.secret).toBeNull();
    rig.timers.advance(10 * 60_000);
    expect(RelaySocket.all).toHaveLength(1);
  });

  it('comes back without a word to a room the relay ended while Atlas was closed: the session is simply stopped', async () => {
    for (const code of [CLOSE.badSecret, CLOSE.ended]) {
      RelaySocket.all = [];
      const first = await started();
      const kept = first.saved.at(-1) ?? null;
      first.session.close();
      RelaySocket.all = [];
      const rig = sessionRig(kept);
      await rig.session.resume();
      rig.socket().readyState = RelaySocket.OPEN;
      rig.socket().dispatchEvent(new Event('open'));
      rig.socket().drop(code);
      expect(rig.notices).toEqual([]);
      expect(rig.session.view()).toMatchObject({ status: 'stopped', problem: null });
      expect(rig.saved.at(-1)?.secret).toBeNull();
      rig.timers.advance(10 * 60_000);
      expect(RelaySocket.all).toHaveLength(1);
    }
  });

  it('says so when a room the GM started is refused', async () => {
    const rig = sessionRig();
    await rig.session.start();
    rig.socket().readyState = RelaySocket.OPEN;
    rig.socket().dispatchEvent(new Event('open'));
    rig.socket().drop(CLOSE.badSecret);
    expect(rig.notices).toHaveLength(1);
    expect(rig.session.view().status).toBe('stopped');
  });

  it('reads nobody the GM never allowed, and opens no channel to them, whatever they send', async () => {
    const rig = await started();
    const heard: [string, DeviceMessage][] = [];
    rig.session.plug({ takes: ['press'], opened: () => undefined, message: (from, message) => void heard.push([from, message]) });
    const thief = await rig.device(TABLET);
    rig.socket().receive({ t: 'knock', id: TABLET, name: 'Phone' });
    await rig.settle();
    rig.socket().receive({ t: 'game', from: TABLET, body: { t: 'seal-ask', v: 1 } });
    rig.timers.advance(10 * 60_000);
    await rig.settle();
    expect(thief.channel.isOpen).toBe(false);
    expect(JSON.stringify(rig.socket().frames())).not.toContain('seal-open');
    expect(heard).toEqual([]);
  });

  it('kicks a removed device the relay seats again, and opens no channel to it, then or later', async () => {
    const rig = await started();
    const device = await allowed(rig, PHONE);
    rig.session.remove(PHONE);
    await rig.settle();
    const socket = rig.socket();
    const before = socket.frames().length;
    socket.receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
    await rig.settle();
    await device.say({ t: 'press', id: 1, command: { type: 'stopAll' } });
    await rig.settle();
    const after = socket.frames().slice(before);
    expect(after.filter((frame) => frame.t === 'kick')).toHaveLength(1);
    expect(JSON.stringify(after)).not.toContain('seal-open');
    expect(rig.session.view().devices).toEqual([]);
  });

  it('sends no more openings to a device that left before it answered', async () => {
    const rig = await started();
    rig.socket().receive({ t: 'knock', id: PHONE, name: 'Phone' });
    await rig.settle();
    rig.timers.advance(ARM_MS);
    rig.session.allow(PHONE);
    // The device's page never answers: it is gone again at once.
    rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
    await rig.settle();
    rig.socket().receive({ t: 'player-left', id: PHONE });
    for (let second = 0; second < 30; second += 1) {
      rig.timers.advance(1000);
      await rig.settle();
    }
    expect(JSON.stringify(rig.socket().frames()).match(/seal-open/g)).toHaveLength(1);
  });

  it('kicks a stranger the relay seated without the GM\'s word', async () => {
    const rig = await started();
    rig.socket().receive({ t: 'player-joined', id: TABLET, name: 'Tablet' });
    await rig.settle();
    expect(rig.socket().framesOf('kick')).toEqual([{ v: 1, t: 'kick', id: TABLET }]);
    expect(rig.session.view().devices).toEqual([]);
  });
});

describe('screens plugged into the session', () => {
  it('hear the opening of each device and the messages of their kinds, and send to open devices only', async () => {
    const rig = await started();
    const opened: string[] = [];
    const pressed: [string, DeviceMessage][] = [];
    const screen: GmScreen = { takes: ['press'], opened: (device) => void opened.push(device), message: (from, message) => void pressed.push([from, message]) };
    rig.session.plug(screen);
    const phone = await allowed(rig, PHONE);
    const tablet = await allowed(rig, TABLET, 'Tablet');
    expect(opened).toEqual([PHONE, TABLET]);
    await phone.say({ t: 'press', id: 7, command: { type: 'stopAll' } });
    await phone.say({ t: 'statblock-view', id: null });
    await rig.settle();
    expect(pressed).toEqual([[PHONE, { t: 'press', id: 7, command: { type: 'stopAll' } }]]);
    rig.socket().receive({ t: 'player-left', id: TABLET });
    await rig.settle();
    rig.session.send({ t: 'press-answer', id: 7, refused: null });
    await rig.settle();
    expect(phone.heard.at(-1)).toEqual({ t: 'press-answer', id: 7, refused: null });
    expect(tablet.heard.some((message) => message.t === 'press-answer')).toBe(false);
  });

  it('keep serving a device when another screen fails, and say in the console that one failed', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rig = await started();
    const opened: string[] = [];
    const pressed: DeviceMessage[] = [];
    rig.session.plug({ takes: ['statblock-view'], opened: () => { throw new Error('no map'); }, message: () => Promise.reject(new Error('no drawing')) });
    rig.session.plug({ takes: ['press'], opened: (device) => void opened.push(device), message: (_from, message) => void pressed.push(message) });
    const phone = await allowed(rig, PHONE);
    await phone.say({ t: 'statblock-view', id: 'secret-goblin' });
    await phone.say({ t: 'press', id: 1, command: { type: 'stopAll' } });
    await rig.settle();
    expect(opened).toEqual([PHONE]);
    expect(phone.heard.some((message) => message.t === 'your-code')).toBe(true);
    expect(pressed).toEqual([{ t: 'press', id: 1, command: { type: 'stopAll' } }]);
    expect(errors).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(errors.mock.calls.map((call) => call.map(String)));
    expect(logged).toContain('statblock-view');
    const record = rig.saved.at(-1);
    for (const secret of [record?.link.key, record?.link.code, record?.secret, 'secret-goblin', PHONE]) expect(logged).not.toContain(secret);
  });

  it('may not read a kind another screen reads', () => {
    const rig = sessionRig();
    rig.session.plug({ takes: ['press'], opened: () => undefined, message: () => undefined });
    expect(() => rig.session.plug({ takes: ['press', 'portrait-ask'], opened: () => undefined, message: () => undefined })).toThrow();
  });
});
