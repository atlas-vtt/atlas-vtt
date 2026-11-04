// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gpus = vi.hoisted(() => [] as { dispose: ReturnType<typeof vi.fn> }[]);

vi.mock('../../../src/app/dice3d/DiceGpu', () => ({
  DiceGpu: class {
    readonly renderer = { shadowMap: {} };
    readonly environment = null;
    readonly dispose = vi.fn();
    constructor() {
      gpus.push(this);
    }
  },
}));

const { borrowStage, releaseStagePool, releaseStagePools, returnStage } = await import('../../../src/app/dice3d/stagePool');

describe('the dice context of a document', () => {
  beforeEach(() => {
    // jsdom has no canvas: a stage then shows nothing, and its maths still runs.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    releaseStagePools();
    gpus.length = 0;
    vi.restoreAllMocks();
  });

  it('is one for every stage of the document', () => {
    const first = borrowStage(document);
    const second = borrowStage(document);
    returnStage(first);
    borrowStage(document);
    expect(first.renderer).not.toBeNull();
    expect(second.renderer).not.toBeNull();
    expect(gpus).toHaveLength(1);
  });

  it('is one per document', () => {
    borrowStage(document);
    borrowStage(document.implementation.createHTMLDocument('popout'));
    expect(gpus).toHaveLength(2);
  });

  it('is given back when its window closes, and only its own', () => {
    const popout = document.implementation.createHTMLDocument('popout');
    borrowStage(document);
    borrowStage(popout);
    releaseStagePool(popout);
    expect(gpus[0]!.dispose).not.toHaveBeenCalled();
    expect(gpus[1]!.dispose).toHaveBeenCalledOnce();
  });

  it('is given back for every document when Atlas unloads, and made anew after', () => {
    borrowStage(document);
    borrowStage(document.implementation.createHTMLDocument('popout'));
    releaseStagePools();
    expect(gpus.every((gpu) => gpu.dispose.mock.calls.length === 1)).toBe(true);
    borrowStage(document);
    expect(gpus).toHaveLength(3);
  });
});
