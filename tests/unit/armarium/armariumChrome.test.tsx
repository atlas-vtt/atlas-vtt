// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { Header } from '../../../src/app/packages/components/asset-manager/components/Header';
import { Sidebar } from '../../../src/app/packages/components/asset-manager/components/Sidebar';
import { TooltipProvider } from '../../../src/app/packages/components/primitives/tooltip';

afterEach(() => cleanup());

const sel = {
  navigationHistory: { canGoBack: () => false, canGoForward: () => true },
  handleNavigateBack: vi.fn(),
  handleNavigateForward: vi.fn(),
} as unknown as React.ComponentProps<typeof Header>['sel'];

function renderHeader(armarium?: { onBack: () => void; onReload: () => void }): void {
  render(
    <TooltipProvider>
      <Header
        app={{} as App}
        search=""
        onSearch={vi.fn()}
        query={{} as React.ComponentProps<typeof Header>['query']}
        activeTab="tokens"
        onTabChange={vi.fn()}
        assetCounts={null}
        onCreateFolder={vi.fn()}
        sidebarToggleLabel="Hide sidebar"
        onToggleSidebar={vi.fn()}
        sel={sel}
        armarium={armarium}
      />
    </TooltipProvider>,
  );
}

describe('the header over the Armarium', () => {
  it('marks no tab, leads Back to the library and puts the store\'s actions where search and Create stand', () => {
    const armarium = { onBack: vi.fn(), onReload: vi.fn() };
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderHeader(armarium);

    expect(document.querySelector('.atlas-tab-button.atlas-active')).toBeNull();
    expect(document.querySelector('.atlas-asset-manager-search')).toBeNull();
    expect(document.querySelector('.atlas-asset-manager-create-btn')).toBeNull();

    const back = screen.getByRole('button', { name: 'Back to the library' }) as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    fireEvent.click(back);
    expect(armarium.onBack).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Forward' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(armarium.onReload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open in browser' }));
    expect(open).toHaveBeenCalledWith('https://atlas-vtt.dev/armarium');
    open.mockRestore();
  });
});

describe('the sidebar', () => {
  it('offers the Armarium as a place, current while it is shown', () => {
    const onShowArmarium = vi.fn();
    const props = {
      selectedTagIds: [], onSelectTag: vi.fn(), onClearTags: vi.fn(), tags: [], countedAssets: [], collections: [],
      selectedCollection: 'default', onSelectCollection: vi.fn(), onManageTags: vi.fn(), onShowArmarium,
    };
    const { rerender } = render(<TooltipProvider><Sidebar {...props} /></TooltipProvider>);
    const place = screen.getByRole('button', { name: 'Armarium' });
    expect(place.getAttribute('aria-current')).toBeNull();
    fireEvent.click(place);
    expect(onShowArmarium).toHaveBeenCalledTimes(1);

    rerender(<TooltipProvider><Sidebar {...props} armariumShown /></TooltipProvider>);
    expect(screen.getByRole('button', { name: 'Armarium' }).getAttribute('aria-current')).toBe('page');
  });
});
