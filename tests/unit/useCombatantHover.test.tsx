// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombatantHover } from '../../src/app/react/components/useCombatantHover';

function List({ blocked = false }: { blocked?: boolean }): React.ReactElement {
  const { hover, listHandlers } = useCombatantHover(blocked);
  return (
    <div>
      <output>{hover?.id ?? 'none'}</output>
      <div data-testid="list" {...listHandlers}>
        <div className="atlas-initiative-card" data-turn-key="a">A</div>
        <div className="atlas-initiative-card" data-turn-key="b">B</div>
      </div>
    </div>
  );
}

// jsdom has no PointerEvent: a mouse event carries the keys held and the kind of pointer
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? '';
  }
}

const shown = (): string | null => document.querySelector('output')?.textContent ?? null;
const over = (text: string, init: PointerEventInit = {}): void => {
  fireEvent.pointerOver(document.body.querySelector(`[data-turn-key="${text}"]`)!, { pointerType: 'mouse', ...init });
};

describe('useCombatantHover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', TestPointerEvent);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens after a moment, then follows the pointer from card to card at once', () => {
    render(<List />);
    over('a');
    expect(shown()).toBe('none');
    act(() => vi.advanceTimersByTime(400));
    expect(shown()).toBe('a');
    over('b');
    expect(shown()).toBe('b');
  });

  it('goes at once for a key, such as Ctrl or Cmd for the statblock, and stays away from that card', () => {
    render(<List />);
    over('a');
    act(() => vi.advanceTimersByTime(400));
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    expect(shown()).toBe('none');
    act(() => vi.advanceTimersByTime(1000));
    expect(shown()).toBe('none');
  });

  it('stays away from a card the pointer comes to with Ctrl or Cmd held, and while blocked', () => {
    const { rerender } = render(<List />);
    over('a', { ctrlKey: true });
    act(() => vi.advanceTimersByTime(400));
    expect(shown()).toBe('none');
    over('b');
    act(() => vi.advanceTimersByTime(400));
    expect(shown()).toBe('b');
    rerender(<List blocked />);
    expect(shown()).toBe('none');
  });

  it('closes as the pointer leaves the list', () => {
    render(<List />);
    over('a');
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerLeave(document.body.querySelector('[data-testid="list"]')!);
    expect(shown()).toBe('none');
  });
});
