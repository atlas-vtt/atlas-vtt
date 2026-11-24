/**
 * Entry of the grid detection worker that `SpectralEngineClient` runs, and of its helpers
 * (`FitHelpers`), which run single fits for it. Bundled inline into main.js by Vite.
 */

import { grayOfBitmap } from './detectGrid';
import type { MapGray } from './detectGrid';
import { detectionJobSteps, NO_GRID, runDetection } from './detectionJob';
import type { DetectionEvent, DetectionOutcome } from './detectionJob';
import { runFitsAhead } from './fitDrivers';
import type { FitRunner } from './fitDrivers';
import type { DetectionReply, DetectionRequest, FitAnswer, FitTask } from './detectionProtocol';
import type { GrayImage } from './grayImage';
import { fitRequested } from './proposalFits';

/** The image of the last job: a panel asks about one map many times, and its spectra are kept with it. */
let held: { key: number; gray: MapGray } | null = null;
/** As a helper: the image of the last fit. */
let helperImage: { key: number; image: GrayImage } | null = null;
/** Fits handed to helpers, by ticket. */
const handedOut = new Map<number, { resolve: (fit: FitAnswer) => void }>();
let nextTicket = 1;

/** Answers the client; the buffers in `transfer` are handed over, not copied. */
function post(reply: DetectionReply | FitAnswer, transfer: Transferable[] = []): void {
  self.postMessage(reply, { transfer });
}

function runFit({ ticket, imageKey, image, request }: FitTask): void {
  if (image) helperImage = { key: imageKey, image };
  try {
    if (helperImage?.key !== imageKey) throw new Error('The map image of this fit was never sent.');
    post({ ticket, fitted: fitRequested(helperImage.image, request) });
  } catch (error) {
    post({ ticket, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Runs a fit on a helper, through the client; where the helper fails, here. */
function helperRunner(id: number, image: GrayImage): FitRunner {
  return (request) => new Promise<FitAnswer>((resolve) => {
    const ticket = nextTicket++;
    handedOut.set(ticket, { resolve });
    post({ id, fit: { ticket, request } });
  }).then((answer) => ('error' in answer ? fitRequested(image, request) : answer.fitted));
}

/** Runs the job's fits here and on `helpers` helpers at once; with none, one after the other here. */
async function detect(gray: MapGray, data: DetectionRequest, emit: (event: DetectionEvent) => void): Promise<DetectionOutcome> {
  const { candidates, ink, lines, helpers, share, id } = data;
  const job = { gray, ink, lines, ...(candidates ? { candidates } : {}) };
  if (helpers <= 0) return runDetection(job, emit);
  if (share) post({ id, share: gray.image });
  // Started after the fits handed out, which the helpers work on meanwhile.
  const here: FitRunner = async (request) => {
    await Promise.resolve();
    return fitRequested(gray.image, request);
  };
  return runFitsAhead(detectionJobSteps(job, emit), [here, ...Array.from({ length: helpers }, () => helperRunner(id, gray.image))]);
}

async function answer(data: DetectionRequest): Promise<void> {
  const { id, imageKey, gray, picture } = data;
  try {
    if (gray) held = { key: imageKey, gray };
    if (picture) {
      // Read here, where it holds no frame of the window's.
      const read = grayOfBitmap(picture.bitmap, picture.size, new OffscreenCanvas(1, 1));
      held = read ? { key: imageKey, gray: read } : null;
      if (!read) {
        post({ id, outcome: NO_GRID });
        return;
      }
    }
    if (held?.key !== imageKey) throw new Error('The map image of this detection was never sent.');
    const outcome = await detect(held.gray, data, (event) => {
      post({ id, event }, event.type === 'ink' ? [event.ink.data.buffer] : []);
    });
    post({ id, outcome }, [...(outcome.hits ? [outcome.hits.buffer] : []), ...(outcome.lines ? [outcome.lines.data.buffer] : [])]);
  } catch (error) {
    post({ id, error: error instanceof Error ? error.message : String(error) });
  }
}

self.addEventListener('message', ({ data }: MessageEvent<DetectionRequest | FitTask | FitAnswer>) => {
  if ('request' in data) runFit(data);
  else if ('ticket' in data) {
    handedOut.get(data.ticket)?.resolve(data);
    handedOut.delete(data.ticket);
  } else void answer(data);
});
