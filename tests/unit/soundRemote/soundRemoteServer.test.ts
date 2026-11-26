// @vitest-environment jsdom
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodeHttpModule } from '@/app/soundRemote/nodeHttp';
import { REMOTE_HEADER } from '@/app/soundRemote/remoteProtocol';
import { SoundRemoteServer, type PairingPrompt } from '@/app/soundRemote/SoundRemoteServer';
import { fakeRemoteDirector, fakeTable, memoryRemoteSettings, remoteMood, withMusic } from '../../helpers/soundRemoteRig';

interface Answer {
  status: number;
  body: string;
}

const PORT = 47_900 + Math.floor(Math.random() * 90);
let server: SoundRemoteServer | null = null;

function call(method: string, path: string, options: { body?: unknown; headers?: Record<string, string>; token?: string } = {}): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { [REMOTE_HEADER]: '1', ...options.headers };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const request = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, (response) => {
      let body = '';
      response.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on('error', reject);
    request.end(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
}

/** Reads a server-sent stream until `count` events have come. */
function events(token: string, count: number): Promise<Array<{ event: string; data: unknown }>> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: PORT, path: '/v1/events', headers: { [REMOTE_HEADER]: '1', authorization: `Bearer ${token}` } }, (response) => {
      let text = '';
      response.on('data', (chunk: Buffer) => {
        text += chunk.toString();
        const blocks = text.split('\n\n').filter((block) => block.startsWith('event:'));
        if (blocks.length < count) return;
        request.destroy();
        resolve(blocks.slice(0, count).map((block) => {
          const [event, data] = block.split('\n');
          return { event: event.slice('event: '.length), data: JSON.parse(data.slice('data: '.length)) as unknown };
        }));
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function start(answer: boolean | 'never' = true) {
  const director = fakeRemoteDirector(withMusic());
  const settings = memoryRemoteSettings();
  settings.setEnabled(true);
  const tavern = remoteMood('tavern', 'Tavern');
  const prompts: Array<PairingPrompt & { client: string }> = [];
  const cancel = vi.fn();
  const table = fakeTable();
  server = new SoundRemoteServer({
    http: http as unknown as NodeHttpModule,
    port: PORT,
    director,
    moods: { moods: () => [tavern], mood: (id) => (id === 'tavern' ? tavern : null), onChange: () => () => undefined },
    table: table.table,
    settings,
    askToPair: (client) => {
      const prompt = { client, answer: answer === 'never' ? new Promise<boolean>(() => undefined) : Promise.resolve(answer), cancel };
      prompts.push(prompt);
      return prompt;
    },
    onListenError: (error) => { throw error; },
  });
  server.start();
  return { director, settings, prompts, cancel, table };
}

async function paired(): Promise<{ token: string } & ReturnType<typeof start>> {
  const rig = start(true);
  // Listening is asynchronous; the first call waits for it.
  await vi.waitFor(() => call('GET', '/v1/hello'));
  const answer = await call('POST', '/v1/pair', { body: { client: 'Stream Deck' } });
  return { ...rig, token: (JSON.parse(answer.body) as { token: string }).token };
}

afterEach(() => {
  server?.stop();
  server = null;
});

describe('the sound remote over HTTP', () => {
  it('answers hello, and refuses browsers and names made to point here', async () => {
    start();
    await vi.waitFor(() => call('GET', '/v1/hello'));
    expect(await call('GET', '/v1/hello')).toEqual({ status: 200, body: JSON.stringify({ app: 'atlas-vtt', api: 1 }) });
    expect((await call('GET', '/v1/hello', { headers: { origin: 'https://example.com' } })).status).toBe(403);
    expect((await call('GET', '/v1/hello', { headers: { 'sec-fetch-mode': 'cors' } })).status).toBe(403);
    expect((await call('GET', '/v1/hello', { headers: { host: `attacker.example:${PORT}` } })).status).toBe(403);
    expect((await call('GET', '/v1/hello', { headers: { [REMOTE_HEADER]: '' } })).status).toBe(403);
    expect((await call('GET', '/v1/nothing')).status).toBe(404);
  });

  it('pairs only once the GM allows it, and stores no token', async () => {
    const { token, settings, prompts } = await paired();
    expect(prompts.map((prompt) => prompt.client)).toEqual(['Stream Deck']);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(settings.get()).toMatchObject({ client: 'Stream Deck' });
    expect(JSON.stringify(settings.get())).not.toContain(token);
  });

  it('refuses a pairing the GM declines, and one while a prompt is open', async () => {
    start(false);
    await vi.waitFor(() => call('GET', '/v1/hello'));
    expect((await call('POST', '/v1/pair', { body: { client: 'Deck' } })).status).toBe(403);
    server?.stop();
    const { cancel } = start('never');
    await vi.waitFor(() => call('GET', '/v1/hello'));
    const first = new Promise<void>((resolve) => {
      const request = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: '/v1/pair', headers: { [REMOTE_HEADER]: '1', 'content-type': 'application/json' } });
      request.on('error', () => resolve());
      request.end(JSON.stringify({ client: 'Deck' }));
      // The controller gives up: its prompt goes with it.
      setTimeout(() => { request.destroy(); resolve(); }, 100);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await call('POST', '/v1/pair', { body: { client: 'Other' } })).status).toBe(409);
    await first;
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it('runs commands only for the paired token', async () => {
    const { token, director } = await paired();
    expect((await call('POST', '/v1/command', { body: { type: 'mood', id: 'tavern' } })).status).toBe(401);
    expect((await call('POST', '/v1/command', { body: { type: 'mood', id: 'tavern' }, token: 'f'.repeat(64) })).status).toBe(401);
    expect((await call('POST', '/v1/command', { body: { type: 'mood', id: 'tavern' }, token })).status).toBe(204);
    expect(director.press).toHaveBeenCalledOnce();
    expect((await call('POST', '/v1/command', { body: { type: 'mood', id: 'gone' }, token })).status).toBe(404);
    expect((await call('POST', '/v1/command', { body: { type: 'rm -rf' }, token })).status).toBe(400);
    expect((await call('POST', '/v1/command', { body: 'x'.repeat(5000), token })).status).toBe(413);
  });

  it('streams the moods and what plays, and ends the stream when the pairing is revoked', async () => {
    const { token, director, settings } = await paired();
    const [moods, state] = await events(token, 2);
    expect(moods).toMatchObject({ event: 'moods', data: [{ id: 'tavern', name: 'Tavern' }] });
    expect(state).toMatchObject({ event: 'state', data: { soundOn: true, playing: true, music: { track: 'Tavern song', levelDb: -4 } } });
    const later = events(token, 3);
    await new Promise((resolve) => setTimeout(resolve, 50));
    director.publish({ levels: { masterDb: -12, musicDb: 0, ambienceDb: 0 } });
    expect((await later)[2]).toMatchObject({ event: 'state', data: { levels: { masterDb: -12 } } });
    settings.revoke();
    expect((await call('GET', '/v1/state', { token })).status).toBe(401);
  });

  it('runs table commands while sound is off, refuses them with a reason, and pushes the fight at once', async () => {
    const { token, director, table } = await paired();
    director.isOn = false;
    const stream = events(token, 3);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await call('POST', '/v1/command', { body: { type: 'combat' }, token })).status).toBe(204);
    expect((await stream)[2]).toMatchObject({ event: 'state', data: { combat: { active: true, round: 1, combatants: 2, rolls: true }, player: { open: true, hidden: false } } });
    expect(table.state.startCombat).toHaveBeenCalledOnce();
    table.window.open = false;
    expect(await call('POST', '/v1/command', { body: { type: 'curtain' }, token })).toEqual({ status: 409, body: JSON.stringify({ error: 'no-player-window' }) });
    expect((await call('POST', '/v1/command', { body: { type: 'pause' }, token })).status).toBe(409);
  });
});
