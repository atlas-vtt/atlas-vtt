import { describe, expect, it } from 'vitest';
import { detectGridInImage, detectionSteps } from '../../../src/app/pixi/spectralEngine/detectGrid';
import type { DetectionWatch } from '../../../src/app/pixi/spectralEngine/detectGrid';
import { runFitsAhead } from '../../../src/app/pixi/spectralEngine/fitDrivers';
import type { FitRunner } from '../../../src/app/pixi/spectralEngine/fitDrivers';
import { fitRequested } from '../../../src/app/pixi/spectralEngine/proposalFits';
import type { GrayImage } from '../../../src/app/pixi/spectralEngine/grayImage';
import { printedMap } from './fixtures';

function recorder(): { watch: DetectionWatch; events: string[] } {
  const events: string[] = [];
  return { events, watch: { tried: (proposal) => events.push(JSON.stringify(proposal)), fitted: (fit) => events.push(JSON.stringify(fit)) } };
}

/** A runner that answers after a delay of its own for every fit, so fits started together end in another order. */
function delayedRunner(image: GrayImage, delays: number[], ran: string[]): FitRunner {
  let call = 0;
  return async (request) => {
    ran.push(JSON.stringify(request));
    await new Promise((resolve) => setTimeout(resolve, delays[call++ % delays.length]));
    return fitRequested(image, request);
  };
}

describe('runFitsAhead', () => {
  // Rows a tenth apart from regular: the first round settles nothing, so the second round and harmonics run too.
  const image = printedMap('hex-vertical', 40, 560, 420, { aspect: 1.1, icons: true });

  it('ends with the answer and the events of fitting one proposal after the other', async () => {
    const alone = recorder();
    const expected = detectGridInImage(image, undefined, alone.watch);
    const ahead = recorder();
    const ran: string[] = [];
    const runners = [delayedRunner(image, [9, 1, 5], ran), delayedRunner(image, [2, 8], ran), delayedRunner(image, [4, 0, 7, 3], ran)];

    const found = await runFitsAhead(detectionSteps(image, undefined, ahead.watch), runners);

    expect(found).toEqual(expected);
    expect(ahead.events).toEqual(alone.events);
    expect(new Set(ran).size).toBe(ran.length);
    expect(ran.length).toBeGreaterThanOrEqual(alone.events.filter((event) => event.includes('harmonicsLeft')).length);
  });

  it('fails where a fit it waits for fails', async () => {
    const failing: FitRunner = () => Promise.reject(new Error('worker gone'));
    await expect(runFitsAhead(detectionSteps(image), [failing])).rejects.toThrow('worker gone');
  });
});
