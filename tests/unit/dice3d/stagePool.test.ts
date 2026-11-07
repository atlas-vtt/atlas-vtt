// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrowStage, releaseStagePool, releaseStagePools, returnStage, warmStages } from '../../../src/app/dice3d/stagePool';

describe('stagePool', () => {
  beforeEach(() => {
    // jsdom has no WebGL; silence three's report of the missing context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    releaseStagePools();
    vi.restoreAllMocks();
  });

  it('creates a hidden canvas in the requested document, without a renderer where WebGL is missing', () => {
    const lease = borrowStage(document);
    expect(lease.renderer).toBeNull();
    expect(lease.canvas.ownerDocument).toBe(document);
    expect(lease.canvas.classList.contains('atlas-dice-stage__canvas')).toBe(true);
    expect(lease.canvas.getAttribute('aria-hidden')).toBe('true');
  });

  it('reuses a returned stage for the same document', () => {
    const lease = borrowStage(document);
    document.body.appendChild(lease.canvas);
    returnStage(lease);
    expect(lease.canvas.isConnected).toBe(false);
    expect(borrowStage(document)).toBe(lease);
    expect(borrowStage(document)).not.toBe(lease);
  });

  it('takes no stage back into a pool that was given back', () => {
    const lease = borrowStage(document);
    document.body.appendChild(lease.canvas);
    releaseStagePool(document);
    returnStage(lease);
    expect(lease.canvas.isConnected).toBe(false);
    expect(borrowStage(document)).not.toBe(lease);
  });

  it('keeps a separate pool per document', () => {
    const popout = document.implementation.createHTMLDocument('popout');
    const lease = borrowStage(document);
    returnStage(lease);

    const other = borrowStage(popout);
    expect(other).not.toBe(lease);
    expect(other.canvas.ownerDocument).toBe(popout);
    expect(borrowStage(document)).toBe(lease);
  });

  describe('warming', () => {
    /** How many stages were ever built: each one adopts its canvas into its document. */
    const built = (): number =>
      vi.mocked(document.adoptNode).mock.calls.filter(([node]) => node instanceof HTMLElement && node.classList.contains('atlas-dice-stage__canvas')).length;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(document, 'adoptNode');
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('builds the stages a document needs before the first roll asks for one', async () => {
      warmStages(document, Promise.resolve());
      expect(built()).toBe(0);
      await vi.runAllTimersAsync();
      expect(built()).toBe(4);

      // As many rolls as stand at once, and one fading out, find their stages waiting; only one more is built on demand.
      borrowStage(document);
      borrowStage(document);
      borrowStage(document);
      borrowStage(document);
      expect(built()).toBe(4);
      borrowStage(document);
      expect(built()).toBe(5);
    });

    it('builds nothing while dice are on a stage, and catches up when it comes back', async () => {
      const lease = borrowStage(document);
      expect(built()).toBe(1);
      warmStages(document, Promise.resolve());
      await vi.advanceTimersByTimeAsync(5000);
      expect(built()).toBe(1);

      returnStage(lease);
      await vi.runAllTimersAsync();
      expect(built()).toBe(4);
    });

    it('warms a document once', async () => {
      warmStages(document, Promise.resolve());
      warmStages(document, Promise.resolve());
      await vi.runAllTimersAsync();
      expect(built()).toBe(4);
    });

    it('builds nothing more for a pool that was given back', async () => {
      warmStages(document, Promise.resolve());
      await vi.advanceTimersByTimeAsync(600);
      expect(built()).toBe(1);
      releaseStagePool(document);
      await vi.runAllTimersAsync();
      expect(built()).toBe(1);
    });
  });
});
