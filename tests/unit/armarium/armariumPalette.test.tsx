// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';

const app = {};
vi.mock('../../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/app/react/root/AtlasUIContext')>(), useAtlasUI: () => ({ app, view: { viewId: 'armarium-test' } }) }));
vi.mock('../../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));
vi.mock('../../../src/app/armarium/showArmarium', () => ({ showArmarium: vi.fn(async () => undefined) }));

import { CommandPalette } from '../../../src/app/react/components/CommandPalette';
import { showArmarium } from '../../../src/app/armarium/showArmarium';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('the command palette', () => {
  it('opens the Armarium, then closes', () => {
    const store = create(() => ({ isDocsOpen: false, setDocsOpen: vi.fn() }));
    const onClose = vi.fn();
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);
    fireEvent.change(screen.getByPlaceholderText('Search commands…'), { target: { value: 'store' } });

    fireEvent.click(screen.getByRole('button', { name: /Armarium/ }));

    expect(showArmarium).toHaveBeenCalledWith(app);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
