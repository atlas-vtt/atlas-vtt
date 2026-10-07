import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { buildExtension } from '../../src/api/extension';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { assetTabSlot } from '../../src/app/extensions/slots';
import { ExtensionAssetPane } from '../../src/app/packages/components/asset-manager/components/ExtensionAssetPane';
import { TabSwitcher } from '../../src/app/packages/components/asset-manager/components/TabSwitcher';
import { useExtensionTabs } from '../../src/app/extensions/useExtensionTabs';
import type { AssetTabContext, AssetTabSpec } from '../../src/api/types/ui';
import type { AtlasCapability } from '../../src/api/types/common';
import { fakeApp, fakePlugin, fakeServices } from './apiFakes';

function host(capabilities: readonly AtlasCapability[] = LANDED_CAPABILITIES): AtlasApiHost {
  const { app } = fakeApp();
  return new AtlasApiHost({ app, capabilities, build: (scope) => buildExtension(scope, fakeServices(app)) });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  expect(assetTabSlot.list()).toHaveLength(0);
});

const spec = (mount: AssetTabSpec['mount'] = () => () => undefined): AssetTabSpec => ({ id: 'packs', title: 'Dice packs', icon: 'dice', mount });

describe('ui.addAssetTab', () => {
  it('is there only with asset-tabs, and its tab goes when the extension unloads', () => {
    expect(host(['ui']).api.connect(fakePlugin('ext')).ui.addAssetTab).toBeUndefined();
    const plugin = fakePlugin('ext');
    const ui = host().api.connect(plugin).ui;
    expect(host().api.has('asset-tabs')).toBe(true);
    ui.addAssetTab!(spec());
    expect(assetTabSlot.list()).toMatchObject([{ owner: 'ext', item: { id: 'packs', title: 'Dice packs', icon: 'dice' } }]);
    expect(Object.isFrozen(assetTabSlot.list()[0]!.item)).toBe(true);
    plugin.unload();
    expect(assetTabSlot.list()).toHaveLength(0);
  });

  it('throws for a malformed tab or an id this extension already added, and its disposer removes it once', () => {
    const plugin = fakePlugin('ext');
    const ui = host().api.connect(plugin).ui;
    expect(() => ui.addAssetTab!({ ...spec(), id: '' })).toThrow('[Atlas API] ui.addAssetTab: "id" must be a non-empty string.');
    expect(() => ui.addAssetTab!({ ...spec(), icon: '' })).toThrow('"icon"');
    expect(() => ui.addAssetTab!({ ...spec(), mount: 1 } as never)).toThrow('"mount" must be a function');
    const dispose = ui.addAssetTab!(spec());
    expect(() => ui.addAssetTab!(spec())).toThrow('already registered');
    dispose();
    dispose();
    expect(assetTabSlot.list()).toHaveLength(0);
    plugin.unload();
  });
});

const entry = (mount: AssetTabSpec['mount']): { key: string; owner: string; tab: AssetTabSpec } => ({ key: 'ext:packs', owner: 'ext', tab: spec(mount) });

describe('an extension asset tab in the asset manager', () => {
  it('mounts with a frozen context, mounts again for another collection, and disposes on leaving', () => {
    const disposers: string[] = [];
    const mount = vi.fn((el: HTMLElement, ctx: AssetTabContext) => {
      el.textContent = `packs of ${ctx.collectionId}`;
      expect(Object.isFrozen(ctx)).toBe(true);
      return () => { disposers.push(ctx.collectionId); };
    });
    const tab = entry(mount);
    const { rerender, unmount } = render(<ExtensionAssetPane entry={tab} collectionId="A" />);
    expect(screen.getByRole('region', { name: 'Dice packs' }).textContent).toBe('packs of A');
    rerender(<ExtensionAssetPane entry={tab} collectionId="A" />);
    expect(mount).toHaveBeenCalledTimes(1);
    rerender(<ExtensionAssetPane entry={tab} collectionId="B" />);
    expect(disposers).toEqual(['A']);
    expect(screen.getByRole('region').textContent).toBe('packs of B');
    unmount();
    expect(disposers).toEqual(['A', 'B']);
  });

  it('logs a mount or disposer that throws, and keeps keys but Escape inside', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<ExtensionAssetPane entry={entry(() => { throw new Error('boom'); })} collectionId="A" />);
    expect(error.mock.calls[0]?.[0]).toContain('ext: asset tab "packs" mount failed');
    unmount();
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    const pane = render(<ExtensionAssetPane entry={entry((el) => { el.append(document.createElement('input')); return () => { throw new Error('late'); }; })} collectionId="A" />);
    const input = pane.container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.keyDown(input, { key: 'a', ctrlKey: true });
    expect(outside).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(outside).toHaveBeenCalledTimes(1);
    pane.unmount();
    expect(error.mock.calls.at(-1)?.[0]).toContain('asset tab "packs" disposer failed');
    document.removeEventListener('keydown', outside);
  });

  it('lists extension tabs after Atlas\'s own with no count, and marks only the one shown', () => {
    const onSelect = vi.fn();
    const onTabChange = vi.fn();
    const tab = entry(() => () => undefined);
    const { rerender } = render(<TabSwitcher activeTab="tokens" onTabChange={onTabChange} assetCounts={null} extensionTabs={{ tabs: [tab], active: null, onSelect }} />);
    const nav = screen.getByRole('navigation');
    const buttons = [...nav.querySelectorAll('button')];
    expect(buttons.at(-1)!.textContent).toBe('Dice packs');
    expect(buttons.at(-1)!.querySelector('.atlas-tab-count')).toBeNull();
    fireEvent.click(buttons.at(-1)!);
    expect(onSelect).toHaveBeenCalledWith('ext:packs');
    rerender(<TabSwitcher activeTab="tokens" onTabChange={onTabChange} assetCounts={null} extensionTabs={{ tabs: [tab], active: tab, onSelect }} />);
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')!.textContent).toBe('Dice packs');
  });

  it('falls back to Atlas\'s tab when the shown one is removed, and forgets it when the manager closes', () => {
    let tabs: ReturnType<typeof useExtensionTabs<AssetTabSpec>> | null = null;
    function Probe({ open }: { open: boolean }): null {
      tabs = useExtensionTabs(assetTabSlot, open);
      return null;
    }
    const plugin = fakePlugin('ext');
    const ui = host().api.connect(plugin).ui;
    const dispose = ui.addAssetTab!(spec());
    const { rerender } = render(<Probe open />);
    act(() => tabs!.show('ext:packs'));
    expect(tabs!.active?.key).toBe('ext:packs');
    act(() => dispose());
    expect(tabs!.active).toBeNull();
    act(() => { ui.addAssetTab!(spec()); });
    act(() => tabs!.show('ext:packs'));
    rerender(<Probe open={false} />);
    expect(tabs!.active).toBeNull();
    act(() => plugin.unload());
  });
});
