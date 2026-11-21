import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { CommandPalette } from '../../src/app/react/components/CommandPalette';
import { SETTINGS_PANEL_IDS, type SettingsPanelId } from '../../src/app/react/components/command-palette/types';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { withStatblockEditor } from '../mocks/experimentalFeatures';
import { settle, type OpenedSurface, type ScreenSurface } from './textFitScreensSurfaces';

const h = React.createElement;

/** The palette as the map's UI holds it, open on its command list or on one of its pages. */
async function openPalette(page: SettingsPanelId | null): Promise<OpenedSurface> {
  const { app } = createInMemoryApp({ files: {} });
  withStatblockEditor(app);
  const settings = new SettingsService(app);
  await settings.initialize();
  const store = createViewAtlasStore(app, `text-fit-palette-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setSceneLighting({ enabled: true });
  store.setState({ commandPalettePage: page });
  render(h(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
    h(ViewStoreProvider, { store, children: h(TooltipProvider, null, h(ContextMenuProvider, null,
      h('div', { className: 'atlas-vtt-plugin atlas-ui', style: { position: 'relative', width: '100vw', height: '100vh' } },
        h(CommandPalette, { isOpen: true, onClose: () => undefined })))) })));
  await settle(600);
  return {
    parts: { '': async () => document.querySelector('.atlas-command-palette-container') ?? document.body },
    close: cleanup,
  };
}

export const PALETTE_SURFACES: readonly ScreenSurface[] = [
  { name: 'command palette', open: () => openPalette(null) },
  ...SETTINGS_PANEL_IDS.map((page): ScreenSurface => ({ name: `command palette, ${page}`, open: () => openPalette(page) })),
];
