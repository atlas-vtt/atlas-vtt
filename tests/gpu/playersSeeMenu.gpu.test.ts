import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { PlayersSeeMenu } from '../../src/app/packages/components/player-window-bar/PlayersSeeMenu';
import { SettingsService } from '../../src/app/services/SettingsService';
import { withPlayerAudience } from '../../src/app/resources/playerAudience';
import { AMMO, HP, STR, STRESS } from '../mocks/resourceFixtures';

const named = (name: string, slot: number) => ({ ...AMMO, key: name.toLowerCase(), name, slot });
const context = vi.hoisted(() => ({ resources: [] as unknown[] }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => context.resources }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useAtlasStore: (selector: (state: { mapPath: string }) => unknown) => selector({ mapPath: 'atlas-vtt/collections/Own/scenes/Cave.atlasmap' }) }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({ getCollectionForMap: () => 'Own', getCollectionSettings: () => ({ conditions: [] }), updateCollectionSettings: async () => undefined }) } }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (original) => ({ ...(await original<object>()), useAtlasUI: () => ({ app: {} }) }));

/** The menu as the player window bar shows it, in a leaf of the given width, styled by the plugin's real stylesheet. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; }
  button { height: 30px; }
  .workspace-leaf { position: fixed; left: 0; top: 0; height: 100vh; overflow: hidden; }
`;
const h = React.createElement;

describe('what players see, as a menu', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1300, 900);
    document.head.append(style);
    context.resources = [
      withPlayerAudience({ ...HP, slot: 0 }, 'party'), { ...STRESS, slot: 1 }, withPlayerAudience({ ...STR, slot: 2 }, 'everyone'),
      withPlayerAudience({ ...AMMO, slot: 3 }, 'opponents'), named('Luck', 4), named('Spell slots', 5),
    ];
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const open = (leafWidth: number): HTMLElement => {
    const settings = new SettingsService({} as never);
    settings.setExperimental('onlinePlay', true);
    render(h('div', { className: 'workspace-leaf', style: { width: leafWidth } },
      h('div', { className: 'atlas-vtt-plugin' },
        h('div', { className: 'atlas-player-window-bar', style: { position: 'absolute', left: 16, top: 16 } },
          h(TooltipProvider, null, h(PlayersSeeMenu, { open: true, onToggle: () => undefined, settings, windowOpen: true, online: true }))))));
    return document.querySelector<HTMLElement>('.atlas-players-see-menu')!;
  };
  const columns = (): DOMRect[] => [...document.querySelectorAll('.atlas-players-see-menu__column')].map((column) => column.getBoundingClientRect());

  it('stands its columns side by side where the view has room, top-aligned, inside the view', async () => {
    const menu = open(1200);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const [shared, own] = columns();
    expect(own!.left).toBeGreaterThan(shared!.right);
    expect(own!.top).toBeCloseTo(shared!.top, 0);
    expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(1200 - 8);
  });

  it('stacks its columns where the view is narrow, and never runs past the view or scrolls sideways', async () => {
    const menu = open(420);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const [shared, own] = columns();
    expect(own!.top).toBeGreaterThanOrEqual(shared!.bottom);
    const rect = menu.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(8);
    expect(rect.right).toBeLessThanOrEqual(420 - 8);
    expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth);
  });

  it('puts each resource\'s name on the text edge and its choice at the row\'s end, the four choices on one line', async () => {
    open(1200);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rows = [...document.querySelectorAll<HTMLElement>('.atlas-dropdown-choice-row')];
    expect(rows).toHaveLength(6);
    const toggleLabel = document.querySelector('.atlas-dropdown-toggle-row__label')!.getBoundingClientRect();
    const toggle = document.querySelector('.atlas-dropdown-toggle-row .atlas-toggle')!.getBoundingClientRect();
    for (const row of rows) {
      const label = row.querySelector('.atlas-dropdown-choice-row__label')!.getBoundingClientRect();
      const control = row.querySelector('.atlas-segmented')!.getBoundingClientRect();
      expect(label.left).toBeCloseTo(toggleLabel.left, 0);
      expect(control.right).toBeCloseTo(toggle.right, 0);
      const options = [...row.querySelectorAll('.atlas-segmented__option')].map((option) => option.getBoundingClientRect());
      expect(new Set(options.map((option) => Math.round(option.top))).size).toBe(1);
      expect(new Set(options.map((option) => Math.round(option.height))).size).toBe(1);
    }
  });
});
