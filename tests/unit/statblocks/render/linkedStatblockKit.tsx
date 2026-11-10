import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { stringify as stringifyYaml } from 'yaml';
import { LinkedStatblock, type LinkedStatblockProps } from '../../../../src/app/statblocks/render/LinkedStatblock';
import type { CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_ID } from '../library/templateTexts';

export const WARDEN = 'Bestiary/Marsh Warden.md';
export const NATIVE = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', size: 'Large', type: 'plant', hp: 30 };

/** The text of a note whose frontmatter is `frontmatter`. */
export const noteText = (frontmatter: Record<string, unknown>, body = ''): string => `---\n${stringifyYaml(frontmatter)}---\n${body}`;

/** Fantasy Statblocks with its bestiary resolved and a layout that shows a creature's name. */
export function loadFantasyStatblocks(vault: CreatureVault): void {
  Object.assign(vault.app, {
    plugins: { plugins: { 'obsidian-5e-statblocks': { manager: {
      getAllLayouts: () => [],
      getLayout: () => null,
      getDefaultLayout: () => ({ name: 'Basic', id: 'basic', blocks: [{ type: 'heading', id: 'h', properties: ['name'], size: 1 }] }),
    } } } },
  });
  Object.assign(window, {
    FantasyStatblocks: {
      getBestiaryCreatures: () => vault.bestiary,
      hasCreature: (name: string) => vault.bestiary.some((creature) => creature.name === name),
      getCreatureFromBestiary: (name: string) => vault.bestiary.find((creature) => creature.name === name) ?? null,
      isResolved: () => true,
    },
  });
}

export const unloadFantasyStatblocks = (): void => { Reflect.deleteProperty(window, 'FantasyStatblocks'); };

export function renderLinked(vault: CreatureVault, props: Partial<LinkedStatblockProps> & { path: string }): RenderResult {
  return render(<LinkedStatblock app={vault.app} variant="full" {...props} />);
}

/** The native card, or null while something else shows. */
export const sheetOf = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>('.atlas-sb-sheet');

/** Today's Fantasy Statblocks card: the shared card without the native sheet's class. */
export const fantasyCardOf = (container: HTMLElement): Element | null => container.querySelector('.atlas-statblock:not(.atlas-sb-sheet)');

export const barOf = (container: HTMLElement): string | null =>
  container.querySelector('.atlas-linked-statblock__bar')?.textContent ?? null;

export const captionOf = (container: HTMLElement): string | null =>
  container.querySelector('.atlas-linked-statblock__caption')?.textContent ?? null;

export const hintOf = (container: HTMLElement): string | null =>
  container.querySelector('.atlas-statblock-missing-hint')?.textContent ?? null;
