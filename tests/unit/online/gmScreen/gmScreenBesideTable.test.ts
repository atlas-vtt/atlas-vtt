import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { TableConnection, type GateEvents, type TableEvents } from '../../../../src/app/online/gm/TableConnection.ts';
import type { PlayerInfo } from '../../../../src/app/online/protocol/index.ts';
import { deviceId, RELAY, RelaySocket, sessionRig, type Rig } from './sessionRig.ts';

const TABLE_CODE = 't'.repeat(26);
const PHONE = deviceId('p');
const PLAYER = deviceId('m');

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

/** The players' table as Atlas runs it, on the same relay, with what reaches its knock cards and players. */
function playersTable(rig: Rig): { connection: TableConnection; knocks: PlayerInfo[]; joined: PlayerInfo[]; socket: () => RelaySocket } {
  const knocks: PlayerInfo[] = [];
  const joined: PlayerInfo[] = [];
  const events: TableEvents = { status: () => undefined, welcome: () => undefined, joined: (player) => void joined.push(player), left: () => undefined, message: () => undefined, access: () => undefined };
  const gate: GateEvents = { frame: () => ({ code: '654321', ask: true }), welcomed: () => undefined, knocked: (player) => void knocks.push(player), gone: () => undefined, paused: () => undefined };
  const connection = new TableConnection(RELAY, TABLE_CODE, 'table-secret-0123456789abcdef', events, gate, rig.timers);
  connection.start();
  return { connection, knocks, joined, socket: () => rig.socket(TABLE_CODE) };
}

/** The GM screen started and a device allowed into it. */
async function withDevice(rig: Rig): Promise<void> {
  await rig.session.start();
  rig.socket(rig.saved.at(-1)?.link.code).welcome();
  await rig.device(PHONE);
  rig.socket(rig.saved.at(-1)?.link.code).receive({ t: 'knock', id: PHONE, name: 'Phone' });
  await rig.settle();
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(PHONE)).toBe(true);
}

describe('the GM screen beside the players\' table', () => {
  it('runs without a table: one room, its own, and none of the table\'s', async () => {
    const rig = sessionRig();
    await withDevice(rig);
    expect(RelaySocket.all.map((socket) => socket.room)).toEqual([rig.saved.at(-1)?.link.code]);
    expect(rig.created).toEqual([rig.saved.at(-1)?.link.code]);
    expect(rig.created).not.toContain(TABLE_CODE);
  });

  it('starts while a table runs and leaves it alone: its knocks never reach the table, and stopping it keeps the table', async () => {
    const rig = sessionRig();
    const table = playersTable(rig);
    table.socket().welcome();
    const before = table.socket().sent.length;
    await withDevice(rig);
    expect(table.knocks).toEqual([]);
    expect(table.socket().sent.length).toBe(before);
    rig.session.stop();
    expect(table.socket().closedByGm).toBe(false);
    expect(table.socket().framesOf('end')).toEqual([]);
    expect(table.socket().sent.length).toBe(before);
  });

  it('keeps running while a table starts and stops beside it, and the table\'s knocks never reach it', async () => {
    const rig = sessionRig();
    await withDevice(rig);
    const room = rig.socket();
    const sentBefore = room.sent.length;
    const table = playersTable(rig);
    table.socket().welcome();
    table.socket().receive({ t: 'knock', id: PLAYER, name: 'Mira' });
    expect(table.knocks).toEqual([{ id: PLAYER, name: 'Mira' }]);
    expect(rig.session.view().knock).toBeNull();
    table.connection.end();
    expect(room.closedByGm).toBe(false);
    expect(room.sent.length).toBe(sentBefore);
    expect(rig.session.view().status).toBe('online');
  });
});
