// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LootBase, LootViewStatus } from '../../src/app/loot/LootBaseReader';
import { BaseSourceRow } from '../../src/app/react/components/collection-settings/random-tables/BaseSourceRow';

const base = (...statuses: LootViewStatus[]): LootBase => ({
  path: 'Loot/Items.base',
  name: 'Items',
  missing: false,
  views: statuses.map((status, index) => ({
    id: `Loot/Items.base#View ${index}`,
    name: `View ${index}`,
    status,
    items: status === 'ready' ? [{ id: `Items/${index}.md`, name: `Item ${index}`, source: ['Items', `View ${index}`], properties: [] }] : [],
  })),
});

const row = (read: LootBase | undefined): void => {
  render(<BaseSourceRow path="Loot/Items.base" base={read} onRemove={() => undefined} />);
};

describe('a loot base in the collection\'s random tables', () => {
  it('says it is being read only while a view is', () => {
    row(base('ready', 'loading'));
    expect(screen.getByText('Reading…')).toBeTruthy();
  });

  it('counts its views and items once they are read', () => {
    row(base('ready', 'ready'));
    expect(screen.getByText('2 views · 2 items')).toBeTruthy();
  });

  it('says a view could not be read instead of reading for ever', () => {
    row(base('ready', 'unreadable'));
    expect(screen.queryByText('Reading…')).toBeNull();
    expect(screen.getByText('Could not be read')).toBeTruthy();
  });
});
