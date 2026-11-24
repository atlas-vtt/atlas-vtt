import type { App } from 'obsidian';
import { assemblePrebuild, splitPrebuild, type PrebuiltScene } from '../../../vision/prebuild/prebuildParts';
import type { PrebuildReply, PrebuildRequest } from '../../../vision/prebuild/scenePrebuild';
import type { PrebuildAnswer, PrebuildMessage } from './scenePrebuildWorker';
import PrebuildWorker, { sharedWorker } from './scenePrebuildWorker?worker&inline';
import { startNodeFreeWorker, type WorkerLink } from '../../../utils/nodeFreeWorker';

/** Workers by the cores the device has: one on two cores, at most three (the main thread loads the rest of the scene meanwhile). */
function workerCount(): number {
  return Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
}

/** One worker and the jobs it still owes. */
class PrebuildPort {
  private worker: WorkerLink<PrebuildMessage, PrebuildAnswer> | null = null;
  private readonly pending = new Map<number, (reply: PrebuildReply | null) => void>();
  private nextId = 1;

  constructor(private readonly create: () => WorkerLink<PrebuildMessage, PrebuildAnswer>) {}

  start(): boolean {
    if (this.worker) return true;
    try {
      const worker = this.create();
      worker.listen((answer) => this.answer(answer), () => this.stop());
      this.worker = worker;
      return true;
    } catch (error) {
      console.warn('[ScenePrebuildClient] A scene lighting worker could not start:', error);
      return false;
    }
  }

  run(request: PrebuildRequest): Promise<PrebuildReply | null> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      const message: PrebuildMessage = { id, request };
      worker.post(message);
    });
  }

  /** Ends the worker and answers what it still owed with null; the next job starts another. */
  stop(): void {
    this.worker?.stop();
    this.worker = null;
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
  }

  private answer(answer: PrebuildAnswer): void {
    if (!answer.reply) console.warn('[ScenePrebuildClient] Tracing the scene failed in a worker:', answer.message);
    this.pending.get(answer.id)?.(answer.reply);
    this.pending.delete(answer.id);
  }
}

/**
 * The window's side of the scene prebuild workers, a few per app: they trace a loading scene's
 * light reaches and sight (`SceneModelBuilder.prepare`), each a share of its lights and tokens,
 * while the main thread loads the rest. A share whose worker fails or cannot start answers
 * null; the scene's build then traces it on the main thread as ever. The workers start with the
 * first scene that needs them and stay: started with every view instead, their code loading on
 * three threads at once slowed the opening of light scenes that never use them.
 */
export class ScenePrebuildClient {
  private static readonly instances = new WeakMap<App, ScenePrebuildClient>();

  static forApp(app: App): ScenePrebuildClient {
    let client = ScenePrebuildClient.instances.get(app);
    if (!client) {
      const options = { name: 'Atlas scene lighting' };
      client = new ScenePrebuildClient(workerCount(), () => startNodeFreeWorker(() => sharedWorker(options), () => new PrebuildWorker(options)));
      ScenePrebuildClient.instances.set(app, client);
    }
    return client;
  }

  /** Stops the workers; called when the plugin unloads. */
  static release(app: App): void {
    ScenePrebuildClient.instances.get(app)?.dispose();
    ScenePrebuildClient.instances.delete(app);
  }

  private readonly ports: PrebuildPort[];
  private disposed = false;

  constructor(count: number, create: () => WorkerLink<PrebuildMessage, PrebuildAnswer>) {
    this.ports = Array.from({ length: count }, () => new PrebuildPort(create));
  }

  async compute(request: PrebuildRequest): Promise<PrebuiltScene | null> {
    const ports = this.started();
    if (ports.length === 0) return null;
    const split = splitPrebuild(request, ports.length);
    const replies = await Promise.all(split.parts.map((part, i) => ports[i]!.run(part)));
    return assemblePrebuild(request, split, replies);
  }

  dispose(): void {
    this.disposed = true;
    for (const port of this.ports) port.stop();
  }

  private started(): PrebuildPort[] {
    return this.disposed ? [] : this.ports.filter((port) => port.start());
  }
}
