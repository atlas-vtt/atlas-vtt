// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { NOTE_PATH, renderPane } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

const HAG_PATH = 'Bestiary/Bog Hag.md';
const native = (name: string): Record<string, unknown> => ({ statblock: true, 'atlas-template': 'builtin:generic-creature', name, hp: 14 });

describe('the pane\'s focus request', () => {
  it('moves focus into the pane once when the pair opens, never again as the pane follows its partner', async () => {
    const harness = await renderPane({
      frontmatter: native('Marsh Warden'),
      focusRequest: 1,
      files: { [NOTE_PATH]: '---\nstatblock: true\n---\n', [HAG_PATH]: '---\nstatblock: true\n---\n' },
    });
    apps.push(harness.app);
    const card = harness.result.container.querySelector('.atlas-sb-pane-card');
    expect(card?.contains(document.activeElement)).toBe(true);

    // The user went back to the note, then followed a link to another statblock.
    const note = document.body.appendChild(document.createElement('textarea'));
    note.focus();
    act(() => harness.source.set(HAG_PATH, native('Bog Hag')));
    await act(async () => { harness.rerender({ notePath: HAG_PATH, focusRequest: 1 }); });
    await act(async () => { await Promise.resolve(); });

    expect(harness.result.container.querySelector('[data-block-id="header-name"]')?.textContent).toBe('Bog Hag');
    expect(document.activeElement).toBe(note);
    note.remove();
  });

  it('opens the first empty value\'s input, and takes focus back from the note focusing as its leaf opens', async () => {
    const harness = await renderPane({ frontmatter: native('Marsh Warden'), focusRequest: 1 });
    apps.push(harness.app);
    const card = harness.result.container.querySelector<HTMLElement>('.atlas-sb-pane-card');
    const input = document.activeElement as HTMLElement | null;
    expect(input?.matches('input, textarea')).toBe(true);
    expect(input?.closest('.atlas-sb-pane-editor')).not.toBeNull();

    // Obsidian focuses the note's editor as the leaf becomes active.
    const note = document.body.appendChild(document.createElement('textarea'));
    note.focus();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });

    expect(card?.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).matches('input, textarea')).toBe(true);
    note.remove();
  });
});
