import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STAGGER_MS } from '../../src/app/packages/components/toolbar/editor/editorMotion';
import { slotChange, useLayoutMotion, type ToolbarMotion } from '../../src/app/packages/components/toolbar/useLayoutMotion';
import { useChangedSinceCommit } from '../../src/app/packages/components/toolbar/useSlotPresence';
import { resolveToolbarLayout, type ToolbarLayout } from '../../src/app/toolbar/toolbarLayout';

const DEFAULT = resolveToolbarLayout({});

describe('the toolbar layout\'s motion', () => {
  it('counts only new layouts, and labels a change the editor announced', () => {
    const { result, rerender } = renderHook(({ layout }: { layout: ToolbarLayout }) => useLayoutMotion(layout), { initialProps: { layout: DEFAULT } });
    expect(result.current.motion).toEqual({ revision: 0, cause: 'other', flipped: [] });

    rerender({ layout: DEFAULT });
    expect(result.current.motion.revision).toBe(0);

    act(() => result.current.expect('hide'));
    rerender({ layout: resolveToolbarLayout({ hidden: ['fog'] }) });
    expect(result.current.motion).toEqual({ revision: 1, cause: 'hide', flipped: ['fog'] });

    // A change nobody announced here: another view's, or one from Atlas' settings.
    rerender({ layout: resolveToolbarLayout({ hidden: ['fog', 'loot', 'move'] }) });
    expect(result.current.motion).toEqual({ revision: 2, cause: 'other', flipped: ['move', 'loot'] });
  });

  it('staggers what a reset brings back, in layout order, and nothing else', () => {
    const reset: ToolbarMotion = { revision: 3, cause: 'reset', flipped: ['fog', 'pin', 'loot'] };
    expect(['fog', 'pin', 'loot', 'move'].map(id => slotChange(reset, id, true).delayMs)).toEqual([0, STAGGER_MS, 2 * STAGGER_MS, 0]);
    expect(slotChange({ ...reset, cause: 'show' }, 'loot', true)).toEqual({ animate: true, delayMs: 0 });
  });

  it('tells a value that changed since the last committed render', () => {
    const { result, rerender } = renderHook(({ value }: { value: number }) => useChangedSinceCommit(value), { initialProps: { value: 1 } });
    expect(result.current).toBe(false);
    rerender({ value: 2 });
    expect(result.current).toBe(true);
    rerender({ value: 2 });
    expect(result.current).toBe(false);
  });
});
