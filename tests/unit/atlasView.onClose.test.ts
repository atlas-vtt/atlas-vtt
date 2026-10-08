import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/services/ServiceManager', () => ({
  ServiceManager: class ServiceManagerMock {}
}));

vi.mock('../../src/app/storeFactory', () => ({
  createViewAtlasStore: vi.fn()
}));

vi.mock('../../src/app/stores/tabMetaStore', () => ({
  createTabMetaStore: vi.fn()
}));

let AtlasView: any;

describe('AtlasView onClose', () => {
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  beforeAll(async () => {
    ({ AtlasView } = await import('../../src/app/atlas-view'));
  });

  afterEach(() => {
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('cleans up subscriptions, pending callbacks, and service resources', async () => {
    const mapLoadingUnsubscribe = vi.fn();
    const flushPendingSaves = vi.fn<() => Promise<void>>().mockResolvedValue();
    const resizeObserverDisconnect = vi.fn();
    const eventBusOff = vi.fn();
    const serviceManagerDestroy = vi.fn();
    const savePinnedPreviewStates = vi.fn();
    const stopTimersForClose = vi.fn();
    const cancelAnimationFrameSpy = vi.fn();
    const detachLeafFocusHandlers = vi.fn();
    const detachTabHeaderActivationHandler = vi.fn();

    globalThis.cancelAnimationFrame = cancelAnimationFrameSpy as unknown as typeof cancelAnimationFrame;

    const context: any = {
      isViewClosing: false,
      mapLoadingUnsubscribe,
      pendingViewportRestoreRaf: 123,
      flushPendingSaves,
      temporalCache: new Map([['t', { value: 1 }]]),
      viewportCache: new Map([['v', { value: 1 }]]),
      resizeObserver: { disconnect: resizeObserverDisconnect },
      detachLeafFocusHandlers,
      detachTabHeaderActivationHandler,
      _serviceManager: {
        getEventBus: () => ({ off: eventBusOff }),
        getNotePreviewUIManager: () => ({ savePinnedPreviewStates }),
        stopTimersForClose,
        destroy: serviceManagerDestroy
      }
    };

    await AtlasView.prototype.onClose.call(context);

    expect(mapLoadingUnsubscribe).toHaveBeenCalledTimes(1);
    // Pinned previews record their scroll and cursor before the final save
    expect(savePinnedPreviewStates.mock.invocationCallOrder[0]).toBeLessThan(flushPendingSaves.mock.invocationCallOrder[0]!);
    // Timers stop before the last save, which keeps the time they have left
    expect(stopTimersForClose.mock.invocationCallOrder[0]).toBeLessThan(flushPendingSaves.mock.invocationCallOrder[0]!);
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(123);
    expect(flushPendingSaves).toHaveBeenCalledTimes(1);
    expect(resizeObserverDisconnect).toHaveBeenCalledTimes(1);
    expect(detachLeafFocusHandlers).toHaveBeenCalledTimes(1);
    expect(detachTabHeaderActivationHandler).toHaveBeenCalledTimes(1);
    expect(serviceManagerDestroy).toHaveBeenCalledTimes(1);

    expect(context.isViewClosing).toBe(true);
    expect(context.mapLoadingUnsubscribe).toBeNull();
    expect(context.pendingViewportRestoreRaf).toBeNull();
    expect(context.resizeObserver).toBeNull();
    expect(context.temporalCache.size).toBe(0);
    expect(context.viewportCache.size).toBe(0);
  });

  it('returns early when close is already in progress', async () => {
    const flushPendingSaves = vi.fn<() => Promise<void>>().mockResolvedValue();
    const serviceManagerDestroy = vi.fn();
    const cancelAnimationFrameSpy = vi.fn();

    globalThis.cancelAnimationFrame = cancelAnimationFrameSpy as unknown as typeof cancelAnimationFrame;

    const context: any = {
      isViewClosing: true,
      mapLoadingUnsubscribe: vi.fn(),
      pendingViewportRestoreRaf: 55,
      flushPendingSaves,
      temporalCache: new Map([['t', { value: 1 }]]),
      viewportCache: new Map([['v', { value: 1 }]]),
      resizeObserver: { disconnect: vi.fn() },
      requestDrawingToolHandler: vi.fn(),
      _serviceManager: {
        getEventBus: () => ({ off: vi.fn() }),
        destroy: serviceManagerDestroy
      }
    };

    await AtlasView.prototype.onClose.call(context);

    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled();
    expect(flushPendingSaves).not.toHaveBeenCalled();
    expect(serviceManagerDestroy).not.toHaveBeenCalled();
    expect(context.pendingViewportRestoreRaf).toBe(55);
    expect(context.mapLoadingUnsubscribe).not.toBeNull();
  });
});
