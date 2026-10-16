import React, { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { useKeepInView } from '../../src/app/packages/components/primitives/useKeepInView';
import type { PopoverPlacement } from '../../src/app/packages/components/primitives/popoverFit';
import css from '../../src/app/statblocks/editor/token-socket/token-socket.scss?inline';

const h = React.createElement;
const CAP = '--atlas-keep-in-view-max-height';

/** The token panel's real nested scrolling layout, without the editor or asset services. */
function Panel({ placement = 'bottom', height = 600, open = true }: {
  placement?: PopoverPlacement;
  height?: number;
  open?: boolean;
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const keepInView = useKeepInView(ref, open, placement);
  if (!open) return null;
  const edge = placement === 'top' ? '--atlas-sb-socket-bottom' : '--atlas-sb-socket-top';
  return h('div', {
    ref,
    className: 'atlas-vtt-plugin atlas-sb-token-popover',
    style: { [edge]: '100px', ...keepInView.style } as React.CSSProperties,
  }, h('div', { className: 'atlas-sb-token-popover__motion' },
    h('div', { className: 'atlas-sb-token-panel' },
      h('div', { className: 'atlas-sb-token-panel__header' }, 'Token art'),
      h('div', { className: 'atlas-sb-token-panel__body' },
        h('div', { style: { height, flexShrink: 0 } }, 'Token choices')))));
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('useKeepInView with a nested scrolling panel', () => {
  const style = document.createElement('style');
  style.textContent = `${css}\n.atlas-vtt-plugin * { box-sizing: border-box; }`;
  beforeEach(async () => {
    await page.viewport(800, 500);
    document.head.append(style);
  });
  afterEach(() => { cleanup(); style.remove(); });

  it.each(['top', 'bottom'] as const)('keeps a stable cap when opening towards the %s', async (placement) => {
    render(h(Panel, { placement }));
    const popover = document.querySelector<HTMLElement>('.atlas-sb-token-popover')!;
    const panel = popover.querySelector<HTMLElement>('.atlas-sb-token-panel')!;
    // Read across ResizeObserver deliveries: the old cap alternates with no cap.
    for (let count = 0; count < 20; count++) {
      await act(async () => { await frame(); });
      expect(popover.style.getPropertyValue(CAP)).toBe('392px');
      const box = panel.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(8);
      expect(box.bottom).toBeLessThanOrEqual(492);
    }
  });

  it('grows with the window, shrinks with its content, and resets when closed', async () => {
    const result = render(h(Panel));
    const popover = document.querySelector<HTMLElement>('.atlas-sb-token-popover')!;
    const panel = popover.querySelector<HTMLElement>('.atlas-sb-token-panel')!;
    await act(async () => { await frame(); });
    const shortHeight = panel.getBoundingClientRect().height;

    await page.viewport(800, 1000);
    await act(async () => { await frame(); });
    expect(panel.getBoundingClientRect().height).toBeGreaterThan(shortHeight);
    const fullHeight = panel.getBoundingClientRect().height;
    result.rerender(h(Panel, { height: 80 }));
    await act(async () => { await frame(); });
    expect(panel.getBoundingClientRect().height).toBeLessThan(fullHeight);

    result.rerender(h(Panel, { open: false }));
    result.rerender(h(Panel, { height: 80 }));
    await act(async () => { await frame(); });
    expect(document.querySelector<HTMLElement>('.atlas-sb-token-popover')!.style.getPropertyValue(CAP)).toBe('');
  });
});
