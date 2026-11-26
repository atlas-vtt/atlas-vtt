import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { setLocale, t, type MessageKey } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { SegmentedControl } from '../../src/app/packages/components/primitives/SegmentedControl';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { DASHBOARD_THEME } from './dashboardTheme';
import { LANGUAGES, describeMisfits, textMisfits } from './textFit';

/**
 * The map's small popovers whose choices are a segmented control (stairs, openings, light zones), at their real
 * width: no choice may run out of its option or into its neighbour. Their choices are named when their module
 * loads, in the language Atlas speaks then, and a module loads once per test file, so the popovers themselves
 * load in Portuguese (where the stairs' choices ran into each other) and every language is laid out in the same
 * popover frame with the same control.
 */

const h = React.createElement;
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const AREA = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }];

interface Popover {
  name: string;
  /** Its choices, in order. */
  choices: readonly MessageKey[];
  host: () => Promise<React.ComponentType>;
  open: (store: ViewAtlasStore) => void;
}

const POPOVERS: readonly Popover[] = [
  {
    name: 'stairs',
    choices: ['levels.stairsUp', 'levels.stairsDown', 'levels.stairsBoth'],
    host: async () => (await import('../../src/app/react/components/levels/LevelLinkPopover')).LevelLinkPopoverHost,
    open: (store) => {
      store.setState({ objects: { ...store.getState().objects, levelLinks: { stairs: { id: 'stairs', kind: 'level-link', polygon: AREA, levels: ['ground', 'upper'] } } } });
      store.getState().openLevelLinkPopover('stairs');
    },
  },
  {
    name: 'opening',
    choices: ['openings.open', 'openings.floor'],
    host: async () => (await import('../../src/app/pixi/levelSurfaces/LevelSurfacePopover')).LevelSurfacePopoverHost,
    open: (store) => {
      store.setState({ objects: { ...store.getState().objects, levelSurfaces: { hole: { id: 'hole', kind: 'level-surface', polygon: AREA, open: true } } } });
      store.getState().openLevelSurfacePopover('hole');
    },
  },
  {
    name: 'light zone',
    choices: ['sceneLight.day', 'sceneLight.dusk', 'sceneLight.night', 'sceneLight.dark'],
    host: async () => (await import('../../src/app/pixi/lighting/LightZonePopover')).LightZonePopoverHost,
    open: (store) => {
      store.getState().setSceneLighting({ enabled: true, ambient: 1 });
      store.getState().openLightZonePopover(store.getState().addLightZone({ polygon: AREA, ambient: 0 }));
    },
  },
];

/** Labels taller than their option: `textMisfits` looks at the sides of a box only. */
function optionsOverflowed(root: Element): string[] {
  return [...root.querySelectorAll('.atlas-segmented__option')].flatMap((option) => {
    const box = option.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(option);
    const out = [...range.getClientRects()].some((rect) => rect.width > 0 && (rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5));
    return out ? [`"${option.textContent ?? ''}" runs out of its option`] : [];
  });
}

/** What does not fit in each popover, mounted in turn. */
async function misfitsOf(mount: (popover: Popover) => Element | Promise<Element>): Promise<string[]> {
  const found: string[] = [];
  for (const popover of POPOVERS) {
    const root = await mount(popover);
    found.push(...[...optionsOverflowed(root), ...describeMisfits(textMisfits(root))].map((line) => `${popover.name}: ${line}`));
    cleanup();
  }
  return found;
}

/** The popover as the map opens it; its module loads in the language set now. */
async function mountPopover(popover: Popover): Promise<Element> {
  const Host = await popover.host();
  const { createViewAtlasStore } = await import('../../src/app/storeFactory');
  const { ViewStoreProvider } = await import('../../src/app/react/ViewStoreContext');
  const { AtlasUIContext } = await import('../../src/app/react/root/AtlasUIContext');
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `segmented-fit-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ mapLoaded: true, isMapLoading: false, isGMView: true, levels: LEVELS, viewedLevel: 'ground', grid: { ...store.getState().grid!, size: 100 } });
  render(h('div', { className: 'atlas-vtt-plugin' },
    h(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } }, h(ViewStoreProvider, { store, children: h(Host) }))));
  act(() => { popover.open(store); });
  // Shown, not still at the opacity it opens from: `textMisfits` skips text that is not on screen.
  const shown = (): Element | null => [...document.querySelectorAll('.atlas-light-popover')].find((element) => getComputedStyle(element).opacity === '1') ?? null;
  await expect.poll(shown, { message: `${popover.name} popover` }).not.toBeNull();
  const root = shown();
  expect(root!.textContent).toContain(t(popover.choices.at(-1)!));
  return root!;
}

/** The popover's frame around its segmented control, with the choices named in the language set now. */
function mountChoices(popover: Popover): Element {
  const options = popover.choices.map((key) => ({ value: key, label: t(key) }));
  render(h('div', { className: 'atlas-vtt-plugin' },
    h('section', { className: 'atlas-light-popover' },
      h('div', { className: 'atlas-light-popover__section' },
        h(SegmentedControl<MessageKey>, { className: 'atlas-segmented--fit', value: popover.choices[0]!, options, ariaLabel: popover.name, onChange: () => undefined })))));
  return document.querySelector('.atlas-light-popover')!;
}

describe('the segmented choices of the map\'s popovers fit their option', () => {
  const style = document.createElement('style');

  beforeAll(async () => {
    MotionGlobalConfig.skipAnimations = true;
    await page.viewport(900, 700);
    style.textContent = DASHBOARD_THEME + css;
    document.head.append(style);
    document.body.className = 'theme-dark';
  });
  afterEach(cleanup);
  afterAll(() => {
    style.remove();
    MotionGlobalConfig.skipAnimations = false;
    setLocale('en', TRANSLATIONS);
  });

  it('in the popovers themselves, in Portuguese', async () => {
    setLocale('pt', TRANSLATIONS);
    expect(await misfitsOf(mountPopover)).toEqual([]);
  });

  it('wrapping a choice longer than its share onto more lines, every option growing alike', () => {
    setLocale('pt', TRANSLATIONS);
    const root = mountChoices(POPOVERS[0]!);
    const heights = [...root.querySelectorAll<HTMLElement>('.atlas-segmented__option')].map((option) => option.getBoundingClientRect().height);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThan(40);
  });

  it('keeping a choice that fits on one line as tall as a button', () => {
    setLocale('en', TRANSLATIONS);
    const root = mountChoices(POPOVERS[1]!);
    for (const option of root.querySelectorAll('.atlas-segmented__option')) expect(option.getBoundingClientRect().height).toBe(40);
  });

  for (const language of LANGUAGES) {
    it(`in ${language}`, async () => {
      setLocale(language, TRANSLATIONS);
      expect(await misfitsOf(mountChoices)).toEqual([]);
    });
  }
});
