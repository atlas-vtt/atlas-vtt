// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import type { App } from 'obsidian';
import { BestiaryTokensOffer } from '../../src/app/packages/components/asset-manager/components/BestiaryTokensOffer';
import { useStarterOfferDismissal } from '../../src/app/packages/components/asset-manager/hooks/useStarterOfferDismissal';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { showAtlasToast, type AtlasToastAction } from '../../src/app/react/components/AtlasToast';
import { t } from '../../src/app/i18n';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryPluginData } from '../mocks/pluginData';

vi.mock('../../src/app/react/components/AtlasToast', () => ({ showAtlasToast: vi.fn(() => ({ dismiss: () => undefined })) }));

/** The sidebar's offer, as the asset manager wires it for one collection. */
function Library({ app, assets, collection, uid }: { app: App; assets: AssetService; collection: string; uid: string }): React.JSX.Element {
  const offer = useStarterOfferDismissal(app, uid);
  return <BestiaryTokensOffer app={app} assets={assets} collection={collection} variant="sidebar" dismissed={offer.dismissed} {...(offer.dismiss && { onDismiss: offer.dismiss })} />;
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
