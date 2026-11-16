// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextMenuProvider, useContextMenu } from '../../src/app/react/root/ContextMenuContext';

function Opener(): null {
  const menu = useContextMenu();
  useEffect(() => {
    menu.open([{ type: 'item', label: 'Move up', onClick: () => undefined }], { x: 10, y: 10 }, { label: 'Options of Shieldwall' });
  }, [menu]);
  return null;
}

afterEach(cleanup);

describe('a context menu', () => {
  it('carries the name it was opened with, for assistive tech', async () => {
    globalThis.ResizeObserver ??= class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;
    render(<ContextMenuProvider><Opener /></ContextMenuProvider>);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Options of Shieldwall');
  });
});
