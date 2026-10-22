// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindHoldHotkey } from '../../src/app/keyboard/holdHotkey';

vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));

describe('bindHoldHotkey', () => {
  let unbind: (() => void) | undefined;
  afterEach(() => unbind?.());

  it('reports the key held down and released', () => {
    const changes: boolean[] = [];
    unbind = bindHoldHotkey(window, () => 'h', undefined, (held) => changes.push(held));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h' }));
    expect(changes).toEqual([true, false]);
  });

  it('releases when the window loses focus while held', () => {
    const changes: boolean[] = [];
    unbind = bindHoldHotkey(window, () => 'h', undefined, (held) => changes.push(held));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    window.dispatchEvent(new Event('blur'));
    expect(changes).toEqual([true, false]);
  });

  it('ignores other keys and stops listening once unbound', () => {
    const changes: boolean[] = [];
    bindHoldHotkey(window, () => 'h', undefined, (held) => changes.push(held))();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    expect(changes).toEqual([]);
  });
});
