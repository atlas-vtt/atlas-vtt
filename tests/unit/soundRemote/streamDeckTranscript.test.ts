// @vitest-environment jsdom
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { Mood } from '@/app/sound/soundTypes';
import type { NodeHttpModule } from '@/app/soundRemote/nodeHttp';
import { REMOTE_HEADER } from '@/app/soundRemote/remoteProtocol';
import { SoundRemoteServer } from '@/app/soundRemote/SoundRemoteServer';
import { fakeRemoteDirector, fakeTable, memoryRemoteSettings, remoteMood, withMusic } from '../../helpers/soundRemoteRig';

/**
 * What a Stream Deck sends and hears, as one text: every command's answer, the events that follow it, a reconnect,
 * a second listener and a mood list change. A change to it is a change of the wire every paired controller reads.
 */

let PORT = 0;
/** Answer headers that say something about Atlas, not about Node's connection handling. */
const SHOWN_HEADERS = ['cache-control', 'connection', 'content-type', 'x-content-type-options'];

let server: SoundRemoteServer | null = null;
const streams: Stream[] = [];

afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
  server?.stop();
  server = null;
});

function headersOf(response: http.IncomingMessage): string {
  return SHOWN_HEADERS.filter((name) => response.headers[name] !== undefined).map((name) => `${name}: ${String(response.headers[name])}`).join('; ');
}

function call(method: string, path: string, body?: unknown, token?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { [REMOTE_HEADER]: '1' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const request = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, (response) => {
      let text = '';
      response.on('data', (chunk: Buffer) => { text += chunk.toString(); });
      response.on('end', () => resolve(`${response.statusCode ?? 0} [${headersOf(response)}] ${text}`));
    });
    request.on('error', reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** An event stream read as the bytes it brings, pings left out (they come every 15 s, whatever happens). */
class Stream {
  private text = '';
  private taken = 0;
  private request: http.ClientRequest | null = null;

  open(token: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.request = http.request({ host: '127.0.0.1', port: PORT, path: '/v1/events', headers: { [REMOTE_HEADER]: '1', authorization: `Bearer ${token}` } }, (response) => {
        response.on('data', (chunk: Buffer) => { this.text += chunk.toString(); });
        resolve(`${response.statusCode ?? 0} [${headersOf(response)}]`);
      });
      this.request.on('error', reject);
      this.request.end();
    });
  }

  /** Waits until the stream holds `marker`, and hands out what came since the last take. */
  async takeUntil(marker: string): Promise<string> {
    await waitUntil(() => this.text.indexOf(marker, this.taken) >= 0);
    const end = this.text.indexOf('\n\n', this.text.indexOf(marker, this.taken)) + 2;
    const taken = this.text.slice(this.taken, end);
    this.taken = end;
    return taken.replace(/: ping\n\n/g, '');
  }

  close(): void {
    this.request?.destroy();
  }
}

async function waitUntil(done: () => boolean): Promise<void> {
  for (let tries = 0; !done(); tries++) {
    if (tries > 400) throw new Error('The stream did not bring what was expected');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A port nothing on this computer listens on now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

function rig() {
  const director = fakeRemoteDirector(withMusic());
  // The director tells its listeners of every change it makes, the levels too
  const setLevels = director.setChannelLevels.getMockImplementation();
  director.setChannelLevels.mockImplementation((changes) => {
    setLevels?.(changes);
    director.publish({});
  });
  let moods: Mood[] = [remoteMood('tavern', 'Tavern'), remoteMood('storm', 'Storm')];
  const moodListeners = new Set<() => void>();
  const moodSource = {
    moods: (): readonly Mood[] => moods,
    mood: (id: string): Mood | null => moods.find((mood) => mood.id === id) ?? null,
    onChange: (listener: () => void): (() => void) => {
      moodListeners.add(listener);
      return () => moodListeners.delete(listener);
    },
  };
  const setMoods = (next: Mood[]): void => {
    moods = next;
    for (const listener of moodListeners) listener();
  };
  const settings = memoryRemoteSettings();
  settings.setEnabled(true);
  const table = fakeTable();
  server = new SoundRemoteServer({
    http: http as unknown as NodeHttpModule,
    port: PORT,
    director,
    moods: moodSource,
    table: table.table,
    settings,
    askToPair: () => ({ answer: Promise.resolve(true), cancel: () => undefined }),
    onListenError: (error) => { throw error; },
  });
  server.start();
  return { director, table, setMoods };
}

describe('the Stream Deck\'s wire', () => {
  it('stays byte for byte what paired controllers read', async () => {
    PORT = await freePort();
    const { director, table, setMoods } = rig();
    const lines: string[] = [];
    for (let tries = 0; ; tries++) {
      try {
        lines.push(`GET /v1/hello -> ${await call('GET', '/v1/hello')}`);
        break;
      } catch (error) {
        if (tries > 100) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const paired = await call('POST', '/v1/pair', { client: 'Stream Deck' });
    lines.push(`POST /v1/pair -> ${paired.replace(/[0-9a-f]{64}/, '<token>')}`);
    const token = (JSON.parse(paired.slice(paired.indexOf('] ') + 2)) as { token: string }).token;

    let marks = 0;
    /** Makes the state say something new and reads the stream up to it: what came before it came of the step. */
    const settle = async (stream: Stream): Promise<string> => {
      marks += 1;
      const masterDb = -100 - marks;
      director.publish({ levels: { ...director.snapshot().levels, masterDb } });
      return stream.takeUntil(`"masterDb":${masterDb},`);
    };

    const first = new Stream();
    streams.push(first);
    lines.push(`GET /v1/events -> ${await first.open(token)}`, await first.takeUntil('event: state'));
    lines.push(`GET /v1/state -> ${await call('GET', '/v1/state', undefined, token)}`);

    const command = async (body: unknown, before?: () => void): Promise<void> => {
      before?.();
      lines.push(`POST /v1/command ${JSON.stringify(body)} -> ${await call('POST', '/v1/command', body, token)}`, await settle(first));
    };
    for (const body of [
      { type: 'mood', id: 'tavern' },
      { type: 'mood', id: 'gone' },
      { type: 'nextMood' },
      { type: 'stopAll' },
      { type: 'pause' },
      { type: 'nextTrack' },
      { type: 'previousTrack' },
      { type: 'shuffle' },
      { type: 'repeat' },
      { type: 'muteMusic' },
      { type: 'level', channel: 'master', deltaDb: -3 },
      { type: 'level', channel: 'master', db: -10 },
      { type: 'level', channel: 'master', reset: true },
      { type: 'level', channel: 'music', deltaDb: 2 },
      { type: 'level', channel: 'musicStrip', db: -5 },
      { type: 'level', channel: 'ambience', deltaDb: 1 },
      { type: 'combat' },
      { type: 'rollInitiative' },
      { type: 'combat' },
      { type: 'present' },
      { type: 'freeze' },
      { type: 'curtain' },
      { type: 'curtain' },
      { type: 'freeze' },
      { type: 'takeBackHandout' },
      { type: 'showHoveredImage' },
      { type: 'roll', id: 'attack' },
      { type: 'roll', id: 'nothing' },
      { type: 'shareRolls' },
      { type: 'rm -rf' },
    ]) await command(body);
    await command({ type: 'takeBackHandout' }, () => { table.window.handout = true; });
    await command({ type: 'showHoveredImage' }, () => { table.window.hoveringImage = true; });
    await command({ type: 'freeze' }, () => { table.window.trueScale = true; });
    await command({ type: 'freeze' }, () => { table.window.open = false; });
    await command({ type: 'curtain' });
    await command({ type: 'pause' }, () => { director.isOn = false; });
    await command({ type: 'combat' });
    lines.push(`POST /v1/command "x" -> ${await call('POST', '/v1/command', 'x', token)}`);
    director.isOn = true;

    lines.push('-- a mood list change');
    setMoods([remoteMood('storm', 'Storm')]);
    lines.push(await settle(first));

    lines.push('-- a second listener: both hear everything');
    const second = new Stream();
    streams.push(second);
    lines.push(`GET /v1/events -> ${await second.open(token)}`, await second.takeUntil('event: state'), await first.takeUntil('event: state'));

    lines.push('-- a reconnect');
    first.close();
    second.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const third = new Stream();
    streams.push(third);
    lines.push(`GET /v1/events -> ${await third.open(token)}`, await third.takeUntil('event: state'), await settle(third));

    await expect(lines.join('\n')).toMatchFileSnapshot('./__snapshots__/streamDeckTranscript.txt');
  }, 30_000);
});
