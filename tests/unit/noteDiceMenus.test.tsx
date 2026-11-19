// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteDiceMenus } from '../../src/app/noteDice/NoteDiceMenus';
import { releasePortalHosts } from '../../src/app/host/portalHost';

afterEach(() => {
  releasePortalHosts();
});

describe('note dice menus', () => {
  it('opens the Atlas menu with the shared dice choices and closes it with its note', async () => {
    globalThis.ResizeObserver ??= class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;
    const section = document.createElement('div');
    const link = document.createElement('button');
    section.append(link);
    document.body.append(section);
    const roll = vi.fn();
    const menus = new NoteDiceMenus();
    await act(async () => {
      menus.open([
        { side: null, label: 'Roll', roll: () => roll(null) },
        { side: 'advantage', label: 'Roll with advantage', roll: () => roll('advantage') },
        { side: 'disadvantage', label: 'Roll with disadvantage', roll: () => roll('disadvantage') },
      ], { x: 10, y: 20 }, link);
    });
    const menu = document.querySelector<HTMLElement>('.atlas-ctx-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect([...menu!.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent))
      .toEqual(expect.arrayContaining([expect.stringContaining('Roll with advantage'), expect.stringContaining('Roll with disadvantage')]));
    await act(async () => {
      fireEvent.click([...menu!.querySelectorAll<HTMLElement>('[role="menuitem"]')][1]!);
    });
    expect(roll).toHaveBeenCalledWith('advantage');
    await act(async () => {
      menus.open([{ side: null, label: 'Roll', roll: () => roll(null) }], { x: 10, y: 20 }, link);
      menus.closeWithin(section);
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () => menus.destroy());
    section.remove();
  });
});
