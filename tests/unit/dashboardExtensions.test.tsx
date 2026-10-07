import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: () => ({ getCollections: () => Promise.resolve([]), getAssets: () => Promise.resolve([]) }) },
}));
vi.mock('../../src/app/services/GlobalAssetManagerService', () => ({ GlobalAssetManagerService: class {} }));

import { Dashboard } from '../../src/app/dashboard-view';
import { dashboardSlot } from '../../src/app/extensions/slots';
import type { DashboardTile } from '../../src/api/types/ui';

const app = { workspace: { on: () => ({}), offref: () => undefined }, vault: { getAbstractFileByPath: () => null } } as never;

function renderDashboard(): HTMLElement {
  return render(<Dashboard app={app} onOpenScene={vi.fn()} onCreateMap={vi.fn()} onOpenAssetManager={vi.fn()} />).container;
}

const tile = (overrides: Partial<DashboardTile> = {}): DashboardTile => ({
  id: 'join', icon: 'users', title: 'Open board', description: 'Open the board', onClick: vi.fn(), ...overrides,
});

function add(dashboardTile: DashboardTile): () => void {
  let remove = (): void => undefined;
  act(() => { remove = dashboardSlot.add('ext', dashboardTile); });
  return () => act(() => { remove(); });
}

describe('Extension tiles on the dashboard', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    expect(dashboardSlot.list()).toHaveLength(0);
  });

  const cards = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('.action-grid > .action-card .action-title')).map((el) => el.textContent ?? '');

  it('shows only Atlas\'s two tiles while nothing is registered', async () => {
    const container = renderDashboard();
    await act(async () => { await Promise.resolve(); });
    expect(cards(container)).toEqual(['Create Scene', 'Asset Manager']);
  });

  it('shows a registered tile with its title and description, after Atlas\'s, as a child of the grid', async () => {
    const container = renderDashboard();
    const remove = add(tile());
    await act(async () => { await Promise.resolve(); });
    expect(cards(container)).toEqual(['Create Scene', 'Asset Manager', 'Open board']);
    expect(screen.getByText('Open the board')).toBeTruthy();
    remove();
  });

  it('runs onClick on a click, and a throwing onClick breaks nothing', async () => {
    const onClick = vi.fn();
    renderDashboard();
    const removeFirst = add(tile({ onClick }));
    const removeSecond = add(tile({ id: 'bad', title: 'Bad tile', onClick: () => { throw new Error('boom'); } }));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByText('Open board'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(() => fireEvent.click(screen.getByText('Bad tile'))).not.toThrow();
    removeFirst();
    removeSecond();
  });

  it('removes the tile with its disposer', async () => {
    const container = renderDashboard();
    const remove = add(tile());
    await act(async () => { await Promise.resolve(); });
    remove();
    expect(cards(container)).toEqual(['Create Scene', 'Asset Manager']);
  });
});
