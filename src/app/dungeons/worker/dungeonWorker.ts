import { runDungeonJob, type DungeonWorkerMessage, type DungeonWorkerReply } from './dungeonJob';

/**
 * Entry of the dungeon worker that `DungeonWorkerClient` runs, bundled inline into main.js by
 * Vite. Jobs run one at a time, in the order they arrive.
 */

function reply(response: DungeonWorkerReply): void {
  const transfer = response.ok && response.result.image.type === 'bitmap' ? [response.result.image.bitmap] : [];
  self.postMessage(response, { transfer });
}

self.addEventListener('message', (event: MessageEvent<DungeonWorkerMessage>) => {
  const { id, job } = event.data;
  runDungeonJob(job).then(
    (result) => reply({ id, ok: true, result }),
    (error: unknown) => reply({ id, ok: false, message: error instanceof Error ? error.message : 'Could not draw the dungeon.' }),
  );
});
