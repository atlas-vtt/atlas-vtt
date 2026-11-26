import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import StatblockLinkModal from '../../src/app/packages/components/asset-manager/StatblockLinkModal';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { TemplateGallery } from '../../src/app/statblocks/editor/gallery/TemplateGallery';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import { FIVE_E_2024_MONSTER } from '../../src/app/statblocks/presets/fiveE2024';
import { addNote, creatureVault } from '../mocks/creatureVault';
import { closeSessionVault, sessionVault } from '../unit/statblocks/library/sessionVault';
import { renderPane } from '../unit/statblocks/editor/paneKit';
import { FakeSession } from '../unit/statblocks/template-editor/editorKit';
import { userEvent } from 'vitest/browser';
import { frames, mount } from './sidePanesHarness';
import { mouse } from './realMouse';
import { all, settle, showing, type OpenedSurface, type ScreenSurface } from './textFitScreensSurfaces';

const h = React.createElement;
const FIVE_E = 'builtin:5e-2024-monster';

const BOG_HAG = {
  statblock: true, 'atlas-template': FIVE_E, name: 'Bog Hag of the Drowned Chapel', size: 'Medium', type: 'fey', alignment: 'neutral evil',
  ac: 17, hp: 82, hit_dice: '11d8 + 33', speed: '30 ft., swim 40 ft.', skillsaves: [{ stealth: 4 }, { perception: 3 }], languages: 'Common, Sylvan',
  senses: 'darkvision 60 ft.', cr: '5',
  actions: [{ name: 'Claws of the marsh', desc: 'Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4) slashing damage.' }],
  spells: ['The hag casts spells using Wisdom (save DC 14).', { 'At will': 'minor illusion, vicious mockery' }, { '1/day each': 'sleep' }],
};

/** The template editor on a built-in, as wide as the window leaves it; a tile's toolbar and Options; the capsule's menu. */
async function openTemplateEditor(window: { width: number }): Promise<OpenedSurface> {
  // Chrome shows under the pointer: it rests where nothing of the editor is.
  await mouse.hover(0, 0);
  mount(new FakeSession(FIVE_E_2024_MONSTER.template, { name: FIVE_E_2024_MONSTER.name, builtIn: true }), window.width - 40);
  await frames(3);
  await settle(300);
  const tiles = [...document.querySelectorAll<HTMLElement>('.atlas-te-stage [data-block-id]')]
    .filter((tile) => !tile.parentElement?.closest('.atlas-te-stage [data-block-id]'));
  const options = (tile: HTMLElement) => async (): Promise<Element[]> => {
    await act(async () => { tile.click(); });
    await frames(2);
    await act(async () => { tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })); });
    await settle(300);
    return [...all('.atlas-te-toolbar'), ...all('.atlas-te-options:not([data-closing])')];
  };
  const parts: OpenedSurface['parts'] = { '': async () => showing(document.body, '.atlas-te-dock') };
  for (const tile of tiles.slice(1, 6)) parts[`tile ${tile.dataset['blockId']}`] = options(tile);
  parts['capsule menu'] = async () => {
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    await userEvent.click(document.querySelector<HTMLElement>('.atlas-te-capsule .atlas-sb-pane-header__more')!);
    await settle(300);
    return all('[role="menu"]');
  };
  return { parts, close: cleanup };
}

/** The statblock beside its note, filled in and empty. */
async function openPane(frontmatter: Record<string, unknown>, window: { width: number }): Promise<OpenedSurface> {
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin' }));
  container.style.width = `${Math.min(600, Math.round(window.width / 2))}px`;
  const harness = await renderPane({ frontmatter, container });
  await settle();
  return {
    parts: { '': async () => showing(container, '.atlas-sb-pane-value') },
    close: async () => {
      cleanup();
      container.remove();
      await releaseTemplateSessions(harness.app);
      TemplateLibrary.release(harness.app);
    },
  };
}

async function openGallery(): Promise<OpenedSurface> {
  const vault = sessionVault();
  await vault.settled();
  render(h(TooltipProvider, null, h(TemplateGallery, {
    app: vault.app, doc: document, roles: [{ id: 'monster', name: 'Monster', templateId: FIVE_E }], systemTemplateIds: [FIVE_E],
    onUse: async () => { throw new Error('not used'); }, onClose: () => undefined,
  })));
  await settle();
  return { parts: { '': async () => showing(document.body, '[role="radio"]') }, close: async () => { cleanup(); await closeSessionVault(vault); } };
}

async function openLinkDialog(): Promise<OpenedSurface> {
  const vault = creatureVault();
  addNote(vault, 'Bestiary/Bog Hag of the Drowned Chapel.md', BOG_HAG);
  render(h(StatblockLinkModal, { isOpen: true, onClose: () => undefined, asset: { name: 'Bog hag' }, onLink: () => undefined, app: vault.app }));
  await settle(600);
  return {
    parts: { '': async () => showing(document.body, '[role="option"]') },
    close: () => {
      cleanup();
      TemplateLibrary.release(vault.app);
      Reflect.deleteProperty(globalThis, 'FantasyStatblocks');
    },
  };
}

export const STATBLOCK_SURFACES: readonly ScreenSurface[] = [
  { name: 'template editor', open: openTemplateEditor },
  { name: 'statblock beside its note', open: (window) => openPane(BOG_HAG, window) },
  { name: 'empty statblock beside its note', open: (window) => openPane({ statblock: true, 'atlas-template': FIVE_E, name: 'Bog Hag' }, window) },
  { name: 'template gallery', open: openGallery },
  { name: 'link statblock dialog', open: openLinkDialog },
];
