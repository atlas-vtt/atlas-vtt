import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import galleryCss from '../../src/app/statblocks/editor/gallery/template-gallery.scss?inline';
import { UseForField } from '../../src/app/statblocks/editor/gallery/UseForField';
import type { StatblockRole } from '../../src/app/statblocks/model/roleTypes';
import { frames, useEditorStyles, wait } from './sidePanesHarness';

// The harness's editor reaches the dice links, whose Node `events` has no browser build.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/**
 * "Starts new statblocks for" in the template gallery's footer, with the real
 * stylesheets: the dialog clips its content, so the list opens in the
 * gallery's overlay, over the dialog, and opening it moves nothing.
 */
const h = React.createElement;
const ROLES: StatblockRole[] = Array.from({ length: 6 }, (_, index) => ({ id: `role-${index}`, name: `Role ${index + 1}`, templateId: 'builtin:generic-creature' }));

function Gallery({ height }: { height: number }): React.JSX.Element {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [value, setValue] = useState<string | null>(null);
  return h('div', { ref: setLayer, className: 'atlas-vtt-plugin atlas-te-gallery-overlay' },
    h('div', { className: 'atlas-te-gallery', role: 'dialog', style: { height } },
      h('div', { className: 'atlas-te-gallery__body' }, h('p', null, 'Cards')),
      h('div', { className: 'atlas-te-gallery__footer' },
        h(UseForField, { roles: ROLES, value, onChange: setValue, layer }),
        h('button', { type: 'button', className: 'btn' }, 'Cancel'))));
}

const trigger = (): HTMLElement => document.querySelector<HTMLElement>('[role="combobox"]')!;
const list = (): HTMLElement => document.querySelector<HTMLElement>('[role="listbox"]')!;
const dialog = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-te-gallery')!;

/** Whether the point shows `element` (nothing clips or covers it there). */
function shows(element: Element, x: number, y: number): boolean {
  return element.contains(document.elementFromPoint(x, y));
}

describe('the gallery\'s "Starts new statblocks for" select', () => {
  useEditorStyles();
  const style = document.createElement('style');
  style.textContent = galleryCss;
  beforeEach(() => { document.head.append(style); });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('opens its list over the dialog, every option shown whole, and moves nothing in the dialog', async () => {
    render(h(Gallery, { height: 600 }));
    await frames(2);
    const before = trigger().getBoundingClientRect();
    const footer = document.querySelector('.atlas-te-gallery__footer')!.getBoundingClientRect();
    await userEvent.click(trigger());
    await frames(2);

    expect(dialog().contains(list()), 'the list is no child of the dialog that clips').toBe(false);
    const options = [...list().querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options).toHaveLength(ROLES.length + 1);
    const last = options.at(-1)!.getBoundingClientRect();
    expect(shows(options.at(-1)!, last.left + last.width / 2, last.bottom - 2)).toBe(true);
    const first = options[0]!.getBoundingClientRect();
    expect(shows(options[0]!, first.left + first.width / 2, first.top + 2)).toBe(true);

    const after = trigger().getBoundingClientRect();
    expect([after.left, after.top]).toEqual([before.left, before.top]);
    expect(document.querySelector('.atlas-te-gallery__footer')!.getBoundingClientRect().top).toBe(footer.top);
    expect(dialog().scrollTop).toBe(0);
    for (const element of dialog().querySelectorAll('*')) expect(element.scrollTop).toBe(0);
    // Once its entrance (a scale from 0.96) has run.
    await wait(250);
    const box = list().getBoundingClientRect();
    expect(box.left).toBeCloseTo(after.left, 0);
    expect(box.width).toBeCloseTo(after.width, 0);
  });

  it('opens above its trigger where the window leaves no room below, and picks with the keyboard', async () => {
    await page.viewport(1280, 380);
    render(h(Gallery, { height: 340 }));
    await frames(2);
    await userEvent.click(trigger());
    await frames(2);
    const box = list().getBoundingClientRect();
    const at = trigger().getBoundingClientRect();
    expect(box.bottom).toBeLessThanOrEqual(at.top);
    expect(box.top).toBeGreaterThanOrEqual(0);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await frames(1);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger().textContent).toBe('Role 2');
  });

  it('follows its trigger when what holds it scrolls', async () => {
    render(h(Gallery, { height: 600 }));
    await frames(2);
    await userEvent.click(trigger());
    await frames(2);
    const overlay = document.querySelector<HTMLElement>('.atlas-te-gallery-overlay')!;
    dialog().style.marginTop = '40px';
    overlay.dispatchEvent(new Event('scroll'));
    await frames(2);
    const box = list().getBoundingClientRect();
    const at = trigger().getBoundingClientRect();
    expect(Math.min(Math.abs(box.top - at.bottom), Math.abs(at.top - box.bottom))).toBeCloseTo(4, 0);
  });
});
