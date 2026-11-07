// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubLayout } from '../mocks/jsdomLayout';
const fake = vi.hoisted(() => ({ save: vi.fn(), service: {}, scan: vi.fn() }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetCatalog', () => ({ useAssetCatalog: () => ({ assetService: fake.service, collections: [{ id: 'default', name: 'Default' }] }) }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetTags', () => ({ useAssetTags: () => ({ tags: ['Enemy'], createTag: vi.fn(), isCreatingTag: false }) }));
vi.mock('../../src/app/services/StatblockTokenImportService', () => ({ StatblockTokenImportService: class { scan = fake.scan; } }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews', () => ({ saveTokenPreviews: fake.save }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ convertForPreview: async () => ({ image: new Blob(['art']), thumbnail: null, preview: null, sourcePreview: null }) }));
stubLayout({ width: 800, height: 600 });
afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  fake.scan.mockResolvedValue([{ name: 'Goblin', path: 'Bestiary/Goblin.md', imagePath: 'goblin.webp', status: 'ready', detail: 'Ready', layoutName: 'Basic 5e Layout' }]);
  fake.save.mockResolvedValue(2);
});

it('stages statblocks beside uploads and applies ring and tag edits to the same cards', async () => {
  const { app } = createInMemoryApp({ files: { 'goblin.webp': 'art' } });
  app.workspace = { trigger: vi.fn() };
  app.vault.readBinary = vi.fn(async () => new Uint8Array([1]).buffer);
  app.vault.getResourcePath = (file: { path: string }) => file.path;
  const { container } = render(<AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}><TokenCreator isOpen onClose={vi.fn()} /></AtlasUIContext.Provider>);
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['art'], 'Wolf.png', { type: 'image/png' })] } });
  await screen.findByDisplayValue('Wolf');
  fireEvent.click(screen.getByRole('button', { name: 'Statblock notes' }));
  await screen.findByLabelText('System / layout');
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 to import' }));
  await screen.findByDisplayValue('Goblin');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(container.querySelectorAll('.atlas-token-card')).toHaveLength(2);
  await waitFor(() => expect(container.querySelectorAll('.atlas-token-card__busy')).toHaveLength(0));
  fireEvent.click(screen.getByRole('switch', { name: 'Toggle token ring for all' }));
  expect(container.querySelectorAll('.atlas-token-card__ring')).toHaveLength(0);
  expect(container.querySelectorAll('.atlas-token-card__mask')).toHaveLength(0);
  fireEvent.click(screen.getByRole('switch', { name: 'Toggle token ring for Goblin' }));
  expect(container.querySelectorAll('.atlas-token-card__ring')).toHaveLength(1);
  const ringForAll = screen.getByRole('switch', { name: 'Toggle token ring for all' });
  expect(document.getElementById(ringForAll.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Mixed token ring settings');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Wolf' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enemy' }));
  fireEvent.click(screen.getByRole('button', { name: /Create.*↵/ }));
  await waitFor(() => expect(fake.save).toHaveBeenCalled());
  const queued = fake.save.mock.lastCall![0].previews;
  expect(queued.map((p: { name: string; showRing: boolean; tags: string[]; statblockPath?: string }) => ({ name: p.name, showRing: p.showRing, tags: p.tags, statblockPath: p.statblockPath }))).toEqual([
    { name: 'Wolf', showRing: false, tags: [], statblockPath: undefined },
    { name: 'Goblin', showRing: true, tags: ['Enemy'], statblockPath: 'Bestiary/Goblin.md' },
  ]);
});

it('preserves edited tags and ring choice when replacing a token image', async () => {
  const { app } = createInMemoryApp();
  app.workspace = { trigger: vi.fn() };
  const { container } = render(<AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}><TokenCreator isOpen onClose={vi.fn()} editToken={{ id: 'existing', name: 'Goblin', imageUrl: 'goblin.webp', tags: ['Enemy'], showRing: false }} /></AtlasUIContext.Provider>);
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['art'], 'Replacement.png', { type: 'image/png' })] } });
  await screen.findByDisplayValue('Replacement');
  expect(container.querySelector('.atlas-token-card__ring')).toBeNull();
  expect(screen.getByRole('button', { name: 'Enemy' }).getAttribute('aria-pressed')).toBe('true');
});

it('Escape dismisses the layout menu before closing the importer over an active map', async () => {
  const { app } = createInMemoryApp();
  const onClose = vi.fn();
  render(<>
    <div className="workspace-leaf mod-active"><div className="atlas-react-ui-container" /></div>
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <TokenCreator isOpen onClose={onClose} initialSource="statblocks" />
    </AtlasUIContext.Provider>
  </>);
  const trigger = await screen.findByRole('button', { name: 'System / layout' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});

it('makes maps of vault images through the same preview cards as uploads', async () => {
  const { app } = createInMemoryApp({ files: { 'Maps/Cave.jpg': 'map', 'atlas-vtt/assets/cave.webp': 'own' } });
  app.workspace = { trigger: vi.fn() };
  const { container } = render(<AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}><TokenCreator isOpen mode="map" onClose={vi.fn()} /></AtlasUIContext.Provider>);
  expect(screen.queryByRole('button', { name: 'Fantasy Statblocks' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'From vault' }));
  expect(screen.queryByRole('checkbox', { name: 'Select cave' })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cave' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add 1 to import' }));
  await screen.findByDisplayValue('Cave');
  expect(container.querySelectorAll('.atlas-token-card')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'From vault' }));
  expect((screen.getByRole('checkbox', { name: 'Select Cave' }) as HTMLInputElement).disabled).toBe(true);
});
