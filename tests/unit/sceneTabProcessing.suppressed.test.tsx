// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SceneTabProcessing } from '../../src/app/react/components/SceneTabProcessing';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { sceneTabProcessing } from '../mocks/sceneTabProcessing';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('closes a processing tooltip on suppression while keeping progress visible and allows a fresh hover afterwards', async () => {
  vi.useFakeTimers();
  const source = sceneTabProcessing('Maps/Processing suppression.atlasmap');
  source.progress(25);
  const value = { app: source.app } as AtlasUIContextValue;
  const component = (suppressed: boolean): React.ReactElement => (
    <AtlasUIContext.Provider value={value}>
      <SceneTabProcessing scenePath="Maps/Processing suppression.atlasmap" suppressed={suppressed} />
    </AtlasUIContext.Provider>
  );
  try {
    const { container, rerender } = render(component(false));
    await act(async () => { await Promise.resolve(); });
    const ring = container.querySelector('.atlas-scene-tab__processing')!;
    const hover = async (type = 'pointermove'): Promise<void> => {
      const event = new MouseEvent(type, { bubbles: true, relatedTarget: document.body });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      await act(async () => { ring.dispatchEvent(event); await vi.advanceTimersByTimeAsync(300); });
    };
    await hover();
    expect(screen.getByRole('tooltip').textContent).toContain('25%');

    rerender(component(true));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => source.progress(50));
    await hover();
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(ring.querySelector('.atlas-processing-ring__fill')?.getAttribute('stroke-dashoffset')).toBe('50');

    rerender(component(false));
    await hover('pointerout');
    await hover();
    expect(screen.getByRole('tooltip').textContent).toContain('50%');
  } finally {
    cleanup();
    source.dispose();
  }
});
