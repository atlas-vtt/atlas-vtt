import { describe, expect, it } from 'vitest';
import { bearerToken, newRemoteToken, remoteTokenHash, requestRefusal, sameHash } from '@/app/soundRemote/remoteAccess';
import { parseClientName, parseRemoteCommand, REMOTE_HEADER } from '@/app/soundRemote/remoteProtocol';

const PORT = 47823;
const fine = { host: `127.0.0.1:${PORT}`, [REMOTE_HEADER]: '1' };

describe('remote commands from the wire', () => {
  it('reads every command this version knows', () => {
    expect(parseRemoteCommand({ type: 'mood', id: 'tavern' })).toEqual({ type: 'mood', id: 'tavern' });
    expect(parseRemoteCommand({ type: 'roll', id: 'attack' })).toEqual({ type: 'roll', id: 'attack' });
    expect(parseRemoteCommand({ type: 'shareRolls' })).toEqual({ type: 'shareRolls' });
    for (const type of ['nextMood', 'stopAll', 'pause', 'nextTrack', 'previousTrack', 'shuffle', 'repeat', 'muteMusic']) {
      expect(parseRemoteCommand({ type })).toEqual({ type });
    }
    expect(parseRemoteCommand({ type: 'level', channel: 'master', deltaDb: -2 })).toEqual({ type: 'level', channel: 'master', deltaDb: -2 });
    expect(parseRemoteCommand({ type: 'level', channel: 'musicStrip', db: -6 })).toEqual({ type: 'level', channel: 'musicStrip', db: -6 });
    expect(parseRemoteCommand({ type: 'level', channel: 'ambience', reset: true })).toEqual({ type: 'level', channel: 'ambience', reset: true });
  });

  it('refuses what it does not know exactly', () => {
    const refused: unknown[] = [
      null, 'mood', [], { type: 'eval' }, { type: 'mood' }, { type: 'mood', id: '' }, { type: 'roll' }, { type: 'mood', id: 'x'.repeat(201) },
      { type: 'level', channel: 'players', deltaDb: 1 }, { type: 'level', channel: 'master' },
      { type: 'level', channel: 'master', db: 1, deltaDb: 1 }, { type: 'level', channel: 'master', deltaDb: Number.NaN },
      { type: 'level', channel: 'master', deltaDb: 1000 }, { type: 'level', channel: 'master', reset: false },
      { type: 'toString' }, { type: 'constructor' },
    ];
    for (const value of refused) expect(parseRemoteCommand(value)).toBeNull();
  });

  it('takes a controller name without control characters, cut to the prompt', () => {
    expect(parseClientName({ client: ' Stream Deck ' })).toBe('Stream Deck');
    expect(parseClientName({ client: 'Deck‮\u0007' })).toBe('Deck‮');
    expect(parseClientName({ client: 'x'.repeat(100) })).toHaveLength(64);
    expect(parseClientName({ client: '\n' })).toBeNull();
    expect(parseClientName({})).toBeNull();
  });
});

describe('who may talk to the remote', () => {
  it('lets a program on this computer in', () => {
    expect(requestRefusal(fine, PORT)).toBeNull();
    expect(requestRefusal({ ...fine, host: `localhost:${PORT}` }, PORT)).toBeNull();
  });

  it('refuses a name made to point here, browsers and requests without the header', () => {
    expect(requestRefusal({ ...fine, host: `evil.example:${PORT}` }, PORT)).toBe('host');
    expect(requestRefusal({ ...fine, host: undefined }, PORT)).toBe('host');
    expect(requestRefusal({ ...fine, host: '127.0.0.1:80' }, PORT)).toBe('host');
    expect(requestRefusal({ ...fine, origin: 'null' }, PORT)).toBe('browser');
    expect(requestRefusal({ ...fine, origin: 'https://example.com' }, PORT)).toBe('browser');
    expect(requestRefusal({ ...fine, 'sec-fetch-site': 'cross-site' }, PORT)).toBe('browser');
    expect(requestRefusal({ ...fine, referer: 'https://example.com/' }, PORT)).toBe('browser');
    expect(requestRefusal({ host: fine.host }, PORT)).toBe('header');
  });

  it('reads only a well formed bearer token', () => {
    const token = newRemoteToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(newRemoteToken()).not.toBe(token);
    expect(bearerToken({ authorization: `Bearer ${token}` })).toBe(token);
    expect(bearerToken({ authorization: token })).toBeNull();
    expect(bearerToken({ authorization: 'Bearer abc' })).toBeNull();
    expect(bearerToken({})).toBeNull();
  });

  it('stores a hash and compares hashes', async () => {
    const token = newRemoteToken();
    const hash = await remoteTokenHash(token);
    expect(hash).not.toContain(token);
    expect(sameHash(hash, await remoteTokenHash(token))).toBe(true);
    expect(sameHash(hash, await remoteTokenHash(newRemoteToken()))).toBe(false);
    expect(sameHash(hash, hash.slice(1))).toBe(false);
  });
});
