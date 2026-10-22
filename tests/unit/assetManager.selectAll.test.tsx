// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useSelectionHandlers, type VisibleIds } from '../../src/app/packages/components/asset-manager/hooks/useSelectionHandlers';

const visible = { current: { assets: ['a1', 'a2'], folders: [] } as VisibleIds };

function pressSelectAll(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
}

afterEach(() => {
  cleanup();
  document.body.empty();
});

it('selects every visible asset with Mod+A', () => {
  const { result } = renderHook(() => useSelectionHandlers(visible, [], 'tokens', true));

  const event = pressSelectAll(document.body);

  expect(result.current.selectedAssetIds).toEqual(['a1', 'a2']);
  expect(event.defaultPrevented).toBe(true);
});

it.each([
  ['a rename field', (): HTMLElement => document.body.createEl('input', { type: 'text' })],
  ['a text area', (): HTMLElement => document.body.createEl('textarea')],
  ['an editable element', (): HTMLElement => document.body.createDiv({ attr: { contenteditable: 'true' } }).createSpan()],
])('leaves Mod+A to %s, which selects its own text', (_, field) => {
  const { result } = renderHook(() => useSelectionHandlers(visible, [], 'tokens', true));

  const event = pressSelectAll(field());

  expect(result.current.selectedAssetIds).toEqual([]);
  expect(event.defaultPrevented).toBe(false);
});
