import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { buildExtension } from '../../src/api/extension';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { collectionSettingsTabSlot } from '../../src/app/extensions/slots';
import { useExtensionTabs } from '../../src/app/extensions/useExtensionTabs';
import { ExtensionSettingsPane, ExtensionSettingsTabButtons } from '../../src/app/react/components/collection-settings/ExtensionSettingsTabs';
import type { AtlasCapability } from '../../src/api/types/common';
import type { CollectionSettingsTabContext, CollectionSettingsTabSpec } from '../../src/api/types/ui';
import { fakeApp, fakePlugin, fakeServices } from './apiFakes';

function host(capabilities: readonly AtlasCapability[] = LANDED_CAPABILITIES): AtlasApiHost {
  const { app } = fakeApp();
  return new AtlasApiHost({ app, capabilities, build: (scope) => buildExtension(scope, fakeServices(app)) });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  expect(collectionSettingsTabSlot.list()).toHaveLength(0);
});

describe('ui.addCollectionSettingsTab', () => {
  it('is there only with collections, checks the tab, and removes it on unload', () => {
    expect(host(['ui']).api.connect(fakePlugin('ext')).ui.addCollectionSettingsTab).toBeUndefined();
    const plugin = fakePlugin('ext');
    const ui = host().api.connect(plugin).ui;
    expect(() => ui.addCollectionSettingsTab!({ id: 'dice', title: '', mount: () => () => undefined })).toThrow('"title" must be a non-empty string');
    expect(() => ui.addCollectionSettingsTab!({ id: 'dice', title: 'Dice colours', icon: '', mount: () => () => undefined })).toThrow('"icon" must be a non-empty string when given');
    ui.addCollectionSettingsTab!({ id: 'dice', title: 'Dice colours', mount: () => () => undefined });
    expect(() => ui.addCollectionSettingsTab!({ id: 'dice', title: 'Again', mount: () => () => undefined })).toThrow('already registered');
    expect(collectionSettingsTabSlot.list()).toMatchObject([{ owner: 'ext', item: { id: 'dice', title: 'Dice colours' } }]);
    plugin.unload();
  });

  it('shows the tab after Atlas\'s, mounts it for the collection and disposes it when another tab is chosen', () => {
    const plugin = fakePlugin('ext');
    const ui = host().api.connect(plugin).ui;
    const disposed = vi.fn();
    const mount = vi.fn((el: HTMLElement, ctx: CollectionSettingsTabContext) => {
      el.textContent = `colours of ${ctx.collectionId}`;
      return disposed;
    });
    const spec: CollectionSettingsTabSpec = { id: 'dice', title: 'Dice colours', mount };
    ui.addCollectionSettingsTab!(spec);
    function Dialog(): React.ReactElement {
      const tabs = useExtensionTabs(collectionSettingsTabSlot, true);
      return (
        <>
          <nav><ExtensionSettingsTabButtons tabs={tabs} /><button type="button" onClick={() => tabs.show(null)}>System</button></nav>
          {tabs.active && <ExtensionSettingsPane entry={tabs.active} collectionId="source" />}
        </>
      );
    }
    render(<Dialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Dice colours' }));
    expect(screen.getByRole('region', { name: 'Dice colours' }).textContent).toBe('colours of source');
    expect(Object.isFrozen(mount.mock.calls[0]![1])).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region')).toBeNull();
    act(() => plugin.unload());
  });
});
