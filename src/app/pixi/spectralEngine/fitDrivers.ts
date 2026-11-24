/** Running a detection's fits (`FitSteps`). */

import type { GrayImage } from './grayImage';
import { fitRequested } from './proposalFits';
import type { FitSteps } from './proposalFits';

/** Runs `steps` to their end, each fit on this thread when it is asked for. */
export function runFits<T>(image: GrayImage, steps: FitSteps<T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next(fitRequested(image, step.value.request));
  return step.value;
}

