import type { NodeResponse } from './nodeHttp';
import type { RemoteMood, RemoteState } from './remoteProtocol';

/** A list goes on through its tracks with nobody telling the director, so the track's name is looked at this often. */
const LOOK_EVERY_MS = 1000;
/** Keeps a stream from being closed as idle by anything in between. */
const PING_EVERY_MS = 15_000;

export interface FeedSource {
  moods(): RemoteMood[];
  state(): RemoteState;
}

/**
 * The remote's live stream (server-sent events): `moods` when the moods change, `state` when what plays
 * does or the table (the GM's fight, the player window) changed. Each is sent whole, and only when its text
 * changed, so a director that publishes often costs a comparison. It looks only while a controller listens.
 */
export class RemoteFeed {
  private readonly clients = new Set<NodeResponse>();
  private sentMoods = '';
  private sentState = '';
  private looking = 0;
  private pinging = 0;

  constructor(private readonly source: FeedSource) {}

  moods(): RemoteMood[] { return this.source.moods(); }

  state(): RemoteState { return this.source.state(); }

  open(response: NodeResponse): void {
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    this.clients.add(response);
    response.on('close', () => {
      this.clients.delete(response);
      if (this.clients.size === 0) this.idle();
    });
    this.sentMoods = JSON.stringify(this.source.moods());
    this.sentState = JSON.stringify(this.source.state());
    // A new listener hears everything at once; the others hear it again, which changes nothing for them.
    this.broadcast('moods', this.sentMoods);
    this.broadcast('state', this.sentState);
    if (!this.looking) {
      this.looking = window.setInterval(() => this.changed(), LOOK_EVERY_MS);
      this.pinging = window.setInterval(() => this.write(': ping\n\n'), PING_EVERY_MS);
    }
  }

  /** The moods, read only when the mood store says they changed: crests make the list large. */
  moodsChanged(): void {
    if (this.clients.size === 0) return;
    const moods = JSON.stringify(this.source.moods());
    if (moods === this.sentMoods) return;
    this.sentMoods = moods;
    this.broadcast('moods', moods);
  }

  changed(): void {
    if (this.clients.size === 0) return;
    const state = JSON.stringify(this.source.state());
    if (state !== this.sentState) {
      this.sentState = state;
      this.broadcast('state', state);
    }
  }

  closeAll(): void {
    for (const client of [...this.clients]) client.end();
    this.clients.clear();
    this.idle();
  }

  private broadcast(event: string, data: string): void {
    this.write(`event: ${event}\ndata: ${data}\n\n`);
  }

  private write(text: string): void {
    for (const client of this.clients) if (!client.writableEnded) client.write(text);
  }

  private idle(): void {
    window.clearInterval(this.looking);
    window.clearInterval(this.pinging);
    this.looking = 0;
    this.pinging = 0;
  }
}
