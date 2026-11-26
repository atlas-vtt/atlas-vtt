import type { RemoteControl } from '../remoteControl';
import { parseRemoteCommand } from '../remoteProtocol';
import { bearerToken, newRemoteToken, remoteTokenHash, requestRefusal, sameHash } from './remoteAccess';
import { RemoteEvents } from './remoteEvents';
import { MAX_REMOTE_BODY, parseClientName, REMOTE_API_VERSION, type RemoteHello } from './remoteHttp';
import type { RemoteSettingsStore } from './remoteSettings';
import type { NodeHttpModule, NodeRequest, NodeResponse, NodeServer } from './nodeHttp';

/** What a pairing prompt gives back: the GM's answer, and a way to take the prompt away. */
export interface PairingPrompt {
  answer: Promise<boolean>;
  cancel(): void;
}

export interface SoundRemoteDeps {
  http: NodeHttpModule;
  port: number;
  /** Runs the commands and hands out the state; whoever made it disposes of it. */
  control: RemoteControl;
  settings: RemoteSettingsStore;
  askToPair(client: string): PairingPrompt;
  /** The port could not be opened (another program holds it). */
  onListenError(error: unknown): void;
}

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

class BodyTooLarge extends Error {}

function send(response: NodeResponse, status: number, body?: object, close = false): void {
  if (response.headersSent || response.writableEnded) return;
  response.writeHead(status, close ? { ...HEADERS, Connection: 'close' } : HEADERS);
  response.end(body ? JSON.stringify(body) : undefined);
}

function readJson(request: NodeRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_REMOTE_BODY) {
        // Answered with 413 and the connection closed; nothing more is read.
        request.pause();
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', () => reject(new Error('Request failed')));
    request.on('end', () => {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        resolve(JSON.parse(new TextDecoder().decode(bytes)));
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * The sound remote over HTTP on 127.0.0.1: lets a paired controller (the Atlas Stream Deck plugin) run the
 * control's commands, and pushes the control's state as server-sent events so its keys light up. It owns the
 * routes, the pairing and the token, and holds no sound or table state of its own.
 */
export class SoundRemoteServer {
  private server: NodeServer | null = null;
  private readonly events: RemoteEvents;
  private pairing: PairingPrompt | null = null;
  private readonly stops: Array<() => void> = [];

  constructor(private readonly deps: SoundRemoteDeps) {
    this.events = new RemoteEvents(deps.control);
  }

  start(): void {
    const { deps } = this;
    const server = deps.http.createServer((request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        console.error('[Atlas] The sound remote failed to answer a request', error);
        send(response, 500, { error: 'failed' });
      });
    });
    server.on('error', (error) => deps.onListenError(error));
    server.listen(deps.port, '127.0.0.1', () => undefined);
    this.server = server;
    let trusted = deps.settings.get().tokenHash;
    // A revoked or replaced token ends the streams it opened; their reconnect is refused.
    this.stops.push(deps.settings.onChange(() => {
      if (deps.settings.get().tokenHash === trusted) return;
      trusted = deps.settings.get().tokenHash;
      this.events.closeAll();
    }));
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.pairing?.cancel();
    this.events.closeAll();
    this.server?.closeAllConnections?.();
    this.server?.close();
    this.server = null;
  }

  private async handle(request: NodeRequest, response: NodeResponse): Promise<void> {
    const refusal = requestRefusal(request.headers, this.deps.port);
    if (refusal) {
      send(response, 403, { error: refusal });
      return;
    }
    const route = `${request.method ?? ''} ${(request.url ?? '').split('?')[0]}`;
    if (route === 'GET /v1/hello') {
      const hello: RemoteHello = { app: 'atlas-vtt', api: REMOTE_API_VERSION };
      send(response, 200, hello);
      return;
    }
    if (route === 'POST /v1/pair') {
      await this.pair(request, response);
      return;
    }
    if (route !== 'GET /v1/events' && route !== 'GET /v1/state' && route !== 'POST /v1/command') {
      send(response, 404, { error: 'not-found' });
      return;
    }
    if (!(await this.authorised(request))) {
      send(response, 401, { error: 'not-paired' });
      return;
    }
    if (route === 'GET /v1/events') this.events.open(response);
    else if (route === 'GET /v1/state') send(response, 200, { moods: this.deps.control.moods(), state: this.deps.control.state() });
    else await this.command(request, response);
  }

  private async authorised(request: NodeRequest): Promise<boolean> {
    const token = bearerToken(request.headers);
    const stored = this.deps.settings.get().tokenHash;
    return token !== null && stored !== null && sameHash(await remoteTokenHash(token), stored);
  }

  private async body(request: NodeRequest, response: NodeResponse): Promise<unknown> {
    if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) {
      send(response, 415, { error: 'json-only' });
      return undefined;
    }
    try {
      return await readJson(request);
    } catch (error) {
      send(response, error instanceof BodyTooLarge ? 413 : 400, { error: 'body' }, true);
      return undefined;
    }
  }

  private async command(request: NodeRequest, response: NodeResponse): Promise<void> {
    const body = await this.body(request, response);
    if (body === undefined) return;
    const command = parseRemoteCommand(body);
    if (!command) {
      send(response, 400, { error: 'unknown-command' });
      return;
    }
    const refused = this.deps.control.run(command);
    if (refused) {
      send(response, refused === 'no-mood' ? 404 : 409, { error: refused });
      return;
    }
    send(response, 204);
  }

  /** One prompt at a time; the token is made only once the GM allowed it, and replaces the one before. */
  private async pair(request: NodeRequest, response: NodeResponse): Promise<void> {
    const body = await this.body(request, response);
    if (body === undefined) return;
    const client = parseClientName(body);
    if (!client) {
      send(response, 400, { error: 'client' });
      return;
    }
    if (this.pairing) {
      send(response, 409, { error: 'busy' });
      return;
    }
    const prompt = this.deps.askToPair(client);
    this.pairing = prompt;
    // A controller that gave up takes its prompt with it.
    response.on('close', () => {
      if (!response.writableEnded) prompt.cancel();
    });
    try {
      if (!(await prompt.answer) || response.writableEnded) {
        send(response, 403, { error: 'denied' });
        return;
      }
      const token = newRemoteToken();
      this.deps.settings.pair(await remoteTokenHash(token), client);
      send(response, 200, { token });
    } finally {
      this.pairing = null;
    }
  }
}
