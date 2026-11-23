import '../setup/obsidianDom';
import React, { createElement, useEffect, useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { withStatblockEditor } from '../mocks/experimentalFeatures';
import { memoryPresets } from '../mocks/memoryPresets';
import { setLocale } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { CollectionSettingsModal, type CollectionSettingsTab } from '../../src/app/react/components/CollectionSettingsModal';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DiceLabDialog } from '../../src/app/react/components/collection-settings/dice-lab/DiceLabDialog';
import { DiceSetService } from '../../src/app/services/diceSets/DiceSetService';
import { AssetService } from '../../src/app/services/AssetService';
import { TABLE_FILES, TABLES_THEME } from './randomTablesHarness';
import { LANGUAGES, describeMisfits, textMisfits } from './textFit';

// The dialog reaches services that load Node's events module.
vi.mock('events', async () => import('eventemitter3'));

/**
 * Every language Atlas speaks, on the settings surfaces, at a wide and a narrow window: no text spills out of its
 * box, is cut off without an ellipsis, or lies on a control or on other text.
 */
const WINDOWS = [{ width: 1440, height: 900 }, { width: 760, height: 900 }] as const;
const TABS: readonly CollectionSettingsTab[] = [
  'system', 'dice', 'grid', 'vision', 'widgets', 'conditions', 'resources', 'statblocks', 'creatureFilters', 'loot',
];
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const h = React.createElement;

async function openSettings(tab: CollectionSettingsTab): Promise<Element> {
  const { app } = createInMemoryApp({ files: TABLE_FILES });
  withStatblockEditor(app);
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  render(createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
    createElement(CollectionSettingsModal, { isOpen: true, collectionId: assets.getDefaultCollectionId(), initialTab: tab, onClose: () => undefined })));
  await expect.poll(() => document.querySelector('.atlas-collection-settings-modal')).not.toBeNull();
  await settle();
  return document.querySelector('.atlas-collection-settings-modal')!;
}

const SETS = [
  { id: 'd20', name: 'd20', crit: 'natural', dice: [{ count: 1, sides: 20 }], explode: undefined },
  { id: 'duality', name: 'Duality', crit: 'doubles', dice: [{ count: 1, sides: 12, name: 'Hope' }, { count: 1, sides: 12, name: 'Fear' }] },
];

function Lab(): React.ReactElement {
  const [service] = useState(() => new DiceSetService(memoryPresets(SETS)));
  const [sets, setSets] = useState(() => service.list());
  useEffect(() => service.onChange(() => setSets(service.list())), [service]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', ref: setAnchor },
    anchor && h(DiceLabDialog, { anchor, diceSets: { service, sets }, initialId: 'd20', onClose: () => undefined })));
}

async function openDiceLab(): Promise<Element> {
  render(h(Lab));
  await expect.poll(() => document.querySelector('.atlas-dice-lab__options')).not.toBeNull();
  await settle();
  return document.querySelector('.atlas-dice-lab__options')!;
}

const SURFACES: ReadonlyArray<{ name: string; open: () => Promise<Element> }> = [
  ...TABS.map((tab) => ({ name: `collection settings, ${tab}`, open: () => openSettings(tab) })),
  { name: 'dice lab options', open: openDiceLab },
];

describe('text fits its place in every language', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
    setLocale('en', TRANSLATIONS);
  });
  beforeEach(() => {
    document.body.className = 'theme-dark';
    document.head.append(style);
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
        for (const surface of SURFACES) {
          const root = await surface.open();
          found.push(...describeMisfits(textMisfits(root)).map((line) => `${surface.name} @${size.width}: ${line}`));
          cleanup();
        }
      }
      expect([...new Set(found)]).toEqual([]);
    }, 240_000);
  }
});
