import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiceRollEntry } from '../../src/app/react/components/dice-log/DiceRollEntry';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function renderEntry(overrides: Partial<DiceRollResult> = {}): void {
  const { app } = createInMemoryApp({ files: {} });
  const result: DiceRollResult = {
    id: 'roll', timestamp: Date.now(), formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }],
    modifiers: 0, total: 13, ...overrides,
  };
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <DiceRollEntry result={result} onRepeat={vi.fn()} />
    </AtlasUIContext.Provider>
  );
}

describe('the GM dice log', () => {
  it('marks an entry that was a secret roll', () => {
    renderEntry({ secret: true });
    expect(screen.queryByText('Secret')).not.toBeNull();
  });

  it('does not mark an entry that was a normal roll', () => {
    renderEntry();
    expect(screen.queryByText('Secret')).toBeNull();
  });
});
