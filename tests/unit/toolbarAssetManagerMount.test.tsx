// @vitest-environment jsdom
import React from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderToolbar, setUpToolbarTestDom } from './toolbarEditorHarness';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => <div data-testid="asset-manager" /> }));

setUpToolbarTestDom();

describe('the asset manager the toolbar opens', () => {
  it('lies under a scope element on the body, outside the leaf, so the rules that place its overlay reach it', () => {
    const { container } = renderToolbar();

    const manager = screen.getByTestId('asset-manager');

    // Every rule of the stylesheet is `.atlas-vtt-plugin .x`: an overlay with no such ancestor is not fixed and falls below the window.
    expect(manager.parentElement?.closest('.atlas-vtt-plugin')).not.toBeNull();
    expect(container.contains(manager)).toBe(false);
  });
});
