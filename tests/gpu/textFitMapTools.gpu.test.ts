import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import tooltipCss from '../../src/app/packages/components/primitives/tooltip.scss?inline';
import contextMenuCss from '../../src/app/react/components/context-menu/atlas-context-menu.scss?inline';
import { setLocale } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { closeContextMenuGlobal } from '../../src/app/react/root/ContextMenuContext';
import { DASHBOARD_THEME } from './dashboardTheme';
import { LANGUAGES, describeMisfits, textMisfits } from './textFit';
import { SURFACES, type Check, type Surface } from './textFitMapToolsSurfaces';
import { handle, installToolbarStyles, mountToolbar, settle } from './toolbarEditorHarness';

// MainToolbar pulls these in; the toolbar's surfaces open none of them.
vi.mock('events', async () => import('eventemitter3'));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ openPlayerWindow: vi.fn(), presentActiveTab: vi.fn(), presentTab: vi.fn(), frameSourceOf: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/PlayerViewSettingsPanel', () => ({ PlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

/**
 * Every language Atlas speaks, on the map's tools at a wide and a narrow window: their menus, bars, popovers,
 * dialogs, context menus, initiative cards and the toolbar editor's card. No text spills out of its box, is cut
 * off without an ellipsis, or lies on a control or on other text.
 */
const WINDOWS = [{ width: 1440, height: 900 }, { width: 760, height: 900 }] as const;
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #dadada; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --background-modifier-form-field: #2a2a2a; --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --interactive-normal: #333; --mono-100: #fff; --mono-0: #000; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3; --icon-m: 18px;
    --shadow-l: 0 8px 24px rgba(0, 0, 0, 0.5); --text-error: #fb464c; --size-2-1: 2px;
    --menu-background: var(--background-secondary); --menu-border-color: var(--background-modifier-border); }
  button, input { font: inherit; }
`;
const cardShown = (): boolean => {
  const card = document.querySelector<HTMLElement>('.atlas-toolbar-card');
  return !!card && !card.hidden && getComputedStyle(card).opacity === '1';
};
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/** The toolbar as the map has it: every tool's menu, then the editor with the card over a tool. */
const toolbarEditor: Surface = {
  name: 'toolbar',
  run: async (check: Check) => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
    // The editor's card waits on its springs, as in the app.
    MotionGlobalConfig.skipAnimations = false;
    try {
      const harness = await mountToolbar();
      // As `startEditing`, without handing its setter's promise to `act`, which would leave an act scope open.
      act(() => { harness.store.getState().setToolbarEditing(true); });
      await settle(40);
      // Keyboard focus opens the card at once.
      handle('draw', 'bar').focus();
      await userEvent.keyboard('{ArrowRight}');
      await expect.poll(() => cardShown(), { timeout: 3000 }).toBe(true);
      await sleep(200);
      check(document.body, 'toolbar editor card');
      cleanup();
      await mountToolbar();
      check(document.body, 'toolbar');
      const menuButtons = [...document.querySelectorAll<HTMLElement>('.atlas-main-toolbar .atlas-dropdown-trigger, .atlas-main-toolbar button[aria-haspopup]')];
      for (const [index, button] of menuButtons.entries()) {
        if (!button.isConnected || button.closest('[hidden]')) continue;
        button.click();
        await settle(20);
        check(document.body, `toolbar, menu ${index + 1}`);
        button.click();
        await settle(20);
      }
    } finally {
      Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
      MotionGlobalConfig.skipAnimations = true;
    }
  },
};

describe('the map tools\' text fits its place in every language', () => {
  const style = document.createElement('style');

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
    setLocale('en', TRANSLATIONS);
  });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  for (const language of LANGUAGES) {
    it(`fits in ${language}`, async () => {
      setLocale(language, TRANSLATIONS);
      const found: string[] = [];
      for (const size of WINDOWS) {
        await page.viewport(size.width, size.height);
        for (const surface of [...SURFACES, toolbarEditor]) {
          const removeToolbarStyles = installToolbarStyles();
          style.textContent = (surface.name === 'cheat sheet' ? DASHBOARD_THEME : THEME) + css + tooltipCss + contextMenuCss;
          document.head.append(style);
          document.body.className = 'theme-dark';
          await surface.run((root, state) => {
            found.push(...describeMisfits(textMisfits(root)).map((line) => `${state} @${size.width}: ${line}`));
          });
          closeContextMenuGlobal();
          cleanup();
          removeToolbarStyles();
          style.remove();
        }
      }
      expect([...new Set(found)]).toEqual([]);
    }, 600_000);
  }
});
