import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { DiceToast } from '../../src/app/react/components/dice/DiceToast';
import { DiceRollHeader } from '../../src/app/react/components/dice3d/DiceRollHeader';
import type { RollSourcePresentation } from '../../src/app/react/components/dice/diceSourcePresentation';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(cleanup);

/** A roll that still carries everything about its source, as the GM's window gets it. */
const result: DiceRollResult = {
  id: 'r', timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 7, max: 20 }], modifiers: 0, total: 7,
  source: { type: 'statblock', tokenId: 'wolf', statblockPath: 'Bestiary/Wolf.md', tokenName: 'Wolf', tokenImagePath: 'tokens/wolf.webp', abilityName: 'Bite' },
};

function inView(app: App, element: React.ReactElement): HTMLElement {
  const context = { app, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  return render(<AtlasUIContext.Provider value={context}>{element}</AtlasUIContext.Provider>).container;
}

const shown = (presentation: RollSourcePresentation | null | undefined, app: App): HTMLElement[] => [
  inView(app, <DiceToast result={result} presentation={presentation} phase="visible" onDismiss={() => undefined} />),
  inView(app, <DiceRollHeader result={result} presentation={presentation} label="Bite" />),
];

describe('who a shown roll names', () => {
  const { app } = createInMemoryApp({ files: { 'tokens/wolf.webp': '' } });

  it('looks the roller up as the GM window does without a presentation', () => {
    const [card, header] = shown(undefined, app);
    expect(card!.textContent).toContain('Wolf');
    expect(card!.querySelector('img')?.getAttribute('src')).toContain('tokens/wolf.webp');
    expect(header!.querySelector('img')?.getAttribute('alt')).toBe('Wolf');
  });

  it('names nobody and looks nothing up for an anonymous roll', () => {
    for (const el of shown(null, app)) {
      expect(el.querySelector('img')).toBeNull();
      expect(el.querySelector('.atlas-dice-toast__avatar, .atlas-dice-toast__name')).toBeNull();
      expect(el.innerHTML).not.toContain('Wolf');
    }
  });

  it('shows exactly the presented name and portrait', () => {
    const presentation = { name: 'Grey Wolf', avatar: { src: 'app://vault/tokens/map-wolf.webp', showRing: false, ringColor: undefined } };
    const [card, header] = shown(presentation, app);
    expect(card!.querySelector('.atlas-dice-toast__name')?.textContent).toBe('Grey Wolf');
    for (const el of [card!, header!]) {
      expect(el.querySelector('img')?.getAttribute('src')).toBe('app://vault/tokens/map-wolf.webp');
      expect(el.querySelector('img')?.getAttribute('alt')).toBe('Grey Wolf');
      expect(el.querySelector('.atlas-token-ring')).toBeNull();
    }
  });

  it('shows an initial only for a presented name without a portrait, and nothing for neither', () => {
    const [named] = shown({ name: 'Grey Wolf', avatar: null }, app);
    expect(named!.querySelector('.atlas-dice-toast__avatar--fallback')?.textContent).toBe('G');
    const [neither, header] = shown({ name: null, avatar: null }, app);
    expect(neither!.querySelector('.atlas-dice-toast__avatar, .atlas-dice-toast__name')).toBeNull();
    expect(header!.querySelector('img')).toBeNull();
  });
});
