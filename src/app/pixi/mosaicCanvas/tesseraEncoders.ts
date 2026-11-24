import { startNodeFreeWorker, type WorkerLink } from '../../utils/nodeFreeWorker';
import type { EncoderSetup } from './tesseraEncoderProtocol';
import type { TesseraPort } from './tesseraPorts';
import EncoderWorker, { sharedWorker } from './tesseraEncoderWorker?worker&inline';

/**
 * The page's side of the tessera encoder workers: started when the tessera core's first build is
 * about to encode (`want-encoders`), their ports handed to it (`TesseraEncoderPool`), stopped with that core.
 * SharedWorkers, which start without Node in a few milliseconds and need no WebCodecs.
 */

export interface EncoderSet {
  /** One end of each encoder's channel, to transfer to the core. */
  ports: MessagePort[];
  stop(): void;
}

export function startTesseraEncoders(count: number): EncoderSet {
  const links: WorkerLink<EncoderSetup, never>[] = [];
  const ports: MessagePort[] = [];
  for (let index = 0; index < count; index++) {
    const options = { name: 'Atlas tessera encoder' };
    const link = startNodeFreeWorker<EncoderSetup, never>(() => sharedWorker(options), () => new EncoderWorker(options));
    // An encoder that does not start never answers the core's first message, which then never uses it.
    link.listen(() => undefined, () => undefined);
    const channel = new MessageChannel();
    link.post({ port: channel.port2 }, [channel.port2]);
    links.push(link);
    ports.push(channel.port1);
  }
  return { ports, stop: () => links.forEach((link) => link.stop()) };
}

/**
 * Gives each tessera core its own encoders, once it asks for them, and stops those of a core that
 * ended. Nothing is started where `start` is null.
 */
export class EncoderSupply {
  private told: TesseraPort | null = null;
  private running: EncoderSet | null = null;

  constructor(private readonly start: (() => EncoderSet) | null) {}

  tell(port: TesseraPort): void {
    if (!this.start || port === this.told) return;
    this.stop();
    this.told = port;
    const encoders = this.start();
    this.running = encoders;
    port.post({ type: 'encoders', ports: encoders.ports }, encoders.ports);
  }

  /** Stops the encoders of the core told last; the next core is given its own. */
  stop(): void {
    this.running?.stop();
    this.running = null;
    this.told = null;
  }
}
