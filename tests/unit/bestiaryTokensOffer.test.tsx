// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BestiaryTokensOffer } from '../../src/app/packages/components/asset-manager/components/BestiaryTokensOffer';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { installBestiaryTokens, type InstallOptions } from '../../src/app/services/stockPacks/bestiaryTokens';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/services/stockPacks/bestiaryTokens', async (original) => ({
  ...(await original<typeof import('../../src/app/services/stockPacks/bestiaryTokens')>()),
  installBestiaryTokens: vi.fn(),
}));
vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

beforeEach(() => AssetService.resetInstance());
afterEach(cleanup);

it("keeps the button's label while it downloads, and shows how far it got in a bar below it", async () => {
  const { app } = createInMemoryApp();
  await new SettingsService(app).initialize();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  let step: (share: number) => void = () => undefined;
  let finish: (count: number) => void = () => undefined;
  vi.mocked(installBestiaryTokens).mockImplementation((_app, _assets, _collection, options: InstallOptions = {}) => {
    step = options.onStep ?? step;
    return new Promise((resolve) => { finish = resolve; });
  });

  const view = render(<BestiaryTokensOffer app={app} assets={assets} collection={assets.getDefaultCollectionId()} variant="empty" fallback={<p>hint</p>} />);
  const button = await view.findByRole('button', { name: /Download 155 free tokens/ });
  await act(async () => button.click());

  const busy = view.container.querySelector<HTMLButtonElement>('.atlas-bestiary-offer--empty')!;
  expect(busy.textContent).toBe('Downloading…');
  expect(busy.getAttribute('aria-busy')).toBe('true');
  expect(busy.querySelector('.atlas-spinner')).not.toBeNull();
  const bar = view.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('0');

  await act(async () => step(0.42));
  expect(busy.textContent).toBe('Downloading…');
  expect(view.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('42%');

  await act(async () => finish(155));
  expect(view.queryByRole('progressbar')).toBeNull();
});
