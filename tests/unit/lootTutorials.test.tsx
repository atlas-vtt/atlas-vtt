// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { Tutorial } from '../../src/app/onboarding/Tutorial';
import { lootRollerSteps } from '../../src/app/onboarding/lootTutorials';
import { LootRollerTutorials } from '../../src/app/react/components/loot/LootRollerTutorials';
import { LootEmptyState } from '../../src/app/react/components/loot/LootEmptyState';
import { RandomTablesTab } from '../../src/app/react/components/collection-settings/RandomTablesTab';

afterEach(cleanup);

function appWithSettings(): { app: App; settings: SettingsService } {
  const app = new App();
  app.vault = { adapter: { exists: async () => true, write: async () => undefined }, getFiles: () => [], on: () => ({}), offref: () => undefined };
  app.metadataCache = { on: () => ({}), offref: () => undefined };
  return { app, settings: new SettingsService(app) };
}

function renderTours(app: App, props: { hasRarities: boolean; rolled: boolean }): void {
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <LootRollerTutorials {...props} />
    </AtlasUIContext.Provider>,
  );
}

describe('tutorial steps with screenshots', () => {
  it('shows a step’s screenshot above its text, under the tour’s own name', () => {
    const { settings } = appWithSettings();
    render(<Tutorial settings={settings} id="lootSettings" label="Loot" steps={[
      { title: 'Loot lives in your notes', body: 'Gather items in a base.', image: { src: 'base.webp', alt: 'A base of item notes' } },
      { title: 'Name your currency', body: 'Plain numbers read in it.' },
    ]} />);

    expect(screen.getByRole('img', { name: 'A base of item notes' }).getAttribute('src')).toBe('base.webp');
    expect(screen.getByText('Loot · 1 / 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('the loot roller’s tours', () => {
  it('leaves out the rarity step when no item names a rarity', () => {
    expect(lootRollerSteps('L', true).map((step) => step.title)).toContain('Filter by rarity');
    expect(lootRollerSteps('L', false).map((step) => step.title)).not.toContain('Filter by rarity');
    expect(lootRollerSteps('L', false).some((step) => step.body.includes('Press L'))).toBe(true);
  });

  it('tours the window first, and the cards only after a roll made in it', () => {
    const { app, settings } = appWithSettings();
    renderTours(app, { hasRarities: true, rolled: true });
    expect(screen.getByText('Pick what to roll from')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(settings.shouldShowTutorial('lootRoller')).toBe(false);
    cleanup();

    renderTours(app, { hasRarities: true, rolled: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();

    renderTours(app, { hasRarities: true, rolled: true });
    expect(screen.getByText('Read an item')).toBeTruthy();
  });
});

describe('the empty Random tables window', () => {
  it('offers a table from a note in a collection without tables', () => {
    const onUseNote = vi.fn();
    render(<LootEmptyState inCollection basesOff={false} onUseNote={onUseNote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a table from a note' }));
    expect(onUseNote).toHaveBeenCalledOnce();
  });

  it('has nothing to set up outside a collection or while Bases is off', () => {
    render(<LootEmptyState inCollection={false} basesOff={false} onUseNote={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    render(<LootEmptyState inCollection basesOff onUseNote={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('the Random tables tab of the collection settings', () => {
  it('tours loot on its first visit and ends by adding the first base', () => {
    const { app, settings } = appWithSettings();
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <RandomTablesTab
          app={app} lootBases={[]} onBasesChange={vi.fn()} randomTables={[]} onRandomTablesChange={vi.fn()} currency="" onCurrencyChange={vi.fn()}
          itemRarities={undefined} onItemRaritiesChange={vi.fn()} systemPresetId={undefined} presets={[]}
        />
      </AtlasUIContext.Provider>,
    );
    expect(screen.getByText('Loot lives in your notes')).toBeTruthy();
    for (let step = 0; step < 3; step++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add a base' }));

    expect(settings.shouldShowTutorial('lootSettings')).toBe(false);
    expect(screen.getByPlaceholderText('Search bases...')).toBeTruthy();
  });
});
