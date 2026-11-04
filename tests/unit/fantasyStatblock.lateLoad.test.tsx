// @vitest-environment jsdom
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';


import FantasyStatblock from '../../src/app/react/components/FantasyStatblock';

type Handler = () => void;

/** Minimal app whose workspace event bus works before Fantasy Statblocks loads. */
function fakeApp() {
  const handlers = new Map<string, Handler[]>();
  return {
    workspace: {
      on: (event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return { event, handler };
      },
      offref: () => undefined,
      trigger: (event: string) => handlers.get(event)?.forEach((handler) => handler()),
    },
    vault: { getAbstractFileByPath: () => null },
    metadataCache: { getFirstLinkpathDest: () => null },
    plugins: {
      plugins: {
        'obsidian-5e-statblocks': {
          manager: {
            getAllLayouts: () => [],
            getLayout: () => null,
            getDefaultLayout: () => ({
              name: 'Basic',
              id: 'basic',
              blocks: [{ type: 'heading', id: 'h', properties: ['name'], size: 1 }],
            }),
          },
        },
      },
    },
  } as never;
}

/** Installs the Fantasy Statblocks global, as the plugin does when it loads. */
function installFantasyStatblocks(): void {
  (window as never as Record<string, unknown>).FantasyStatblocks = {
    getBestiaryCreatures: () => [{ name: 'Giant Toad', path: 'bestiary/toad.md' }],
    hasCreature: (name: string) => name === 'Giant Toad',
    getCreatureFromBestiary: () => ({ name: 'Giant Toad', path: 'bestiary/toad.md' }),
    isResolved: () => true,
    onResolved: () => undefined,
    onUpdated: () => undefined,
    render: () => undefined,
    getBestiaryNames: () => ['Giant Toad'],
  };
}

afterEach(() => {
  delete (window as never as Record<string, unknown>).FantasyStatblocks;
});

describe('FantasyStatblock when Fantasy Statblocks loads late', () => {
  it('renders once the bestiary becomes available after mount', () => {
    const app = fakeApp();

    // Mounted before Fantasy Statblocks exists — as happens on window reload
    // with a statblock note already open.
    const { container } = render(
      <FantasyStatblock notePath="bestiary/toad.md" app={app} />,
    );
    expect(container.textContent).toContain('Install and enable');

    installFantasyStatblocks();
    act(() => {
      (app as never as { workspace: { trigger(event: string): void } }).workspace.trigger(
        'fantasy-statblocks:bestiary:resolved',
      );
    });

    expect(container.querySelector('.atlas-statblock')).not.toBeNull();
    expect(container.textContent).toContain('Giant Toad');
  });
});
