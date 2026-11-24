import { serveWorker } from '../../../utils/nodeFreeWorker';
import { prebuildScene, type PrebuildReply, type PrebuildRequest } from '../../../vision/prebuild/scenePrebuild';

/** A job of the scene prebuild worker that `ScenePrebuildClient` runs, bundled inline into main.js by Vite. */
export interface PrebuildMessage {
  id: number;
  request: PrebuildRequest;
}

export type PrebuildAnswer = { id: number; reply: PrebuildReply } | { id: number; reply: null; message: string };

serveWorker<PrebuildMessage>(({ id, request }, reply) => {
  let answer: PrebuildAnswer;
  try {
    answer = { id, reply: prebuildScene(request) };
  } catch (error) {
    answer = { id, reply: null, message: error instanceof Error ? error.message : String(error) };
  }
  reply(answer, answer.reply ? [answer.reply.polygons.coords.buffer, answer.reply.polygons.starts.buffer, answer.reply.reaches.buffer, answer.reply.parts.buffer, answer.reply.reflections.buffer, answer.reply.areas.buffer] : []);
});
