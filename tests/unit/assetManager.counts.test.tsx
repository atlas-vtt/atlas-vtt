// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import { SectionHeader } from '../../src/app/packages/components/asset-manager/components/SectionHeader';
import type { AnyAsset, Folder, Tab } from '../../src/app/packages/components/asset-manager/types';

// The owner's report (2026-11-09): picking the SRD tag read "308" in the sidebar and "210 of 475" over the grid, and the
// tab grew to "305 of 400". One count now: a tag's count is what picking it shows, from every folder of the tab, and a
// tab always shows the collection's total.
const workspaceApp = { workspace: { on: () => ({}), offref: () => {} }, keymap: { pushScope: () => {}, popScope: () => {} } };
const COUNTS: Record<Tab, number> = { scenes: 2, maps: 1, encounters: 0, tokens: 5, party: 0 };

// root ─ Goblin, Untagged
//  └ monsters ─ Wolf
//     └ undead ─ Ghoul, Wight
const folder = (id: string, parentId: string | null): Folder => ({ id, name: id, type: 'tokens', parentId, path: id });
const token = (name: string, folderId: string | null, tags: string[]): AnyAsset =>
  ({ id: name, name, type: 'tokens', imageUrl: '', modifiedAt: 0, folderId, tags }) as AnyAsset;

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    app: workspaceApp,
    shownFolderOf: (folderId: string | null) => folderId,
    folders: [folder('monsters', null), folder('undead', 'monsters')],
    collections: [{ id: 'default', uid: 'u-default', name: 'Default' }],
    availableTags: [{ id: 'srd', name: 'SRD' }, { id: 'beast', name: 'Beast' }],
    assetCounts: COUNTS,
    assets: [
      token('Goblin', null, ['srd']),
      token('Untagged', null, []),
      token('Wolf', 'monsters', ['srd', 'beast']),
      token('Ghoul', 'undead', ['srd']),
      token('Wight', 'undead', ['SRD']),
    ],
  }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetCrud', () => ({ useAssetCrud: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections', () => ({ useTagsAndCollections: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useContextMenus', () => ({ useContextMenus: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useStatblockLink', () => ({ useStatblockLink: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useRememberedPlace', () => ({
  useRememberedPlace: () => ({ scrollTopOf: () => 0, setScrollTop: () => {} }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects', () => ({ useAssetManagerEffects: () => {} }));
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => null }));
// The header as far as the tabs: the real tab bar, with whatever the manager hands the header.
vi.mock('../../src/app/packages/components/asset-manager/components/Header', async () => {
  const { TabSwitcher } = await import('../../src/app/packages/components/asset-manager/components/TabSwitcher');
  const { TooltipProvider } = await import('../../src/app/packages/components/primitives/tooltip');
  return {
    Header: (props: React.ComponentProps<typeof TabSwitcher>) => (
      <TooltipProvider><TabSwitcher {...props} /></TooltipProvider>
    ),
  };
});
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ assets, folders, onFolderDoubleClick }: { assets: AnyAsset[]; folders: Folder[]; onFolderDoubleClick: (id: string) => void }) => (
    <div>
      {folders.map((f) => <button key={f.id} type="button" onClick={() => onFolderDoubleClick(f.id)}>Open {f.id}</button>)}
      <ul aria-label="Assets">{assets.map((asset) => <li key={asset.id}>{asset.name}</li>)}</ul>
    </div>
  ),
}));

afterEach(cleanup);

const shownTokens = (): string[] => within(screen.getByRole('list', { name: 'Assets' })).queryAllByRole('listitem').map((item) => item.textContent ?? '');
const tabCounts = (): string[] => [...document.querySelectorAll('.atlas-asset-manager-tabs .atlas-tab-count')].map((count) => count.textContent ?? '');
const tagButton = (name: string): HTMLElement => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const tagCount = (name: string): string | null => tagButton(name).querySelector('.atlas-tag-count')?.textContent ?? null;

describe('tab counts', () => {
  it('stay the collection\'s totals whatever a tag, a search or an open folder leaves', () => {
    render(<AssetManager isOpen onClose={() => {}} />);
    expect(tabCounts()).toEqual(['2', '1', '0', '5', '0']);
    fireEvent.click(tagButton('SRD'));
    expect(shownTokens()).toHaveLength(4);
    expect(tabCounts()).toEqual(['2', '1', '0', '5', '0']);
    fireEvent.click(tagButton('SRD'));
    fireEvent.click(screen.getByRole('button', { name: 'Open monsters' }));
    expect(shownTokens()).toEqual(['Wolf']);
    expect(tabCounts()).toEqual(['2', '1', '0', '5', '0']);
  });
});

describe('tag counts', () => {
  it('are what picking the tag shows, items in subfolders included', () => {
    render(<AssetManager isOpen onClose={() => {}} />);
    expect(tagCount('SRD')).toBe('4');
    fireEvent.click(tagButton('SRD'));
    expect(shownTokens()).toEqual(['Ghoul', 'Goblin', 'Wight', 'Wolf']);
    expect(tagCount('SRD')).toBe('4');
  });

  it('are the same number from inside a folder, whose tag search spans the whole tab', () => {
    render(<AssetManager isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open monsters' }));
    expect(tagCount('SRD')).toBe('4');
    fireEvent.click(tagButton('SRD'));
    expect(shownTokens()).toHaveLength(4);
  });

  it('follow the other filters, so each still says what picking it adds up to', () => {
    render(<AssetManager isOpen onClose={() => {}} />);
    fireEvent.click(tagButton('SRD'));
    expect(tagCount('Beast')).toBe('1');
    fireEvent.click(tagButton('Beast'));
    expect(shownTokens()).toEqual(['Wolf']);
  });
});

it('names no other collection under the results', () => {
  render(<AssetManager isOpen onClose={() => {}} />);
  fireEvent.click(tagButton('SRD'));
  expect(document.querySelector('.atlas-asset-manager-elsewhere')).toBeNull();
  expect(screen.queryByText(/ more in /)).toBeNull();
});

it('the section header shows the number it lists, never against a total', () => {
  render(<SectionHeader title="Tokens" count={33} collapsed={false} onToggle={vi.fn()} />);
  expect(document.querySelector('.atlas-section-count')?.textContent).toBe('33');
});
