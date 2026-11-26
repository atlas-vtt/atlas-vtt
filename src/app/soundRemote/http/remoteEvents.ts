import type { RemoteControl, RemoteWatch } from '../remoteControl';
import type { NodeResponse } from './nodeHttp';

/** Keeps a stream from being closed as idle by anything in between. */
const PING_EVERY_MS = 15_000;

/**
 * The remote's live stream (server-sent events): `moods` when the moods change, `state` when what plays
 * does or the table (the GM's fight, the player window) changed, each sent whole as the control hands it out.
 * One watch serves every listener, and runs only while one listens.
 */
export class RemoteEvents {
  private readonly clients = new Set<NodeResponse>();
  private watch: RemoteWatch | null = null;
  private pinging = 0;

  constructor(private readonly control: Pick<RemoteControl, 'watch'>) {}

  open(response: NodeResponse): void {
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    this.clients.add(response);
    response.on('close', () => {
      this.clients.delete(response);
      if (this.clients.size === 0) this.idle();
    });
    // A new listener hears everything at once; the others hear it again, which changes nothing for them.
    if (this.watch) this.watch.resend();
    else this.watch = this.control.watch((change) => this.write(`event: ${change.kind}\ndata: ${change.json}\n\n`));
    if (!this.pinging) this.pinging = window.setInterval(() => this.write(': ping\n\n'), PING_EVERY_MS);
  }

  closeAll(): void {
    for (const client of [...this.clients]) client.end();
    this.clients.clear();
    this.idle();
  }

  private write(text: string): void {
    for (const client of this.clients) if (!client.writableEnded) client.write(text);
  }

  private idle(): void {
    this.watch?.stop();
    this.watch = null;
    window.clearInterval(this.pinging);
    this.pinging = 0;
  }
}
