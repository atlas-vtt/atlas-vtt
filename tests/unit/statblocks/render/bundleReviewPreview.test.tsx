// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { useModHoverStatblockPreview } from '../../../../src/app/packages/components/asset-manager/hooks/useModHoverStatblockPreview';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { LibraryTemplate } from '../../../../src/app/statblocks/model/resolvedTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { libraryEntry } from '../library/templateTexts';
import { NATIVE, barOf, noteText, sheetOf, unloadFantasyStatblocks } from './linkedStatblockKit';

const BUNDLE_NOTE = 'Bundle/Bestiary/Marsh Warden.md';
const WINDOW = '.atlas-statblock-preview-window';

let current: CreatureVault;

beforeEach(() => {
  current = creatureVault();
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
  Platform.isMacOS = true;
});

afterEach(async () => {
  cleanup();
  // The window unmounts its statblock a task after it closes.
  await act(async () => { await new Promise((done) => setTimeout(done, 200)); });
  TemplateLibrary.release(current.app);
  unloadFantasyStatblocks();
  document.body.empty();
  Platform.isMacOS = false;
  vi.unstubAllGlobals();
});

function BundlePane({ container, bundleTemplates }: { container: HTMLElement; bundleTemplates?: readonly LibraryTemplate[] }): null {
  useModHoverStatblockPreview({
    app: current.app,
    container,
    cardSelector: '.card',
    targetOf: () => ({ key: 'warden', notePath: BUNDLE_NOTE, token: { name: 'Marsh Warden' } }),
    noteText: () => Promise.resolve(noteText(NATIVE)),
    bundleTemplates,
  });
  return null;
}

/** Holds Mod over the bundle's token card and returns the preview window once its statblock shows. */
async function hoverBundleToken(bundleTemplates?: readonly LibraryTemplate[]): Promise<HTMLElement> {
  const pane = document.body.createDiv();
  const card = pane.createDiv({ cls: 'card' });
  render(<BundlePane container={pane} bundleTemplates={bundleTemplates} />);
  fireEvent.mouseMove(card, { metaKey: true });
  return vi.waitFor(() => {
    const preview = document.body.querySelector<HTMLElement>(WINDOW);
    if (!preview || !sheetOf(preview)) throw new Error('No statblock in the preview yet');
    return preview;
  });
}

describe('the bundle review\'s statblock preview', () => {
  it('draws a native note of the bundle with the bundle\'s own template', async () => {
    const preview = await hoverBundleToken([libraryEntry(MARSH_CREATURE, 'Marsh creature')]);
    const card = sheetOf(preview)!;
    expect(card.dataset.template).toBe('marsh-creature');
    expect(card.dataset.variant).toBe('hover');
    // Values reach the card through Obsidian's Markdown renderer, after the card itself.
    await vi.waitFor(() => expect(card.textContent).toContain('Marsh Warden'));
    expect(barOf(preview)).toBeNull();
  });

  it('shows the missing-template state when the bundle brings no template', async () => {
    const preview = await hoverBundleToken();
    await waitFor(() => expect(barOf(preview)).toBe('Template not found'));
    expect(sheetOf(preview)?.dataset.template).toBe('auto');
  });
});
