// @vitest-environment jsdom
import React, { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useChromeAutoHide } from '../../src/app/react/components/chrome-auto-hide/useChromeAutoHide';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function Root({ settings }: { settings: SettingsService }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useChromeAutoHide(ref, false, settings);
  return <div ref={ref} className="atlas-ui" />;
}

afterEach(cleanup);

describe('useChromeAutoHide', () => {
  // UIRoot calls it outside the view's context, which it provides itself: the switch must reach it all the same.
  it('follows the setting without the view context around it', () => {
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    const store = createViewAtlasStore(app, `chrome-auto-hide-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    const { container } = render(<ViewStoreProvider store={store}><Root settings={settings} /></ViewStoreProvider>);
    const root = container.querySelector('.atlas-ui')!;
    expect(root.hasAttribute('data-chrome-auto-hide')).toBe(false);

    act(() => { settings.setToolbarAutoHide(true); });
    expect(root.hasAttribute('data-chrome-auto-hide')).toBe(true);

    act(() => { store.getState().setToolbarEditing(true); });
    expect(root.hasAttribute('data-chrome-auto-hide')).toBe(false);
  });
});
