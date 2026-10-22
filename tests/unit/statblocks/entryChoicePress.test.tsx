// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryExtraInputs } from '../../../src/app/statblocks/editor/statblock-pane/EntryExtraInputs';
import type { EntryExtraShape } from '../../../src/app/statblocks/model/templateTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE: EntryExtraShape = { key: 'source', label: 'Source', type: 'choice', options: ['Class', 'Subclass', 'Ancestry', 'Community'] } as EntryExtraShape;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function mount(onChange = vi.fn()): HTMLElement {
  const host = document.body.createDiv();
  root = createRoot(host);
  act(() => root!.render(<EntryExtraInputs extras={[SOURCE]} textOf={() => ''} onChange={onChange} />));
  return host;
}

const press = (target: Element): MouseEvent => {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  act(() => { target.dispatchEvent(event); });
  return event;
};

/**
 * The Source dropdown of a new ability opens from a press anywhere on its box: a press on its chevron
 * or padding landed on no control, took focus out of the ability and closed the editor with it.
 */
describe('a choice part of an ability being written', () => {
  it('opens from a press on its chevron, keeping focus in its input', () => {
    const host = mount();
    const chevron = host.querySelector('.atlas-sb-pane-choice__chevron')!;
    const event = press(chevron);
    expect(event.defaultPrevented).toBe(true);
    const input = host.querySelector<HTMLInputElement>('.atlas-sb-pane-choice input')!;
    expect(document.activeElement).toBe(input);
    expect(host.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('leaves a press on the input itself to the input', () => {
    const host = mount();
    const event = press(host.querySelector('.atlas-sb-pane-choice input')!);
    expect(event.defaultPrevented).toBe(false);
    expect(host.querySelector('[role="listbox"]')).not.toBeNull();
  });
});
