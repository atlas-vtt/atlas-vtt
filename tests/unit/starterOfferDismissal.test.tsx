// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import type { App } from 'obsidian';
import { BestiaryTokensOffer } from '../../src/app/packages/components/asset-manager/components/BestiaryTokensOffer';
import { HeaderMenu } from '../../src/app/packages/components/asset-manager/components/HeaderMenu';
import { useStarterOfferDismissal } from '../../src/app/packages/components/asset-manager/hooks/useStarterOfferDismissal';
import { useStarterTokensEntry } from '../../src/app/packages/components/asset-manager/hooks/useStarterTokensEntry';
import type { Tab } from '../../src/app/packages/components/asset-manager/types';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { showAtlasToast, type AtlasToastAction } from '../../src/app/react/components/AtlasToast';
import { t } from '../../src/app/i18n';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryPluginData } from '../mocks/pluginData';

vi.mock('../../src/app/react/components/AtlasToast', () => ({ showAtlasToast: vi.fn(() => ({ dismiss: () => undefined })) }));

/** The sidebar's offer and the header's Create menu, as the asset manager wires them for one collection. */
function Library({ app, assets, collection, uid, tab = 'tokens' }: { app: App; assets: AssetService; collection: string; uid: string; tab?: Tab }): React.JSX.Element {
  const offer = useStarterOfferDismissal(app, uid);
  const entry = useStarterTokensEntry(app, assets, collection, tab);
  return (
    <>
      <BestiaryTokensOffer app={app} assets={assets} collection={collection} variant="sidebar" dismissed={offer.dismissed} {...(offer.dismiss && { onDismiss: offer.dismiss })} />
      <HeaderMenu label="Create" triggerClassName="atlas-asset-manager-create-btn" triggerContent="+" items={entry ? [entry.item] : []}>
        {entry?.popover}
      </HeaderMenu>
    </>
  );
}

async function library(): Promise<{ app: App; assets: AssetService; settings: SettingsService; data: ReturnType<typeof memoryPluginData>; uidOf: (id: string) => Promise<string> }> {
  const { app } = createInMemoryApp();
  const data = memoryPluginData({});
  const settings = new SettingsService(app, undefined, data);
  await settings.initialize();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  await assets.createCollection('Winter Camp');
  const uidOf = async (id: string): Promise<string> => (await assets.getCollection(id))!.uid!;
  return { app, assets, settings, data, uidOf };
}

const offerShown = (view: RenderResult): boolean => view.container.querySelector('.atlas-bestiary-offer--sidebar') !== null;

function lastToastAction(): AtlasToastAction {
  const action = vi.mocked(showAtlasToast).mock.calls.at(-1)?.[2];
  if (!action) throw new Error('No toast with an action');
  return action;
}

// The offer fades out; jsdom never ends an animation.
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
beforeEach(() => {
  AssetService.resetInstance();
  vi.mocked(showAtlasToast).mockClear();
});
afterEach(cleanup);

describe('the sidebar offer of starter tokens', () => {
  it('hides for the one collection it was dismissed in, says so with Undo, and is kept in the settings by uid', async () => {
    const { app, assets, settings, data, uidOf } = await library();
    const winter = await uidOf('Winter Camp');
    const view = render(<Library app={app} assets={assets} collection="Winter Camp" uid={winter} />);
    await waitFor(() => expect(offerShown(view)).toBe(true));

    await act(async () => fireEvent.click(view.getByRole('button', { name: t('am.bestiary.hide') })));
    await waitFor(() => expect(offerShown(view)).toBe(false));
    expect(settings.isStarterOfferHidden(winter)).toBe(true);
    expect(showAtlasToast).toHaveBeenCalledWith(t('am.bestiary.hidden'), expect.any(Number), expect.objectContaining({ label: t('history.undo') }));

    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ hiddenStarterOffers: [winter] });
    const reread = new SettingsService(createInMemoryApp().app, undefined, data);
    await reread.initialize();
    expect(reread.isStarterOfferHidden(winter)).toBe(true);

    // Another collection still offers them.
    view.rerender(<Library app={app} assets={assets} collection={assets.getDefaultCollectionId()} uid={await uidOf(assets.getDefaultCollectionId())} />);
    await waitFor(() => expect(offerShown(view)).toBe(true));
  });

  it('comes back with Undo, and the file no longer lists the collection', async () => {
    const { app, assets, settings, data, uidOf } = await library();
    const winter = await uidOf('Winter Camp');
    const view = render(<Library app={app} assets={assets} collection="Winter Camp" uid={winter} />);
    await waitFor(() => expect(offerShown(view)).toBe(true));
    await act(async () => fireEvent.click(view.getByRole('button', { name: t('am.bestiary.hide') })));

    await act(async () => lastToastAction().run());
    await waitFor(() => expect(offerShown(view)).toBe(true));
    expect(settings.isStarterOfferHidden(winter)).toBe(false);
    await settings.saveSettingsNow();
    expect(JSON.parse(JSON.stringify(data.stored()))).not.toHaveProperty('hiddenStarterOffers');
  });

  it('stays hidden after the collection folder is renamed, since it is kept by uid', async () => {
    const { app, assets, settings, uidOf } = await library();
    settings.setStarterOfferHidden(await uidOf('Winter Camp'), true);
    await assets.renameCollection('Winter Camp', 'Summer Camp');

    const view = render(<Library app={app} assets={assets} collection="Summer Camp" uid={await uidOf('Summer Camp')} />);
    await act(async () => undefined);
    expect(offerShown(view)).toBe(false);
  });

  it('follows a dismissal another device saved into the settings', async () => {
    const { app, assets, settings, data, uidOf } = await library();
    const winter = await uidOf('Winter Camp');
    const view = render(<Library app={app} assets={assets} collection="Winter Camp" uid={winter} />);
    await waitFor(() => expect(offerShown(view)).toBe(true));

    data.set({ hiddenStarterOffers: [winter] });
    await act(async () => settings.reload());
    await waitFor(() => expect(offerShown(view)).toBe(false));
  });

  it('reads a damaged list as none', async () => {
    const settings = new SettingsService(createInMemoryApp().app, undefined, memoryPluginData({ hiddenStarterOffers: 'all' }));
    await settings.initialize();
    expect(settings.isStarterOfferHidden('all')).toBe(false);
  });
});

describe("the Create menu's Get starter tokens", () => {
  const openMenu = (view: RenderResult): void => {
    fireEvent.click(view.getByRole('button', { name: 'Create' }));
  };

  it('is offered on the Tokens tab whether or not the sidebar offer is hidden, and leaves it hidden', async () => {
    const { app, assets, settings, uidOf } = await library();
    const winter = await uidOf('Winter Camp');
    const view = render(<Library app={app} assets={assets} collection="Winter Camp" uid={winter} />);
    await waitFor(() => expect(offerShown(view)).toBe(true));
    openMenu(view);
    expect(view.getByRole('menuitem', { name: new RegExp(t('am.header.getStarterTokens')) })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Create' }));

    await act(async () => fireEvent.click(view.getByRole('button', { name: t('am.bestiary.hide') })));
    openMenu(view);
    const item = view.getByRole('menuitem', { name: new RegExp(t('am.header.getStarterTokens')) });
    expect(item.hasAttribute('disabled')).toBe(false);
    await act(async () => fireEvent.click(item));

    expect(view.getByRole('dialog', { name: t('am.bestiary.statblocks') })).toBeTruthy();
    expect(settings.isStarterOfferHidden(winter)).toBe(true);
  });

  it('is not in the menu on other tabs', async () => {
    const { app, assets, uidOf } = await library();
    const view = render(<Library app={app} assets={assets} collection="Winter Camp" uid={await uidOf('Winter Camp')} tab="maps" />);
    await act(async () => undefined);
    openMenu(view);
    expect(view.queryByRole('menuitem', { name: new RegExp(t('am.header.getStarterTokens')) })).toBeNull();
  });
});
