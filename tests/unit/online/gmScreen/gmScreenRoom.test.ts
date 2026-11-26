import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse } from '../../../../src/app/account/http.ts';
import type { TableOutbox } from '../../../../src/app/online/gm/tableOutbox.ts';
import { relayRooms, type RoomAccount } from '../../../../src/app/online/gmScreen/index.ts';
import { fakeTimers } from './fakeTimers.ts';

const CODE = 'g'.repeat(26);
const SECRET = 'room-secret-0123456789abcdef0123456789';

function rig(answer: HttpResponse, token: string | null = 'account-token'): { asked: HttpRequest[]; ended: string[]; signedOut: number[]; rooms: ReturnType<typeof relayRooms> } {
  const asked: HttpRequest[] = [];
  const ended: string[] = [];
  const signedOut: number[] = [];
  const account: RoomAccount = { token: () => token, signedOutByServer: () => void signedOut.push(1), refresh: () => Promise.resolve() };
  const open = ((room: { code: string }, events: { welcome(): void }) => ({
    start: () => events.welcome(),
    end: () => void ended.push(room.code),
    stop: () => undefined,
  })) as unknown as (room: never, events: never, gate: never) => TableOutbox;
  return { asked, ended, signedOut, rooms: relayRooms((request) => (asked.push(request), Promise.resolve(answer)), 'https://relay.example', account, open, fakeTimers()) };
}

describe('asking the relay for the GM screen\'s room', () => {
  it('asks for a room of kind gm-screen at the lasting code, with the account\'s token', async () => {
    const { asked, rooms } = rig({ status: 201, json: { code: CODE, secret: SECRET, maxPlayers: 4, kind: 'gm-screen' } });
    expect(await rooms(CODE)).toEqual({ room: { code: CODE, secret: SECRET, maxPlayers: 4, kind: 'gm-screen' } });
    expect(asked).toEqual([expect.objectContaining({ url: 'https://relay.example/api/tables', method: 'POST', authorization: 'Bearer account-token', json: expect.objectContaining({ code: CODE, kind: 'gm-screen' }) })]);
  });

  it('ends a players\' table a relay made that knows no kinds, and runs nothing', async () => {
    const { ended, rooms } = rig({ status: 201, json: { code: CODE, secret: SECRET, maxPlayers: 4 } });
    expect(await rooms(CODE)).toHaveProperty('refused');
    expect(ended).toEqual([CODE]);
  });

  it('says why where the account may not host, and asks nothing while signed out', async () => {
    const refused = rig({ status: 403, json: { error: 'no-access' } });
    expect(await refused.rooms(CODE)).toHaveProperty('refused');
    const signedOut = rig({ status: 201, json: null }, null);
    expect(await signedOut.rooms(CODE)).toHaveProperty('refused');
    expect(signedOut.asked).toEqual([]);
    const expired = rig({ status: 401, json: null });
    await expired.rooms(CODE);
    expect(expired.signedOut).toEqual([1]);
  });
});
