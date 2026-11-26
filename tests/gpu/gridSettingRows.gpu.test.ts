import '../setup/obsidianDom';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { CollectionSettingsModal } from '../../src/app/react/components/CollectionSettingsModal';
import { AssetService } from '../../src/app/services/AssetService';
import { TABLE_FILES, TABLES_THEME } from './randomTablesHarness';

vi.mock('events', async () => import('eventemitter3'));

const box = (element: Element): DOMRect => element.getBoundingClientRect();

/** The Grid and measurement tab's rows in a real layout: fields side by side line up, and a select's list shows every option whole. */
describe('the grid and measurement rows', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  beforeEach(async () => {
    document.body.className = 'theme-dark';
    document.head.append(style);
    await page.viewport(1440, 900);
    const { app } = createInMemoryApp({ files: TABLE_FILES });
    AssetService.resetInstance();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    render(createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
      createElement(CollectionSettingsModal, { isOpen: true, collectionId: assets.getDefaultCollectionId(), initialTab: 'grid', onClose: () => undefined })));
    await expect.poll(() => document.querySelector('.atlas-csm-square')).not.toBeNull();
  });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('gives the distance and its unit one height and one corner', () => {
    const square = document.querySelector('.atlas-csm-square')!;
    const field = square.querySelector('input')!;
    const unit = square.querySelector('.atlas-select-trigger')!;
    expect(box(unit).height).toBeCloseTo(box(field).height, 0);
    expect(box(unit).top).toBeCloseTo(box(field).top, 0);
    expect(getComputedStyle(unit).borderTopLeftRadius).toBe(getComputedStyle(field).borderTopLeftRadius);
  });

  it('shows every unit whole, the list inside the dialog', async () => {
    const unit = document.querySelector<HTMLElement>('.atlas-csm-square .atlas-select-trigger')!;
    fireEvent.click(unit);
    await expect.poll(() => screen.queryAllByRole('option').length).toBe(5);
    for (const text of document.querySelectorAll<HTMLElement>('.atlas-select-option-text')) {
      expect(text.scrollWidth, text.textContent ?? '').toBeLessThanOrEqual(text.clientWidth);
    }
    // Once its scale-in has ended
    const listElement = document.querySelector('.atlas-select-content')!;
    await expect.poll(() => box(listElement).width >= box(unit).width - 0.5).toBe(true);
    const list = box(listElement);
    const page = box(document.querySelector('.atlas-collection-settings-content')!);
    expect(list.right).toBeLessThanOrEqual(page.right + 0.5);
  });
});
