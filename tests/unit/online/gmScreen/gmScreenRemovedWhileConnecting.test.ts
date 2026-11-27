import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { deviceId, RelaySocket, sessionRig } from './sessionRig.ts';

const PHONE = deviceId('p');
const TABLET = deviceId('t');

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

describe('a device removed while Sidekick connects to its room', () => {
  it('is not seated by that connection: the relay\'s roster names only the devices left', async () => {
    const first = sessionRig();
    await first.session.start();
    first.socket().welcome();
    await first.settle();
    for (const [id, name] of [[PHONE, 'Phone'], [TABLET, 'Tablet']] as const) {
      await first.device(id);
      first.socket().receive({ t: 'knock', id, name });
      await first.settle();
      first.timers.advance(ARM_MS);
      expect(first.session.allow(id)).toBe(true);
    }
    first.session.close();
    RelaySocket.all = [];

    // Atlas loads again and comes back to the room; the GM removes the phone before the connection opens.
    const rig = sessionRig(first.saved.at(-1) ?? null);
    const resumed = rig.session.resume();
    rig.session.remove(PHONE);
    await resumed;
    rig.socket().welcome();
    await rig.settle();
    const rosters = rig.socket().framesOf('players').map((frame) => (frame.players as { id: string }[]).map((seat) => seat.id));
    expect(rosters.length).toBeGreaterThan(0);
    for (const roster of rosters) expect(roster).toEqual([TABLET]);
  });
});
