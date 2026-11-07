import { describe, expect, it } from 'vitest';
import { createTable } from '../../../../src/app/online/gm/createTable.ts';
import { readCreated } from '../../../../src/app/online/gm/createdTable.ts';
import { bodyOf, type HttpRequest } from '../../../../src/app/online/gm/account/http.ts';
import { GM_LEVEL } from '../../../../src/app/online/protocol/index.ts';

const TABLE = { code: 'b'.repeat(26), secret: 'n'.repeat(43), maxPlayers: 12, plan: 'beta' };

describe('the relay\'s answer to a table request', () => {
  it('is a table with its code, secret and seats when the account may host', () => {
    expect(readCreated(201, TABLE)).toEqual({ code: TABLE.code, secret: TABLE.secret, maxPlayers: 12 });
    expect(readCreated(201, { ...TABLE, maxPlayers: 2, plan: 'free' })).toMatchObject({ maxPlayers: 2 });
    expect(readCreated(201, { code: 'short', secret: TABLE.secret })).toBe('The server answered with something that is no table.');
  });

  it('is one sentence for each way the relay says no', () => {
    const answers: readonly (readonly [number, string, string])[] = [
      [401, 'signed-out', 'You were signed out. Running tables keep going.'],
      [403, 'no-access', 'Online play is in early access. Redeem an invite key on your account page.'],
      [403, 'access-ended', 'Your access to online play has ended. See your account page.'],
      [403, 'access-revoked', 'Your access to online play was withdrawn. See your account page.'],
      [403, 'account-restricted', 'Your account is restricted and cannot host online tables. See your account page.'],
      [403, 'terms-not-accepted', 'Accept the current Terms on your account page to host online tables.'],
      [403, 'something-new', 'This account may not host online tables now. See your account page.'],
      [409, 'link-taken', 'This campaign\'s link belongs to another account. Make a new link.'],
      [429, 'account-rate', 'Too many tries. Try again in a minute.'],
      [503, 'accounts-unreachable', 'Can’t reach Atlas sign-in right now.'],
      [503, 'not-configured', 'This server hosts no tables for Atlas accounts.'],
      [503, 'try again', 'The server could not create a table. Try again in a moment.'],
      [500, 'boom', 'The server could not create a table (500).'],
    ];
    for (const [status, error, sentence] of answers) expect(readCreated(status, { error }), error).toBe(sentence);
    // No two answers the relay tells apart read alike.
    expect(new Set(answers.map(([, , sentence]) => sentence)).size).toBe(answers.length);
    // An answer without a body still says something.
    expect(readCreated(403, null)).toBe('This account may not host online tables now. See your account page.');
  });

  it('is asked for with the account\'s token in the header and the campaign\'s link as JSON, and a server that cannot be reached is said so', async () => {
    const requests: HttpRequest[] = [];
    const link = 'c'.repeat(26);
    const created = await createTable((request) => {
      requests.push(request);
      return Promise.resolve({ status: 201, json: TABLE });
    }, 'https://play.atlas-vtt.dev', 'account-token', link);
    expect(created).toMatchObject({ code: TABLE.code });
    expect(requests).toEqual([{ url: 'https://play.atlas-vtt.dev/api/tables', method: 'POST', authorization: 'Bearer account-token', json: { code: link, gmLevel: GM_LEVEL } }]);
    expect(requests.map(bodyOf)).toEqual([{ body: `{"code":"${link}","gmLevel":${GM_LEVEL}}`, contentType: 'application/json' }]);
    expect(await createTable(() => Promise.resolve({ status: 403, json: { error: 'access-ended' } }), 'https://play.atlas-vtt.dev', 'account-token', link))
      .toEqual({ status: 403, message: 'Your access to online play has ended. See your account page.' });
    expect(await createTable(() => Promise.resolve({ status: 409, json: { error: 'link-taken' } }), 'https://play.atlas-vtt.dev', 'account-token', link))
      .toEqual({ status: 409, message: 'This campaign\'s link belongs to another account. Make a new link.' });
    expect(await createTable(() => Promise.reject(new Error('offline')), 'https://play.atlas-vtt.dev', 'account-token', link)).toEqual({ status: 0, message: 'The server could not be reached.' });
  });
});
